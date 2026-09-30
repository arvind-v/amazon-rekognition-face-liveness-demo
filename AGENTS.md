# AGENTS.md

Guidance for coding agents working in this repository. Read it before changing anything; keep it current when the code changes.

## What this is

A demo of Amazon Rekognition Face Liveness: one CDK stack (API, Lambda, Cognito, S3 and CloudFront) and clients built on the AWS Amplify liveness SDKs. The repository is public. Keep customer names, customer data and customer-specific issues out of code, docs and commit messages; describe problems generically.

## Layout

| Path | Contents |
|---|---|
| `backend/liveness_api/app.py` | The one Lambda: `POST /api/sessions` and `POST /api/sessions/{sessionId}/results` |
| `backend/tests/` | pytest, Rekognition stubbed with botocore `Stubber` |
| `infra/liveness_demo/stack.py` | The whole stack, including the generated `amplify_outputs.json` |
| `infra/tests/` | CDK assertion tests on the synthesized template |
| `web/` | Vite, React 19 and TypeScript app on `@aws-amplify/ui-react-liveness` |
| `web/e2e/` | Playwright tests with Chromium's synthetic camera |
| `scripts/deploy.sh` | Builds the web app and runs `cdk deploy` |

## Commands

Use Python 3.13 and Node.js 24 (`web/.nvmrc`).

```sh
# Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest

# Infra (tests skip asset bundling; `cdk synth` runs it)
cd infra && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest
npx aws-cdk@2 synth --quiet

# Web
cd web && npm ci
npm run lint && npm test && npm run build
npm run test:e2e                                   # stubbed backend
BASE_URL=https://<distribution>.cloudfront.net npm run test:e2e

# Deploy (needs AWS credentials and a bootstrapped account)
scripts/deploy.sh
```

Run every suite a change can affect before committing. Chromium's synthetic camera has no zoom control, so browser tests only cover the no-zoom path; zoom logic is unit-tested with the fake tracks in `web/src/test/media.ts`. Web changes that touch the liveness component's placement or camera also need the deployed browser tests, because only a real session gets the component past its first screen.

## Facts about the SDK that drive the design

These are from reading the SDK source (`@aws-amplify/ui-react-liveness` 3.6.9). Recheck them when upgrading.

- The component connects to Rekognition and fetches guest credentials as soon as it mounts, before its start screen. With fake credentials it fails immediately, which is why the stubbed browser test stops at the stream URL.
- Rekognition sends the oval's size and position in camera pixels, plus the thresholds for "far enough" before recording and "face fills the oval". The display size of the video never enters those checks; it only scales the drawn oval.
- The component fills the width of its container, sets the video to 4:3, and draws the oval once when the check starts. It does not follow resizes.
- The colored flash overlay, and on phones the whole camera view, use `position: fixed`. A CSS transform on any ancestor turns that ancestor into their containing block, which misplaces them.
- Sessions are single use. Every retry needs a new session from the backend.
- The light challenge's start screen shows a photosensitivity warning; the movement-only challenge's does not. The deployed browser tests use that to check which challenge a session got. Without `ChallengePreferences`, Rekognition has chosen the light challenge in every test so far.
- The streaming region comes from `amplify_outputs.json` (`custom.liveness.region`) and must match the region the backend creates sessions in.
- The component calls `navigator.mediaDevices.getUserMedia` itself when it mounts. The app applies the framing zoom by wrapping that call (`holdZoomForLiveness` in `web/src/zoom.ts`). Install the wrapper before the component mounts, which is why `App.startCheck` does it, and release it when the check ends. A parent `useEffect` runs after its children's effects, which is too late.
- Before recording, the component rejects a face that is too close: `(2 x pupil distance + 1.8 x eye-to-mouth distance) / 4` divided by its start-screen oval width must stay under the session's `FaceDistanceThresholdMin`. `targetFaceWidth()` in `web/src/zoom.ts` uses 0.4, the value in the SDK's test data. Real sessions may differ.

## Conventions

- Pin exact dependency versions (`package.json`, `requirements*.txt`). npm warns that `@xstate/react` 3, a dependency of the Amplify UI packages, declares React 18 as its peer. Amplify supports React 19; the warning is expected.
- The backend bundles its own boto3 so it can parse newer result fields such as `Feedback`; the Lambda runtime's copy may be older.
- The backend decides pass or fail. Clients display the backend's `isLive` and never apply the threshold themselves.
- Results screens show the fields in the backend's response (`web/src/api.ts` `LivenessResult`). Feedback-code tips live in `web/src/feedback.ts`; the native apps should reuse the same wording.
- Commit messages: an imperative subject under 72 characters, then a body saying what changed and why. No emojis, no tool or agent trailers.
- Update `README.md` in the same commit as the change it describes.
