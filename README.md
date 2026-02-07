# AWS Well-Architected Framework CDK 핸즈온

AWS SAA(Solutions Architect Associate) 수준에서 Well-Architected Framework의 6대 요소를
AWS CDK로 실습하며 학습하는 프로젝트입니다.

## 특징

- **소크라테스식 학습**: 모든 노트와 코드 주석이 "왜(Why)" 중심으로 작성됨
- **CDK 핸즈온**: TypeScript CDK 코드로 직접 인프라를 정의하고 이해
- **선택적 배포**: `cdk synth`로 학습하거나, `cdk deploy`로 실제 배포 가능
- **6대 요소 완전 커버**: 운영 우수성, 보안, 안정성, 성능 효율성, 비용 최적화, 지속 가능성

## 시작하기

### 사전 요구사항

- Node.js 18+ 및 npm
- Python 3.9+
- AWS CLI (설정 완료)
- AWS CDK CLI (`npm install -g aws-cdk`)

### 설치

```bash
# 의존성 설치
npm install
pip install -r requirements.txt

# CDK 부트스트랩 (최초 1회, 실제 배포 시에만 필요)
npx cdk bootstrap
```

### 학습 경로

1. **[00 기초](./00-foundations/)** - CDK와 CloudFormation 기초
2. **[01 운영 우수성](./01-operational-excellence/)** - 모니터링, 자동화
3. **[02 보안](./02-security/)** - IAM, 암호화, 네트워크 보안
4. **[03 안정성](./03-reliability/)** - Multi-AZ, Auto Scaling, DR
5. **[04 성능 효율성](./04-performance-efficiency/)** - Lambda, 캐싱, CDN
6. **[05 비용 최적화](./05-cost-optimization/)** - 수명주기, 예산, 스팟
7. **[06 지속 가능성](./06-sustainability/)** - Graviton, 서버리스

> 자세한 커리큘럼은 [docs/curriculum-overview.md](./docs/curriculum-overview.md)를 참고하세요.

## 기술 스택

| 기술 | 용도 |
|------|------|
| TypeScript | CDK 인프라 코드 |
| Python | 운영 스크립트 (boto3) |
| AWS CDK v2 | Infrastructure as Code |
| Markdown | 학습 노트 |

## 프로젝트 구조

```
├── docs/                # 학습 가이드, 커리큘럼, 서비스 매핑
├── shared/              # 공유 컨스트럭트 및 유틸리티
├── 00-foundations/      # CDK 기초 (노트 5개 + 랩 3개)
├── 01-operational-excellence/  # 운영 우수성 (노트 4개 + 랩 3개)
├── 02-security/         # 보안 (노트 5개 + 랩 4개)
├── 03-reliability/      # 안정성 (노트 4개 + 랩 3개)
├── 04-performance-efficiency/  # 성능 효율성 (노트 4개 + 랩 3개)
├── 05-cost-optimization/       # 비용 최적화 (노트 4개 + 랩 3개)
└── 06-sustainability/   # 지속 가능성 (노트 3개 + 랩 2개)
```
