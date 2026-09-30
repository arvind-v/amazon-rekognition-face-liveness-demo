import { describe, expect, it } from 'vitest'
import { ConfigError, parseConfig } from './config'

const outputs = {
  version: '1.4',
  auth: {
    aws_region: 'us-east-1',
    identity_pool_id: 'us-east-1:11111111-2222-3333-4444-555555555555',
    unauthenticated_identities_enabled: true,
  },
  custom: {
    liveness: { region: 'us-east-1', api_url: 'https://example.cloudfront.net/api', confidence_threshold: 80 },
  },
}

describe('parseConfig', () => {
  it('reads the region and threshold from the custom section', () => {
    expect(parseConfig(outputs)).toEqual({ region: 'us-east-1', confidenceThreshold: 80 })
  })

  it('defaults the threshold when it is missing', () => {
    const { confidence_threshold: _, ...liveness } = outputs.custom.liveness
    expect(parseConfig({ ...outputs, custom: { liveness } }).confidenceThreshold).toBe(70)
  })

  it('rejects outputs without an identity pool', () => {
    expect(() => parseConfig({ ...outputs, auth: {} })).toThrow(ConfigError)
  })

  it('rejects outputs without a liveness region', () => {
    expect(() => parseConfig({ ...outputs, custom: {} })).toThrow(/custom.liveness.region/)
  })
})
