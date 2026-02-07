"""
carbon_footprint_check.py - AWS 탄소 발자국 확인 스크립트

-- 왜 탄소 발자국을 확인해야 하는가?
"측정할 수 없으면 개선할 수 없다" (피터 드러커)
AWS 사용으로 인한 탄소 배출량을 정량적으로 파악해야
지속 가능성 개선 목표를 설정하고 진척도를 추적할 수 있습니다.

질문: 당신의 AWS 계정이 매달 얼마나 많은 CO2를 배출하는지 알고 있나요?

사용법:
    python carbon_footprint_check.py
    python carbon_footprint_check.py --profile my-profile
    python carbon_footprint_check.py --region ap-northeast-2

필요 권한:
    - sustainability:GetCarbonFootprintSummary (Carbon Footprint Tool)
    - ce:GetCostAndUsage (Cost Explorer)
    - cloudwatch:GetMetricData (CloudWatch)
    - compute-optimizer:GetRecommendationSummaries (Compute Optimizer)
"""

import argparse
import json
import sys
from datetime import datetime, timedelta

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError, ProfileNotFound
except ImportError:
    print("오류: boto3가 설치되지 않았습니다.")
    print("설치 방법: pip install boto3")
    sys.exit(1)


def create_session(profile=None, region=None):
    """
    AWS 세션을 생성합니다.

    -- 왜: 세션을 별도 함수로 분리합니다.
    프로파일과 리전 설정을 한 곳에서 관리하여
    여러 함수에서 일관된 세션을 사용합니다.
    """
    try:
        session_kwargs = {}
        if profile:
            session_kwargs["profile_name"] = profile
        if region:
            session_kwargs["region_name"] = region

        session = boto3.Session(**session_kwargs)

        # 자격 증명 확인
        sts = session.client("sts")
        identity = sts.get_caller_identity()
        print(f"[인증 확인] AWS 계정: {identity['Account']}")
        print(f"[인증 확인] 사용자: {identity['Arn']}")
        print(f"[인증 확인] 리전: {session.region_name}")
        print()

        return session

    except NoCredentialsError:
        print("오류: AWS 자격 증명을 찾을 수 없습니다.")
        print("해결 방법:")
        print("  1. aws configure 명령으로 자격 증명을 설정하세요")
        print("  2. --profile 옵션으로 프로파일을 지정하세요")
        print("  3. 환경 변수 AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY를 설정하세요")
        sys.exit(1)
    except ProfileNotFound as e:
        print(f"오류: {e}")
        print("사용 가능한 프로파일을 확인하세요: cat ~/.aws/credentials")
        sys.exit(1)


