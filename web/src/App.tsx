import { Alert, Button, Flex, Heading, Loader, Text, ThemeProvider } from '@aws-amplify/ui-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createSession, getResults, type ClientContext, type LivenessResult } from './api'
import { CameraFraming, type FramingChoice } from './components/CameraFraming'
import { LivenessStage } from './components/LivenessStage'
import { ResultsView } from './components/ResultsView'
import { SetupPanel, type CheckSettings } from './components/SetupPanel'
import type { DemoConfig } from './config'
import { clientContext } from './device'
import { describeLivenessError } from './errors'
import { defaultLayout, isMobileBrowser } from './layout'
import { holdZoomForLiveness } from './zoom'

// The liveness SDK bundles TensorFlow.js, so load it only when a check starts.
const LivenessCheck = lazy(() => import('./components/LivenessCheck'))

type Step =
  | { name: 'start' }
  | { name: 'framing' }
  | { name: 'creating' }
  | { name: 'check'; sessionId: string }
  | { name: 'result'; result: LivenessResult; context: ClientContext }
  | { name: 'error'; message: string }

export function App({ config }: { config: DemoConfig }) {
  const [step, setStep] = useState<Step>({ name: 'start' })
  const [mobile] = useState(() => isMobileBrowser())
  const [settings, setSettings] = useState<CheckSettings>(() => ({
    layout: defaultLayout(mobile),
    preZoom: true,
    auditImagesLimit: 0,
  }))
  const framing = useRef<FramingChoice | null>(null)
  const appliedZoom = useRef<number | null>(null)
  const releaseZoom = useRef<(() => void) | null>(null)

  // The zoom is held only while the liveness component is on screen.
  useEffect(() => {
    if (step.name !== 'check' && releaseZoom.current) {
      releaseZoom.current()
      releaseZoom.current = null
    }
  }, [step.name])
  useEffect(() => () => releaseZoom.current?.(), [])

  async function startCheck() {
    setStep({ name: 'creating' })
    try {
      const sessionId = await createSession({
        challengeType: settings.challengeType,
        auditImagesLimit: settings.auditImagesLimit,
      })
      // Installed before the component mounts, so its first frame is zoomed.
      const zoom = framing.current?.zoom
      appliedZoom.current = null
      if (zoom != null && !releaseZoom.current) {
        releaseZoom.current = holdZoomForLiveness(zoom, (applied) => {
          appliedZoom.current = applied
        })
      }
      setStep({ name: 'check', sessionId })
    } catch (error) {
      setStep({ name: 'error', message: messageOf(error) })
    }
  }

  function begin() {
    framing.current = null
    if (settings.preZoom) {
      setStep({ name: 'framing' })
    } else {
      void startCheck()
    }
  }

  async function finishCheck(sessionId: string) {
    // An error thrown from here would surface inside the liveness component
    // as a generic server error, so report it in the app's own error view.
    try {
      const context = clientContext({
        layout: settings.layout,
        challengeRequested: settings.challengeType ?? 'service default',
        preZoom: settings.preZoom,
        zoomSupported: Boolean(framing.current?.zoomRange),
        zoomMax: framing.current?.zoomRange?.max ?? null,
        zoomRequested: framing.current?.zoom ?? null,
        zoomApplied: appliedZoom.current,
      })
      setStep({ name: 'result', result: await getResults(sessionId, context), context })
    } catch (error) {
      setStep({ name: 'error', message: messageOf(error) })
    }
  }

  return (
    <ThemeProvider>
      <main className="app">
        <header className="app-header">
          <Heading level={1}>Face Liveness demo</Heading>
          <Text>Amazon Rekognition Face Liveness with the Amplify web SDK</Text>
        </header>

        {step.name === 'start' && (
          <SetupPanel settings={settings} mobile={mobile} onChange={setSettings} onStart={begin} />
        )}

        {step.name === 'framing' && (
          <CameraFraming
            onContinue={(choice) => {
              framing.current = choice
              void startCheck()
            }}
            onBack={() => setStep({ name: 'start' })}
          />
        )}

        {step.name === 'creating' && <Loader size="large" aria-label="Creating a session" />}

        {step.name === 'check' && (
          <LivenessStage mode={settings.layout} onClose={() => setStep({ name: 'start' })}>
            <Suspense fallback={<Loader size="large" aria-label="Loading the liveness check" />}>
              <LivenessCheck
                sessionId={step.sessionId}
                region={config.region}
                onComplete={() => finishCheck(step.sessionId)}
                onError={(error) => setStep({ name: 'error', message: describeLivenessError(error) })}
                onCancel={() => setStep({ name: 'start' })}
              />
            </Suspense>
          </LivenessStage>
        )}

        {step.name === 'result' && (
          <ResultsView
            result={step.result}
            context={step.context}
            onRestart={() => setStep({ name: 'start' })}
          />
        )}

        {step.name === 'error' && (
          <Flex direction="column" alignItems="flex-start" gap="medium">
            <Alert variation="error" heading="The check did not complete">
              {step.message}
            </Alert>
            <Button variation="primary" onClick={startCheck}>
              Try again
            </Button>
          </Flex>
        )}
      </main>
    </ThemeProvider>
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
