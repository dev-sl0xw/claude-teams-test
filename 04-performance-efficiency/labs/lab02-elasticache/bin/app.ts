#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CacheStack } from '../lib/cache-stack';
import { generateStackName } from '../../../shared/utils/naming';

/**
 * Lab 02 - ElastiCache 앱 진입점
 *
 * -- 왜: ElastiCache 스택을 독립적으로 배포하는 이유
 * 캐시 인프라는 애플리케이션 배포와 수명주기가 다릅니다.
 * 캐시는 한번 생성하면 오래 유지하고, 애플리케이션은 자주 배포합니다.
 * 스택을 분리하면 애플리케이션 재배포 시 캐시가 영향받지 않습니다.
 *
 * 질문: 캐시를 재생성하면 모든 데이터가 사라집니다.
 *        이것이 애플리케이션에 어떤 영향을 줄까요? (Cache Stampede)
 */

const app = new cdk.App();

new CacheStack(app, generateStackName('dev', 'performance', 'CacheStack'), {
  projectName: 'well-architected-handson',
  environment: 'dev',
  pillar: 'performance-efficiency',
});
