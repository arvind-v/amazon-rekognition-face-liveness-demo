import { Alert, Button, Flex, Heading, Loader, Text, ThemeProvider } from '@aws-amplify/ui-react'
import { lazy, Suspense, useState } from 'react'
import { createSession, getResults, type LivenessResult } from './api'
import { ResultsView } from './components/ResultsView'
import type { DemoConfig } from './config'
import { clientContext } from './device'
import { describeLivenessError } from './errors'

// The liveness SDK bundles TensorFlow.js, so load it only when a check starts.
const LivenessCheck = lazy(() => import('./components/LivenessCheck'))

type Step =
  | { name: 'start' }
  | { name: 'creating' }
  | { name: 'check'; sessionId: string }
  | { name: 'result'; result: LivenessResult }
  | { name: 'error'; message: string }

export function App({ config }: { config: DemoConfig }) {
  const [step, setStep] = useState<Step>({ name: 'start' })

  async function startCheck() {
    setStep({ name: 'creating' })
    try {
      setStep({ name: 'check', sessionId: await createSession() })
    } catch (error) {
      setStep({ name: 'error', message: messageOf(error) })
    }
  }

  async function finishCheck(sessionId: string) {
    // An error thrown from here would surface inside the liveness component
    // as a generic server error, so report it in the app's own error view.
    try {
      setStep({ name: 'result', result: await getResults(sessionId, clientContext()) })
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
          <Flex direction="column" alignItems="flex-start" gap="medium">
            <Text>
              The check records a short video selfie. Face a well-lit wall and turn your screen
              brightness up.
            </Text>
            <Button variation="primary" onClick={startCheck}>
              Start a liveness check
            </Button>
          </Flex>
        )}

        {step.name === 'creating' && <Loader size="large" aria-label="Creating a session" />}

        {step.name === 'check' && (
          <div className="liveness-container">
            <Suspense fallback={<Loader size="large" aria-label="Loading the liveness check" />}>
              <LivenessCheck
                sessionId={step.sessionId}
                region={config.region}
                onComplete={() => finishCheck(step.sessionId)}
                onError={(error) => setStep({ name: 'error', message: describeLivenessError(error) })}
                onCancel={() => setStep({ name: 'start' })}
              />
            </Suspense>
          </div>
        )}

        {step.name === 'result' && (
          <ResultsView result={step.result} onRestart={() => setStep({ name: 'start' })} />
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
