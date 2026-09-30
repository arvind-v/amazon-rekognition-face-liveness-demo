import os
import sys
from pathlib import Path

# The handler creates its Rekognition client at import time, so the region and
# credentials must exist before the module is imported. The credentials are
# never used: every Rekognition call in the tests goes through a Stubber.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("POWERTOOLS_SERVICE_NAME", "liveness-api-test")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
