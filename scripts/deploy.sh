#!/usr/bin/env bash
# Build the web app, then deploy the stack with it.
# Any arguments are passed to `cdk deploy`, for example:
#   scripts/deploy.sh -c confidenceThreshold=80
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$repo/web" && npm ci --no-fund --no-audit && npm run build)

cd "$repo/infra"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --quiet --disable-pip-version-check -r requirements.txt

npx --yes aws-cdk@2.1143.0 deploy --outputs-file outputs.json "$@"
