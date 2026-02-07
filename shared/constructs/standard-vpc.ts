import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * StandardVpc - 베스트 프랙티스가 적용된 VPC 컨스트럭트
 *
 * -- 왜 VPC가 중요한가?
 * VPC(Virtual Private Cloud)는 AWS에서 당신만의 "가상 네트워크"입니다.
 * 온프레미스 데이터센터의 네트워크를 클라우드에 구현한 것과 같습니다.
 *
 * VPC 없이는:
 *   - EC2 인스턴스를 안전하게 격리할 수 없습니다 (보안 Pillar)
 *   - Multi-AZ 배포를 할 수 없습니다 (안정성 Pillar)
 *   - 네트워크 성능을 최적화할 수 없습니다 (성능 효율성 Pillar)
 *
 * 질문: VPC 없이 EC2를 사용할 수 있나요? 과거에는 가능했지만, 왜 지금은 VPC가 필수인가요?
 * 질문: 하나의 VPC에 모든 리소스를 넣는 것과 여러 VPC로 분리하는 것의 차이점은?
 *
 * SAA 포인트: VPC는 리전 단위 리소스이고, 서브넷은 AZ 단위 리소스입니다.
 */

export interface StandardVpcProps {
  /** VPC CIDR 블록 (기본값: 10.0.0.0/16) */
  cidr?: string;
  /** 사용할 가용 영역 수 (기본값: 2) */
  maxAzs?: number;
  /** NAT Gateway 수 (기본값: 1 - 비용 절약) */
  natGateways?: number;
}

export class StandardVpc extends Construct {
  /** 생성된 VPC 인스턴스 */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: StandardVpcProps = {}) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      // -- 왜: /16 CIDR 블록을 사용하는 이유
      // /16은 65,536개의 IP 주소를 제공합니다.
      // 너무 작으면 나중에 리소스를 추가할 수 없고,
      // VPC의 CIDR은 생성 후 변경이 매우 어렵습니다.
      // 질문: /16과 /24의 IP 주소 개수 차이는? CIDR 표기법을 이해하고 있나요?
      ipAddresses: ec2.IpAddresses.cidr(props.cidr ?? '10.0.0.0/16'),

      // -- 왜: 최소 2개의 가용 영역(AZ)을 사용하는 이유
      // 1개 AZ만 사용하면 해당 데이터센터에 장애가 발생했을 때
      // 모든 서비스가 중단됩니다 (단일 장애점, Single Point of Failure).
      // 2개 AZ는 고가용성의 최소 조건입니다.
      // 질문: 3개 AZ를 사용하면 더 안전한데, 왜 기본값이 2인가요? (비용 트레이드오프)
      maxAzs: props.maxAzs ?? 2,

      // -- 왜: NAT Gateway를 1개만 사용하는 이유 (학습/개발 환경)
      // NAT Gateway는 프라이빗 서브넷의 리소스가 인터넷에 접근할 수 있게 해줍니다.
      // 하지만 NAT Gateway는 시간당 ~$0.045 + 데이터 처리 비용이 발생합니다.
      // 프로덕션에서는 AZ당 1개(고가용성)가 권장되지만,
      // 학습/개발 환경에서는 비용 절약을 위해 1개만 사용합니다.
      // 질문: NAT Gateway가 1개일 때, 그 AZ에 장애가 나면 어떻게 되나요?
      // SAA 포인트: NAT Gateway vs NAT Instance의 비용과 성능 차이를 이해하세요.
      natGateways: props.natGateways ?? 1,

      // -- 왜: 퍼블릭/프라이빗/격리 서브넷 3종을 구성하는 이유
      // 각 서브넷 유형은 서로 다른 보안 요구사항을 충족합니다:
      //   - PUBLIC: 인터넷에서 직접 접근 가능 (ALB, Bastion Host)
      //   - PRIVATE_WITH_EGRESS: 인터넷 접근 가능하지만, 외부에서 접근 불가 (EC2, ECS)
      //   - PRIVATE_ISOLATED: 인터넷 연결 없음 (RDS, ElastiCache)
      // 질문: 왜 데이터베이스를 격리 서브넷에 배치해야 하나요?
      //        프라이빗 서브넷으로는 충분하지 않나요?
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          // -- 왜: /24는 서브넷당 256개 IP (실제 사용 가능: 251개)
          // AWS는 각 서브넷에서 5개의 IP를 예약합니다.
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // -- 왜: VPC Flow Logs를 활성화하는 이유
    // 네트워크 트래픽을 기록하여 보안 문제를 감지하고 분석할 수 있습니다.
    // 이는 보안 Pillar의 "탐지 제어(Detective Controls)" 패턴입니다.
    // 질문: Flow Logs를 S3에 저장하는 것과 CloudWatch Logs에 저장하는 것의 차이점은?
    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
      trafficType: ec2.FlowLogTrafficType.REJECT,
      // -- 왜: REJECT만 기록하는 이유
      // ALL을 기록하면 로그 양이 방대해지고 비용이 증가합니다.
      // REJECT만 기록하면 차단된 트래픽(잠재적 공격)만 분석할 수 있습니다.
      // 프로덕션에서는 ALL을 사용하되, 로그 보관 기간을 설정하는 것이 좋습니다.
    });
  }
}
