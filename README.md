# Amazon Rekognition Face Liveness demo

A working Face Liveness setup you can deploy to your own AWS account in one command: a backend that creates liveness sessions and scores them, plus clients that run the check with the AWS Amplify liveness SDKs.

[Amazon Rekognition Face Liveness](https://aws.amazon.com/rekognition/face-liveness/) verifies that the person in front of the camera is physically present. The user records a short video selfie while following on-screen prompts, and Rekognition returns a confidence score that the video shows a live person rather than a spoof.

## How it works

1. The client asks the backend to create a session (`CreateFaceLivenessSession`) and gets a session ID.
2. The Amplify liveness component opens the camera, guides the user, and streams the video straight to Rekognition (`StartFaceLivenessSession`). It signs that stream with short-lived guest credentials from a Cognito identity pool; the guest role can call nothing else.
3. When the component finishes, the client asks the backend for the result. The backend calls `GetFaceLivenessSessionResults`, compares the confidence score with the configured threshold, and returns pass or fail, the score, feedback codes and the reference image.

The pass or fail decision is made in the backend so every client applies the same threshold.

## Architecture

One CDK stack (`infra/`) creates:

| Resource | Purpose |
|---|---|
| CloudFront distribution | Serves the web app and `amplify_outputs.json`, and forwards `/api/*` to the API, so everything shares one HTTPS origin |
| S3 bucket (private) | Holds the web app, readable only by CloudFront |
| API Gateway HTTP API | `POST /api/sessions` and `POST /api/sessions/{sessionId}/results`, throttled to 10 requests per second |
| Lambda function (Python 3.13, arm64) | Calls Rekognition; may only create sessions and read their results |
| Cognito identity pool | Issues guest credentials whose only permission is `rekognition:StartFaceLivenessSession` |
| Cognito user pool | Not used for sign-in; the Amplify Swift and Android config formats require one |

`amplify_outputs.json` is generated at deploy time and holds everything a client needs: region, identity pool, API URL and threshold.

## Deploy

Prerequisites: an AWS account with credentials configured for the CLI, Python 3.13, Node.js 24, and Docker (optional; used only if pip cannot bundle the Lambda dependencies locally). Face Liveness is available in a limited set of regions; this README uses `us-east-1`.

```sh
cd infra
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export AWS_REGION=us-east-1
npx aws-cdk@2 bootstrap            # once per account and region
npx aws-cdk@2 deploy
```

The deploy prints `SiteUrl` and `AmplifyOutputsUrl`. Settings are CDK context values:

| Setting | Default | Example |
|---|---|---|
| `confidenceThreshold` | `70` | `npx aws-cdk@2 deploy -c confidenceThreshold=80` |
| `stackName` | `FaceLivenessDemo` | `npx aws-cdk@2 deploy -c stackName=FaceLivenessDemo-dev` |

The threshold is a demo default, not an AWS recommendation. Choose yours from your own false accept and false reject targets.

## Test

```sh
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest

cd ../infra && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest
```

The backend tests stub Rekognition, so they need no AWS access. The infra tests check the synthesized template, including that neither IAM role can do more than its job.

To smoke-test a deployed stack:

```sh
SITE=https://<your distribution>.cloudfront.net
SESSION=$(curl -s -X POST "$SITE/api/sessions" | jq -r .sessionId)
curl -s -X POST "$SITE/api/sessions/$SESSION/results" | jq '{status, confidence, isLive}'
```

A new session reports `CREATED` with no score.

## Clean up

```sh
cd infra && npx aws-cdk@2 destroy
```

Everything in the stack is deleted, including the site bucket and logs.

## Security notes

This is a demo. The API has no authentication: anyone with the URL can create sessions, which is why the stage is throttled. Session results, including the reference image, can be read by anyone who has the session ID. Before using this pattern in production, put the API behind your own authentication and tie each session to the user who created it.

## Code layout

| Path | Contents |
|---|---|
| `backend/` | Lambda handler and its tests |
| `infra/` | CDK app and template tests |
| `src/frontend/` | React web app |
