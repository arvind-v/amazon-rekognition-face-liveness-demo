import { Button, Flex, Heading } from '@aws-amplify/ui-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fitLivenessWidth, SMALL_MODAL_WIDTH, type LayoutMode } from '../layout'

interface LivenessStageProps {
  mode: LayoutMode
  onClose: () => void
  children: ReactNode
}

/** Places the liveness component inline or in one of the modal layouts. */
export function LivenessStage({ mode, onClose, children }: LivenessStageProps) {
  // Sized once, when the stage opens: the component draws its oval for the
  // size it has when the check starts and does not redraw on resize.
  const [width] = useState(() =>
    mode === 'small-modal'
      ? SMALL_MODAL_WIDTH
      : fitLivenessWidth(window.innerWidth, window.innerHeight),
  )

  if (mode === 'inline') {
    return <div className="liveness-inline">{children}</div>
  }

  const body = (
    <>
      <Flex justifyContent="space-between" alignItems="center" className="modal-header">
        <Heading level={2}>Liveness check</Heading>
        <Button variation="link" size="small" onClick={onClose} aria-label="Close the check">
          Close
        </Button>
      </Flex>
      <div className="modal-liveness" style={{ width }} data-testid="modal-liveness">
        {children}
      </div>
    </>
  )

  if (mode === 'transform-modal') {
    return (
      <div className="modal-backdrop">
        <div className="modal-panel modal-panel--transform" role="dialog" aria-modal="true" aria-label="Liveness check">
          {body}
        </div>
      </div>
    )
  }

  return <NativeDialog onClose={onClose}>{body}</NativeDialog>
}

function NativeDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal-panel liveness-dialog"
      aria-label="Liveness check"
      onCancel={(event) => {
        // Escape closes the check through the app, which also ends the session.
        event.preventDefault()
        onClose()
      }}
    >
      {children}
    </dialog>
  )
}
