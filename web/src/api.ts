/** Client for the demo backend, served by the same origin under /api. */

export type ChallengeType = 'FaceMovementAndLightChallenge' | 'FaceMovementChallenge'

export interface SessionOptions {
  challengeType?: ChallengeType
  auditImagesLimit?: number
}

export interface LivenessImage {
  base64: string
  boundingBox?: { Width: number; Height: number; Left: number; Top: number } | null
}

export interface LivenessResult {
  sessionId: string
  status: 'CREATED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
  confidence: number | null
  threshold: number
  isLive: boolean
  challenge: { type: ChallengeType; version: string } | null
  feedback: { code: string; message: string }[]
  sdkType: string | null
  referenceImage: LivenessImage | null
  auditImages: LivenessImage[]
}

/** Context sent with each result so the backend log can be sliced by client. */
export type ClientContext = Record<string, string | number | boolean | null>

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(data.message ?? `Request failed (HTTP ${response.status})`, response.status)
  }
  return data as T
}

export async function createSession(options: SessionOptions = {}): Promise<string> {
  const { sessionId } = await post<{ sessionId: string }>('/sessions', options)
  return sessionId
}

export function getResults(sessionId: string, client: ClientContext = {}): Promise<LivenessResult> {
  return post(`/sessions/${encodeURIComponent(sessionId)}/results`, { client })
}
