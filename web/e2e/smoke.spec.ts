import { expect, test, type Page } from '@playwright/test'

// Without BASE_URL these tests stub the backend and Cognito, so the liveness
// component gets as far as opening its Rekognition stream, which then fails
// on the fake credentials. With BASE_URL they run against a deployed stack.
const deployed = Boolean(process.env.BASE_URL)
const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

const outputs = {
  version: '1.4',
  auth: {
    aws_region: 'us-east-1',
    user_pool_id: 'us-east-1_example',
    user_pool_client_id: 'exampleclientid',
    identity_pool_id: 'us-east-1:11111111-2222-3333-4444-555555555555',
    unauthenticated_identities_enabled: true,
  },
  custom: { liveness: { region: 'us-east-1', confidence_threshold: 70 } },
}

async function stubBackend(page: Page) {
  await page.route('**/amplify_outputs.json', (route) => route.fulfill({ json: outputs }))
  await page.route('**/api/sessions', (route) => route.fulfill({ json: { sessionId: SESSION_ID } }))
  await page.route('https://cognito-identity.us-east-1.amazonaws.com/', (route) => {
    const target = route.request().headers()['x-amz-target'] ?? ''
    const identityId = 'us-east-1:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const body = target.endsWith('GetId')
      ? { IdentityId: identityId }
      : {
          IdentityId: identityId,
          Credentials: {
            AccessKeyId: 'ASIAEXAMPLE',
            SecretKey: 'example',
            SessionToken: 'example',
            Expiration: Math.floor(Date.now() / 1000) + 3600,
          },
        }
    return route.fulfill({ contentType: 'application/x-amz-json-1.1', body: JSON.stringify(body) })
  })
}

test.describe('with a stubbed backend', () => {
  test.skip(deployed, 'Runs only against the local preview server')

  test('streams the session to Rekognition in the configured region', async ({ page }) => {
    await stubBackend(page)
    const stream = page.waitForEvent('websocket')

    await page.goto('/')
    await page.getByRole('button', { name: 'Start a liveness check' }).click()

    const url = new URL((await stream).url())
    expect(url.host).toBe('streaming-rekognition.us-east-1.amazonaws.com')
    expect(url.searchParams.get('session-id')).toBe(SESSION_ID)
    expect(url.searchParams.get('video-width')).toBe('640')
    expect(url.searchParams.get('video-height')).toBe('480')
    // The fake credentials are rejected, and the app offers a retry.
    await expect(page.getByRole('alert')).toContainText('The check did not complete')
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('explains a missing config instead of rendering a blank page', async ({ page }) => {
    await page.route('**/amplify_outputs.json', (route) => route.fulfill({ status: 404, body: '' }))

    await page.goto('/')

    await expect(page.getByRole('alert')).toContainText('Could not load /amplify_outputs.json')
  })
})

test.describe('against a deployed stack', () => {
  test.skip(!deployed, 'Set BASE_URL to a deployed site')

  test('reaches the camera screen with a real session', async ({ page }) => {
    const sessionCreated = page.waitForResponse(
      (response) => response.url().endsWith('/api/sessions') && response.request().method() === 'POST',
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Start a liveness check' }).click()

    expect((await sessionCreated).ok()).toBe(true)
    await expect(page.getByRole('button', { name: 'Start video check' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator('video')).toBeVisible()
  })
})
