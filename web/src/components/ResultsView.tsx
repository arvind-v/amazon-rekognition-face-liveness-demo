import { Badge, Button, Card, Flex, Heading, Image, Text } from '@aws-amplify/ui-react'
import type { ClientContext, LivenessResult } from '../api'
import { feedbackGuidance, STATUS_DESCRIPTIONS } from '../feedback'

const CHALLENGE_NAMES: Record<string, string> = {
  FaceMovementAndLightChallenge: 'Face movement and light',
  FaceMovementChallenge: 'Face movement only',
}

interface ResultsViewProps {
  result: LivenessResult
  context: ClientContext
  onRestart: () => void
}

export function ResultsView({ result, context, onRestart }: ResultsViewProps) {
  const scored = result.status === 'SUCCEEDED' && result.confidence !== null

  return (
    <Card variation="outlined" className="results">
      <Flex direction="column" gap="medium">
        <Flex alignItems="center" gap="small" wrap="wrap">
          <Heading level={2}>{result.isLive ? 'Live person' : 'Not verified'}</Heading>
          <Badge variation={result.isLive ? 'success' : 'error'} size="large">
            {result.isLive ? 'Pass' : 'Fail'}
          </Badge>
        </Flex>

        {scored ? (
          <ConfidenceMeter confidence={result.confidence!} threshold={result.threshold} />
        ) : (
          <Text>
            No score. {STATUS_DESCRIPTIONS[result.status] ?? `Status: ${result.status}.`}
          </Text>
        )}

        {result.feedback.length > 0 && (
          <section aria-labelledby="feedback-heading">
            <Heading level={3} id="feedback-heading">
              What to change before trying again
            </Heading>
            <ul className="feedback-list">
              {result.feedback.map((item) => {
                const guidance = feedbackGuidance(item.code)
                return (
                  <li key={item.code}>
                    <strong>{guidance.title}.</strong> {guidance.tip}
                    <span className="feedback-code">
                      {item.code}
                      {item.message ? `: ${item.message}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {(result.referenceImage || result.auditImages.length > 0) && (
          <Flex gap="small" wrap="wrap" className="result-images">
            {result.referenceImage && (
              <figure>
                <Image
                  alt="Reference image from the liveness check"
                  src={`data:image/jpeg;base64,${result.referenceImage.base64}`}
                />
                <figcaption>Reference image</figcaption>
              </figure>
            )}
            {result.auditImages.map((image, index) => (
              <figure key={index}>
                <Image
                  alt={`Audit image ${index + 1}`}
                  src={`data:image/jpeg;base64,${image.base64}`}
                />
                <figcaption>Audit image {index + 1}</figcaption>
              </figure>
            ))}
          </Flex>
        )}

        <dl className="result-details">
          <dt>Status</dt>
          <dd>{result.status}</dd>
          <dt>Challenge</dt>
          <dd>{result.challenge ? CHALLENGE_NAMES[result.challenge.type] ?? result.challenge.type : 'n/a'}</dd>
          <dt>Camera zoom</dt>
          <dd>{describeZoom(context)}</dd>
          <dt>Layout</dt>
          <dd>{String(context.layout ?? 'n/a')}</dd>
          <dt>SDK reported by the client</dt>
          <dd>{result.sdkType ?? 'n/a'}</dd>
          <dt>Session ID</dt>
          <dd className="session-id">{result.sessionId}</dd>
        </dl>

        <Text className="demo-note">
          This demo shows the raw score so you can compare settings. A production app should show
          only pass or fail, and decide it on the server.
        </Text>

        <div>
          <Button variation="primary" onClick={onRestart}>
            Run another check
          </Button>
        </div>
      </Flex>
    </Card>
  )
}

function ConfidenceMeter({ confidence, threshold }: { confidence: number; threshold: number }) {
  return (
    <div className="confidence">
      <Text className="confidence-value">
        Confidence {confidence.toFixed(2)}%{' '}
        <span className="confidence-threshold">(pass at {threshold} or higher)</span>
      </Text>
      <div
        className="confidence-bar"
        role="meter"
        aria-label="Confidence score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={confidence}
      >
        <div
          className={`confidence-fill ${confidence >= threshold ? 'confidence-fill--pass' : 'confidence-fill--fail'}`}
          style={{ width: `${confidence}%` }}
        />
        <div className="confidence-marker" style={{ left: `${threshold}%` }} aria-hidden="true" />
      </div>
    </div>
  )
}

function describeZoom(context: ClientContext): string {
  if (!context.preZoom) return 'framing step skipped'
  if (!context.zoomSupported) return 'camera has no zoom'
  const applied = context.zoomApplied
  return typeof applied === 'number' ? `${applied.toFixed(1)}x` : 'not applied'
}
