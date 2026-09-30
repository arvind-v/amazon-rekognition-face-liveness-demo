import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeTrack, stubCamera } from '../test/media'
import { CameraFraming } from './CameraFraming'

describe('CameraFraming', () => {
  it('opens the camera with zoom access and starts at the default pre-zoom', async () => {
    const track = fakeTrack({ min: 1, max: 4, step: 0.1 })
    const { getUserMedia } = stubCamera(track)
    render(<CameraFraming onContinue={() => {}} onBack={() => {}} />)

    // The label shows the current value too, for example "Camera zoom 1.5x".
    const slider = await screen.findByRole('slider', { name: /Camera zoom/ })
    expect(slider).toHaveAttribute('aria-valuenow', '1.5')
    expect(slider).toHaveAttribute('aria-valuemax', '4')
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ video: { zoom: true } })
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 1.5 }] })
  })

  it('passes the chosen zoom on and releases the camera', async () => {
    const track = fakeTrack({ min: 1, max: 4, step: 0.1 })
    stubCamera(track)
    const onContinue = vi.fn()
    const { unmount } = render(<CameraFraming onContinue={onContinue} onBack={() => {}} />)
    await screen.findByRole('slider', { name: /Camera zoom/ })

    await userEvent.click(screen.getByRole('button', { name: 'Continue to the check' }))
    unmount()

    expect(onContinue).toHaveBeenCalledWith({
      zoom: 1.5,
      zoomRange: { min: 1, max: 4, step: 0.1 },
    })
    expect(track.stop).toHaveBeenCalled()
  })

  it('explains when the camera has no zoom and continues without one', async () => {
    stubCamera(fakeTrack())
    const onContinue = vi.fn()
    render(<CameraFraming onContinue={onContinue} onBack={() => {}} />)

    expect(await screen.findByText('This camera has no zoom the browser can use')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continue to the check' }))

    expect(onContinue).toHaveBeenCalledWith({ zoom: null, zoomRange: null })
  })

  it('lets the user continue when the camera cannot be opened', async () => {
    const { getUserMedia } = stubCamera(fakeTrack())
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
    render(<CameraFraming onContinue={() => {}} onBack={() => {}} />)

    expect(await screen.findByText('Permission denied')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to the check' })).toBeEnabled(),
    )
  })
})
