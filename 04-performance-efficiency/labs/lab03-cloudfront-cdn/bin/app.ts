#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdnStack } from '../lib/cdn-stack';
import { generateStackName } from '../../../shared/utils/naming';

/**
 * Lab 03 - CloudFront CDN 앱 진입점
 *
 * -- 왜: CDN 스택을 독립적으로 관리하는 이유
 * CloudFront 배포는 변경 시 전 세계 엣지 로케이션에 전파하는 데 시간이 걸립니다.
 * 애플리케이션 코드 배포와 CDN 설정 변경을 분리하면:
 *   1. 애플리케이션 배포 속도가 빨라집니다
 *   2. CDN 설정 변경이 애플리케이션에 영향을 주지 않습니다
 *   3. 롤백이 독립적으로 가능합니다
 *
 * 질문: CloudFront 배포 업데이트에 왜 15~20분이 걸릴까요?
 *        전 세계 수백 곳의 엣지 로케이션에 설정을 전파해야 하기 때문입니다.
 */

const app = new cdk.App();

new CdnStack(app, generateStackName('dev', 'performance', 'CdnStack'), {
  projectName: 'wa-handson',
  environment: 'dev',
  pillar: 'performance-efficiency',
});

app.synth();