def check_ec2_utilization(session):
    """
    EC2 인스턴스의 CPU 사용률을 확인합니다.

    -- 왜: 유휴 EC2 인스턴스를 찾습니다.
    CPU 사용률이 5% 미만인 인스턴스는 에너지를 낭비하고 있습니다.
    이런 인스턴스를 식별하면 적정 크기 조정이나 종료를 결정할 수 있습니다.

    질문: CPU 사용률이 낮다고 항상 불필요한 인스턴스일까요?
    → 아닙니다. 메모리 집중 워크로드는 CPU 사용률이 낮을 수 있습니다.
      네트워크 I/O, 디스크 I/O도 함께 확인해야 합니다.
    """
    print("=" * 60)
    print("1. EC2 인스턴스 사용률 분석")
    print("=" * 60)

    ec2 = session.client("ec2")
    cloudwatch = session.client("cloudwatch")

    try:
        # 실행 중인 인스턴스 조회
        response = ec2.describe_instances(
            Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
        )

        instances = []
        for reservation in response.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                instances.append(instance)

        if not instances:
            print("실행 중인 EC2 인스턴스가 없습니다.")
            print("→ 서버리스 아키텍처를 사용 중이라면 이미 좋은 선택입니다!")
            print()
            return

        print(f"실행 중인 인스턴스: {len(instances)}개\n")

        # 각 인스턴스의 CPU 사용률 확인
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=7)

        low_utilization = []
        graviton_count = 0
        x86_count = 0

        for instance in instances:
            instance_id = instance["InstanceId"]
            instance_type = instance["InstanceType"]

            # Graviton 인스턴스 확인 (이름에 'g'가 포함된 패밀리)
            # 예: t4g, m7g, c7g, r7g 등
            family = instance_type.split(".")[0]
            is_graviton = family.endswith("g") or "g" in family[1:]

            if is_graviton:
                graviton_count += 1
            else:
                x86_count += 1

            # 7일간 평균 CPU 사용률 조회
            try:
                metric_response = cloudwatch.get_metric_statistics(
                    Namespace="AWS/EC2",
                    MetricName="CPUUtilization",
                    Dimensions=[
                        {"Name": "InstanceId", "Value": instance_id}
                    ],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=86400,  # 1일 단위
                    Statistics=["Average"],
                )

                datapoints = metric_response.get("Datapoints", [])
                if datapoints:
                    avg_cpu = sum(dp["Average"] for dp in datapoints) / len(datapoints)
                else:
                    avg_cpu = None

            except ClientError as e:
                error_code = e.response["Error"]["Code"]
                if error_code in ("AccessDeniedException", "AccessDenied"):
                    print(f"    ⚠ CloudWatch 권한 부족: cloudwatch:GetMetricStatistics 권한이 필요합니다.")
                else:
                    print(f"    ⚠ CloudWatch 메트릭 조회 실패: {error_code}")
                avg_cpu = None

            # 인스턴스 이름 태그 찾기
            name_tag = ""
            for tag in instance.get("Tags", []):
                if tag["Key"] == "Name":
                    name_tag = tag["Value"]
                    break

            arch_label = "ARM(Graviton)" if is_graviton else "x86"
            cpu_display = f"{avg_cpu:.1f}%" if avg_cpu is not None else "데이터 없음"

            print(f"  {instance_id} ({instance_type}) [{arch_label}]")
            print(f"    이름: {name_tag or '(없음)'}")
            print(f"    7일 평균 CPU: {cpu_display}")

            if avg_cpu is not None and avg_cpu < 5.0:
                low_utilization.append({
                    "id": instance_id,
                    "type": instance_type,
                    "name": name_tag,
                    "avg_cpu": avg_cpu,
                })
                print(f"    ⚠ 주의: CPU 사용률이 매우 낮습니다. 적정 크기 조정을 검토하세요.")

            print()

        # 요약
        print(f"--- 요약 ---")
        print(f"  Graviton(ARM) 인스턴스: {graviton_count}개")
        print(f"  x86 인스턴스: {x86_count}개")
        if graviton_count + x86_count > 0:
            graviton_ratio = graviton_count / (graviton_count + x86_count) * 100
            print(f"  Graviton 비율: {graviton_ratio:.1f}%")
            if graviton_ratio < 50:
                print(f"  → 제안: x86 인스턴스를 Graviton으로 전환하면 에너지를 절약할 수 있습니다.")
        if low_utilization:
            print(f"\n  사용률 낮은 인스턴스: {len(low_utilization)}개")
            print(f"  → Compute Optimizer를 확인하여 적정 크기로 변경하세요.")
        print()

    except ClientError as e:
        print(f"EC2 정보 조회 실패: {e.response['Error']['Message']}")
        print()


