import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { TaggedStack, TaggedStackProps } from '../../../shared/constructs/tagged-stack';
import { SecureBucket } from '../../../shared/constructs/secure-bucket';
import { generateResourceName } from '../../../shared/utils/naming';

/**
 * CdnStack - CloudFront + S3 오리진을 구성하는 스택
 *
 * -- 왜 CloudFront를 사용하는가?
 * S3에 직접 접근하면 서울 리전(ap-northeast-2)에서만 응답합니다.
 * 미국, 유럽 사용자는 수백 ms의 지연시간을 경험합니다.
 *
 * CloudFront를 사용하면:
 *   1. 전 세계 수백 곳의 엣지 로케이션에서 콘텐츠 캐싱
 *   2. 사용자에게 가장 가까운 위치에서 응답 (지연시간 최소화)
 *   3. S3 직접 접근을 차단하여 보안 강화 (OAC)
 *   4. DDoS 보호 (AWS Shield 기본 포함)
 *
 * 질문: S3는 이미 높은 가용성(99.99%)을 제공하는데,
 *        왜 CloudFront를 추가해야 할까요? "가용성"과 "성능"의 차이를 생각해보세요.
 *
 * SAA 포인트: CloudFront는 글로벌 서비스입니다. 리전에 종속되지 않습니다.
 *            하지만 SSL 인증서는 반드시 us-east-1에서 생성해야 합니다.
 */

export class CdnStack extends TaggedStack {
  /** CloudFront 배포 */
  public readonly distribution: cloudfront.Distribution;
  /** S3 오리진 버킷 */
  public readonly originBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: TaggedStackProps) {
    super(scope, id, props);

    // -- 왜: SecureBucket을 사용하는 이유
    // 보안 기본값(암호화, 퍼블릭 차단, SSL 강제)이 자동 적용됩니다.
    // CloudFront 오리진 버킷은 절대 퍼블릭이어서는 안 됩니다.
    // 질문: 정적 웹사이트 호스팅을 위해 S3를 퍼블릭으로 설정하는 것과
    //        CloudFront + OAC를 사용하는 것의 보안 차이는?
    const secureBucket = new SecureBucket(this, 'OriginBucket', {
      bucketNameSuffix: 'cdn-origin',
      // -- 왜: 버전 관리를 활성화하는 이유
      // 잘못된 파일을 배포해도 이전 버전으로 즉시 롤백할 수 있습니다.
      // CloudFront 캐시 무효화와 함께 사용하면 빠른 롤백이 가능합니다.
      versioned: true,
      // -- 왜: 학습 환경에서 autoDelete를 true로 설정하는 이유
      // cdk destroy 시 버킷이 자동 삭제되어 깔끔한 정리가 가능합니다.
      // 프로덕션에서는 절대 true로 설정하지 마세요!
      autoDelete: true,
    });
    this.originBucket = secureBucket.bucket;

    // -- 왜: OAC(Origin Access Control)를 사용하는 이유
    // OAC는 CloudFront만 S3 버킷에 접근할 수 있도록 제한합니다.
    // 사용자가 S3 URL을 직접 알아내더라도 접근할 수 없습니다.
    //
    // OAC vs OAI (이전 방식):
    //   - OAC: 서버측 암호화(SSE-KMS) 지원, 더 세밀한 권한 제어
    //   - OAI: 레거시, 새 배포에서는 OAC 권장
    //
    // 질문: OAC 없이 CloudFront를 사용하면 어떤 보안 문제가 발생할까요?
    //        S3 요청 비용과 CloudFront 비용의 차이도 생각해보세요.

    // -- 왜: CloudFront Distribution을 생성하는 이유
    // Distribution은 CloudFront의 "배포 단위"입니다.
    // 하나의 Distribution에 여러 오리진과 캐시 동작을 설정할 수 있습니다.
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${props.environment} - 성능 효율성 Lab CloudFront 배포`,

      defaultBehavior: {
        // -- 왜: S3BucketOrigin.withOriginAccessControl을 사용하는 이유
        // CDK L2 구성에서 OAC를 자동으로 설정합니다.
        // S3 버킷 정책도 자동으로 업데이트하여 CloudFront에만 접근을 허용합니다.
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.originBucket),

        // -- 왜: HTTPS 리다이렉트를 설정하는 이유
        // HTTP 요청을 자동으로 HTTPS로 리다이렉트합니다.
        // 전송 중 데이터를 암호화하여 중간자 공격(MITM)을 방지합니다.
        // 질문: HTTPS_ONLY vs REDIRECT_TO_HTTPS의 차이점은?
        //        사용자 경험에 어떤 영향을 줄까요?
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

        // -- 왜: 캐시 정책을 CACHING_OPTIMIZED로 설정하는 이유
        // AWS 관리형 캐시 정책으로, 정적 콘텐츠에 최적화되어 있습니다.
        // TTL: 기본 24시간, 최대 365일
        // 질문: TTL을 너무 길게 설정하면 어떤 문제가 생길까요?
        //        파일을 업데이트했는데 사용자에게 이전 버전이 보인다면?
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,

        // -- 왜: 압축을 활성화하는 이유
        // Gzip/Brotli 압축으로 전송 데이터 크기를 줄입니다.
        // 일반적으로 텍스트 기반 파일(HTML, CSS, JS)이 60~80% 압축됩니다.
        // 대역폭 비용 절감과 로딩 속도 향상의 두 가지 효과가 있습니다.
        compress: true,
      },

      // -- 왜: index.html을 기본 루트 객체로 설정하는 이유
      // / 경로로 접근할 때 자동으로 index.html을 반환합니다.
      // SPA(Single Page Application) 호스팅에 필수적입니다.
      defaultRootObject: 'index.html',

      // -- 왜: 커스텀 에러 응답을 설정하는 이유
      // S3에서 404를 반환할 때, 커스텀 에러 페이지를 보여줍니다.
      // SPA에서는 클라이언트 사이드 라우팅을 위해 index.html로 리다이렉트합니다.
      // 질문: 403 에러도 처리해야 하는 이유는?
      //        S3에서 존재하지 않는 객체 접근 시 403이 반환되는 경우가 있나요?
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],

      // -- 왜: 가격 등급을 PriceClass 100으로 설정하는 이유
      // PRICE_CLASS_100: 가장 저렴한 엣지 로케이션만 사용 (북미, 유럽)
      // PRICE_CLASS_200: + 아시아, 아프리카, 중동
      // PRICE_CLASS_ALL: 모든 엣지 로케이션
      // 학습 환경에서는 비용 절약을 위해 100을 사용합니다.
      // 질문: 한국 사용자가 주 대상이라면 어떤 가격 등급을 선택해야 할까요?
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // -- 왜: CloudFront 도메인 이름을 Output으로 내보내는 이유
    // 배포 후 이 URL로 접근하여 CDN이 정상 동작하는지 확인합니다.
    // 커스텀 도메인을 설정하기 전에 CloudFront 도메인으로 테스트합니다.
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront 배포 도메인 이름',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront 배포 ID (캐시 무효화에 사용)',
    });

    new cdk.CfnOutput(this, 'OriginBucketName', {
      value: this.originBucket.bucketName,
      description: 'S3 오리진 버킷 이름 (콘텐츠 업로드용)',
    });
  }
}
