import { Button, Card, Flex, Heading, Image, Text } from '@aws-amplify/ui-react'
import type { LivenessResult } from '../api'

interface ResultsViewProps {
  result: LivenessResult
  onRestart: () => void
}

export function ResultsView({ result, onRestart }: ResultsViewProps) {
  return (
    <Card variation="outlined" className="results">
      <Flex direction="column" gap="small">
        <Heading level={2}>Result</Heading>
        <Text>Status: {result.status}</Text>
        <Text>
          Confidence: {result.confidence === null ? 'not available' : `${result.confidence}%`}
        </Text>
        <Text className="session-id">Session ID: {result.sessionId}</Text>
        {result.referenceImage && (
          <Image
            className="reference-image"
            alt="Reference image from the liveness check"
            src={`data:image/jpeg;base64,${result.referenceImage.base64}`}
          />
        )}
        <Button variation="primary" onClick={onRestart}>
          Run another check
        </Button>
      </Flex>
    </Card>
  )
}
