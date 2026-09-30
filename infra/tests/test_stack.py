import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Annotations, Match, Template

from liveness_demo.stack import LivenessDemoStack

CACHING_DISABLED_POLICY_ID = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"


def synth(web_dist, region="us-east-1", **props):
    # Skip asset bundling: these tests check the template, not the build.
    app = cdk.App(context={"aws:cdk:bundling-stacks": []})
    stack = LivenessDemoStack(
        app,
        "Test",
        web_dist=web_dist,
        env=cdk.Environment(account="111122223333", region=region),
        **props,
    )
    return stack, Template.from_stack(stack)


@pytest.fixture(scope="module")
def web_dist(tmp_path_factory):
    dist = tmp_path_factory.mktemp("dist")
    (dist / "index.html").write_text("<!doctype html><title>test</title>")
    return dist


@pytest.fixture(scope="module")
def template(web_dist):
    return synth(web_dist, confidence_threshold=75)[1]


def statements_for_role(template, role_logical_id):
    statements = []
    for policy in template.find_resources("AWS::IAM::Policy").values():
        if {"Ref": role_logical_id} in policy["Properties"]["Roles"]:
            statements.extend(policy["Properties"]["PolicyDocument"]["Statement"])
    return statements


def actions(statements):
    found = set()
    for statement in statements:
        action = statement["Action"]
        found.update([action] if isinstance(action, str) else action)
    return found


def test_guest_role_can_only_stream_liveness_video(template):
    roles = template.find_resources(
        "AWS::IAM::Role",
        {
            "Properties": {
                "AssumeRolePolicyDocument": {
                    "Statement": Match.array_with(
                        [
                            Match.object_like(
                                {
                                    "Condition": Match.object_like(
                                        {
                                            "ForAnyValue:StringLike": {
                                                "cognito-identity.amazonaws.com:amr": "unauthenticated"
                                            }
                                        }
                                    )
                                }
                            )
                        ]
                    )
                }
            }
        },
    )
    [guest_role] = roles

    assert actions(statements_for_role(template, guest_role)) == {
        "rekognition:StartFaceLivenessSession"
    }
    template.has_resource_properties(
        "AWS::Cognito::IdentityPool", {"AllowUnauthenticatedIdentities": True}
    )


def test_api_function_can_only_create_and_read_sessions(template):
    [function] = template.find_resources(
        "AWS::Lambda::Function",
        {"Properties": {"Handler": "liveness_api.app.lambda_handler"}},
    ).values()
    role_id = function["Properties"]["Role"]["Fn::GetAtt"][0]

    assert actions(statements_for_role(template, role_id)) == {
        "rekognition:CreateFaceLivenessSession",
        "rekognition:GetFaceLivenessSessionResults",
    }
    assert function["Properties"]["Runtime"] == "python3.13"
    assert function["Properties"]["Architectures"] == ["arm64"]
    assert function["Properties"]["Environment"]["Variables"]["CONFIDENCE_THRESHOLD"] == "75"


def test_no_role_uses_a_full_access_managed_policy(template):
    for role in template.find_resources("AWS::IAM::Role").values():
        for policy in role["Properties"].get("ManagedPolicyArns", []):
            assert "FullAccess" not in str(policy)


def test_api_exposes_exactly_the_two_routes(template):
    routes = template.find_resources("AWS::ApiGatewayV2::Route")

    assert sorted(route["Properties"]["RouteKey"] for route in routes.values()) == [
        "POST /api/sessions",
        "POST /api/sessions/{sessionId}/results",
    ]


def test_api_is_throttled(template):
    template.has_resource_properties(
        "AWS::ApiGatewayV2::Stage",
        {
            "StageName": "$default",
            "AutoDeploy": True,
            "DefaultRouteSettings": {
                "ThrottlingRateLimit": 10,
                "ThrottlingBurstLimit": 20,
            },
        },
    )


def test_cloudfront_forwards_api_calls_without_caching(template):
    template.has_resource_properties(
        "AWS::CloudFront::Distribution",
        {
            "DistributionConfig": Match.object_like(
                {
                    "DefaultRootObject": "index.html",
                    "CacheBehaviors": [
                        Match.object_like(
                            {
                                "PathPattern": "/api/*",
                                "CachePolicyId": CACHING_DISABLED_POLICY_ID,
                                "AllowedMethods": Match.array_with(["POST"]),
                                "ViewerProtocolPolicy": "https-only",
                            }
                        )
                    ],
                }
            )
        },
    )


def test_site_bucket_is_private(template):
    template.has_resource_properties(
        "AWS::S3::Bucket",
        {
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "BlockPublicPolicy": True,
                "IgnorePublicAcls": True,
                "RestrictPublicBuckets": True,
            }
        },
    )


def test_deploys_web_build_and_config(template):
    [deployment] = template.find_resources("Custom::CDKBucketDeployment").values()

    assert len(deployment["Properties"]["SourceObjectKeys"]) == 2
    template.has_output("SiteUrl", {})
    template.has_output("AmplifyOutputsUrl", {})


def test_missing_web_build_deploys_config_only_and_warns(tmp_path):
    stack, template = synth(tmp_path / "missing")

    [deployment] = template.find_resources("Custom::CDKBucketDeployment").values()
    assert len(deployment["Properties"]["SourceObjectKeys"]) == 1
    Annotations.from_stack(stack).has_warning(
        "*", Match.string_like_regexp("No web build at")
    )


def test_warns_when_region_is_not_a_face_liveness_region(web_dist):
    stack, _ = synth(web_dist, region="eu-north-1")

    Annotations.from_stack(stack).has_warning(
        "*", Match.string_like_regexp("not listed as available in eu-north-1")
    )
