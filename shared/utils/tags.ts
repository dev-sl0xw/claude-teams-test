import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * tags.ts - 태깅 전략 헬퍼
 *
 * -- 왜 태깅 전략이 필요한가?
 * AWS 리소스의 태그는 단순한 라벨이 아니라, 비용 관리의 핵심 도구입니다.
 * AWS Cost Explorer는 태그를 기반으로 비용을 분류하고 분석합니다.
 *
 * 태그 없이 100개의 리소스가 있으면:
 *   - "이번 달 보안 관련 비용이 얼마인지" 알 수 없습니다
 *   - "개발 환경을 정리하면 얼마나 절약되는지" 계산할 수 없습니다
 *
 * 질문: AWS Organizations에서 태그 정책(Tag Policy)은 어떤 역할을 하나요?
 *
 * SAA 포인트: Cost Allocation Tags(비용 할당 태그)는 별도로 활성화해야 합니다.
 */

// -- 왜: 필수 태그를 상수로 정의하는 이유
// 태그 키를 문자열로 하드코딩하면 오타가 발생하고 일관성이 깨집니다.
// 상수를 사용하면 IDE의 자동완성과 타입 검사를 활용할 수 있습니다.
export const REQUIRED_TAG_KEYS = {
  PROJECT: 'Project',
  ENVIRONMENT: 'Environment',
  MANAGED_BY: 'ManagedBy',
  PILLAR: 'WA-Pillar',
  COST_CENTER: 'CostCenter',
} as const;

/**
 * Well-Architected Pillar 이름 상수
 *
 * -- 왜: 영문 소문자로 통일하는 이유
 * 태그 값은 대소문자를 구분하므로, 'Security'와 'security'는 다른 값입니다.
 * 소문자로 통일하면 비용 분석 시 그룹화가 정확해집니다.
 */
export const PILLAR_NAMES = {
  OPERATIONAL_EXCELLENCE: 'operational-excellence',
  SECURITY: 'security',
  RELIABILITY: 'reliability',
  PERFORMANCE_EFFICIENCY: 'performance-efficiency',
  COST_OPTIMIZATION: 'cost-optimization',
  SUSTAINABILITY: 'sustainability',
} as const;

/**
 * 비용 추적을 위한 추가 태그를 적용합니다.
 *
 * -- 왜: CostCenter 태그가 중요한 이유
 * 기업에서는 부서별 비용을 추적해야 합니다.
 * 이 함수는 비용 할당 태그를 자동으로 적용하여 비용 추적을 가능하게 합니다.
 *
 * @param scope - 태그를 적용할 CDK Construct
 * @param costCenter - 비용 센터 식별자 (예: 'learning', 'team-a')
 */
export function applyCostTags(scope: Construct, costCenter: string): void {
  cdk.Tags.of(scope).add(REQUIRED_TAG_KEYS.COST_CENTER, costCenter);
}

/**
 * 자동 삭제 스케줄 태그를 적용합니다 (학습/개발 환경용).
 *
 * -- 왜: 자동 삭제 태그가 필요한 이유
 * 학습용 리소스를 만들고 잊어버리면 불필요한 비용이 계속 발생합니다.
 * 이 태그를 기반으로 Lambda 함수가 오래된 리소스를 자동 정리할 수 있습니다.
 *
 * 질문: 이 태그만으로 리소스가 자동 삭제되나요?
 *        아니면 별도의 자동화가 필요한가요?
 *
 * @param scope - 태그를 적용할 CDK Construct
 * @param daysUntilExpiry - 만료까지의 일수 (기본값: 7일)
 */
export function applyAutoDeleteTags(
  scope: Construct,
  daysUntilExpiry: number = 7
): void {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);
  cdk.Tags.of(scope).add('AutoDelete', 'true');
  cdk.Tags.of(scope).add('ExpiryDate', expiryDate.toISOString().split('T')[0]);
}
