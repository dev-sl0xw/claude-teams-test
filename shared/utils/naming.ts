/**
 * naming.ts - AWS 리소스 네이밍 규칙 유틸리티
 *
 * -- 왜 네이밍 규칙이 필요한가?
 * AWS 계정에 수십, 수백 개의 리소스가 생기면 이름만으로 용도를 파악해야 합니다.
 * 일관된 네이밍 규칙이 없으면:
 *   - 어떤 리소스가 어떤 프로젝트에 속하는지 알 수 없습니다
 *   - 실수로 프로덕션 리소스를 삭제할 위험이 있습니다
 *   - IAM 정책에서 리소스를 와일드카드로 지정할 수 없습니다
 *
 * 질문: IAM 정책에서 리소스를 "arn:aws:s3:::wa-handson-*" 처럼 패턴으로
 *        지정하려면, 네이밍 규칙이 얼마나 중요할까요?
 *
 * SAA 포인트: S3 버킷 이름은 글로벌 유일해야 하고, 소문자만 허용됩니다.
 */

// -- 왜: 프로젝트의 기본 접두사를 상수로 정의하는 이유
// 모든 리소스 이름에 동일한 접두사를 사용하면 검색과 필터링이 용이합니다.
export const PROJECT_PREFIX = 'wa-handson';

/**
 * 리소스 이름을 생성합니다.
 *
 * 형식: {prefix}-{environment}-{pillar}-{resourceType}-{suffix}
 * 예시: wa-handson-dev-security-bucket-logs
 *
 * @param environment - 환경 (dev, staging, prod)
 * @param pillar - Well-Architected Pillar (security, reliability 등)
 * @param resourceType - 리소스 유형 (bucket, vpc, lambda 등)
 * @param suffix - 추가 식별자 (선택)
 */
export function generateResourceName(
  environment: string,
  pillar: string,
  resourceType: string,
  suffix?: string
): string {
  // -- 왜: 모든 이름을 소문자로 통일하는 이유
  // S3 버킷, DynamoDB 테이블 등 일부 서비스는 대문자를 허용하지 않습니다.
  // 처음부터 소문자로 통일하면 서비스별 제약을 걱정할 필요가 없습니다.
  const parts = [PROJECT_PREFIX, environment, pillar, resourceType];
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join('-').toLowerCase();
}

/**
 * 스택 이름을 생성합니다.
 *
 * 형식: WaHandson-{Environment}-{Pillar}-{StackName}
 * 예시: WaHandson-Dev-Security-IamStack
 *
 * -- 왜: 스택 이름은 PascalCase를 사용하는 이유
 * CloudFormation 스택 이름은 콘솔에서 자주 보는 식별자입니다.
 * PascalCase가 대시 구분보다 콘솔에서 가독성이 좋습니다.
 */
export function generateStackName(
  environment: string,
  pillar: string,
  stackName: string
): string {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `WaHandson-${capitalize(environment)}-${capitalize(pillar)}-${stackName}`;
}
