import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LivenessResult } from '../api'
import { passingResult } from '../test/fetch'
import { ResultsView } from './ResultsView'

const context = {
  platform: 'web',
  layout: 'responsive-modal',
  preZoom: true,
  zoomSupported: true,
  zoomApplied: 1.5,
}

function renderResult(overrides: Partial<LivenessResult> = {}, ctx: Record<string, unknown> = context) {
  const result = { ...passingResult(), ...overrides } as LivenessResult
  render(<ResultsView result={result} context={ctx as never} onRestart={() => {}} />)
}

describe('ResultsView', () => {
  it('shows a pass with the score against the threshold', () => {
    renderResult()

    expect(screen.getByRole('heading', { name: 'Live person' })).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText(/Confidence 92.35%/)).toBeInTheDocument()
    expect(screen.getByText('(pass at 70 or higher)')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Confidence score' })).toHaveAttribute(
      'aria-valuenow',
      '92.35',
    )
    expect(screen.getByRole('img', { name: /Reference image/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /What to change/ })).not.toBeInTheDocument()
  })

  it('shows a fail with guidance for each feedback code', () => {
    renderResult({
      confidence: 41,
      isLive: false,
      feedback: [
        { code: 'LOW_LIGHTING_DETECTED', message: 'Poor lighting conditions detected.' },
        { code: 'FACE_NOT_ALIGNED', message: 'Face not looking at the camera.' },
      ],
    })

    expect(screen.getByRole('heading', { name: 'Not verified' })).toBeInTheDocument()
    expect(screen.getByText('Fail')).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Too dark.')
    expect(items[0]).toHaveTextContent('turn the screen brightness up')
    expect(items[0]).toHaveTextContent('LOW_LIGHTING_DETECTED: Poor lighting conditions detected.')
    expect(items[1]).toHaveTextContent('Not facing the camera.')
  })

  it('explains a session with no score', () => {
    renderResult({ status: 'FAILED', confidence: null, isLive: false, referenceImage: null })

    expect(screen.getByText(/No score. The check did not finish/)).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows audit images when the session returned them', () => {
    renderResult({ auditImages: [{ base64: 'b25l' }, { base64: 'dHdv' }] })

    expect(screen.getByRole('img', { name: 'Audit image 1' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,b25l',
    )
    expect(screen.getByRole('img', { name: 'Audit image 2' })).toBeInTheDocument()
  })

  it('names the challenge and the zoom the check ran with', () => {
    renderResult({ challenge: { type: 'FaceMovementChallenge', version: '1.0.0' } })

    expect(screen.getByText('Face movement only')).toBeInTheDocument()
    expect(screen.getByText('1.5x')).toBeInTheDocument()
  })

  it.each([
    [{ preZoom: false }, 'framing step skipped'],
    [{ preZoom: true, zoomSupported: false }, 'camera has no zoom'],
    [{ preZoom: true, zoomSupported: true, zoomApplied: null }, 'not applied'],
  ])('describes the zoom as %j', (zoomContext, expected) => {
    renderResult({}, { ...context, ...zoomContext })

    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
