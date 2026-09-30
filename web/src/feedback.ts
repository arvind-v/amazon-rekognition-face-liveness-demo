/**
 * Retry guidance for the feedback codes Rekognition returns with a low
 * score. The descriptions follow the Face Liveness FAQ; the tips are what a
 * user can change before trying again.
 */
export const FEEDBACK_GUIDANCE: Record<string, { title: string; tip: string }> = {
  FACE_NOT_VISIBLE: {
    title: 'Face not visible',
    tip: 'Keep your whole face in view for the entire check.',
  },
  FACE_OBSTRUCTION_DETECTED: {
    title: 'Face covered',
    tip: 'Remove anything covering your face, such as a mask, sunglasses or a hand.',
  },
  LOW_VIDEO_QUALITY_DETECTED: {
    title: 'Low video quality',
    tip: 'Clean the camera lens, hold the camera steady and add light.',
  },
  FACE_NOT_ALIGNED: {
    title: 'Not facing the camera',
    tip: 'Look straight at the camera throughout the check.',
  },
  EYES_CLOSED_DETECTED: {
    title: 'Eyes closed',
    tip: 'Keep your eyes open throughout the check.',
  },
  LOW_LIGHTING_DETECTED: {
    title: 'Too dark',
    tip: 'Move somewhere brighter and turn the screen brightness up.',
  },
  HIGH_LIGHTING_DETECTED: {
    title: 'Too bright',
    tip: 'Avoid strong light on your face or behind you, such as a lamp or a window.',
  },
}

export function feedbackGuidance(code: string) {
  return FEEDBACK_GUIDANCE[code] ?? { title: code, tip: 'Adjust the conditions and try again.' }
}

/** What each session status means for the person running the demo. */
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  SUCCEEDED: 'The check finished and Rekognition scored it.',
  FAILED: 'The check did not finish, so there is no score.',
  EXPIRED: 'The session expired before the check finished.',
  IN_PROGRESS: 'Rekognition is still processing the check.',
  CREATED: 'The session was created but no video reached Rekognition.',
}
