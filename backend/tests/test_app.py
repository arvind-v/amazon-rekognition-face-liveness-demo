import base64
import json
from dataclasses import dataclass

import pytest
from botocore.stub import Stubber

from liveness_api import app as api

SESSION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
IMAGE_BYTES = b"\xff\xd8\xff\xe0reference-image"


@dataclass
class FakeContext:
    function_name: str = "liveness-api"
    function_version: str = "$LATEST"
    memory_limit_in_mb: int = 256
    invoked_function_arn: str = "arn:aws:lambda:us-east-1:111122223333:function:liveness-api"
    aws_request_id: str = "request-id"


def http_event(path, body=None):
    return {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"content-type": "application/json"},
        "requestContext": {
            "accountId": "111122223333",
            "apiId": "api",
            "domainName": "example.execute-api.us-east-1.amazonaws.com",
            "domainPrefix": "example",
            "http": {
                "method": "POST",
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "203.0.113.10",
                "userAgent": "pytest",
            },
            "requestId": "request-id",
            "routeKey": "$default",
            "stage": "$default",
            "time": "30/Sep/2026:12:00:00 +0000",
            "timeEpoch": 1790769600000,
        },
        "body": None if body is None else json.dumps(body),
        "isBase64Encoded": False,
    }


def invoke(path, body=None):
    response = api.lambda_handler(http_event(path, body), FakeContext())
    return response["statusCode"], json.loads(response["body"])


@pytest.fixture
def stub():
    with Stubber(api.rekognition) as stubber:
        yield stubber
        stubber.assert_no_pending_responses()


def results_response(**overrides):
    response = {
        "SessionId": SESSION_ID,
        "Status": "SUCCEEDED",
        "Confidence": 92.3456,
        "ReferenceImage": {
            "Bytes": IMAGE_BYTES,
            "BoundingBox": {"Width": 0.4, "Height": 0.5, "Left": 0.3, "Top": 0.2},
        },
        "AuditImages": [],
        "Challenge": {"Type": "FaceMovementAndLightChallenge", "Version": "2.0.0"},
        "Metadata": {"SDKType": "AMPLIFY_WEB"},
    }
    response.update(overrides)
    return response


class TestCreateSession:
    def test_defaults_to_no_audit_images_and_service_chosen_challenge(self, stub):
        stub.add_response(
            "create_face_liveness_session",
            {"SessionId": SESSION_ID},
            {"Settings": {"AuditImagesLimit": 0}},
        )

        status, body = invoke("/api/sessions")

        assert status == 200
        assert body == {"sessionId": SESSION_ID}

    def test_passes_challenge_type_and_audit_images(self, stub):
        stub.add_response(
            "create_face_liveness_session",
            {"SessionId": SESSION_ID},
            {
                "Settings": {
                    "AuditImagesLimit": 2,
                    "ChallengePreferences": [{"Type": "FaceMovementChallenge"}],
                }
            },
        )

        status, _ = invoke(
            "/api/sessions",
            {"challengeType": "FaceMovementChallenge", "auditImagesLimit": 2},
        )

        assert status == 200

    @pytest.mark.parametrize(
        "body",
        [
            {"challengeType": "BlinkChallenge"},
            {"auditImagesLimit": 5},
            {"auditImagesLimit": -1},
            {"auditImagesLimit": "2"},
            {"auditImagesLimit": True},
            ["not", "an", "object"],
        ],
    )
    def test_rejects_invalid_settings_without_calling_rekognition(self, stub, body):
        status, _ = invoke("/api/sessions", body)

        assert status == 400

    def test_maps_throttling_to_429(self, stub):
        stub.add_client_error(
            "create_face_liveness_session",
            service_error_code="ThrottlingException",
            http_status_code=400,
        )

        status, _ = invoke("/api/sessions")

        assert status == 429


