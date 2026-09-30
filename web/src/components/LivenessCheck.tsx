import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import type { LivenessError } from '../errors'

interface LivenessCheckProps {
  sessionId: string
  region: string
  onComplete: () => Promise<void>
  onError: (error: LivenessError) => void
  onCancel: () => void
}

/**
 * The Amplify liveness component for one session. Sessions are single use,
 * so the component is keyed by session ID and remounts for every attempt.
 */
export default function LivenessCheck({
  sessionId,
  region,
  onComplete,
  onError,
  onCancel,
}: LivenessCheckProps) {
  return (
    <FaceLivenessDetector
      key={sessionId}
      sessionId={sessionId}
      region={region}
      onAnalysisComplete={onComplete}
      onError={onError}
      onUserCancel={onCancel}
    />
  )
}
