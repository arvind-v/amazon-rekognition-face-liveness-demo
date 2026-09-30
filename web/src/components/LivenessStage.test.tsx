import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fitLivenessWidth, SMALL_MODAL_WIDTH } from '../layout'
import { LivenessStage } from './LivenessStage'

function setWindowSize(width: number, height: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('innerHeight', height)
}

describe('LivenessStage', () => {
  it('opens the responsive modal as a native dialog sized to the window', () => {
    setWindowSize(1436, 895)
    render(
      <LivenessStage mode="responsive-modal" onClose={() => {}}>
        <p>component</p>
      </LivenessStage>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Liveness check' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByTestId('modal-liveness')).toHaveStyle({
      width: `${fitLivenessWidth(1436, 895)}px`,
    })
  })

  it('keeps its size when the window is resized after it opens', () => {
    setWindowSize(1436, 895)
    const { rerender } = render(
      <LivenessStage mode="responsive-modal" onClose={() => {}}>
        <p>component</p>
      </LivenessStage>,
    )
    setWindowSize(800, 600)
    rerender(
      <LivenessStage mode="responsive-modal" onClose={() => {}}>
        <p>component</p>
      </LivenessStage>,
    )

    expect(screen.getByTestId('modal-liveness')).toHaveStyle({ width: '745px' })
  })

  it('uses a fixed width for the small modal', () => {
    render(
      <LivenessStage mode="small-modal" onClose={() => {}}>
        <p>component</p>
      </LivenessStage>,
    )

    expect(screen.getByTestId('modal-liveness')).toHaveStyle({ width: `${SMALL_MODAL_WIDTH}px` })
  })

  it('centers the transform modal with a CSS transform instead of a dialog', () => {
    render(
      <LivenessStage mode="transform-modal" onClose={() => {}}>
        <p>component</p>
      </LivenessStage>,
    )

    const panel = screen.getByRole('dialog', { name: 'Liveness check' })
    expect(panel.tagName).toBe('DIV')
    expect(panel).toHaveClass('modal-panel--transform')
  })

  it('renders inline without a dialog', () => {
    render(
      <LivenessStage mode="inline" onClose={() => {}}>
        <p>component</p>
      </LivenessStage>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('component')).toBeInTheDocument()
  })

  it('closes from the close button and from Escape', async () => {
    const onClose = vi.fn()
    render(
      <LivenessStage mode="responsive-modal" onClose={onClose}>
        <p>component</p>
      </LivenessStage>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close the check' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
