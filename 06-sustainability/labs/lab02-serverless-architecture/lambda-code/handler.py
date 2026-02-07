"""
서버리스 CRUD 핸들러 - 지속 가능성 Lab

-- 왜 서버리스인가?
이 Lambda 함수는 요청이 있을 때만 실행됩니다.
EC2 기반 서버는 요청이 없어도 24시간 전기를 소비하지만,
이 함수는 호출될 때만 밀리초 단위로 컴퓨팅 자원을 사용합니다.

질문: 하루에 100건의 요청을 처리하는 이 함수의 총 실행 시간은?
→ 100건 × 평균 100ms = 10초. 하루 중 10초만 에너지를 사용합니다.
   EC2는 같은 작업을 위해 86,400초(24시간) 동안 에너지를 사용합니다.
"""

import json
import os
import uuid
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

# -- 왜: Lambda 핸들러 밖에서 DynamoDB 클라이언트를 초기화합니다.
# Lambda 컨테이너가 재사용될 때(Warm Start) 클라이언트를 재생성하지 않아도 됩니다.
# 이것은 실행 시간을 줄여 에너지 효율을 높이는 최적화 기법입니다.
# 질문: 왜 핸들러 안이 아닌 밖에서 초기화할까요?
# → 핸들러는 매 호출마다 실행되지만, 핸들러 밖 코드는 콜드 스타트 시에만 실행됩니다.
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("TABLE_NAME", "items")
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    """
    API Gateway에서 전달된 요청을 처리하는 메인 핸들러

    -- 왜 하나의 핸들러에서 모든 CRUD를 처리할까요?
    트래픽이 적은 학습 환경에서는 하나의 Lambda가 효율적입니다.
    여러 Lambda로 분리하면 각각 콜드 스타트가 발생하여
    오히려 총 에너지 소비가 증가할 수 있습니다.
    """
    http_method = event.get("httpMethod", "")
    path_parameters = event.get("pathParameters") or {}
    item_id = path_parameters.get("id")

    try:
        if http_method == "GET" and item_id:
            return get_item(item_id)
        elif http_method == "GET":
            return list_items()
        elif http_method == "POST":
            return create_item(event)
        elif http_method == "PUT" and item_id:
            return update_item(item_id, event)
        elif http_method == "DELETE" and item_id:
            return delete_item(item_id)
        else:
            return response(400, {"error": "지원하지 않는 요청입니다"})
    except ClientError as e:
        # -- 왜: AWS 서비스 에러를 별도로 처리합니다.
        # DynamoDB 요청 제한(ThrottlingException) 등을 구분하여 적절히 응답합니다.
        return response(500, {"error": f"AWS 서비스 오류: {e.response['Error']['Message']}"})
    except Exception as e:
        return response(500, {"error": f"서버 오류: {str(e)}"})


def create_item(event):
    """
    새 아이템을 생성합니다.

    -- 왜: UUID를 서버에서 생성합니다.
    클라이언트가 ID를 보내지 않아도 됩니다.
    서버에서 유일한 ID를 보장하면 중복 데이터를 방지하여
    불필요한 스토리지 사용(= 에너지 낭비)을 줄입니다.
    """
    body = json.loads(event.get("body", "{}"))

    item = {
        "id": str(uuid.uuid4()),
        "name": body.get("name", ""),
        "description": body.get("description", ""),
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }

    table.put_item(Item=item)

    return response(201, {"message": "아이템이 생성되었습니다", "item": item})


def get_item(item_id):
    """
    ID로 아이템을 조회합니다.

    -- 왜: GetItem을 사용합니다 (Query나 Scan이 아닌).
    GetItem은 파티션 키로 직접 접근하므로 소비하는 읽기 용량이 최소입니다.
    Scan은 전체 테이블을 읽으므로 불필요한 에너지를 소비합니다.
    질문: Scan 대신 GetItem을 사용하면 에너지가 얼마나 절약될까요?
    """
    result = table.get_item(Key={"id": item_id})

    item = result.get("Item")
    if not item:
        return response(404, {"error": "아이템을 찾을 수 없습니다"})

    return response(200, {"item": item})


def list_items():
    """
    모든 아이템을 조회합니다.

    -- 왜: Scan을 사용합니다.
    전체 목록 조회는 Scan이 불가피합니다.
    하지만 Limit 파라미터로 한 번에 가져오는 양을 제한하여
    불필요한 읽기 용량 소비를 줄일 수 있습니다.

    질문: 아이템이 100만 개라면 이 API는 어떤 문제가 발생할까요?
    → 페이지네이션이 필요합니다. 한 번에 모든 데이터를 반환하면
      네트워크 대역폭과 Lambda 메모리를 낭비합니다.
    """
    result = table.scan(Limit=100)

    items = result.get("Items", [])

    return response(200, {"items": items, "count": len(items)})


def update_item(item_id, event):
    """
    아이템을 수정합니다.

    -- 왜: UpdateExpression을 사용합니다 (전체 덮어쓰기가 아닌).
    변경된 필드만 업데이트하면 DynamoDB의 쓰기 용량을 절약합니다.
    전체 아이템을 put_item으로 덮어쓰면 변경되지 않은 데이터도
    다시 쓰므로 에너지가 낭비됩니다.
    """
    body = json.loads(event.get("body", "{}"))

    result = table.update_item(
        Key={"id": item_id},
        UpdateExpression="SET #n = :name, description = :desc, updatedAt = :updated",
        ExpressionAttributeNames={"#n": "name"},
        ExpressionAttributeValues={
            ":name": body.get("name", ""),
            ":desc": body.get("description", ""),
            ":updated": datetime.utcnow().isoformat(),
        },
        ReturnValues="ALL_NEW",
        ConditionExpression="attribute_exists(id)",
    )

    return response(200, {"message": "아이템이 수정되었습니다", "item": result.get("Attributes")})


def delete_item(item_id):
    """
    아이템을 삭제합니다.

    -- 왜: 불필요한 데이터를 삭제합니다.
    사용하지 않는 데이터를 저장하는 것도 에너지 낭비입니다.
    DynamoDB는 데이터를 3개 가용 영역에 복제하므로,
    1KB의 불필요한 데이터는 실제로 3KB의 스토리지를 차지합니다.
    """
    table.delete_item(
        Key={"id": item_id},
        ConditionExpression="attribute_exists(id)",
    )

    return response(200, {"message": "아이템이 삭제되었습니다"})


def response(status_code, body):
    """
    API Gateway 형식의 응답을 생성합니다.

    -- 왜: CORS 헤더를 포함합니다.
    프론트엔드에서 직접 API를 호출할 수 있게 합니다.
    별도의 프록시 서버를 운영하지 않아도 되므로 리소스를 절약합니다.
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        },
        "body": json.dumps(body, default=str, ensure_ascii=False),
    }