class TestGetResults:
    def test_summarizes_a_passing_session(self, stub):
        stub.add_response(
            "get_face_liveness_session_results",
            results_response(),
            {"SessionId": SESSION_ID},
        )

        status, body = invoke(f"/api/sessions/{SESSION_ID}/results")

        assert status == 200
        assert body["status"] == "SUCCEEDED"
        assert body["confidence"] == 92.35
        assert body["threshold"] == 70.0
        assert body["isLive"] is True
        assert body["challenge"] == {
            "type": "FaceMovementAndLightChallenge",
            "version": "2.0.0",
        }
        assert body["sdkType"] == "AMPLIFY_WEB"
        assert body["feedback"] == []
        assert base64.b64decode(body["referenceImage"]["base64"]) == IMAGE_BYTES
        assert body["referenceImage"]["boundingBox"]["Width"] == 0.4

    def test_below_threshold_is_not_live_and_keeps_feedback(self, stub):
        stub.add_response(
            "get_face_liveness_session_results",
            results_response(
                Confidence=41.0,
                Feedback=[
                    {"Code": "LOW_LIGHTING_DETECTED", "Message": "Poor lighting."},
                    {"Code": "FACE_NOT_ALIGNED", "Message": "Face not aligned."},
                ],
            ),
            {"SessionId": SESSION_ID},
        )

        _, body = invoke(f"/api/sessions/{SESSION_ID}/results")

        assert body["isLive"] is False
        assert [item["code"] for item in body["feedback"]] == [
            "LOW_LIGHTING_DETECTED",
            "FACE_NOT_ALIGNED",
        ]

    def test_uses_the_configured_threshold(self, stub, monkeypatch):
        monkeypatch.setenv("CONFIDENCE_THRESHOLD", "95")
        stub.add_response(
            "get_face_liveness_session_results",
            results_response(),
            {"SessionId": SESSION_ID},
        )

        _, body = invoke(f"/api/sessions/{SESSION_ID}/results")

        assert body["threshold"] == 95.0
        assert body["isLive"] is False

    def test_session_without_score_or_images(self, stub):
        response = results_response(Status="EXPIRED")
        for key in ("Confidence", "ReferenceImage", "Challenge", "Metadata"):
            response.pop(key)
        stub.add_response(
            "get_face_liveness_session_results", response, {"SessionId": SESSION_ID}
        )

        status, body = invoke(f"/api/sessions/{SESSION_ID}/results")

        assert status == 200
        assert body["isLive"] is False
        assert body["confidence"] is None
        assert body["referenceImage"] is None
        assert body["challenge"] is None
        assert body["sdkType"] is None

    def test_returns_audit_images(self, stub):
        stub.add_response(
            "get_face_liveness_session_results",
            results_response(AuditImages=[{"Bytes": b"one"}, {"Bytes": b"two"}]),
            {"SessionId": SESSION_ID},
        )

        _, body = invoke(f"/api/sessions/{SESSION_ID}/results")

        decoded = [base64.b64decode(image["base64"]) for image in body["auditImages"]]
        assert decoded == [b"one", b"two"]

    def test_rejects_malformed_session_id_without_calling_rekognition(self, stub):
        status, _ = invoke("/api/sessions/not-a-session/results")

        assert status == 400

    def test_maps_unknown_session_to_404(self, stub):
        stub.add_client_error(
            "get_face_liveness_session_results",
            service_error_code="SessionNotFoundException",
            http_status_code=400,
        )

        status, _ = invoke(f"/api/sessions/{SESSION_ID}/results")

        assert status == 404

    def test_hides_server_error_details_from_the_client(self, stub):
        stub.add_client_error(
            "get_face_liveness_session_results",
            service_error_code="AccessDeniedException",
            service_message="User arn:aws:sts::111122223333:assumed-role/x is not authorized",
            http_status_code=403,
        )

        status, body = invoke(f"/api/sessions/{SESSION_ID}/results")

        assert status == 500
        assert "arn:aws" not in json.dumps(body)

    def test_logs_one_structured_line_with_sanitized_client_context(self, stub, caplog):
        stub.add_response(
            "get_face_liveness_session_results",
            results_response(
                Feedback=[{"Code": "EYES_CLOSED_DETECTED", "Message": "Eyes closed."}]
            ),
            {"SessionId": SESSION_ID},
        )
        client = {
            "platform": "web",
            "zoom": 1.5,
            "zoomSupported": True,
            "userAgent": "x" * 500,
            "nested": {"dropped": True},
        }

        with caplog.at_level("INFO"):
            invoke(f"/api/sessions/{SESSION_ID}/results", {"client": client})

        [record] = [r for r in caplog.records if r.getMessage() == "liveness result"]
        line = json.loads(api.logger.registered_formatter.format(record))
        assert line["session_id"] == SESSION_ID
        assert line["is_live"] is True
        assert line["feedback_codes"] == ["EYES_CLOSED_DETECTED"]
        assert line["client"]["platform"] == "web"
        assert line["client"]["zoom"] == 1.5
        assert len(line["client"]["userAgent"]) == 200
        assert "nested" not in line["client"]
        assert "base64" not in json.dumps(line)


def test_unknown_route_is_404():
    status, _ = invoke("/api/unknown")

    assert status == 404
