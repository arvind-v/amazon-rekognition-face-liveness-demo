import { Button, CheckboxField, Flex, Radio, RadioGroupField, SelectField, Text } from '@aws-amplify/ui-react'
import type { ChallengeType } from '../api'
import { LAYOUT_OPTIONS, type LayoutMode } from '../layout'

export interface CheckSettings {
  layout: LayoutMode
  /** Show the framing step, where the camera zoom is set, before the check. */
  preZoom: boolean
  /** Challenge to request; undefined lets Rekognition choose. */
  challengeType?: ChallengeType
  /** Extra frames from the video to return with the result, 0 to 4. */
  auditImagesLimit: number
}

interface SetupPanelProps {
  settings: CheckSettings
  mobile: boolean
  onChange: (settings: CheckSettings) => void
  onStart: () => void
}

export function SetupPanel({ settings, mobile, onChange, onStart }: SetupPanelProps) {
  return (
    <Flex direction="column" gap="large" className="setup">
      <Text>
        The check records a short video selfie. Face a well-lit wall and turn your screen
        brightness up.
      </Text>

      <RadioGroupField
        legend="Layout"
        name="layout"
        value={settings.layout}
        onChange={(event) => onChange({ ...settings, layout: event.target.value as LayoutMode })}
        descriptiveText={
          mobile
            ? 'On phones the component switches to full screen once the check starts.'
            : undefined
        }
      >
        {LAYOUT_OPTIONS.map((option) => (
          <Radio key={option.value} value={option.value}>
            <span className="option-label">{option.label}</span>
            <span className="option-description">{option.description}</span>
          </Radio>
        ))}
      </RadioGroupField>

      <SelectField
        label="Challenge"
        value={settings.challengeType ?? ''}
        onChange={(event) =>
          onChange({
            ...settings,
            challengeType: (event.target.value || undefined) as ChallengeType | undefined,
          })
        }
        descriptiveText="The light challenge flashes colors on the screen and uses their reflection on your face."
      >
        <option value="">Let Rekognition choose</option>
        <option value="FaceMovementAndLightChallenge">Face movement and light</option>
        <option value="FaceMovementChallenge">Face movement only</option>
      </SelectField>

      <SelectField
        label="Audit images"
        value={String(settings.auditImagesLimit)}
        onChange={(event) => onChange({ ...settings, auditImagesLimit: Number(event.target.value) })}
        descriptiveText="Extra frames from the video, returned with the result for review."
      >
        {[0, 1, 2, 3, 4].map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </SelectField>

      <CheckboxField
        name="preZoom"
        label="Frame and pre-zoom the camera before the check"
        checked={settings.preZoom}
        onChange={(event) => onChange({ ...settings, preZoom: event.target.checked })}
      />

      <div>
        <Button variation="primary" onClick={onStart}>
          Start a liveness check
        </Button>
      </div>
    </Flex>
  )
}
