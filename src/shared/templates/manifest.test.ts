import { describe, expect, it } from 'vitest'

import { parseTemplateManifest } from './manifest'

const baseManifest = {
  schemaVersion: 1,
  id: 'calendar-app',
  slug: 'calendar-app',
  name: 'Calendar App',
  description: 'Calendar integration test app.',
  icon: 'calendar',
  status: 'available',
  source: {
    repository: 'calendar-template',
    remote: 'git@example.com:calendar-template.git'
  },
  git: {
    mount: {
      target: '/workspace',
      strategy: 'clone'
    }
  },
  runtime: {
    agentPort: 7070,
    appPort: 80,
    workdir: '/workspace'
  },
  services: {},
  env: {
    template: {}
  }
} as const

describe('template manifest integrations', () => {
  it('accepts on-demand Google integration scopes', () => {
    const manifest = parseTemplateManifest({
      ...baseManifest,
      integrations: {
        googleCalendar: {
          mode: 'on_demand',
          provider: 'google',
          required: false,
          scopes: ['https://www.googleapis.com/auth/calendar.readonly']
        }
      }
    })

    expect(manifest.integrations?.googleCalendar).toEqual({
      mode: 'on_demand',
      provider: 'google',
      required: false,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    })
  })

  it('accepts hot template markers', () => {
    const manifest = parseTemplateManifest({
      ...baseManifest,
      hot: true
    })

    expect(manifest.hot).toBe(true)
  })

  it('rejects unknown integration providers', () => {
    expect(() =>
      parseTemplateManifest({
        ...baseManifest,
        integrations: {
          outlookCalendar: {
            mode: 'on_demand',
            provider: 'microsoft',
            required: false,
            scopes: ['Calendars.Read']
          }
        }
      })
    ).toThrow('/integrations/outlookCalendar/provider')
  })
})
