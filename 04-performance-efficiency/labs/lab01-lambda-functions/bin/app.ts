#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LambdaStack } from '../lib/lambda-stack';
import { generateStackName } from '../../../shared/utils/naming';

/**
 * Lab 01 - Lambda Functions 앱 진입점
 *
 * -- 왜: CDK 앱의 진입점을 별도 파일로 분리하는 이유
 * lib/에는 스택 정의(무엇을 만들 것인가)를,
 * bin/에는 앱 설정(어떻게 배포할 것인가)을 분리합니다.
 * 이렇게 하면 동일한 스택을 여러 환경(dev/prod)에 재사용할 수 있습니다.
 *
 * 질문: 하나의 CDK 앱에서 여러 환경의 스택을 동시에 정의할 수 있을까요?
 *        그렇다면 어떤 장점이 있을까요?
 */

const app = new cdk.App();

new LambdaStack(app, generateStackName('dev', 'performance', 'LambdaStack'), {
  projectName: 'wa-handson',
  environment: 'dev',
  pillar: 'performance-efficiency',
  // -- 왜: env를 명시적으로 설정하지 않는 이유
  // env를 설정하지 않으면 CDK는 현재 CLI 프로파일의 계정/리전을 사용합니다.
  // 이는 학습 환경에서 가장 간단한 방법입니다.
  // 프로덕션에서는 env: { account: '123456789012', region: 'ap-northeast-2' }
  // 처럼 명시적으로 설정하여 환경 간 혼동을 방지합니다.
});

app.synth();
