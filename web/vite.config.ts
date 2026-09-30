/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// `npm run dev` has no backend of its own. Point LIVENESS_SITE_URL at a
// deployed stack and the dev server forwards the API and the generated
// config to it, so the page behaves as it does on CloudFront.
const siteUrl = process.env.LIVENESS_SITE_URL
const proxy = siteUrl
  ? Object.fromEntries(
      ['/api', '/amplify_outputs.json'].map((path) => [
        path,
        { target: siteUrl, changeOrigin: true },
      ]),
    )
  : undefined

export default defineConfig({
  plugins: [react()],
  define: {
    __LIVENESS_SDK_VERSION__: JSON.stringify(
      pkg.dependencies['@aws-amplify/ui-react-liveness'],
    ),
  },
  server: { proxy },
  preview: { proxy },
  build: {
    // The liveness chunk carries TensorFlow.js and its face model runtime.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
