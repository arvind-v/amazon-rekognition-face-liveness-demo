import { vi } from 'vitest'

export interface FakeResponse {
  status?: number
  body: unknown
}

/**
 * Replaces fetch with a queue of canned responses and records each request,
 * so tests can assert on the calls the app made to the backend.
 */
export function stubFetch(...responses: FakeResponse[]) {
  const queue = [...responses]
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const next = queue.shift()
    if (!next) throw new Error('Unexpected fetch call')
    const status = next.status ?? 200
    return new Response(JSON.stringify(next.body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    request(index: number) {
      const [input, init] = fetchMock.mock.calls[index]
      return {
        url: String(input),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }
    },
  }
}

export const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

export function passingResult(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    status: 'SUCCEEDED',
    confidence: 92.35,
    threshold: 70,
    isLive: true,
    challenge: { type: 'FaceMovementAndLightChallenge', version: '2.0.0' },
    feedback: [],
    sdkType: 'AMPLIFY_WEB',
    referenceImage: { base64: 'aGVsbG8=', boundingBox: null },
    auditImages: [],
    ...overrides,
  }
}
