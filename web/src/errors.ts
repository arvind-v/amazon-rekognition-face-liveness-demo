import type { FaceLivenessDetectorProps } from '@aws-amplify/ui-react-liveness'

export type LivenessError = Parameters<NonNullable<FaceLivenessDetectorProps['onError']>>[0]

export function describeLivenessError(error: LivenessError): string {
  const detail = error.error?.message
  return detail ? `${error.state}: ${detail}` : error.state
}
