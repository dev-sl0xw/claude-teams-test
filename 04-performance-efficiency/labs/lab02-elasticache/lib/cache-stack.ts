import * as cdk from 'aws-cdk-lib';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { TaggedStack, TaggedStackProps } from '../../../shared/constructs/tagged-stack';
import { StandardVpc } from '../../../shared/constructs/standard-vpc';
import { generateResourceName } from '../../../shared/utils/naming';

/**
 * CacheStack - ElastiCache Redis 클러스터를 구성하는 스택
 *
 * -- 왜 ElastiCache Redis를 사용하는가?
 * 데이터베이스 조회 결과를 메모리에 캐시하면:
 *   1. 응답 지연시간이 수 ms에서 sub-ms로 줄어듭니다
 *   2. 데이터베이스 부하가 크게 감소합니다 (읽기의 80%를 캐시에서 처리)
 *   3. 데이터베이스 스케일업 비용을 절약할 수 있습니다
 *
 * 질문: 캐시가 데이터베이스보다 빠른 이유는 무엇일까요?
 *        디스크 I/O vs 메모리 접근 속도의 차이를 생각해보세요.
 *
 * 질문: ElastiCache를 VPC 내에 배치하는 이유는 무엇일까요?
 *        인터넷에서 직접 접근 가능하면 어떤 보안 문제가 발생할까요?
 *
 * SAA 포인트: ElastiCache Redis는 Multi-AZ 자동 장애 조치를 지원합니다.
 *            프라이머리 노드 장애 시 자동으로 리플리카가 프라이머리로 승격됩니다.
 */

