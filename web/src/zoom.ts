/**
 * Camera zoom for the liveness check.
 *
 * The check measures face size relative to the camera frame, so zooming the
 * camera makes the face fill the oval from farther away. The zoom is chosen
 * before the check and held for its whole length: the check asks the user to
 * move closer, and changing the zoom during it would fake that movement.
 *
 * Only the camera's own zoom is used (the MediaStreamTrack `zoom`
 * constraint), so Rekognition still receives the camera's frames. Browsers
 * expose it where the camera supports it, for example Chrome on Android and
 * USB webcams with a zoom control. Elsewhere there is no zoom to offer.
 */

export interface ZoomRange {
  min: number
  max: number
  step: number
}

/** Zoom the framing step starts at when the camera supports zoom. */
export const DEFAULT_PRE_ZOOM = 1.5

// `zoom` is in the Media Capture Image spec but not yet in TypeScript's DOM types.
type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } }
type ZoomSettings = MediaTrackSettings & { zoom?: number }
type ZoomConstraints = MediaTrackConstraints & { zoom?: boolean | number }

export function readZoomRange(track: MediaStreamTrack): ZoomRange | null {
  const zoom = (track.getCapabilities?.() as ZoomCapabilities | undefined)?.zoom
  if (!zoom || !(zoom.max > zoom.min)) return null
  return { min: zoom.min, max: zoom.max, step: zoom.step || 0.1 }
}

export function clampZoom(value: number, range: ZoomRange): number {
  return Math.min(range.max, Math.max(range.min, value))
}

export function initialZoom(range: ZoomRange | null): number | null {
  return range ? clampZoom(DEFAULT_PRE_ZOOM, range) : null
}

/** Applies a zoom level and returns the level the camera reports. */
export async function applyZoom(track: MediaStreamTrack, value: number): Promise<number | null> {
  const range = readZoomRange(track)
  if (!range) return null
  const zoom = clampZoom(value, range)
  await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] })
  return (track.getSettings() as ZoomSettings).zoom ?? zoom
}

/** Opens the front camera for the framing preview, asking for zoom access. */
export function openFramingCamera(): Promise<MediaStream> {
  const video: ZoomConstraints = {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
    // Chrome grants zoom control only to streams that ask for it.
    zoom: true,
  }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

/**
 * Makes every camera stream opened until the returned function is called
 * start at the given zoom. The liveness component opens its own stream when
 * it mounts, so this is how the chosen zoom reaches it without changing the
 * component. `onApplied` receives the zoom the camera reports, or null if the
 * camera has no zoom.
 */
export function holdZoomForLiveness(
  zoom: number,
  onApplied: (applied: number | null) => void,
  mediaDevices: MediaDevices = navigator.mediaDevices,
): () => void {
  const hadOwnProperty = Object.prototype.hasOwnProperty.call(mediaDevices, 'getUserMedia')
  const original = mediaDevices.getUserMedia
  const getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const video = constraints?.video
    if (!video) return original.call(mediaDevices, constraints)

    const withZoom: MediaStreamConstraints = {
      ...constraints,
      video: { ...(typeof video === 'object' ? video : {}), zoom: true } as ZoomConstraints,
    }
    const stream = await original.call(mediaDevices, withZoom)
    const [track] = stream.getVideoTracks()
    try {
      onApplied(track ? await applyZoom(track, zoom) : null)
    } catch {
      onApplied(null)
    }
    return stream
  }
  mediaDevices.getUserMedia = getUserMedia
  return () => {
    if (mediaDevices.getUserMedia !== getUserMedia) return
    if (hadOwnProperty) {
      mediaDevices.getUserMedia = original
    } else {
      delete (mediaDevices as Partial<MediaDevices>).getUserMedia
    }
  }
}

/**
 * Face width the framing step aims for, in camera pixels.
 *
 * Before recording, the liveness component checks that the face is not too
 * close: in its code, (2 x pupil distance + 1.8 x eye-to-mouth distance) / 4,
 * divided by the width of its start-screen oval, must stay under a threshold
 * that Rekognition sends with the session. The oval is 0.8 of the frame width,
 * or of 3/4 of the height for a landscape frame. The threshold is 0.4 in the
 * SDK's own test data; this aims 20% below the limit that value gives. Treat
 * it as a starting point to tune, not a service guarantee.
 */
export function targetFaceWidth(frameWidth: number, frameHeight: number): number {
  const ovalWidth = 0.8 * (frameWidth >= frameHeight ? 0.75 * frameHeight : frameWidth)
  const distanceThreshold = 0.4
  const margin = 0.8
  return 2 * distanceThreshold * ovalWidth * margin
}
