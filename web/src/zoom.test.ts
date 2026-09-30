import { describe, expect, it, vi } from 'vitest'
import { fakeStream, fakeTrack } from './test/media'
import {
  applyZoom,
  DEFAULT_PRE_ZOOM,
  holdZoomForLiveness,
  initialZoom,
  readZoomRange,
  targetFaceWidth,
} from './zoom'

describe('readZoomRange', () => {
  it('reads the camera zoom capability', () => {
    expect(readZoomRange(fakeTrack({ min: 1, max: 5, step: 0.1 }) as never)).toEqual({
      min: 1,
      max: 5,
      step: 0.1,
    })
  })

  it('returns null for a camera without zoom', () => {
    expect(readZoomRange(fakeTrack() as never)).toBeNull()
  })

  it('returns null for a zoom range with nothing to choose', () => {
    expect(readZoomRange(fakeTrack({ min: 1, max: 1 }) as never)).toBeNull()
  })
})

describe('initialZoom', () => {
  it('starts at the default pre-zoom when the camera allows it', () => {
    expect(initialZoom({ min: 1, max: 5, step: 0.1 })).toBe(DEFAULT_PRE_ZOOM)
  })

  it('stays inside a narrower range', () => {
    expect(initialZoom({ min: 1, max: 1.2, step: 0.1 })).toBe(1.2)
  })

  it('is null without zoom', () => {
    expect(initialZoom(null)).toBeNull()
  })
})

describe('applyZoom', () => {
  it('clamps to the camera range and reports the zoom the camera settles on', async () => {
    const track = fakeTrack({ min: 1, max: 3 })

    await expect(applyZoom(track as never, 9)).resolves.toBe(3)
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] })
  })

  it('does nothing on a camera without zoom', async () => {
    const track = fakeTrack()

    await expect(applyZoom(track as never, 2)).resolves.toBeNull()
    expect(track.applyConstraints).not.toHaveBeenCalled()
  })
})

describe('holdZoomForLiveness', () => {
  function devicesWith(track: ReturnType<typeof fakeTrack>) {
    const getUserMedia = vi.fn(async (_constraints?: MediaStreamConstraints) => fakeStream(track))
    // Like the browser, the method lives on the prototype, not the instance.
    const mediaDevices = Object.create({ getUserMedia }) as MediaDevices
    return { mediaDevices, getUserMedia }
  }

  it('asks for zoom access and zooms every stream before returning it', async () => {
    const track = fakeTrack({ min: 1, max: 5 })
    const { mediaDevices, getUserMedia } = devicesWith(track)
    const onApplied = vi.fn()

    holdZoomForLiveness(1.8, onApplied, mediaDevices)
    await mediaDevices.getUserMedia({ video: { width: { ideal: 640 } }, audio: false })

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { width: { ideal: 640 }, zoom: true },
      audio: false,
    })
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 1.8 }] })
    expect(onApplied).toHaveBeenCalledWith(1.8)
  })

  it('reports null when the camera has no zoom', async () => {
    const { mediaDevices } = devicesWith(fakeTrack())
    const onApplied = vi.fn()

    holdZoomForLiveness(1.8, onApplied, mediaDevices)
    await mediaDevices.getUserMedia({ video: true })

    expect(onApplied).toHaveBeenCalledWith(null)
  })

  it('reports null when the camera refuses the zoom', async () => {
    const track = fakeTrack({ min: 1, max: 5 })
    track.applyConstraints.mockRejectedValueOnce(new Error('OverconstrainedError'))
    const { mediaDevices } = devicesWith(track)
    const onApplied = vi.fn()

    holdZoomForLiveness(1.8, onApplied, mediaDevices)
    await expect(mediaDevices.getUserMedia({ video: true })).resolves.toBeDefined()

    expect(onApplied).toHaveBeenCalledWith(null)
  })

  it('leaves requests without video alone', async () => {
    const { mediaDevices, getUserMedia } = devicesWith(fakeTrack({ min: 1, max: 5 }))

    holdZoomForLiveness(1.8, vi.fn(), mediaDevices)
    await mediaDevices.getUserMedia({ audio: true })

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('restores the original getUserMedia when released', () => {
    const { mediaDevices, getUserMedia } = devicesWith(fakeTrack())

    const release = holdZoomForLiveness(1.8, vi.fn(), mediaDevices)
    expect(Object.prototype.hasOwnProperty.call(mediaDevices, 'getUserMedia')).toBe(true)
    release()

    expect(Object.prototype.hasOwnProperty.call(mediaDevices, 'getUserMedia')).toBe(false)
    expect(mediaDevices.getUserMedia).toBe(getUserMedia)
  })
})

describe('targetFaceWidth', () => {
  it('aims below the pre-check limit for a landscape frame', () => {
    // Oval 0.8 x 360 = 288 px; limit 2 x 0.4 x 288 = 230 px; 20% margin.
    expect(targetFaceWidth(640, 480)).toBeCloseTo(184.3, 1)
  })

  it('uses the full width of a portrait frame', () => {
    expect(targetFaceWidth(480, 640)).toBeCloseTo(245.8, 1)
  })
})
