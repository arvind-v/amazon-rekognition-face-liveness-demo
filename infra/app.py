#!/usr/bin/env python3
import os

import aws_cdk as cdk

from liveness_demo.stack import LivenessDemoStack

app = cdk.App()

LivenessDemoStack(
    app,
    app.node.try_get_context("stackName") or "FaceLivenessDemo",
    confidence_threshold=float(app.node.try_get_context("confidenceThreshold") or 70),
    web_dist=app.node.try_get_context("webDist"),
    env=cdk.Environment(
        account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
        region=os.environ.get("CDK_DEFAULT_REGION"),
    ),
)

app.synth()
