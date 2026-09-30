import { describe, expect, it, vi } from 'vitest'
import { ApiError, createSession, getResults } from './api'
import { passingResult, SESSION_ID, stubFetch } from './test/fetch'

describe('createSession', () => {
  it('posts the session options and returns the session ID', async () => {
    const { request } = stubFetch({ body: { sessionId: SESSION_ID } })

    const sessionId = await createSession({
      challengeType: 'FaceMovementChallenge',
      auditImagesLimit: 2,
    })

    expect(sessionId).toBe(SESSION_ID)
    expect(request(0)).toEqual({
      url: '/api/sessions',
      method: 'POST',
      body: { challengeType: 'FaceMovementChallenge', auditImagesLimit: 2 },
    })
  })

  it('raises the backend message with the HTTP status', async () => {
    stubFetch({ status: 429, body: { message: 'Rekognition is throttling requests' } })

    const error = await createSession().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 429, message: 'Rekognition is throttling requests' })
  })

  it('falls back to the status when the body is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>bad gateway</html>', { status: 502 }))

    await expect(createSession()).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (HTTP 502)',
    })
  })
})

describe('getResults', () => {
  it('sends the client context with the session ID in the path', async () => {
    const { request } = stubFetch({ body: passingResult() })

    const result = await getResults(SESSION_ID, { platform: 'web', zoom: 1.5 })

    expect(result.isLive).toBe(true)
    expect(request(0)).toEqual({
      url: `/api/sessions/${SESSION_ID}/results`,
      method: 'POST',
      body: { client: { platform: 'web', zoom: 1.5 } },
    })
  })
})
