# Lab 02: 서버리스 아키텍처로 유휴 리소스 제거하기

## 학습 목표

- Lambda + API Gateway + DynamoDB 서버리스 아키텍처를 이해합니다
- 서버리스가 유휴 리소스를 제거하여 에너지를 절약하는 원리를 설명할 수 있습니다
- DynamoDB 온디맨드 모드가 프로비저닝 모드와 어떻게 다른지 이해합니다
- Python으로 간단한 CRUD Lambda 핸들러를 작성할 수 있습니다
- ARM(Graviton) Lambda의 에너지 효율 이점을 이해합니다

## 사전 지식

- Lambda 기본 개념 (핸들러, 이벤트, 컨텍스트)
- API Gateway REST API 기본
- DynamoDB 기본 (파티션 키, 아이템, 테이블)
- HTTP 메서드 (GET, POST, PUT, DELETE)
- Python 기본 문법

## 아키텍처 다이어그램 (ASCII)

```
클라이언트 (브라우저/curl)
     │
     ▼
┌──────────────────────┐
│   API Gateway        │  ← 요청 시에만 처리 (유휴 비용 없음)
│   (REST API)         │
│   /items             │
│   /items/{id}        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Lambda Function    │  ← 호출 시에만 실행 (유휴 비용 없음)
│   (Python 3.12)      │     ARM(Graviton) 아키텍처
│   (ARM/Graviton)     │     20% 저렴, 더 높은 에너지 효율
│                      │
│   handler.py         │
│   - create_item()    │
│   - get_item()       │
│   - list_items()     │
│   - update_item()    │
│   - delete_item()    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   DynamoDB           │  ← 온디맨드 모드 (요청량 비례 과금)
│   (On-Demand)        │     사용하지 않으면 거의 무료
│                      │
│   PK: id (String)    │
│   Attributes:        │
│     - name           │
│     - description    │
│     - createdAt      │
│     - updatedAt      │
└──────────────────────┘

에너지 소비 비교:
  EC2 기반:    ████████████████████████  24시간 전력 소비
  서버리스:    ░░░░████░░░░████░░░░░░░░  요청 시에만 전력 소비
                    ↑         ↑
               요청 발생  요청 발생
```

## 선택적 배포 안내

> 이 Lab은 학습 목적으로 CDK 코드와 Lambda 코드를 읽고 이해하는 것만으로도 충분합니다.
> 실제 배포를 원하는 경우 아래 안내를 따르세요.

### 배포 전 준비

```bash
# 1. 프로젝트 루트에서 의존성 설치
npm install

# 2. CDK Bootstrap (최초 1회)
npx cdk bootstrap

# 3. 변경 사항 미리보기
npx cdk diff --app "npx ts-node bin/app.ts"
```

### 배포

```bash
# 스택 배포
npx cdk deploy --app "npx ts-node bin/app.ts" SustainabilityServerlessStack
```

### 정리 (비용 방지)

```bash
# 스택 삭제 (모든 리소스 제거)
npx cdk destroy --app "npx ts-node bin/app.ts" SustainabilityServerlessStack
```

## 단계별 실습

### Step 1: CDK 코드 분석 - 서버리스 리소스 이해

`lib/serverless-stack.ts`를 열고 다음을 확인하세요:

1. **DynamoDB**: `billingMode: PAY_PER_REQUEST` - 왜 온디맨드를 선택했을까요?
2. **Lambda**: `architecture: ARM_64` - 왜 Lambda에서도 Graviton을 사용할까요?
3. **API Gateway**: `throttlingRateLimit: 100` - 왜 요청 제한이 필요할까요?

### Step 2: Lambda 코드 분석 - Python 핸들러

`lambda-code/handler.py`를 열고 다음을 확인하세요:

1. **DynamoDB 클라이언트 초기화 위치**: 왜 핸들러 밖에서 초기화할까요?
2. **GetItem vs Scan**: 왜 단일 조회에 GetItem을 사용할까요?
3. **UpdateExpression**: 왜 전체 덮어쓰기가 아닌 부분 업데이트를 할까요?

### Step 3: API 테스트 (배포 후)

배포 후 출력된 API URL을 사용하여 테스트합니다:

