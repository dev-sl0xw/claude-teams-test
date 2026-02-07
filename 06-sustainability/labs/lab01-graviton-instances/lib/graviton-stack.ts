import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { TaggedStack, TaggedStackProps } from '../../../shared/constructs/tagged-stack';
import { generateResourceName } from '../../../shared/utils/naming';

/**
 * GravitonStack - Graviton(ARM) 인스턴스 배포 스택
 *
 * -- 왜 Graviton 인스턴스를 사용하는가?
 * AWS Graviton 프로세서는 ARM 아키텍처 기반으로, x86 대비 최대 40% 에너지를 절약합니다.
 * 같은 워크로드를 더 적은 전력으로 처리한다는 것은 탄소 배출량을 직접적으로 줄인다는 의미입니다.
 *
 * 질문: 왜 AWS는 Intel/AMD가 아닌 자체 프로세서를 설계했을까요?
 * - 범용 칩은 모든 용도에 맞추다 보니 불필요한 회로가 많아 전력을 낭비합니다.
 * - 클라우드 워크로드에 최적화된 칩을 설계하면 에너지 효율을 극대화할 수 있습니다.
 *
 * SAA 포인트: Graviton 인스턴스는 't4g', 'm7g', 'c7g' 등 이름에 'g'가 포함됩니다.
 */