def check_cost_by_service(session):
    """
    서비스별 비용을 확인합니다.

    -- 왜: 비용은 에너지 소비의 간접적 지표입니다.
    비용이 높은 서비스는 그만큼 많은 리소스(= 에너지)를 사용하고 있습니다.
    서비스별 비용 분포를 보면 에너지 최적화의 우선순위를 결정할 수 있습니다.
    """
    print("=" * 60)
    print("2. 서비스별 비용 분석 (최근 30일)")
    print("=" * 60)

    ce = session.client("ce", region_name="us-east-1")  # Cost Explorer는 us-east-1에서만 동작

    end_date = datetime.utcnow().strftime("%Y-%m-%d")
    start_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")

    try:
        response = ce.get_cost_and_usage(
            TimePeriod={"Start": start_date, "End": end_date},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )

        total_cost = 0.0
        services = []

        for result in response.get("ResultsByTime", []):
            for group in result.get("Groups", []):
                service_name = group["Keys"][0]
                cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
                if cost > 0.01:  # $0.01 이상만 표시
                    services.append((service_name, cost))
                    total_cost += cost

        if not services:
            print("최근 30일간 비용이 발생하지 않았습니다.")
            print()
            return

        # 비용 순으로 정렬
        services.sort(key=lambda x: x[1], reverse=True)

        print(f"\n총 비용: ${total_cost:.2f}\n")
        for service_name, cost in services[:10]:  # 상위 10개만
            bar_length = int(cost / total_cost * 30) if total_cost > 0 else 0
            bar = "█" * bar_length
            percentage = cost / total_cost * 100 if total_cost > 0 else 0
            print(f"  ${cost:>8.2f} ({percentage:>5.1f}%) {bar} {service_name}")

        # 지속 가능성 제안
        print(f"\n--- 지속 가능성 제안 ---")
        for service_name, cost in services[:5]:
            if "EC2" in service_name:
                print(f"  → EC2: Graviton 인스턴스 전환, 적정 크기 조정, Auto Scaling 검토")
            elif "RDS" in service_name:
                print(f"  → RDS: Aurora Serverless v2 전환 검토, 읽기 복제본 최적화")
            elif "S3" in service_name:
                print(f"  → S3: 수명주기 정책으로 불필요 데이터 자동 정리")
            elif "Lambda" in service_name:
                print(f"  → Lambda: ARM 아키텍처 전환, 메모리 최적화 (Power Tuning)")
            elif "DynamoDB" in service_name:
                print(f"  → DynamoDB: 온디맨드 vs 프로비저닝 모드 비교 분석")
        print()

    except ClientError as e:
        print(f"비용 정보 조회 실패: {e.response['Error']['Message']}")
        print("참고: Cost Explorer는 활성화되어 있어야 합니다.")
        print()


def check_compute_optimizer(session):
    """
    Compute Optimizer 추천 사항을 확인합니다.

    -- 왜: Compute Optimizer는 머신러닝으로 리소스의 적정 크기를 추천합니다.
    과도하게 프로비저닝된 리소스를 찾아 에너지 낭비를 줄일 수 있습니다.
    """
    print("=" * 60)
    print("3. Compute Optimizer 추천 요약")
    print("=" * 60)

    try:
        co = session.client("compute-optimizer")

        response = co.get_recommendation_summaries()

        summaries = response.get("recommendationSummaries", [])

        if not summaries:
            print("Compute Optimizer가 활성화되지 않았거나 데이터가 충분하지 않습니다.")
            print("활성화 방법: AWS 콘솔 > Compute Optimizer > Opt in")
            print()
            return

        for summary in summaries:
            resource_type = summary.get("recommendationResourceType", "Unknown")
            finding_summaries = summary.get("summaries", [])

            print(f"\n  리소스 유형: {resource_type}")
            for finding in finding_summaries:
                name = finding.get("name", "Unknown")
                value = finding.get("value", 0)
                if value > 0:
                    label = ""
                    if name == "OVER_PROVISIONED":
                        label = "과도 프로비저닝 (줄일 수 있음)"
                    elif name == "UNDER_PROVISIONED":
                        label = "부족 프로비저닝 (늘려야 함)"
                    elif name == "OPTIMIZED":
                        label = "최적화됨"
                    elif name == "NOT_OPTIMIZED":
                        label = "최적화되지 않음"
                    else:
                        label = name

                    print(f"    {label}: {value}개")

        print()

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "OptInRequiredException":
            print("Compute Optimizer가 활성화되지 않았습니다.")
            print("활성화 방법: AWS 콘솔 > Compute Optimizer > Opt in")
        else:
            print(f"Compute Optimizer 조회 실패: {e.response['Error']['Message']}")
        print()


