import { Button, Flex, Radio, RadioGroupField, Text } from '@aws-amplify/ui-react'
import { LAYOUT_OPTIONS, type LayoutMode } from '../layout'

export interface CheckSettings {
  layout: LayoutMode
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

      <div>
        <Button variation="primary" onClick={onStart}>
          Start a liveness check
        </Button>
      </div>
    </Flex>
  )
}
