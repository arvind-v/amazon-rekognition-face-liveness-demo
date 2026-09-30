import { describe, expect, it } from 'vitest'
import { defaultLayout, fitLivenessWidth, isMobileBrowser, MAX_LIVENESS_WIDTH, MIN_LIVENESS_WIDTH } from './layout'

describe('fitLivenessWidth', () => {
  it('is limited by height on a laptop screen', () => {
    // A 1436 x 895 browser window, as on a 13-inch MacBook.
    expect(fitLivenessWidth(1436, 895)).toBe(745)
  })

  it('is limited by width on a narrow window', () => {
    expect(fitLivenessWidth(600, 1000)).toBe(520)
  })

  it('never exceeds the maximum on a large monitor', () => {
    expect(fitLivenessWidth(3840, 2160)).toBe(MAX_LIVENESS_WIDTH)
  })

  it('never drops below the minimum', () => {
    expect(fitLivenessWidth(300, 400)).toBe(MIN_LIVENESS_WIDTH)
  })
})

describe('isMobileBrowser', () => {
  const agents = {
    iphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    android:
      'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  }

  it.each([
    ['iPhone', agents.iphone, 5, true],
    ['Android phone', agents.android, 5, true],
    ['iPad reporting itself as a Mac', agents.mac, 5, true],
    ['Mac', agents.mac, 0, false],
  ])('%s', (_name, userAgent, maxTouchPoints, expected) => {
    expect(isMobileBrowser({ userAgent, maxTouchPoints })).toBe(expected)
  })
})

describe('defaultLayout', () => {
  it('uses the responsive modal on desktop and inline on phones', () => {
    expect(defaultLayout(false)).toBe('responsive-modal')
    expect(defaultLayout(true)).toBe('inline')
  })
})
