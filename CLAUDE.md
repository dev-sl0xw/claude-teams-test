# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

AWS Well-Architected Framework 6대 요소를 CDK로 학습하는 핸즈온 프로젝트입니다.
SAA(Solutions Architect Associate) 수준의 지식을 소크라테스식 질문법으로 학습합니다.

## 빌드 및 실행 명령어

```bash
# TypeScript 빌드
npm run build

# 타입 체크 (빌드 없이)
npm run check

# CDK 관련
npx cdk synth           # CloudFormation 템플릿 생성
npx cdk deploy          # AWS에 배포
npx cdk destroy         # 배포 리소스 정리
npx cdk diff            # 변경사항 비교

# Python 스크립트 실행
python shared/python/aws_helper.py
```

## 디렉토리 구조

```
├── shared/              # 공유 컨스트럭트와 유틸리티
│   ├── constructs/      # TaggedStack, SecureBucket, StandardVpc
│   ├── utils/           # naming.ts, tags.ts
│   └── python/          # boto3 헬퍼
├── docs/                # 학습 가이드 문서
├── 00-foundations/      # CDK 기초
├── 01-operational-excellence/
├── 02-security/
├── 03-reliability/
├── 04-performance-efficiency/
├── 05-cost-optimization/
└── 06-sustainability/
```

## 코딩 규칙

### 언어
- 학습 노트: 한국어 Markdown
- 코드 주석: 한국어 (소크라테스식)
- 변수/함수명: 영문 (TypeScript/Python 표준)

### CDK 코드 주석 스타일
```typescript
// -- 왜: [이 설정이 존재하는 이유]
// [구체적 설명]
// 질문: [학습자가 생각해볼 질문]
// SAA 포인트: [시험 관련 핵심]
```

### 노트 구조
모든 노트는 `docs/socratic-method-guide.md`의 템플릿을 따릅니다:
1. 왜 이것이 중요한가? (질문)
2. 핵심 개념
3. 잠깐, 그런데... (흔한 오해)
4. 핸즈온 연결
5. SAA 시험 핵심 포인트
6. 관련 Pillar

### CDK 스택 규칙
- 모든 스택은 `shared/constructs/tagged-stack.ts`의 `TaggedStack`을 상속
- S3 버킷은 `shared/constructs/secure-bucket.ts`의 `SecureBucket` 사용
- VPC는 `shared/constructs/standard-vpc.ts`의 `StandardVpc` 사용
- 리소스 네이밍은 `shared/utils/naming.ts` 함수 사용

### 파일 네이밍
- 노트: `NN-kebab-case-제목.md` (예: `01-pillar-개요.md`)
- 랩: `labNN-descriptive-name/` (예: `lab01-first-stack/`)
- 스택: `descriptive-name-stack.ts` (예: `cloudwatch-stack.ts`)
- Python: `snake_case.py` (예: `check_cloudwatch_metrics.py`)
