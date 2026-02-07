#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ServerlessStack } from '../lib/serverless-stack';

/**
 * -- 왜: 서버리스 아키텍처 Lab의 CDK 앱 진입점입니다.
 *
 * 이 스택은 Lambda + API Gateway + DynamoDB로 구성된
 * 완전 서버리스 아키텍처를 배포합니다.
 *
 * 질문: 이 스택이 배포된 후 아무도 API를 호출하지 않으면 비용이 발생할까요?
 * → API Gateway: 호출 시에만 과금
 * → Lambda: 호출 시에만 과금
 * → DynamoDB (온디맨드): 요청 시에만 과금
 * → 즉, 사용하지 않으면 비용이 거의 0입니다. EC2와 비교해보세요!
 */
const app = new cdk.App();

const environment = app.node.tryGetContext('environment') || 'dev';

new ServerlessStack(app, 'SustainabilityServerlessStack', {
  projectName: 'wa-handson',
  environment,
  pillar: 'sustainability',
  description: '지속 가능성 Pillar - 서버리스 아키텍처 (Lambda + API Gateway + DynamoDB)',
});

app.synth();
