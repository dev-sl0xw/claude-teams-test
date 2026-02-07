#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GravitonStack } from '../lib/graviton-stack';

/**
 * -- 왜: CDK 앱의 진입점입니다.
 * 이 파일은 어떤 스택을 어떤 환경에 배포할지 정의합니다.
 *
 * 질문: 왜 스택 정의(lib/)와 앱 진입점(bin/)을 분리할까요?
 * → 같은 스택을 dev, staging, prod 등 여러 환경에 다른 설정으로 배포할 수 있기 때문입니다.
 *   이것은 코드 재사용성과 관심사 분리(Separation of Concerns) 원칙입니다.
 */
const app = new cdk.App();

// -- 왜: 환경 변수에서 설정을 읽어옵니다.
// 하드코딩된 값 대신 환경 변수를 사용하면 같은 코드로 다른 환경에 배포할 수 있습니다.
const environment = app.node.tryGetContext('environment') || 'dev';

new GravitonStack(app, 'SustainabilityGravitonStack', {
  projectName: 'wa-handson',
  environment,
  pillar: 'sustainability',
  description: '지속 가능성 Pillar - Graviton(ARM) vs x86 인스턴스 비교 스택',

  // -- 왜: env를 명시적으로 설정하지 않습니다.
  // 학습 환경에서는 AWS CLI 프로파일의 기본 리전을 사용합니다.
  // 실무에서는 env: { account: '123456789012', region: 'ap-northeast-2' }로 명시합니다.
  // 질문: 리전 선택이 지속 가능성에 영향을 줄까요?
  // → 네! 리전마다 재생 에너지 비율이 다릅니다.
});

app.synth();
