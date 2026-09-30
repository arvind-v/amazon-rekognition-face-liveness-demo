/**
 * Where the liveness component is placed on the page. The component sizes
 * its 4:3 video from the width of its container, measures that size once
 * when the check starts, and positions its colored flash overlay relative to
 * the browser window, so the container it gets matters.
 */
export type LayoutMode = 'responsive-modal' | 'inline' | 'small-modal' | 'transform-modal'

/** Camera width of the small modal, like a component squeezed into a sign-in dialog. */
export const SMALL_MODAL_WIDTH = 280

export const LAYOUT_OPTIONS: { value: LayoutMode; label: string; description: string }[] = [
  {
    value: 'responsive-modal',
    label: 'Modal sized to the screen',
    description:
      'A native dialog as large as the window allows at 4:3, fixed when it opens and centered without a CSS transform.',
  },
  {
    value: 'inline',
    label: 'Inline in the page',
    description: 'The component fills the page column, up to 740 px wide.',
  },
  {
    value: 'small-modal',
    label: 'Small fixed modal',
    description: `A ${SMALL_MODAL_WIDTH} px camera view, like a component squeezed into a sign-in dialog.`,
  },
  {
    value: 'transform-modal',
    label: 'Modal centered with a CSS transform',
    description:
      'Same size as the first option, centered with translate(-50%, -50%). The transform moves the flash overlay off the camera view.',
  },
]

/**
 * Height the component adds around its video on the start screen: the
 * photosensitivity warning and the start button. Measured at 740 px wide;
 * the warning wraps to a second line on narrow views.
 */
export const LIVENESS_CHROME_HEIGHT = 200
/** The dialog's own header, padding and distance from the window edge. */
export const DIALOG_CHROME_HEIGHT = 136
export const DIALOG_CHROME_WIDTH = 80
export const MAX_LIVENESS_WIDTH = 960
export const MIN_LIVENESS_WIDTH = 280

/**
 * Widest component that fits the window without scrolling, with the video
 * at 4:3. Computed once when the dialog opens, because the component draws
 * its oval once and does not follow later resizes.
 */
export function fitLivenessWidth(viewportWidth: number, viewportHeight: number): number {
  const byWidth = viewportWidth - DIALOG_CHROME_WIDTH
  const byHeight = ((viewportHeight - DIALOG_CHROME_HEIGHT - LIVENESS_CHROME_HEIGHT) * 4) / 3
  const width = Math.min(byWidth, byHeight, MAX_LIVENESS_WIDTH)
  return Math.round(Math.max(MIN_LIVENESS_WIDTH, width))
}

/**
 * Same test the liveness component uses to switch to full screen during the
 * check: an Android, iPhone or iPad user agent, or an iPad that reports
 * itself as a Mac.
 */
export function isMobileBrowser(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator) {
  const newerIpad = /Macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1
  return /Android|iPhone|iPad/i.test(nav.userAgent) || newerIpad
}

export function defaultLayout(mobile: boolean): LayoutMode {
  return mobile ? 'inline' : 'responsive-modal'
}
