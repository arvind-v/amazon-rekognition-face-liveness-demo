import { defineConfig, devices } from '@playwright/test'

// Runs against `vite preview` with a stubbed backend by default. Set BASE_URL
// to a deployed site to run the same checks against the real stack.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL,
    permissions: ['camera'],
    launchOptions: {
      // A synthetic camera, so the liveness component can open its video
      // stream in a headless browser.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
      },
})
