import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * SecureBucket - 보안 기본값이 적용된 S3 버킷 컨스트럭트
 *
 * -- 왜 이런 컨스트럭트가 필요한가?
 * S3 버킷은 AWS에서 가장 많이 사용되는 서비스 중 하나이지만,
 * 잘못 설정하면 데이터 유출의 가장 흔한 원인이 됩니다.
 *
 * 역사적 사례: 2017년 미 국방부 데이터가 공개 S3 버킷에서 유출되었습니다.
 * 이는 단순히 "퍼블릭 액세스 차단"을 설정하지 않았기 때문입니다.
 *
 * 질문: S3 버킷이 기본적으로 "프라이빗"인데, 왜 추가 보안 설정이 필요할까요?
 * 질문: 암호화를 적용하면 성능에 영향이 있을까요? 비용은?
 *
 * SAA 포인트: S3 기본 암호화(SSE-S3)는 추가 비용이 없습니다.
 */

export interface SecureBucketProps {
  /** 버킷 이름 접미사 (고유한 이름 생성에 사용) */
  bucketNameSuffix?: string;
  /** 버전 관리 활성화 여부 (기본값: true) */
  versioned?: boolean;
  /** 자동 삭제 허용 여부 - 개발 환경에서만 true로 설정 (기본값: false) */
  autoDelete?: boolean;
}

export class SecureBucket extends Construct {
  /** 생성된 S3 버킷 인스턴스 */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SecureBucketProps = {}) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      // -- 왜: SSE-S3 암호화를 기본 적용하는 이유
      // 저장 중 암호화(Encryption at Rest)는 보안 Pillar의 핵심 요소입니다.
      // 물리적 디스크가 탈취되더라도 데이터를 읽을 수 없게 합니다.
      // SSE-S3는 AWS가 키를 관리하므로 가장 간단한 옵션입니다.
      // 질문: SSE-S3, SSE-KMS, SSE-C의 차이점은 무엇이고, 각각 언제 사용하나요?
      encryption: s3.BucketEncryption.S3_MANAGED,

      // -- 왜: 퍼블릭 액세스를 완전히 차단하는 이유
      // 대부분의 S3 데이터 유출은 의도치 않은 퍼블릭 액세스 때문입니다.
      // 이 설정은 버킷 정책이나 ACL로도 퍼블릭 설정을 할 수 없게 막습니다.
      // 질문: 정적 웹사이트 호스팅처럼 퍼블릭 접근이 필요한 경우는 어떻게 하나요?
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // -- 왜: SSL/TLS 연결만 허용하는 이유
      // 전송 중 암호화(Encryption in Transit)를 강제합니다.
      // HTTP(비암호화)로 데이터에 접근하는 것을 방지합니다.
      enforceSSL: true,

      // -- 왜: 버전 관리를 기본 활성화하는 이유
      // 실수로 파일을 삭제하거나 덮어써도 이전 버전으로 복구할 수 있습니다.
      // 이는 안정성(Reliability) Pillar의 데이터 보호 패턴입니다.
      // 질문: 버전 관리가 비용에 미치는 영향은? 모든 버킷에 활성화해야 할까요?
      versioned: props.versioned ?? true,

      // -- 왜: removalPolicy를 RETAIN으로 설정하는 이유
      // CDK 스택을 삭제해도 데이터가 담긴 버킷은 유지됩니다.
      // 실수로 `cdk destroy`를 실행해도 데이터 손실을 방지합니다.
      // 개발 환경에서는 DESTROY로 변경하여 깔끔한 정리가 가능합니다.
      removalPolicy: props.autoDelete
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,

      // -- 왜: autoDeleteObjects는 removalPolicy가 DESTROY일 때만 의미가 있습니다.
      // 버킷에 객체가 있으면 삭제가 실패하므로, 자동 삭제를 활성화합니다.
      autoDeleteObjects: props.autoDelete ?? false,
    });
  }
}
