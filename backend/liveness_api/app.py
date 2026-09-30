"""HTTP API for the Face Liveness demo.

Two routes, both served through CloudFront under /api:

    POST /api/sessions                        create a Face Liveness session
    POST /api/sessions/{sessionId}/results    fetch and summarize its results

The pass/fail decision is made here, not in the clients, so every client
applies the same confidence threshold.
"""

from __future__ import annotations

import base64
import os
import re
from typing import Any

import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver
from aws_lambda_powertools.event_handler.exceptions import (
    BadRequestError,
    NotFoundError,
    ServiceError,
)
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError

CHALLENGE_TYPES = ("FaceMovementAndLightChallenge", "FaceMovementChallenge")
MAX_AUDIT_IMAGES = 4
SESSION_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
MAX_CLIENT_FIELDS = 16
MAX_CLIENT_VALUE_LENGTH = 200

logger = Logger()
app = APIGatewayHttpResolver(strip_prefixes=["/api"])
rekognition = boto3.client("rekognition")


def confidence_threshold() -> float:
    return float(os.environ.get("CONFIDENCE_THRESHOLD", "70"))


@app.post("/sessions")
def create_session() -> dict[str, Any]:
    body = app.current_event.json_body or {}
    if not isinstance(body, dict):
        raise BadRequestError("Request body must be a JSON object")

    settings: dict[str, Any] = {"AuditImagesLimit": _audit_images_limit(body)}
    challenge_type = body.get("challengeType")
    if challenge_type is not None:
        if challenge_type not in CHALLENGE_TYPES:
            raise BadRequestError(
                f"challengeType must be one of {', '.join(CHALLENGE_TYPES)}"
            )
        settings["ChallengePreferences"] = [{"Type": challenge_type}]

    response = _call(rekognition.create_face_liveness_session, Settings=settings)
    logger.info(
        "liveness session created",
        session_id=response["SessionId"],
        challenge_type=challenge_type,
        audit_images_limit=settings["AuditImagesLimit"],
    )
    return {"sessionId": response["SessionId"]}


@app.post("/sessions/<session_id>/results")
def get_results(session_id: str) -> dict[str, Any]:
    if not SESSION_ID_PATTERN.match(session_id):
        raise BadRequestError("sessionId is not a valid Face Liveness session ID")

    body = app.current_event.json_body or {}
    client = _client_context(body.get("client") if isinstance(body, dict) else None)

    response = _call(
        rekognition.get_face_liveness_session_results, SessionId=session_id
    )
    result = summarize(response, confidence_threshold())

    # One line per result, without images, so pass rates can be compared by
    # platform and zoom level in CloudWatch Logs Insights.
    logger.info(
        "liveness result",
        session_id=session_id,
        status=result["status"],
        confidence=result["confidence"],
        is_live=result["isLive"],
        threshold=result["threshold"],
        challenge_type=(result["challenge"] or {}).get("type"),
        feedback_codes=[item["code"] for item in result["feedback"]],
        sdk_type=result["sdkType"],
        client=client,
    )
    return result


def summarize(response: dict[str, Any], threshold: float) -> dict[str, Any]:
    """Reduce a GetFaceLivenessSessionResults response to what the clients show."""
    status = response.get("Status")
    confidence = response.get("Confidence")
    challenge = response.get("Challenge")
    return {
        "sessionId": response.get("SessionId"),
        "status": status,
        "confidence": round(confidence, 2) if confidence is not None else None,
        "threshold": threshold,
        "isLive": status == "SUCCEEDED"
        and confidence is not None
        and confidence >= threshold,
        "challenge": (
            {"type": challenge.get("Type"), "version": challenge.get("Version")}
            if challenge
            else None
        ),
        "feedback": [
            {"code": item.get("Code"), "message": item.get("Message")}
            for item in response.get("Feedback", [])
        ],
        "sdkType": (response.get("Metadata") or {}).get("SDKType"),
        "referenceImage": _image(response.get("ReferenceImage")),
        "auditImages": [
            image
            for image in (_image(item) for item in response.get("AuditImages", []))
            if image is not None
        ],
    }


def _image(image: dict[str, Any] | None) -> dict[str, Any] | None:
    if not image or "Bytes" not in image:
        return None
    return {
        "base64": base64.b64encode(image["Bytes"]).decode("ascii"),
        "boundingBox": image.get("BoundingBox"),
    }


def _audit_images_limit(body: dict[str, Any]) -> int:
    value = body.get("auditImagesLimit", 0)
    if isinstance(value, bool) or not isinstance(value, int):
        raise BadRequestError("auditImagesLimit must be an integer")
    if not 0 <= value <= MAX_AUDIT_IMAGES:
        raise BadRequestError(f"auditImagesLimit must be between 0 and {MAX_AUDIT_IMAGES}")
    return value


def _client_context(client: Any) -> dict[str, Any]:
    """Keep only short scalar values from the client-supplied context."""
    if not isinstance(client, dict):
        return {}
    context: dict[str, Any] = {}
    for key, value in list(client.items())[:MAX_CLIENT_FIELDS]:
        if not isinstance(key, str):
            continue
        if isinstance(value, str):
            context[key[:50]] = value[:MAX_CLIENT_VALUE_LENGTH]
        elif isinstance(value, (bool, int, float)) or value is None:
            context[key[:50]] = value
    return context


_ERROR_STATUS = {
    "InvalidParameterException": 400,
    "SessionNotFoundException": 404,
    "ThrottlingException": 429,
    "ProvisionedThroughputExceededException": 429,
    "InternalServerError": 502,
}


def _call(operation, **kwargs) -> dict[str, Any]:
    try:
        return operation(**kwargs)
    except ClientError as error:
        code = error.response["Error"]["Code"]
        message = error.response["Error"].get("Message", code)
        status = _ERROR_STATUS.get(code, 500)
        if status == 404:
            raise NotFoundError(message) from error
        if status == 400:
            raise BadRequestError(message) from error
        if status == 429:
            raise ServiceError(status, "Rekognition is throttling requests; retry shortly") from error
        # Server-side failures can carry account details (role ARNs, for
        # example), so the client only gets the error code.
        logger.exception("Rekognition call failed", error_code=code)
        raise ServiceError(status, f"Rekognition request failed ({code})") from error


@logger.inject_lambda_context
def lambda_handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return app.resolve(event, context)
