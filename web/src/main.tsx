import '@aws-amplify/ui-react/styles.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadConfig } from './config'

const root = createRoot(document.getElementById('root')!)

loadConfig().then(
  (config) =>
    root.render(
      <StrictMode>
        <App config={config} />
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <p role="alert" className="config-error">
        {error instanceof Error ? error.message : String(error)}
      </p>,
    ),
)
