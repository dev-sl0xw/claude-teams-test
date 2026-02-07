import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { TaggedStack, TaggedStackProps } from '../../../shared/constructs/tagged-stack';
import { generateResourceName } from '../../../shared/utils/naming';

/**
 * LambdaStack - Lambda + API Gateway를 구성하는 스택
 *
 * -- 왜 Lambda + API Gateway 조합인가?
 * 서버리스 아키텍처의 가장 기본적인 패턴입니다.
 * API Gateway가 HTTP 요청을 받아 Lambda에 전달하고,
 * Lambda가 비즈니스 로직을 처리하여 응답합니다.
 *
 * 이 조합의 장점:
 *   1. 인프라 관리 불필요 (패치, 스케일링 자동)
 *   2. 사용량 기반 과금 (요청이 없으면 비용 0)
 *   3. 자동 확장 (수천 동시 요청 처리 가능)
 *
 * 질문: EC2 + ALB와 비교했을 때, 어떤 워크로드에서 이 패턴이 더 유리할까요?
 * 질문: Lambda의 15분 실행 제한은 어떤 아키텍처 결정에 영향을 줄까요?
 *
 * SAA 포인트: API Gateway는 REST API와 HTTP API 두 종류가 있습니다.
 *            HTTP API가 더 저렴하고 빠르지만, REST API는 더 많은 기능을 제공합니다.
 */

export class LambdaStack extends TaggedStack {
  /** 생성된 Lambda 함수 */
  public readonly lambdaFunction: lambda.Function;
  /** 생성된 API Gateway REST API */
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: TaggedStackProps) {
    super(scope, id, props);

    // -- 왜: Lambda 함수의 메모리를 256MB로 설정하는 이유
    // Lambda는 메모리에 비례하여 CPU가 할당됩니다.
    // 128MB(최소)는 CPU가 매우 제한적이고, 256MB부터 합리적인 성능을 제공합니다.
    // 질문: 메모리를 1,769MB로 설정하면 vCPU 1개가 완전히 할당됩니다.
    //        왜 이 숫자가 중요할까요?
    this.lambdaFunction = new lambda.Function(this, 'PerformanceHandler', {
      functionName: generateResourceName(
        props.environment,
        'performance',
        'lambda',
        'handler'
      ),
      // -- 왜: Python 3.12 런타임을 선택하는 이유
      // Python은 Lambda에서 가장 빠른 콜드 스타트를 제공하는 런타임 중 하나입니다.
      // Java(JVM 초기화)나 .NET(CLR 초기화)보다 수백 ms 빠릅니다.
      // Node.js도 빠르지만, 데이터 처리에는 Python이 더 풍부한 라이브러리를 제공합니다.
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      // -- 왜: 코드를 별도 디렉토리에서 로드하는 이유
      // Lambda 코드와 CDK 인프라 코드를 분리하면:
      //   1. Lambda 코드만 독립적으로 테스트 가능
      //   2. 배포 패키지 크기를 최소화하여 콜드 스타트 단축
      //   3. 코드 리뷰 시 인프라와 로직을 분리하여 검토
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-code')),
      memorySize: 256,
      // -- 왜: 타임아웃을 30초로 설정하는 이유
      // API Gateway의 최대 타임아웃은 29초입니다.
      // Lambda 타임아웃이 이보다 길면 API Gateway가 먼저 503을 반환합니다.
      // 짧은 타임아웃을 설정하면 무한 루프 등의 비용 폭탄을 방지합니다.
      timeout: cdk.Duration.seconds(30),
      // -- 왜: 환경 변수로 환경 정보를 전달하는 이유
      // 하드코딩 대신 환경 변수를 사용하면 동일한 코드를 dev/staging/prod에서 재사용합니다.
      // Lambda 콘솔에서도 즉시 값을 확인할 수 있어 디버깅이 편합니다.
      environment: {
        ENVIRONMENT: props.environment,
        LOG_LEVEL: 'INFO',
      },
      // -- 왜: 로그 보존 기간을 설정하는 이유
      // CloudWatch Logs는 기본적으로 영구 보존(비용 지속 발생)입니다.
      // 학습/개발 환경에서는 1주일이면 충분합니다.
      // 프로덕션에서는 규정 준수 요건에 따라 설정합니다.
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // -- 왜: API Gateway REST API를 생성하는 이유
    // Lambda 함수를 HTTP 엔드포인트로 노출하기 위해 API Gateway를 사용합니다.
    // 직접 Lambda URL을 사용할 수도 있지만, API Gateway는 추가 기능을 제공합니다:
    //   - 요청 검증, 스로틀링, API 키 관리, CORS 설정
    // 질문: Lambda Function URL과 API Gateway의 차이점은 무엇인가요?
    //        언제 각각을 선택해야 하나요?
    this.api = new apigateway.RestApi(this, 'PerformanceApi', {
      restApiName: generateResourceName(
        props.environment,
        'performance',
        'api',
        'lambda'
      ),
      description: '성능 효율성 Lab - Lambda 콜드/웜 스타트 측정용 API',
      // -- 왜: deployOptions에서 스테이지 이름을 설정하는 이유
      // API Gateway는 "스테이지" 개념으로 환경을 분리합니다.
      // /dev/resource, /prod/resource 처럼 URL에 스테이지가 포함됩니다.
      deployOptions: {
        stageName: props.environment,
        // -- 왜: 트레이싱을 활성화하는 이유
        // X-Ray 트레이싱으로 API Gateway -> Lambda의 전체 요청 흐름을 시각화합니다.
        // 콜드 스타트가 어느 단계에서 발생하는지 정확히 파악할 수 있습니다.
        tracingEnabled: true,
      },
    });

    // -- 왜: /performance 리소스에 GET 메서드를 연결하는 이유
    // RESTful API 설계에서 리소스 경로와 HTTP 메서드로 작업을 구분합니다.
    // GET /performance: 성능 측정 데이터를 조회하는 엔드포인트
    const performanceResource = this.api.root.addResource('performance');
    performanceResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.lambdaFunction, {
        // -- 왜: 프록시 통합을 사용하는 이유
        // 프록시 통합은 요청을 그대로 Lambda에 전달하고, 응답도 그대로 반환합니다.
        // 비프록시 통합은 매핑 템플릿으로 변환이 필요하지만 더 세밀한 제어가 가능합니다.
        proxy: true,
      })
    );

    // -- 왜: API URL을 CloudFormation Output으로 내보내는 이유
    // 스택 배포 후 API 엔드포인트 URL을 쉽게 확인할 수 있습니다.
    // 다른 스택에서 이 값을 참조할 수도 있습니다 (Cross-Stack Reference).
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url ?? 'N/A',
      description: 'API Gateway 엔드포인트 URL',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: this.lambdaFunction.functionName,
      description: 'Lambda 함수 이름 (콜드 스타트 벤치마크에서 사용)',
    });
  }
}
