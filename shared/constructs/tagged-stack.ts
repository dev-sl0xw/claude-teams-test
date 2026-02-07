import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * TaggedStack - 필수 태그가 자동으로 적용되는 기본 Stack 클래스
 *
 * -- 왜 이런 클래스가 필요한가?
 * AWS에서 리소스에 태그를 붙이는 것은 "선택사항"이 아니라 "필수사항"입니다.
 * 태그가 없으면:
 *   1. 비용이 어디서 발생하는지 추적할 수 없습니다 (비용 최적화 Pillar)
 *   2. 누가 만든 리소스인지 알 수 없습니다 (운영 우수성 Pillar)
 *   3. 환경별(dev/staging/prod) 구분이 불가능합니다 (보안 Pillar)
 *
 * 질문: 만약 100개의 리소스가 태그 없이 생성되었다면, 월말 비용 보고서를 어떻게 작성하시겠습니까?
 * 질문: 태그를 각 Stack에서 개별적으로 붙이지 않고, 왜 기본 클래스로 만드는 걸까요?
 *
 * SAA 포인트: AWS Organizations의 태그 정책(Tag Policy)으로 태그 표준을 강제할 수 있습니다.
 */

// -- 왜: 태그 속성을 인터페이스로 정의하는 이유는 TypeScript의 타입 안전성을 활용하기 위함입니다.
// 문자열 오타로 인한 잘못된 태그가 배포되는 것을 컴파일 타임에 방지합니다.
export interface TaggedStackProps extends cdk.StackProps {
  /** 프로젝트 이름 (예: 'well-architected-handson') */
  projectName: string;
  /** 환경 구분 (예: 'dev', 'staging', 'prod') */
  environment: string;
  /** Well-Architected Pillar 이름 (예: 'security', 'reliability') */
  pillar?: string;
}

export class TaggedStack extends cdk.Stack {
  /** 프로젝트 이름 - 하위 스택에서 네이밍에 활용 */
  public readonly projectName: string;
  /** 환경 구분 */
  public readonly environment: string;

  constructor(scope: Construct, id: string, props: TaggedStackProps) {
    super(scope, id, props);

    this.projectName = props.projectName;
    this.environment = props.environment;

    // -- 왜: cdk.Tags.of(this)를 사용하면 이 Stack의 모든 하위 리소스에 태그가 자동 전파됩니다.
    // 각 리소스마다 태그를 개별적으로 붙이는 것은 비효율적이고 누락 위험이 있습니다.
    // 질문: 만약 Stack 레벨 태그와 리소스 레벨 태그가 충돌하면 어떤 것이 우선할까요?
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // -- 왜: Pillar 태그는 선택사항입니다.
    // 이 프로젝트는 학습용이므로 어떤 Well-Architected Pillar를 실습 중인지 표시합니다.
    if (props.pillar) {
      cdk.Tags.of(this).add('WA-Pillar', props.pillar);
    }

    // -- 왜: CreatedAt 태그로 리소스 생성 시점을 기록합니다.
    // 오래된 리소스를 찾아 정리할 때 유용합니다 (비용 최적화).
    // 질문: 이 태그가 배포할 때마다 갱신되면 어떤 문제가 발생할까요?
    cdk.Tags.of(this).add('CreatedAt', new Date().toISOString().split('T')[0]);
  }
}
