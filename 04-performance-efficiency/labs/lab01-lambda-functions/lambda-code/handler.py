"""
Lambda 핸들러 - 성능 효율성 Lab 01

-- 왜 이 핸들러가 필요한가?
Lambda의 콜드 스타트와 웜 스타트를 직접 측정하기 위한 핸들러입니다.
핸들러 외부(모듈 레벨) 코드와 내부 코드의 실행 시점 차이를 이해하는 것이 핵심입니다.

질문: 아래 코드에서 INIT_TIME은 언제 실행될까요?
      매 요청마다? 아니면 콜드 스타트 시에만?

SAA 포인트: Lambda의 실행 환경은 일정 시간 "따뜻하게(warm)" 유지됩니다.
           이 시간은 AWS가 관리하며, 보장되지 않습니다.
"""

import json
import os
import time
from datetime import datetime

# -- 왜: 핸들러 외부에서 초기화 시간을 기록하는 이유
# 이 코드는 Lambda 실행 환경이 생성될 때(콜드 스타트) 한 번만 실행됩니다.
# 이후 요청(웜 스타트)에서는 이미 초기화된 값이 재사용됩니다.
# 질문: DB 연결, SDK 클라이언트 초기화를 여기서 하면 왜 성능이 좋아질까요?
INIT_TIME = time.time()
INIT_TIMESTAMP = datetime.utcnow().isoformat()

# -- 왜: 호출 카운터를 전역 변수로 관리하는 이유
# 같은 실행 환경에서 처리된 요청 수를 추적합니다.
# 카운터가 1이면 콜드 스타트, 2 이상이면 웜 스타트입니다.
invocation_count = 0


def lambda_handler(event, context):
    """
    Lambda 핸들러 함수

    -- 왜: event와 context 두 개의 파라미터를 받는가?
    event: API Gateway로부터 전달된 요청 정보 (HTTP 메서드, 헤더, 바디 등)
    context: Lambda 실행 환경 정보 (함수 이름, 메모리, 남은 실행 시간 등)

    질문: context.get_remaining_time_in_millis()는 왜 유용할까요?
          타임아웃 직전에 정리 작업을 해야 한다면?
    """
    global invocation_count
    invocation_count += 1

    try:
        # -- 왜: 요청 시작 시간을 기록하는 이유
        # 핸들러 실행 시간(웜 스타트 지연시간)을 측정합니다.
        # INIT_TIME과의 차이가 크면 콜드 스타트가 발생한 것입니다.
        request_start = time.time()

        # -- 왜: 콜드 스타트 여부를 판단하는 이유
        # invocation_count == 1이면 이 실행 환경에서의 첫 번째 요청(콜드 스타트)입니다.
        is_cold_start = invocation_count == 1

        # -- 왜: 의도적으로 약간의 작업을 수행하는 이유
        # 실제 애플리케이션에서는 DB 쿼리, 외부 API 호출 등의 작업이 있습니다.
        # 여기서는 간단한 계산으로 대체하여 순수 실행 시간을 측정합니다.
        result = sum(i * i for i in range(1000))

        # -- 왜: 상세한 성능 메트릭을 응답에 포함하는 이유
        # 벤치마크 스크립트가 이 데이터를 수집하여 콜드/웜 스타트 통계를 분석합니다.
        request_end = time.time()
        execution_time_ms = (request_end - request_start) * 1000
        time_since_init_ms = (request_start - INIT_TIME) * 1000

        response_body = {
            "message": "Performance Efficiency Lab - Lambda Handler",
            "performance_metrics": {
                "is_cold_start": is_cold_start,
                "invocation_count": invocation_count,
                "execution_time_ms": round(execution_time_ms, 2),
                "time_since_init_ms": round(time_since_init_ms, 2),
                "init_timestamp": INIT_TIMESTAMP,
                "request_timestamp": datetime.utcnow().isoformat(),
            },
            "environment": {
                "function_name": context.function_name,
                "memory_limit_mb": context.memory_limit_in_mb,
                "remaining_time_ms": context.get_remaining_time_in_millis(),
                "runtime_environment": os.environ.get("ENVIRONMENT", "unknown"),
                "aws_region": os.environ.get("AWS_REGION", "unknown"),
            },
            "computation_result": result,
        }

        # -- 왜: API Gateway 프록시 통합 응답 형식을 따르는 이유
        # API Gateway Lambda Proxy Integration은 특정 응답 형식을 요구합니다.
        # statusCode, headers, body가 정확히 이 형식이어야 합니다.
        # 질문: headers에 CORS 설정을 추가하지 않으면 브라우저에서 어떤 오류가 발생할까요?
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "X-Cold-Start": str(is_cold_start).lower(),
                "X-Invocation-Count": str(invocation_count),
            },
            "body": json.dumps(response_body, ensure_ascii=False),
        }
    except Exception as e:
        print(f"Error in lambda_handler: {type(e).__name__} - {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"서버 오류: {str(e)}"}, ensure_ascii=False),
        }