export class CacheStack extends TaggedStack {
  /** 생성된 VPC */
  public readonly vpc: ec2.Vpc;
  /** Redis 보안 그룹 */
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: TaggedStackProps) {
    super(scope, id, props);

    // -- 왜: StandardVpc를 재사용하는 이유
    // ElastiCache는 VPC 내에서만 동작합니다 (EC2-Classic은 지원 종료).
    // 격리 서브넷(Isolated Subnet)에 배치하여 인터넷 접근을 완전히 차단합니다.
    // 질문: 왜 프라이빗 서브넷이 아닌 격리 서브넷을 사용할까요?
    //        Redis가 인터넷에 나갈 이유가 있을까요?
    const vpcConstruct = new StandardVpc(this, 'CacheVpc');
    this.vpc = vpcConstruct.vpc;

    // -- 왜: Redis 전용 보안 그룹을 생성하는 이유
    // 보안 그룹은 "어떤 트래픽이 Redis에 접근할 수 있는가"를 제어합니다.
    // Redis 포트(6379)만 열고, 특정 소스(애플리케이션 서버)에서만 접근을 허용합니다.
    // 질문: 보안 그룹을 0.0.0.0/0으로 열면 어떤 위험이 있을까요?
    //        Redis에는 기본적으로 인증이 없다는 점을 기억하세요.
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: generateResourceName(
        props.environment,
        'performance',
        'sg',
        'redis'
      ),
      description: 'ElastiCache Redis 접근 제어 보안 그룹',
      // -- 왜: 아웃바운드 트래픽을 허용하는 이유
      // Redis 복제(Replication)와 클러스터 통신에 필요합니다.
      allowAllOutbound: true,
    });

    // -- 왜: VPC CIDR에서만 Redis 포트 접근을 허용하는 이유
    // 같은 VPC 내의 리소스(EC2, Lambda 등)만 Redis에 접근할 수 있습니다.
    // 더 엄격하게는 특정 보안 그룹에서만 접근을 허용할 수 있습니다.
    this.redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'VPC 내부에서 Redis 포트(6379) 접근 허용'
    );

    // -- 왜: 서브넷 그룹을 생성하는 이유
    // ElastiCache 서브넷 그룹은 Redis 노드가 배치될 서브넷을 지정합니다.
    // 격리 서브넷을 지정하여 인터넷과 완전히 분리된 환경에 배치합니다.
    // Multi-AZ 배포 시 여러 AZ의 서브넷을 포함해야 합니다.
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      cacheSubnetGroupName: generateResourceName(
        props.environment,
        'performance',
        'subnet-group',
        'redis'
      ),
      description: 'ElastiCache Redis용 서브넷 그룹 (격리 서브넷)',
      subnetIds: this.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
    });

    // -- 왜: Redis 복제 그룹을 생성하는 이유 (단일 노드가 아닌)
    // 복제 그룹(Replication Group)은 프라이머리 + 리플리카 구성입니다.
    // 학습 환경에서는 비용 절약을 위해 단일 노드만 사용하지만,
    // 프로덕션에서는 최소 1개의 리플리카로 고가용성을 확보합니다.
    //
    // 질문: 리플리카가 있으면 읽기 성능도 향상될까요?
    //        리플리카에서 읽기(Read Replica)는 어떻게 동작할까요?
    const redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisReplicationGroup', {
      replicationGroupDescription: '성능 효율성 Lab - Redis 캐시 클러스터',
      // -- 왜: cache.t3.micro를 선택하는 이유
      // 학습/개발 환경에서는 가장 작은 인스턴스로 충분합니다.
      // 프로덕션에서는 워크로드에 맞는 인스턴스 유형을 선택합니다:
      //   - r6g: 메모리 최적화 (대용량 캐시)
      //   - m6g: 범용 (균형 잡힌 워크로드)
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      // -- 왜: Redis 7.x를 사용하는 이유
      // 최신 버전은 성능 개선과 새로운 데이터 구조를 제공합니다.
      // Redis 7에서 추가된 Functions, ACL 개선 등의 기능이 있습니다.
      engineVersion: '7.0',
      // -- 왜: 리플리카를 0개로 설정하는 이유 (학습 환경)
      // 프로덕션에서는 최소 1개의 리플리카가 권장됩니다.
      // 리플리카가 있으면 프라이머리 장애 시 자동 장애 조치가 가능합니다.
      numCacheClusters: 1,
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
      securityGroupIds: [this.redisSecurityGroup.securityGroupId],
      // -- 왜: 전송 중 암호화(TLS)를 활성화하는 이유
      // Well-Architected 보안 Pillar: 전송 중인 데이터는 항상 암호화해야 합니다.
      // 클라이언트 연결 시 TLS를 사용해야 하지만, 이는 보안의 기본입니다.
      // 질문: TLS 없이 Redis를 운영하면 VPC 내부에서도 어떤 위험이 있을까요?
      transitEncryptionEnabled: true,
      // -- 왜: 저장 중 암호화를 활성화하는 이유
      // 캐시 데이터에도 민감 정보가 포함될 수 있습니다.
      // Redis 스냅샷이 유출되더라도 데이터를 보호합니다.
      atRestEncryptionEnabled: true,
    });

    // -- 왜: 의존성을 명시적으로 설정하는 이유
    // 서브넷 그룹이 먼저 생성된 후에 Redis 클러스터가 생성되어야 합니다.
    // CDK가 보통 자동으로 처리하지만, CfnResource 사용 시 명시적 지정이 필요할 수 있습니다.
    redisCluster.addDependency(subnetGroup);

    // -- 왜: Redis 엔드포인트를 Output으로 내보내는 이유
    // 애플리케이션에서 이 엔드포인트를 사용하여 Redis에 연결합니다.
    // 질문: Redis 엔드포인트를 하드코딩하면 왜 문제가 될까요?
    //        환경 변수나 Parameter Store를 사용하는 것이 왜 더 나을까요?
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redisCluster.attrPrimaryEndPointAddress,
      description: 'Redis 프라이머리 엔드포인트',
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: redisCluster.attrPrimaryEndPointPort,
      description: 'Redis 포트',
    });
  }
}
