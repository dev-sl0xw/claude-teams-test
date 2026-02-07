# Lab 01: Lambda Functions - 콜드 스타트와 성능 측정

## 학습 목표

- Lambda 함수를 CDK로 정의하고 API Gateway와 연동하는 방법을 이해합니다
- Lambda의 콜드 스타트(Cold Start)와 웜 스타트(Warm Start)의 차이를 체험합니다
- Python 핸들러의 초기화 코드와 핸들러 코드의 실행 시점 차이를 이해합니다
- API Gateway REST API의 프록시 통합 방식을 학습합니다

## 사전 지식

- Lambda의 실행 모델 (이벤트 기반, 동시 실행)
- API Gateway의 역할 (HTTP 요청을 Lambda로 라우팅)
- Python 기초 문법

## 아키텍처 다이어그램

```
+----------+      +---------------+      +------------------+
|          |      |               |      |                  |
|  Client  +----->+ API Gateway   +----->+  Lambda Function |
|  (curl)  |      | (REST API)    |      |  (Python 3.12)   |
|          |<-----+               |<-----+                  |
+----------+      +-------+-------+      +--------+---------+
                          |                        |
                          v                        v
                   CloudWatch Logs          CloudWatch Metrics
                   (API 접근 로그)           (실행 시간, 에러율)
```

## 선택적 배포 안내

```bash
# 스택 합성 (CloudFormation 템플릿 생성)
npx cdk synth --app "npx ts-node 04-performance-efficiency/labs/lab01-lambda-functions/bin/app.ts"

# 변경사항 확인
npx cdk diff --app "npx ts-node 04-performance-efficiency/labs/lab01-lambda-functions/bin/app.ts"

# 배포
npx cdk deploy --app "npx ts-node 04-performance-efficiency/labs/lab01-lambda-functions/bin/app.ts"

# 정리
npx cdk destroy --app "npx ts-node 04-performance-efficiency/labs/lab01-lambda-functions/bin/app.ts"
```

## 단계별 실습

### Step 1: Lambda 스택 코드 분석

`lib/lambda-stack.ts`를 열고 다음을 확인하세요:

1. **메모리 설정 (256MB)**: 왜 128MB가 아닌 256MB인가요?
2. **타임아웃 설정 (30초)**: API Gateway의 최대 타임아웃과의 관계는?
3. **Python 런타임 선택**: Java나 .NET 대비 콜드 스타트 장점은?

### Step 2: Python 핸들러 분석

`lambda-code/handler.py`를 열고 다음을 확인하세요:

1. `INIT_TIME`은 언제 실행되나요? (핸들러 외부 = 콜드 스타트 시 1회)
2. `invocation_count`가 1이면 콜드 스타트, 2 이상이면 웜 스타트
3. `context.get_remaining_time_in_millis()`의 용도는?

### Step 3: 콜드 스타트 측정

배포 후 다음 명령어로 콜드 스타트를 측정합니다:

```bash
# 첫 번째 호출 (콜드 스타트)
curl -s <API_URL>/performance | python3 -m json.tool

# 즉시 두 번째 호출 (웜 스타트)
curl -s <API_URL>/performance | python3 -m json.tool

# 결과 비교: is_cold_start, execution_time_ms, time_since_init_ms
```

### Step 4: 벤치마크 스크립트 실행

```bash
python3 04-performance-efficiency/scripts/benchmark_lambda.py
```

## 소크라테스 질문

1. **콜드 스타트는 왜 발생하는가?** Lambda가 새로운 실행 환경을 만드는 과정을 설명할 수 있나요?
2. **핸들러 외부 코드의 의미**: DB 연결, SDK 초기화를 핸들러 안에 넣으면 어떤 문제가 생길까요?
3. **메모리와 CPU의 관계**: Lambda 메모리를 2배로 늘리면 실행 시간이 절반으로 줄어들까요? 왜?
4. **Provisioned Concurrency**: 콜드 스타트를 완전히 제거할 수 있다면, 왜 모든 함수에 사용하지 않을까요?
5. **VPC 내 Lambda**: Lambda를 VPC에 연결하면 콜드 스타트에 어떤 영향이 있을까요?

## 정리 및 다음 단계

이 Lab에서는 Lambda의 콜드 스타트 메커니즘을 이해하고 직접 측정했습니다.

**핵심 교훈:**
- 콜드 스타트는 실행 환경 초기화 비용이며, 런타임/패키지 크기/VPC 연결에 영향받음
- 핸들러 외부 초기화를 활용하면 웜 스타트 시 재사용되어 성능 향상
- 메모리 설정이 CPU 할당에 영향을 미치므로, 메모리와 실행 시간의 균형점을 찾아야 함

**다음 Lab:** [Lab 02 - ElastiCache]에서 인메모리 캐시를 구성하여 데이터베이스 성능을 최적화합니다.