```bash
# API_URL은 배포 출력에서 확인
API_URL="https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/prod"

# 아이템 생성
curl -X POST "$API_URL/items" \
  -H "Content-Type: application/json" \
  -d '{"name": "테스트 아이템", "description": "서버리스 테스트"}'

# 전체 목록 조회
curl "$API_URL/items"

# 단일 아이템 조회 (ID는 생성 응답에서 확인)
curl "$API_URL/items/{id}"

# 아이템 수정
curl -X PUT "$API_URL/items/{id}" \
  -H "Content-Type: application/json" \
  -d '{"name": "수정된 아이템", "description": "수정 테스트"}'

# 아이템 삭제
curl -X DELETE "$API_URL/items/{id}"
```

### Step 4: 에너지 효율 비교 사고 실험

다음 두 아키텍처의 일일 에너지 소비를 비교해보세요:

**아키텍처 A: EC2 기반**
- t3.micro 인스턴스 1대 (24시간 실행)
- 하루 1,000건 API 요청
- 각 요청 처리 시간: 50ms

**아키텍처 B: 서버리스 (이 Lab)**
- Lambda 함수 (요청 시에만 실행)
- 하루 1,000건 API 요청
- 각 요청 처리 시간: 100ms (콜드 스타트 포함)

```
아키텍처 A 활성 시간: 24시간 = 86,400,000ms
아키텍처 B 활성 시간: 1,000 × 100ms = 100,000ms

→ 서버리스는 EC2의 약 0.12%만 에너지를 사용합니다!
```

**질문**: 그렇다면 요청이 하루 100만 건이면 어떻게 될까요?

### Step 5: DynamoDB 온디맨드 vs 프로비저닝 비교

| 모드 | 유휴 시 비용 | 피크 시 대응 | 지속 가능성 |
|------|------------|-------------|------------|
| 온디맨드 | 거의 없음 | 자동 확장 | 사용량 비례 에너지 |
| 프로비저닝 | 예약 용량 비용 | 수동 조정 필요 | 유휴 에너지 낭비 가능 |
| 프로비저닝 + Auto Scaling | 최소 용량 비용 | 자동 확장 (지연 있음) | 최소 용량만큼 에너지 |

## 소크라테스 질문

1. **요청이 없는 시간에 이 아키텍처의 에너지 소비는?** EC2 기반과 비교하면 차이가 얼마나 될까요?

2. **Lambda의 콜드 스타트는 에너지 낭비일까요?** 콜드 스타트를 줄이기 위해 Provisioned Concurrency를 사용하면 서버리스의 지속 가능성 이점이 줄어들까요?

3. **DynamoDB 온디맨드 모드가 항상 프로비저닝보다 친환경적일까요?** 어떤 경우에 프로비저닝 모드가 더 효율적일까요?

4. **Lambda에서 ARM(Graviton) 아키텍처를 사용하면 코드 변경이 필요할까요?** Python은 되고 C++은 안 되는 이유는?

5. **API Gateway의 스로틀링이 지속 가능성과 무슨 관계가 있을까요?** DDoS 공격이 에너지에 미치는 영향은?

6. **이 아키텍처에서 가장 많은 에너지를 소비하는 컴포넌트는 무엇일까요?** Lambda? DynamoDB? API Gateway?

## 정리 및 다음 단계

### 이 Lab에서 배운 것
- 서버리스 아키텍처는 유휴 시 에너지 소비가 거의 0입니다
- DynamoDB 온디맨드 모드는 사용량에 비례하여 용량이 조절됩니다
- Lambda에서도 ARM(Graviton)을 사용하여 에너지 효율을 높일 수 있습니다
- 효율적인 코드 작성(GetItem vs Scan, UpdateExpression)이 에너지 절약에 기여합니다
- API Gateway의 스로틀링은 불필요한 리소스 사용을 방지합니다

### 다음 단계
- **Script**: `carbon_footprint_check.py`로 AWS 계정의 탄소 발자국을 확인합니다
- **노트 복습**: 3개의 학습 노트를 다시 읽고 핵심 개념을 정리합니다
- **SAA 시험 준비**: 각 노트의 "SAA 시험 핵심 포인트"를 중심으로 복습합니다
