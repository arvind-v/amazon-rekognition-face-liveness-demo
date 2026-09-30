"""CDK stack for the Face Liveness demo.

One stack holds everything the three clients (web, iOS, Android) share:

- An HTTP API backed by one Lambda function that creates liveness sessions
  and returns their results.
- A Cognito identity pool whose guest role may only call
  StartFaceLivenessSession, which is how the Amplify SDKs stream video to
  Rekognition.
- A private S3 bucket behind CloudFront that serves the web app, the API
  under /api, and amplify_outputs.json, the one config file every client reads.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import jsii
from aws_cdk import (
    Annotations,
    BundlingOptions,
    CfnOutput,
    Duration,
    ILocalBundling,
    RemovalPolicy,
    Stack,
    Token,
    aws_apigatewayv2 as apigw,
    aws_apigatewayv2_integrations as integrations,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_cognito as cognito,
    aws_cognito_identitypool as identitypool,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_logs as logs,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
)
from constructs import Construct

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_WEB_DIST = REPO_ROOT / "web" / "dist"

# Regions listed in the Face Liveness FAQ at the time of writing.
FACE_LIVENESS_REGIONS = {
    "us-east-1",
    "us-west-2",
    "eu-west-1",
    "ap-northeast-1",
    "ap-south-1",
    "sa-east-1",
    "ap-southeast-5",
    "ap-southeast-7",
}

LAMBDA_RUNTIME = lambda_.Runtime.PYTHON_3_13
LAMBDA_ARCHITECTURE = lambda_.Architecture.ARM_64


@jsii.implements(ILocalBundling)
class _LocalPipBundling:
    """Install the Lambda dependencies with the local pip instead of Docker.

    Every dependency is pure Python, so pip can target the Lambda platform
    from any host. When this fails, CDK falls back to the Docker image.
    """

    def __init__(self, source: Path) -> None:
        self._source = source

    def try_bundle(self, output_dir: str, *args, **kwargs) -> bool:
        command = [
            sys.executable, "-m", "pip", "install",
            "--quiet", "--disable-pip-version-check", "--no-compile",
            "--requirement", str(self._source / "requirements.txt"),
            "--target", output_dir,
            "--platform", "manylinux2014_aarch64",
            "--implementation", "cp",
            "--python-version", LAMBDA_RUNTIME.name.removeprefix("python"),
            "--only-binary=:all:",
        ]  # fmt: skip
        try:
            subprocess.run(command, check=True)
        except (OSError, subprocess.CalledProcessError):
            return False
        shutil.copytree(
            self._source / "liveness_api",
            Path(output_dir) / "liveness_api",
            ignore=shutil.ignore_patterns("__pycache__"),
            dirs_exist_ok=True,
        )
        return True


class LivenessDemoStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        confidence_threshold: float = 70,
        web_dist: str | Path | None = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        if not Token.is_unresolved(self.region) and self.region not in FACE_LIVENESS_REGIONS:
            Annotations.of(self).add_warning_v2(
                "liveness-demo:region",
                f"Face Liveness is not listed as available in {self.region}. "
                "Check the Rekognition Face Liveness FAQ before deploying here.",
            )

        # Cognito. The identity pool hands every client short-lived guest
        # credentials that can do exactly one thing: stream a liveness video.
        # The user pool is never used for sign-in; the Amplify Swift and
        # Android config formats require a user pool ID even for guest access.
        user_pool = cognito.UserPool(
            self,
            "UserPool",
            self_sign_up_enabled=False,
            sign_in_aliases=cognito.SignInAliases(email=True),
            feature_plan=cognito.FeaturePlan.LITE,
            removal_policy=RemovalPolicy.DESTROY,
        )
        user_pool_client = user_pool.add_client("AppClient", generate_secret=False)

        identity_pool = identitypool.IdentityPool(
            self,
            "IdentityPool",
            allow_unauthenticated_identities=True,
            authentication_providers=identitypool.IdentityPoolAuthenticationProviders(
                user_pools=[
                    identitypool.UserPoolAuthenticationProvider(
                        user_pool=user_pool, user_pool_client=user_pool_client
                    )
                ]
            ),
        )
        identity_pool.unauthenticated_role.add_to_principal_policy(
            iam.PolicyStatement(
                actions=["rekognition:StartFaceLivenessSession"],
                resources=["*"],
            )
        )

        # API: one function, two routes, throttled so a public demo URL
        # cannot run up a large Rekognition bill.
        api_function = lambda_.Function(
            self,
            "ApiFunction",
            description="Creates Face Liveness sessions and returns their results",
            runtime=LAMBDA_RUNTIME,
            architecture=LAMBDA_ARCHITECTURE,
            handler="liveness_api.app.lambda_handler",
            code=lambda_.Code.from_asset(
                str(BACKEND_DIR),
                exclude=["tests", ".pytest_cache", "**/__pycache__", "requirements-dev.txt"],
                bundling=BundlingOptions(
                    image=LAMBDA_RUNTIME.bundling_image,
                    platform="linux/arm64",
                    command=[
                        "bash",
                        "-c",
                        "pip install --no-cache-dir -r requirements.txt -t /asset-output"
                        " && cp -r liveness_api /asset-output/",
                    ],
                    local=_LocalPipBundling(BACKEND_DIR),
                ),
            ),
            memory_size=256,
            timeout=Duration.seconds(15),
            environment={
                "CONFIDENCE_THRESHOLD": f"{confidence_threshold:g}",
                "POWERTOOLS_SERVICE_NAME": "liveness-api",
                "POWERTOOLS_LOG_LEVEL": "INFO",
            },
            log_group=logs.LogGroup(
                self,
                "ApiLogs",
                retention=logs.RetentionDays.ONE_MONTH,
                removal_policy=RemovalPolicy.DESTROY,
            ),
        )
        api_function.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "rekognition:CreateFaceLivenessSession",
                    "rekognition:GetFaceLivenessSessionResults",
                ],
                resources=["*"],
            )
        )

        http_api = apigw.HttpApi(self, "Api", create_default_stage=False)
        apigw.HttpStage(
            self,
            "ApiStage",
            http_api=http_api,
            stage_name="$default",
            auto_deploy=True,
            throttle=apigw.ThrottleSettings(rate_limit=10, burst_limit=20),
        )
        integration = integrations.HttpLambdaIntegration("ApiIntegration", api_function)
        for path in ("/api/sessions", "/api/sessions/{sessionId}/results"):
            http_api.add_routes(
                path=path, methods=[apigw.HttpMethod.POST], integration=integration
            )

        # Site: web app and API behind one CloudFront domain, so browsers never
        # make a cross-origin call and the native apps need a single URL.
        site_bucket = s3.Bucket(
            self,
            "SiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        distribution = cloudfront.Distribution(
            self,
            "Site",
            comment="Face Liveness demo",
            default_root_object="index.html",
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                response_headers_policy=cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
            ),
            additional_behaviors={
                "/api/*": cloudfront.BehaviorOptions(
                    origin=origins.HttpOrigin(
                        f"{http_api.api_id}.execute-api.{self.region}.{self.url_suffix}",
                        protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                    ),
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                    cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                    origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                ),
            },
        )
        site_url = f"https://{distribution.distribution_domain_name}"

        # amplify_outputs.json is the Amplify Gen 2 config format, which the
        # JavaScript, Swift and Android libraries all read. The "custom"
        # section carries what the demo clients need beyond Amplify itself.
        amplify_outputs = {
            "version": "1.4",
            "auth": {
                "aws_region": self.region,
                "user_pool_id": user_pool.user_pool_id,
                "user_pool_client_id": user_pool_client.user_pool_client_id,
                "identity_pool_id": identity_pool.identity_pool_id,
                "unauthenticated_identities_enabled": True,
            },
            "custom": {
                "liveness": {
                    "region": self.region,
                    "api_url": f"{site_url}/api",
                    "confidence_threshold": confidence_threshold,
                }
            },
        }
        sources = [s3deploy.Source.json_data("amplify_outputs.json", amplify_outputs)]
        web_dist_path = Path(web_dist) if web_dist else DEFAULT_WEB_DIST
        if (web_dist_path / "index.html").is_file():
            sources.insert(0, s3deploy.Source.asset(str(web_dist_path)))
        else:
            Annotations.of(self).add_warning_v2(
                "liveness-demo:web-dist",
                f"No web build at {web_dist_path}; deploying the API and config only.",
            )
        s3deploy.BucketDeployment(
            self,
            "SiteContent",
            destination_bucket=site_bucket,
            sources=sources,
            distribution=distribution,
            distribution_paths=["/*"],
            memory_limit=512,
        )

        CfnOutput(self, "SiteUrl", value=site_url)
        CfnOutput(self, "AmplifyOutputsUrl", value=f"{site_url}/amplify_outputs.json")
        CfnOutput(self, "ApiEndpoint", value=http_api.api_endpoint)
        CfnOutput(self, "IdentityPoolId", value=identity_pool.identity_pool_id)
        CfnOutput(self, "Region", value=self.region)
