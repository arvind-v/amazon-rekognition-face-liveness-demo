import { Alert, Button, Flex, Heading, Loader, SliderField, Text } from '@aws-amplify/ui-react'
import { useEffect, useRef, useState } from 'react'
import {
  applyZoom,
  initialZoom,
  openFramingCamera,
  readZoomRange,
  targetFaceWidth,
  type ZoomRange,
} from '../zoom'

export interface FramingChoice {
  /** Zoom to hold during the check, or null when the camera has no zoom. */
  zoom: number | null
  zoomRange: ZoomRange | null
}

interface CameraFramingProps {
  onContinue: (choice: FramingChoice) => void
  onBack: () => void
}

type CameraState =
  | { status: 'opening' }
  | { status: 'ready'; track: MediaStreamTrack; range: ZoomRange | null }
  | { status: 'failed'; message: string }

/**
 * A camera preview shown before the check, where the user sets the zoom so
 * their face already starts near the size the check wants.
 */
export function CameraFraming({ onContinue, onBack }: CameraFramingProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraState>({ status: 'opening' })
  const [zoom, setZoom] = useState<number | null>(null)
  const [frame, setFrame] = useState({ width: 640, height: 480 })

  useEffect(() => {
    let stream: MediaStream | undefined
    let cancelled = false

    openFramingCamera().then(
      async (opened) => {
        if (cancelled) {
          opened.getTracks().forEach((track) => track.stop())
          return
        }
        stream = opened
        const [track] = opened.getVideoTracks()
        if (videoRef.current) videoRef.current.srcObject = opened
        const range = readZoomRange(track)
        const start = initialZoom(range)
        const applied = start === null ? null : await applyZoom(track, start).catch(() => null)
        setZoom(applied ?? start)
        setCamera({ status: 'ready', track, range })
      },
      (error: unknown) =>
        setCamera({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
    )

    return () => {
      cancelled = true
      // Release the camera so the liveness component can open it.
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function changeZoom(value: number) {
    setZoom(value)
    if (camera.status === 'ready') await applyZoom(camera.track, value).catch(() => {})
  }

  const range = camera.status === 'ready' ? camera.range : null
  const outlineWidth = (targetFaceWidth(frame.width, frame.height) / frame.width) * 100
  const outlineHeight = outlineWidth * 1.618 * (frame.width / frame.height)

  return (
    <Flex direction="column" gap="medium" className="framing">
      <Heading level={2}>Frame your face</Heading>
      <Text>
        Sit where you normally would. {range ? 'Zoom until your face fills the outline. ' : ''}
        The check will still ask you to move a little closer.
      </Text>

      <div className="framing-preview" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget
            if (videoWidth && videoHeight) setFrame({ width: videoWidth, height: videoHeight })
          }}
        />
        <svg className="framing-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="50" cy="50" rx={outlineWidth / 2} ry={outlineHeight / 2} />
        </svg>
        {camera.status === 'opening' && <Loader className="framing-loader" size="large" />}
      </div>

      {camera.status === 'ready' && range && zoom !== null && (
        <SliderField
          label="Camera zoom"
          min={range.min}
          max={range.max}
          step={range.step}
          value={zoom}
          onChange={changeZoom}
          formatValue={(value) => `${value.toFixed(1)}x`}
        />
      )}

      {camera.status === 'ready' && !range && (
        <Alert variation="info" heading="This camera has no zoom the browser can use">
          The check will use the camera's full view. Browsers offer zoom on Android phones and on
          webcams with a zoom control; most built-in laptop cameras have none.
        </Alert>
      )}

      {camera.status === 'failed' && (
        <Alert variation="warning" heading="Could not open the camera for framing">
          {camera.message}
        </Alert>
      )}

      <Flex gap="small">
        <Button
          variation="primary"
          isDisabled={camera.status === 'opening'}
          onClick={() => onContinue({ zoom: range ? zoom : null, zoomRange: range })}
        >
          Continue to the check
        </Button>
        <Button variation="link" onClick={onBack}>
          Back
        </Button>
      </Flex>
    </Flex>
  )
}
