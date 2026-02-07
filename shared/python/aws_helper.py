"""
aws_helper.py - boto3 공용 유틸리티

-- 왜 이 유틸리티가 필요한가?
CDK는 인프라를 "정의"하는 도구이고, boto3는 인프라를 "운영"하는 도구입니다.
예를 들어:
  - CDK로 CloudWatch 경보를 "생성"합니다
  - boto3로 CloudWatch 메트릭을 "조회"합니다

이 파일은 여러 학습 스크립트에서 공통으로 사용하는 boto3 헬퍼 함수를 모아둡니다.

질문: CDK와 boto3 모두 AWS와 통신하는데, 왜 두 가지가 필요할까요?
      CDK만으로 모든 것을 할 수 없나요?

SAA 포인트: boto3는 AWS CLI와 같은 자격 증명 체인(Credential Chain)을 사용합니다.
           환경변수 > AWS 프로파일 > EC2 인스턴스 역할 순서로 자격 증명을 찾습니다.
"""

import json
from typing import Optional

import boto3
from botocore.exceptions import ClientError, NoCredentialsError


def get_session(
    profile_name: Optional[str] = None,
    region_name: str = "ap-northeast-2",
) -> boto3.Session:
    """
    AWS 세션을 생성합니다.

    -- 왜: 세션을 함수로 래핑하는 이유
    매번 boto3.client('s3') 처럼 직접 생성하면:
      1. 리전 설정을 매번 반복해야 합니다
      2. 프로파일 전환이 어렵습니다
      3. 테스트 시 모킹이 어렵습니다

    질문: ap-northeast-2는 어느 리전인가요? 왜 이 리전을 기본값으로 선택했을까요?

    Args:
        profile_name: AWS CLI 프로파일 이름 (None이면 기본 프로파일 사용)
        region_name: AWS 리전 (기본값: ap-northeast-2, 서울)

    Returns:
        boto3.Session 인스턴스
    """
    # -- 왜: try-except로 자격 증명 오류를 잡는 이유
    # AWS 자격 증명이 설정되지 않은 상태에서 boto3를 사용하면
    # 암호화된 오류 메시지가 나옵니다. 학습자에게 친절한 안내를 제공합니다.
    try:
        session = boto3.Session(
            profile_name=profile_name,
            region_name=region_name,
        )
        # 자격 증명이 유효한지 확인
        session.client("sts").get_caller_identity()
        return session
    except NoCredentialsError:
        print("⚠️  AWS 자격 증명을 찾을 수 없습니다.")
        print("   다음 중 하나를 설정해주세요:")
        print("   1. aws configure 명령어로 AWS CLI 설정")
        print("   2. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 환경변수 설정")
        print("   3. ~/.aws/credentials 파일에 프로파일 추가")
        raise
    except ClientError as e:
        print(f"⚠️  AWS 인증 오류: {e}")
        raise


def get_account_id(session: Optional[boto3.Session] = None) -> str:
    """
    현재 AWS 계정 ID를 반환합니다.

    -- 왜: 계정 ID가 필요한 이유
    S3 버킷 이름은 글로벌 유일해야 하므로, 계정 ID를 포함시키면 충돌을 방지할 수 있습니다.
    또한 IAM ARN은 계정 ID를 포함하므로, 정책 생성 시 필요합니다.

    질문: AWS 계정 ID는 민감 정보인가요? 공개해도 괜찮은가요?
    """
    if session is None:
        session = get_session()
    try:
        sts = session.client("sts")
        return sts.get_caller_identity()["Account"]
    except ClientError as e:
        print(f"⚠️  계정 ID 조회 실패: {e}")
        print("   자격 증명이 만료되었거나 STS 권한이 없을 수 있습니다.")
        raise


def check_service_availability(
    service_name: str,
    session: Optional[boto3.Session] = None,
) -> bool:
    """
    특정 AWS 서비스가 현재 리전에서 사용 가능한지 확인합니다.

    -- 왜: 서비스 가용성을 확인하는 이유
    모든 AWS 서비스가 모든 리전에서 사용 가능한 것은 아닙니다.
    예를 들어, 일부 AI/ML 서비스는 특정 리전에서만 사용할 수 있습니다.
    랩을 시작하기 전에 필요한 서비스가 현재 리전에서 지원되는지 확인합니다.

    SAA 포인트: 리전별 서비스 가용성은 시험에서 자주 출제됩니다.

    Args:
        service_name: AWS 서비스 이름 (예: 's3', 'lambda', 'elasticache')
        session: boto3 세션 (None이면 기본 세션 생성)

    Returns:
        서비스 사용 가능 여부
    """
    if session is None:
        session = get_session()
    available_services = session.get_available_services()
    return service_name in available_services


def print_cfn_template(template_path: str) -> None:
    """
    CloudFormation 템플릿을 보기 좋게 출력합니다.

    -- 왜: cdk synth 결과를 확인하는 것이 중요한 이유
    CDK는 TypeScript 코드를 CloudFormation JSON/YAML로 변환합니다.
    실제로 어떤 리소스가 생성되는지 배포 전에 검토해야 합니다.
    이는 운영 우수성 Pillar의 "변경 관리" 패턴입니다.

    질문: cdk synth로 생성된 템플릿과 cdk diff의 차이점은 무엇인가요?
          각각 언제 사용하는 것이 적절한가요?

    Args:
        template_path: cdk.out/ 디렉토리 내의 템플릿 파일 경로
    """
    try:
        with open(template_path, "r") as f:
            template = json.load(f)
        print(json.dumps(template, indent=2, ensure_ascii=False))
    except FileNotFoundError:
        print(f"⚠️  템플릿 파일을 찾을 수 없습니다: {template_path}")
        print("   먼저 'npx cdk synth' 명령어를 실행해주세요.")
