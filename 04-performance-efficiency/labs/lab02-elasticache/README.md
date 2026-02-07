# Lab 02: ElastiCache Redis - 인메모리 캐시 구성

## 학습 목표

- ElastiCache Redis 클러스터를 CDK로 구성하는 방법을 이해합니다
- VPC 내 격리 서브넷에 캐시를 배치하는 보안 패턴을 학습합니다
- 서브넷 그룹과 보안 그룹의 역할과 설정 방법을 이해합니다
- Redis vs Memcached의 선택 기준을 학습합니다

## 사전 지식

- ElastiCache Redis의 기본 개념 (인메모리 캐시, 키-값 저장소)
- VPC 네트워킹 기초 (서브넷, 보안 그룹)
- 캐싱 전략 (Lazy Loading, Write-Through)

## 아키텍처 다이어그램

```
+------------------------------------------------------------------+
|  VPC (10.0.0.0/16)                                               |
|                                                                    |
|  +------------------+  +------------------+  +------------------+ |
|  |  Public Subnet   |  |  Private Subnet  |  | Isolated Subnet  | |
|  |  (10.0.0.0/24)   |  |  (10.0.1.0/24)   |  | (10.0.2.0/24)   | |
|  |                   |  |                   |  |                  | |
|  |                   |  |  [Application]   |  |  [Redis Cache]   | |
|  |                   |  |                   |  |  port: 6379      | |
|  +------------------+  +--------+---------+  +--------+---------+ |
|                                  |                      |          |
|                                  +-------> SG: 6379 <---+          |
|                                                                    |
+------------------------------------------------------------------+
```

## 선택적 배포 안내

```bash
# 스택 합성
npx cdk synth --app "npx ts-node 04-performance-efficiency/labs/lab02-elasticache/bin/app.ts"

# 변경사항 확인
npx cdk diff --app "npx ts-node 04-performance-efficiency/labs/lab02-elasticache/bin/app.ts"

# 배포 (VPC + ElastiCache 생성에 약 10~15분 소요)
npx cdk deploy --app "npx ts-node 04-performance-efficiency/labs/lab02-elasticache/bin/app.ts"

# 정리 (비용 발생 주의!)
npx cdk destroy --app "npx ts-node 04-performance-efficiency/labs/lab02-elasticache/bin/app.ts"
```

## 단계별 실습

### Step 1: 캐시 스택 코드 분석

`lib/cache-stack.ts`를 열고 다음을 확인하세요:

1. **StandardVpc 사용**: 왜 기존 VPC 컨스트럭트를 재사용하는가?
2. **격리 서브넷 배치**: Redis를 인터넷에서 완전히 분리하는 이유는?
3. **보안 그룹 설정**: VPC CIDR에서만 6379 포트를 허용하는 이유는?

### Step 2: 서브넷 그룹 이해

서브넷 그룹은 ElastiCache 노드가 배치될 서브넷을 결정합니다:

- Multi-AZ 배포를 위해 여러 AZ의 서브넷을 포함
- 격리 서브넷을 지정하면 인터넷 접근이 불가능한 환경에 배치
- 질문: 서브넷 그룹에 퍼블릭 서브넷을 포함하면 어떻게 되나요?

### Step 3: Redis 설정 분석

CDK 코드에서 Redis 구성을 분석합니다:

- **노드 유형 (cache.t3.micro)**: 학습용 최소 인스턴스
- **엔진 버전 (7.0)**: 최신 기능과 성능 개선
- **리플리카 수 (0)**: 학습 환경에서 비용 절약
- **암호화**: 저장 중 암호화 활성화, 전송 중 암호화는 학습용으로 비활성화

### Step 4: 프로덕션 환경 비교

학습 환경과 프로덕션 환경의 차이를 이해합니다:

| 설정 | 학습 환경 | 프로덕션 환경 |
|------|-----------|---------------|
| 노드 유형 | cache.t3.micro | cache.r6g.large 이상 |
| 리플리카 | 0개 | 1~5개 |
| Multi-AZ | 비활성화 | 활성화 |
| 전송 암호화 | 비활성화 | 활성화 (필수) |
| 자동 백업 | 비활성화 | 활성화 |

## 소크라테스 질문

1. **격리 서브넷 vs 프라이빗 서브넷**: Redis를 프라이빗 서브넷(NAT Gateway 접근 가능)에 두면 어떤 보안 위험이 있을까요?
2. **캐시 노드 장애**: 단일 노드 Redis가 장애 나면 애플리케이션은 어떻게 되나요? 이를 "Cache Stampede"라고 하는 이유는?
3. **데이터 영속성**: Redis에 저장된 데이터가 노드 재시작 시 사라진다면, 왜 캐시를 사용하는 것이 여전히 가치 있을까요?
4. **클러스터 모드**: Redis 클러스터 모드를 사용하면 어떤 장점이 있을까요? 단일 노드의 메모리 한계를 어떻게 극복하나요?
5. **Memcached 선택 시점**: 어떤 상황에서 Redis 대신 Memcached를 선택해야 할까요?

## 정리 및 다음 단계

이 Lab에서는 ElastiCache Redis를 VPC의 격리 서브넷에 안전하게 배치하는 방법을 학습했습니다.

**핵심 교훈:**
- ElastiCache는 VPC 내에서만 동작하며, 격리 서브넷이 가장 안전한 배치
- 보안 그룹으로 Redis 포트 접근을 애플리케이션 서버로만 제한
- 서브넷 그룹은 Multi-AZ 배포의 기반이 되는 설정
- 프로덕션에서는 리플리카, Multi-AZ, TLS 암호화가 필수

**다음 Lab:** [Lab 03 - CloudFront CDN]에서 정적 콘텐츠를 전 세계에 빠르게 배포하는 CDN을 구성합니다.