export class GravitonStack extends TaggedStack {
  constructor(scope: Construct, id: string, props: TaggedStackProps) {
    super(scope, id, props);

    // -- 왜: 기존 기본 VPC를 조회하여 사용합니다.
    // 학습 환경에서 새 VPC를 만들면 리소스 낭비이며,
    // 이 자체가 지속 가능성 원칙에 위배됩니다.
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', {
      isDefault: true,
    });

    // -- 왜: 보안 그룹을 별도로 생성하여 SSH 접근만 허용합니다.
    // 기본 보안 그룹은 모든 트래픽을 허용할 수 있어 보안 위험이 있습니다.
    // 지속 가능성 Pillar이지만, 보안 원칙도 함께 적용하는 것이 Well-Architected입니다.
    const securityGroup = new ec2.SecurityGroup(this, 'GravitonSg', {
      vpc,
      securityGroupName: generateResourceName(
        this.environment,
        'sustainability',
        'sg',
        'graviton'
      ),
      description: 'Graviton 인스턴스용 보안 그룹 - SSH만 허용',
      allowAllOutbound: true,
    });

    // -- 왜: SSH 접속을 위해 22번 포트만 개방합니다.
    // 실무에서는 Session Manager를 사용하여 포트 개방 없이 접속하는 것이 더 안전합니다.
    // 여기서는 학습 편의를 위해 SSH를 허용합니다.
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      '학습용 SSH 접근 허용 - 실무에서는 Session Manager 권장'
    );

    // -- 왜: Amazon Linux 2023 ARM 이미지를 사용합니다.
    // Graviton 인스턴스는 ARM 아키텍처이므로 ARM용 AMI가 필요합니다.
    // Amazon Linux 2023은 ARM에 최적화되어 있으며 장기 지원(LTS)을 받습니다.
    const armAmi = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });

    // -- 왜: x86 AMI도 함께 정의하여 비교를 가능하게 합니다.
    // 같은 워크로드를 x86과 ARM에서 실행하면 성능과 비용 차이를 직접 확인할 수 있습니다.
    const x86Ami = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // ========================================================================
    // Graviton (ARM) 인스턴스들
    // ========================================================================

    // -- 왜: t4g.micro를 첫 번째로 배포합니다.
    // t4g.micro는 프리 티어에 포함되므로 비용 없이 Graviton을 체험할 수 있습니다.
    // 질문: 왜 AWS는 Graviton 인스턴스를 프리 티어에 포함했을까요?
    // → Graviton 채택을 장려하여 전체 플릿의 에너지 효율을 높이려는 전략입니다.
    const t4gInstance = new ec2.Instance(this, 'T4gInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      machineImage: armAmi,
      securityGroup,
      instanceName: generateResourceName(
        this.environment,
        'sustainability',
        'ec2',
        't4g-micro'
      ),
    });

    // -- 왜: m7g는 범용 Graviton3 인스턴스입니다.
    // 안정적인 워크로드에 적합하며, 버스트 성능이 아닌 일관된 성능을 제공합니다.
    // t4g(버스트)와 m7g(안정)의 차이를 이해하는 것이 중요합니다.
    const m7gInstance = new ec2.Instance(this, 'M7gInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M7G,
        ec2.InstanceSize.MEDIUM
      ),
      machineImage: armAmi,
      securityGroup,
      instanceName: generateResourceName(
        this.environment,
        'sustainability',
        'ec2',
        'm7g-medium'
      ),
    });

    // -- 왜: c7g는 컴퓨팅 최적화 Graviton3 인스턴스입니다.
    // CPU 집중 워크로드(데이터 처리, 배치 작업 등)에 적합합니다.
    // 질문: 웹 서버에 c7g를 쓰면 어떤 문제가 있을까요?
    // → 메모리 대비 CPU 비율이 높아 메모리 부족이 발생할 수 있습니다.
    const c7gInstance = new ec2.Instance(this, 'C7gInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.C7G,
        ec2.InstanceSize.MEDIUM
      ),
      machineImage: armAmi,
      securityGroup,
      instanceName: generateResourceName(
        this.environment,
        'sustainability',
        'ec2',
        'c7g-medium'
      ),
    });

    // ========================================================================
    // 비교용 x86 인스턴스 (에너지 차이를 확인하기 위한 대조군)
    // ========================================================================

    // -- 왜: x86 t3.micro를 비교 대상으로 배포합니다.
    // t4g.micro와 동일한 워크로드를 실행하여 성능과 비용을 비교할 수 있습니다.
    // 질문: CloudWatch에서 두 인스턴스의 CPU 사용률이 같다면, 에너지 소비도 같을까요?
    // → CPU 사용률은 같아도 ARM이 더 적은 전력으로 같은 작업을 수행합니다.
    const t3Instance = new ec2.Instance(this, 'T3Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: x86Ami,
      securityGroup,
      instanceName: generateResourceName(
        this.environment,
        'sustainability',
        'ec2',
        't3-micro-x86-compare'
      ),
    });

    // ========================================================================
    // 출력값 - 인스턴스 정보 확인용
    // ========================================================================

    // -- 왜: CloudFormation 출력으로 인스턴스 정보를 표시합니다.
    // 배포 후 즉시 인스턴스 ID를 확인할 수 있어 SSH 접속이나 콘솔 확인이 편리합니다.
    new cdk.CfnOutput(this, 'T4gInstanceId', {
      value: t4gInstance.instanceId,
      description: 'Graviton2 t4g.micro 인스턴스 ID (ARM, 프리 티어)',
    });

    new cdk.CfnOutput(this, 'M7gInstanceId', {
      value: m7gInstance.instanceId,
      description: 'Graviton3 m7g.medium 인스턴스 ID (ARM, 범용)',
    });

    new cdk.CfnOutput(this, 'C7gInstanceId', {
      value: c7gInstance.instanceId,
      description: 'Graviton3 c7g.medium 인스턴스 ID (ARM, 컴퓨팅)',
    });

    new cdk.CfnOutput(this, 'T3InstanceId', {
      value: t3Instance.instanceId,
      description: 'x86 t3.micro 인스턴스 ID (비교용)',
    });

    // -- 왜: 에너지 효율 비교 메시지를 출력합니다.
    // 배포 후 콘솔에서 바로 확인할 수 있는 학습 포인트입니다.
    new cdk.CfnOutput(this, 'EnergyComparisonNote', {
      value: 'Graviton(ARM)은 x86 대비 최대 40% 에너지 절약. CloudWatch에서 CPU 사용률을 비교해보세요.',
      description: '에너지 효율 비교 안내',
    });
  }
}
