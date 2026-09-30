import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { passingResult, SESSION_ID, stubFetch } from './test/fetch'
import { fakeTrack, stubCamera, type FakeTrack } from './test/media'

// The real component needs a camera and a Rekognition stream. This stand-in
// exposes the callbacks the app wires up, so the flow around it can be tested.
vi.mock('@aws-amplify/ui-react-liveness', () => ({
  FaceLivenessDetector: function FakeDetector(props: {
    sessionId: string
    region: string
    onAnalysisComplete: () => Promise<void>
    onError: (error: { state: string; error: Error }) => void
    onUserCancel: () => void
  }) {
    // Like the real component, open the camera on mount.
    useEffect(() => {
      void navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 } }, audio: false })
    }, [])
    return (
      <div data-testid="detector" data-session={props.sessionId} data-region={props.region}>
        <button onClick={() => props.onAnalysisComplete()}>finish</button>
        <button onClick={() => props.onError({ state: 'TIMEOUT', error: new Error('Face did not fit') })}>
          fail
        </button>
        <button onClick={() => props.onUserCancel()}>cancel</button>
      </div>
    )
  },
}))

const config = { region: 'us-east-1', confidenceThreshold: 70 }
const OTHER_SESSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('App', () => {
  let user: ReturnType<typeof userEvent.setup>
  let camera: FakeTrack

  beforeEach(() => {
    user = userEvent.setup()
    camera = fakeTrack()
    stubCamera(camera)
  })

  /** Starts a check, passing through the framing step. */
  async function startCheck() {
    await user.click(screen.getByRole('button', { name: 'Start a liveness check' }))
    await user.click(await screen.findByRole('button', { name: 'Continue to the check' }))
  }

  it('runs a check and shows the result', async () => {
    const { request } = stubFetch({ body: { sessionId: SESSION_ID } }, { body: passingResult() })
    render(<App config={config} />)

    await startCheck()
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

    await startCheck()
    await user.click(await screen.findByRole('button', { name: 'fail' }))
    expect(await screen.findByText('TIMEOUT: Face did not fit')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('detector')).toHaveAttribute('data-session', OTHER_SESSION_ID)
    expect(request(1).url).toBe('/api/sessions')
  })

  it('returns to the start screen when the user cancels', async () => {
    stubFetch({ body: { sessionId: SESSION_ID } })
    render(<App config={config} />)

    await startCheck()
    await user.click(await screen.findByRole('button', { name: 'cancel' }))

    expect(screen.getByRole('button', { name: 'Start a liveness check' })).toBeInTheDocument()
  })

  it('shows the backend error when a session cannot be created', async () => {
    stubFetch({ status: 429, body: { message: 'Rekognition is throttling requests' } })
    render(<App config={config} />)

    await startCheck()

    expect(await screen.findByText('Rekognition is throttling requests')).toBeInTheDocument()
  })

  it('opens the check in a dialog by default on desktop', async () => {
    stubFetch({ body: { sessionId: SESSION_ID } })
    render(<App config={config} />)

    await startCheck()

    const dialog = await screen.findByRole('dialog', { name: 'Liveness check' })
    expect(dialog).toContainElement(await screen.findByTestId('detector'))
  })

  it('reports the chosen layout with the result', async () => {
    const { request } = stubFetch({ body: { sessionId: SESSION_ID } }, { body: passingResult() })
    render(<App config={config} />)

    await user.click(screen.getByRole('radio', { name: /Inline in the page/ }))
    await startCheck()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'finish' }))
    await screen.findByText('Status: SUCCEEDED')

    expect(request(1).body.client.layout).toBe('inline')
  })

  it('holds the zoom chosen in the framing step while the check runs', async () => {
    camera = fakeTrack({ min: 1, max: 4, step: 0.1 })
    const { getUserMedia } = stubCamera(camera)
    const { request } = stubFetch({ body: { sessionId: SESSION_ID } }, { body: passingResult() })
    render(<App config={config} />)

    await startCheck()
    await screen.findByTestId('detector')
    // The framing preview opens the camera once and the component once more.
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    expect(getUserMedia.mock.calls[1][0]).toMatchObject({ video: { zoom: true } })
    await user.click(screen.getByRole('button', { name: 'finish' }))
    await screen.findByText('Status: SUCCEEDED')

    expect(request(1).body.client).toMatchObject({
      preZoom: true,
      zoomSupported: true,
      zoomMax: 4,
      zoomRequested: 1.5,
      zoomApplied: 1.5,
    })
  })

  it('skips the framing step when pre-zoom is off', async () => {
    stubFetch({ body: { sessionId: SESSION_ID } })
    render(<App config={config} />)

    await user.click(screen.getByRole('checkbox', { name: /pre-zoom the camera/ }))
    await user.click(screen.getByRole('button', { name: 'Start a liveness check' }))

    expect(await screen.findByTestId('detector')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Frame your face' })).not.toBeInTheDocument()
  })
})
