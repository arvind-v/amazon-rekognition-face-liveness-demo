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
export AWS_REGION=us-east-1
npx aws-cdk@2 bootstrap     # once per account and region
scripts/deploy.sh
```

`scripts/deploy.sh` builds the web app, creates `infra/.venv` if needed, and runs `cdk deploy`. It prints `SiteUrl`; open it on a desktop browser or a phone. Arguments after the script name go to `cdk deploy`. Settings are CDK context values:

| Setting | Default | Example |
|---|---|---|
| `confidenceThreshold` | `70` | `scripts/deploy.sh -c confidenceThreshold=80` |
| `stackName` | `FaceLivenessDemo` | `scripts/deploy.sh -c stackName=FaceLivenessDemo-dev` |

The threshold is a demo default, not an AWS recommendation. Choose yours from your own false accept and false reject targets.

## Web app

`web/` is a Vite, React and TypeScript app built on `@aws-amplify/ui-react-liveness`. It reads `/amplify_outputs.json` at startup, so the same build works against any deployed stack.

To work on it locally against a deployed stack:

```sh
cd web
npm install
LIVENESS_SITE_URL=https://<your distribution>.cloudfront.net npm run dev
```

The dev server forwards `/api` and `/amplify_outputs.json` to that site. Browsers only allow camera access on `localhost` or HTTPS, so to test on a phone, use the deployed `SiteUrl`.

### Sizing the liveness view

The liveness component has no size settings. It fills the width of its container, sets its video to 4:3, and draws its oval once when the check starts. Its colored flash overlay, and on phones the whole camera view, are positioned against the browser window with `position: fixed`. That leads to three rules:

1. Give the component as much width as the window allows at 4:3, and fix it before the check starts. A small container gives a small camera view, even on a large screen.
2. Don't resize the container during the check. The oval stays where it was first drawn.
3. Center modals without CSS transforms. A `transform` on any ancestor, such as the common `translate(-50%, -50%)`, makes that ancestor the reference box for `position: fixed`, so the flash overlay is drawn inside the modal instead of over the window. A native `<dialog>` is centered by the browser without one.

The start screen offers four layouts so you can compare them:

| Layout | What it shows |
|---|---|
| Modal sized to the screen (default on desktop) | The fix: a native `<dialog>` sized by `fitLivenessWidth()` in `web/src/layout.ts` |
| Inline in the page (default on phones) | The component in the page column |
| Small fixed modal | A 280 px camera view, as in a crowded sign-in dialog |
| Modal centered with a CSS transform | The overlay problem from rule 3 |

On phones the component switches to full screen once the check starts, whatever the container.

## Test

```sh
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest

cd ../infra && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest

cd ../web
npm run lint && npm test && npm run build
npx playwright install chromium   # once
npm run test:e2e
BASE_URL=https://<your distribution>.cloudfront.net npm run test:e2e
```

The backend tests stub Rekognition, so they need no AWS access. The infra tests check the synthesized template, including that neither IAM role can do more than its job. The web unit tests replace the liveness component with a stand-in and cover the flow around it.

The browser tests use Chromium's synthetic camera. Against the local preview they stub the backend and Cognito and check that the liveness component opens its Rekognition stream with the right session and region. With `BASE_URL` they use the deployed stack: a real session reaches the camera screen, each layout gets the camera size it should, and the flash overlay covers the window except in the transform-centered modal. Neither can complete a check: that takes a real face.

To smoke-test a deployed stack:

```sh
SITE=https://<your distribution>.cloudfront.net
SESSION=$(curl -s -X POST "$SITE/api/sessions" | jq -r .sessionId)
curl -s -X POST "$SITE/api/sessions/$SESSION/results" | jq '{status, confidence, isLive}'
```

A new session reports `CREATED` with no score.

## Clean up

```sh
cd infra && source .venv/bin/activate && npx aws-cdk@2 destroy
```

Everything in the stack is deleted, including the site bucket and logs.

## Security notes

This is a demo. The API has no authentication: anyone with the URL can create sessions, which is why the stage is throttled. Session results, including the reference image, can be read by anyone who has the session ID. Before using this pattern in production, put the API behind your own authentication and tie each session to the user who created it.

## Code layout

| Path | Contents |
|---|---|
| `backend/` | Lambda handler and its tests |
| `infra/` | CDK app and template tests |
| `web/` | React web app, unit tests and browser tests |
| `scripts/` | Deploy script |
| `AGENTS.md` | Notes for coding agents working in this repo |
