import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { passingResult, SESSION_ID, stubFetch } from './test/fetch'

// The real component needs a camera and a Rekognition stream. This stand-in
// exposes the callbacks the app wires up, so the flow around it can be tested.
vi.mock('@aws-amplify/ui-react-liveness', () => ({
  FaceLivenessDetector: (props: {
    sessionId: string
    region: string
    onAnalysisComplete: () => Promise<void>
    onError: (error: { state: string; error: Error }) => void
    onUserCancel: () => void
  }) => (
    <div data-testid="detector" data-session={props.sessionId} data-region={props.region}>
      <button onClick={() => props.onAnalysisComplete()}>finish</button>
      <button onClick={() => props.onError({ state: 'TIMEOUT', error: new Error('Face did not fit') })}>
        fail
      </button>
      <button onClick={() => props.onUserCancel()}>cancel</button>
    </div>
  ),
}))

const config = { region: 'us-east-1', confidenceThreshold: 70 }
const OTHER_SESSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('App', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
  })

  it('runs a check and shows the result', async () => {
    const { request } = stubFetch({ body: { sessionId: SESSION_ID } }, { body: passingResult() })
    render(<App config={config} />)

    await user.click(screen.getByRole('button', { name: 'Start a liveness check' }))
    const detector = await screen.findByTestId('detector')
    expect(detector).toHaveAttribute('data-session', SESSION_ID)
    expect(detector).toHaveAttribute('data-region', 'us-east-1')

    await user.click(screen.getByRole('button', { name: 'finish' }))

    expect(await screen.findByText('Status: SUCCEEDED')).toBeInTheDocument()
    expect(screen.getByText('Confidence: 92.35%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /reference image/i })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,aGVsbG8=',
    )
    expect(request(1).url).toBe(`/api/sessions/${SESSION_ID}/results`)
    expect(request(1).body.client).toMatchObject({ platform: 'web' })
  })

  it('creates a new session when the user retries after an error', async () => {
    const { request } = stubFetch(
      { body: { sessionId: SESSION_ID } },
      { body: { sessionId: OTHER_SESSION_ID } },
    )
    render(<App config={config} />)

    await user.click(screen.getByRole('button', { name: 'Start a liveness check' }))
    await user.click(await screen.findByRole('button', { name: 'fail' }))
    expect(await screen.findByText('TIMEOUT: Face did not fit')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('detector')).toHaveAttribute('data-session', OTHER_SESSION_ID)
    expect(request(1).url).toBe('/api/sessions')
  })

  it('returns to the start screen when the user cancels', async () => {
    stubFetch({ body: { sessionId: SESSION_ID } })
    render(<App config={config} />)

    await user.click(screen.getByRole('button', { name: 'Start a liveness check' }))
    await user.click(await screen.findByRole('button', { name: 'cancel' }))

    expect(screen.getByRole('button', { name: 'Start a liveness check' })).toBeInTheDocument()
  })

  it('shows the backend error when a session cannot be created', async () => {
    stubFetch({ status: 429, body: { message: 'Rekognition is throttling requests' } })
    render(<App config={config} />)

    await user.click(screen.getByRole('button', { name: 'Start a liveness check' }))

    expect(await screen.findByText('Rekognition is throttling requests')).toBeInTheDocument()
  })
})