def check_sustainability_tips(session):
    """
    지속 가능성 개선 팁을 출력합니다.

    -- 왜: 구체적인 행동 방안을 제시합니다.
    데이터만 보여주면 "그래서 어떻게 하라는 거지?"라는 질문이 남습니다.
    실행 가능한 팁을 함께 제공하여 즉시 개선 조치를 취할 수 있게 합니다.
    """
    print("=" * 60)
    print("4. 지속 가능성 개선 체크리스트")
    print("=" * 60)

    checklist = [
        {
            "category": "컴퓨팅",
            "items": [
                "[ ] EC2 인스턴스를 Graviton(ARM)으로 전환했는가?",
                "[ ] 사용률이 낮은 인스턴스를 적정 크기로 조정했는가?",
                "[ ] Auto Scaling을 적용하여 수요에 맞게 확장/축소하는가?",
                "[ ] 개발/테스트 환경은 야간/주말에 중지하는가?",
                "[ ] 서버리스(Lambda, Fargate)로 전환 가능한 워크로드가 있는가?",
            ],
        },
        {
            "category": "스토리지",
            "items": [
                "[ ] S3 수명주기 정책으로 오래된 데이터를 저렴한 스토리지 클래스로 이동하는가?",
                "[ ] 사용하지 않는 EBS 볼륨과 스냅샷을 정리했는가?",
                "[ ] 불필요한 데이터 복제를 줄였는가?",
            ],
        },
        {
            "category": "데이터베이스",
            "items": [
                "[ ] DynamoDB는 온디맨드 모드를 사용하는가? (트래픽이 불규칙한 경우)",
                "[ ] RDS는 Aurora Serverless v2로 전환 가능한가?",
                "[ ] 읽기 복제본이 실제로 필요한 만큼만 있는가?",
            ],
        },
        {
            "category": "네트워크",
            "items": [
                "[ ] CloudFront를 사용하여 오리진 서버 부하를 줄이고 있는가?",
                "[ ] 불필요한 데이터 전송을 최소화하고 있는가? (압축, 캐싱)",
                "[ ] 사용하지 않는 NAT Gateway나 로드 밸런서가 있는가?",
            ],
        },
        {
            "category": "모니터링",
            "items": [
                "[ ] Customer Carbon Footprint Tool을 정기적으로 확인하는가?",
                "[ ] Compute Optimizer를 활성화하고 추천을 검토하는가?",
                "[ ] Trusted Advisor의 비용 최적화 항목을 정기적으로 확인하는가?",
            ],
        },
    ]

    for section in checklist:
        print(f"\n  [{section['category']}]")
        for item in section["items"]:
            print(f"    {item}")

    print()
    print("--- Customer Carbon Footprint Tool 확인 방법 ---")
    print("  AWS 콘솔 > Billing and Cost Management > Carbon Footprint")
    print("  또는: https://console.aws.amazon.com/billing/home#/carbon-footprint")
    print()


def main():
    """
    메인 함수 - 모든 검사를 순서대로 실행합니다.
    """
    parser = argparse.ArgumentParser(
        description="AWS 탄소 발자국 및 지속 가능성 검사 도구"
    )
    parser.add_argument(
        "--profile",
        help="AWS CLI 프로파일 이름 (기본: default)",
        default=None,
    )
    parser.add_argument(
        "--region",
        help="AWS 리전 (기본: 프로파일의 기본 리전)",
        default=None,
    )
    parser.add_argument(
        "--skip-cost",
        help="비용 분석을 건너뜁니다 (Cost Explorer 미활성화 시)",
        action="store_true",
    )

    args = parser.parse_args()

    print()
    print("╔════════════════════════════════════════════════════════╗")
    print("║   AWS 지속 가능성 (Sustainability) 검사 도구          ║")
    print("║   Well-Architected Framework - 6th Pillar             ║")
    print("╚════════════════════════════════════════════════════════╝")
    print()
    print("이 도구는 AWS 계정의 지속 가능성 상태를 분석하고")
    print("개선 방안을 제안합니다.")
    print()

    session = create_session(profile=args.profile, region=args.region)

    # 1. EC2 사용률 분석
    check_ec2_utilization(session)

    # 2. 서비스별 비용 분석 (간접적 에너지 지표)
    if not args.skip_cost:
        check_cost_by_service(session)
    else:
        print("비용 분석을 건너뜁니다. (--skip-cost 옵션)")
        print()

    # 3. Compute Optimizer 추천
    check_compute_optimizer(session)

    # 4. 지속 가능성 체크리스트
    check_sustainability_tips(session)

    print("╔════════════════════════════════════════════════════════╗")
    print("║   검사 완료!                                         ║")
    print("║                                                      ║")
    print("║   기억하세요:                                        ║")
    print("║   '측정할 수 없으면 개선할 수 없다'                  ║")
    print("║   정기적으로 이 도구를 실행하여                      ║")
    print("║   지속 가능성 상태를 모니터링하세요.                  ║")
    print("╚════════════════════════════════════════════════════════╝")
    print()


if __name__ == "__main__":
    main()
