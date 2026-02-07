import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { TaggedStack, TaggedStackProps } from '../../../shared/constructs/tagged-stack';
import { generateResourceName } from '../../../shared/utils/naming';

/**
 * ServerlessStack - 서버리스 아키텍처로 유휴 리소스 제거 스택
 *
 * -- 왜 서버리스가 지속 가능성에 기여하는가?
 * 전통적인 서버는 요청이 없어도 24시간 실행됩니다.
 * 서버리스는 요청이 있을 때만 컴퓨팅 자원을 사용합니다.
 * 유휴 시간의 에너지 낭비를 "0"으로 만드는 것이 서버리스의 핵심 가치입니다.
 *
 * 질문: 하루에 100건의 API 요청을 처리하는 서비스가 있다면,
 *        EC2 vs Lambda 중 어떤 것이 에너지를 더 적게 사용할까요?
 *
 * SAA 포인트: Lambda + API Gateway + DynamoDB는 "완전 서버리스" 아키텍처의 대표적 패턴입니다.
 */
export class ServerlessStack extends TaggedStack {
  constructor(scope: Construct, id: string, props: TaggedStackProps) {
    super(scope, id, props);

    // ========================================================================
    // DynamoDB 테이블 - 온디맨드 모드
    // ========================================================================

    // -- 왜: DynamoDB 온디맨드(PAY_PER_REQUEST) 모드를 사용합니다.
    // 프로비저닝 모드는 미리 읽기/쓰기 용량을 예약하므로 사용하지 않아도 비용이 발생합니다.
    // 온디맨드 모드는 실제 요청량에 비례하여 용량이 자동 조절됩니다.
    // 질문: 온디맨드 모드가 항상 프로비저닝 모드보다 저렴할까요?
    // → 아닙니다. 트래픽이 일정하고 높은 경우 프로비저닝 모드가 더 저렴합니다.
    //   하지만 지속 가능성 관점에서는 온디맨드가 리소스 낭비를 줄입니다.
    const table = new dynamodb.Table(this, 'ItemsTable', {
      tableName: generateResourceName(
        this.environment,
        'sustainability',
        'dynamodb',
        'items'
      ),
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      // -- 왜: removalPolicy를 DESTROY로 설정합니다.
      // 학습 환경이므로 스택 삭제 시 테이블도 함께 삭제됩니다.
      // 실무에서는 RETAIN을 사용하여 실수로 데이터가 삭제되지 않도록 합니다.
      removalPolicy: cdk.RemovalPolicy.DESTROY,

      // -- 왜: pointInTimeRecovery를 활성화합니다.
      // 학습 환경이지만, 데이터 보호는 항상 중요합니다.
      // 추가 비용이 거의 없으므로 지속 가능성에 영향 없이 안전성을 높입니다.
      pointInTimeRecovery: true,
    });

    // ========================================================================
    // Lambda 함수 - Python 핸들러
    // ========================================================================

    // -- 왜: Lambda 함수를 Python으로 작성합니다.
    // Python은 Lambda에서 가장 인기 있는 런타임 중 하나이며,
    // 콜드 스타트 시간이 짧아 에너지 효율이 좋습니다.
    // 질문: Lambda 런타임 선택이 에너지 소비에 영향을 줄까요?
    // → 네! 콜드 스타트 시간이 짧은 런타임은 초기화에 드는 에너지가 적습니다.
    //   Python, Node.js > Java, .NET (콜드 스타트 기준)
    const handler = new lambda.Function(this, 'CrudHandler', {
      functionName: generateResourceName(
        this.environment,
        'sustainability',
        'lambda',
        'crud-handler'
      ),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('lambda-code'),

      // -- 왜: 메모리를 256MB로 설정합니다.
      // Lambda의 CPU 성능은 메모리에 비례합니다.
      // 너무 적은 메모리는 실행 시간을 늘려 오히려 에너지를 더 소비합니다.
      // 질문: 128MB로 2초 걸리는 것과 256MB로 1초 걸리는 것, 어느 쪽이 에너지 효율적일까요?
      // → 총 에너지 = 전력 × 시간. 256MB × 1초 = 128MB × 2초, 비슷하거나 빠른 쪽이 유리합니다.
      memorySize: 256,

      // -- 왜: 타임아웃을 30초로 설정합니다.
      // CRUD 작업은 대부분 1초 이내에 완료됩니다.
      // 하지만 DynamoDB 지연이 발생할 수 있으므로 여유 있게 설정합니다.
      timeout: cdk.Duration.seconds(30),

      // -- 왜: ARM_64 아키텍처를 사용합니다.
      // Lambda에서도 Graviton을 사용할 수 있습니다!
      // ARM 기반 Lambda는 x86 대비 20% 저렴하고 에너지 효율도 높습니다.
      // 질문: Lambda에서 Graviton을 사용하면 코드를 수정해야 할까요?
      // → Python 같은 인터프리터 언어는 수정 불필요. 네이티브 바이너리를 쓰는 경우만 주의.
      architecture: lambda.Architecture.ARM_64,

      environment: {
        TABLE_NAME: table.tableName,
        // -- 왜: 환경 변수로 테이블 이름을 전달합니다.
        // Lambda 코드에서 하드코딩하면 스택 변경 시 코드도 수정해야 합니다.
        // 환경 변수는 인프라와 코드의 결합도를 낮춥니다.
      },
    });

    // -- 왜: Lambda에 DynamoDB 읽기/쓰기 권한을 부여합니다.
    // IAM 최소 권한 원칙: 필요한 권한만 정확히 부여합니다.
    // grantReadWriteData()는 해당 테이블에 대한 CRUD 권한만 부여합니다.
    table.grantReadWriteData(handler);

    // ========================================================================
    // API Gateway - REST API
    // ========================================================================

    // -- 왜: API Gateway를 Lambda 앞에 배치합니다.
    // API Gateway는 요청 검증, 스로틀링, CORS 처리를 담당합니다.
    // Lambda가 직접 인터넷에 노출되지 않으므로 보안이 강화됩니다.
    // 질문: API Gateway 없이 Lambda URL을 직접 사용하면 어떤 문제가 있을까요?
    // → 요청 제한(스로틀링), API 키 관리, 요청/응답 변환 등을 직접 구현해야 합니다.
    const api = new apigateway.RestApi(this, 'ItemsApi', {
      restApiName: generateResourceName(
        this.environment,
        'sustainability',
        'api',
        'items'
      ),
      description: '지속 가능성 Lab - 서버리스 CRUD API',

      // -- 왜: deployOptions에서 스로틀링을 설정합니다.
      // 과도한 요청은 Lambda 동시 실행 수를 늘려 불필요한 에너지를 소비합니다.
      // 적절한 스로틀링은 비용과 에너지를 모두 절약합니다.
      deployOptions: {
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
    });

    // -- 왜: /items 리소스에 CRUD 메서드를 연결합니다.
    // 하나의 Lambda가 여러 HTTP 메서드를 처리합니다 (모놀리식 Lambda 패턴).
    // 질문: 각 HTTP 메서드마다 별도 Lambda를 만드는 것과 하나로 통합하는 것, 어느 쪽이 더 효율적일까요?
    // → 트래픽이 적으면 하나의 Lambda가 효율적 (콜드 스타트 관리가 쉬움).
    //   트래픽이 많으면 분리가 유리 (독립적 스케일링 가능).
    const items = api.root.addResource('items');
    const lambdaIntegration = new apigateway.LambdaIntegration(handler);

    items.addMethod('GET', lambdaIntegration);    // 전체 목록 조회
    items.addMethod('POST', lambdaIntegration);   // 새 아이템 생성

    const singleItem = items.addResource('{id}');
    singleItem.addMethod('GET', lambdaIntegration);    // 단일 조회
    singleItem.addMethod('PUT', lambdaIntegration);    // 수정
    singleItem.addMethod('DELETE', lambdaIntegration); // 삭제

    // ========================================================================
    // 출력값
    // ========================================================================

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway 엔드포인트 URL',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: handler.functionName,
      description: 'Lambda 함수 이름',
    });

    new cdk.CfnOutput(this, 'DynamoDbTableName', {
      value: table.tableName,
      description: 'DynamoDB 테이블 이름',
    });

    // -- 왜: 서버리스 장점 메시지를 출력합니다.
    new cdk.CfnOutput(this, 'SustainabilityNote', {
      value: '이 아키텍처는 요청이 없을 때 에너지 소비가 0입니다. EC2 기반 서버와 비교해보세요.',
      description: '서버리스 지속 가능성 안내',
    });
  }
}
