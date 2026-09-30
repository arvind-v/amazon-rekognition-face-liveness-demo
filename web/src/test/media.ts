import { vi } from 'vitest'

/** A camera track with an optional zoom control, for tests without a camera. */
export function fakeTrack(zoom?: { min: number; max: number; step?: number }) {
  const settings: Record<string, number> = { width: 640, height: 480 }
  if (zoom) settings.zoom = zoom.min
  const track = {
    kind: 'video',
    getCapabilities: () => (zoom ? { zoom } : {}),
    getSettings: () => ({ ...settings }),
    applyConstraints: vi.fn(async (constraints: { advanced?: { zoom?: number }[] }) => {
      const value = constraints.advanced?.[0]?.zoom
      if (value !== undefined) settings.zoom = value
    }),
    stop: vi.fn(),
  }
  return track
}

export type FakeTrack = ReturnType<typeof fakeTrack>

export function fakeStream(track: FakeTrack) {
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream
}

/**
 * Installs navigator.mediaDevices whose getUserMedia returns the given track.
 * jsdom has no mediaDevices; the test setup removes this after each test.
 */
export function stubCamera(track: FakeTrack) {
  const getUserMedia = vi.fn(async (_constraints?: MediaStreamConstraints) => fakeStream(track))
  const mediaDevices = { getUserMedia } as unknown as MediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: mediaDevices,
    configurable: true,
    writable: true,
  })
  return { getUserMedia, mediaDevices }
}
