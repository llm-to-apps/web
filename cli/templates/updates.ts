import { createHash } from 'node:crypto'
import { type AppTemplate } from '@prisma/client'

import { prisma } from '../../src/server/db'
import {
  parseTemplateManifest,
  templateManifestToAppTemplateFields,
  type TemplateManifest
} from '../../src/shared/templates/manifest'

type CheckUpdatesOptions = {
  apply?: boolean
}

type UpdateTemplateOptions = {
  manifestUrl?: string
  path?: string
  ref?: string
}

type UpdateSource = {
  manifestUrl: string
  reason: string
}

type TemplateUpdate = {
  changes: string[]
  currentHash: string
  latestHash: string
  manifest: TemplateManifest
  manifestUrl: string
  template: AppTemplate
}

class NoUpdateSourceError extends Error {
  constructor() {
    super('No update source found')
    this.name = 'NoUpdateSourceError'
  }
}

const comparedFields = [
  'agentPort',
  'appPort',
  'description',
  'git',
  'icon',
  'image',
  'manifest',
  'name',
  'repository',
  'slug',
  'sortOrder',
  'status'
] as const

export async function checkTemplateUpdatesCommand(options: CheckUpdatesOptions) {
  try {
    const templates = await prisma.appTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
    })
    const updates: TemplateUpdate[] = []

    for (const template of templates) {
      const update = await checkTemplateUpdate(template).catch((error) => {
        if (error instanceof NoUpdateSourceError) {
          return null
        }

        console.warn(
          `Could not check ${template.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        return null
      })

      if (update) {
        updates.push(update)
        printTemplateUpdate(update)
      }
    }

    if (updates.length === 0) {
      console.log('No template updates found.')
      return
    }

    if (!options.apply) {
      console.log(`Found ${updates.length} template update(s).`)
      console.log('Run with --apply to update the database.')
      return
    }

    for (const update of updates) {
      await applyTemplateUpdate(update)
    }

    console.log(`Applied ${updates.length} template update(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

export async function updateTemplateCommand(
  templateId: string,
  options: UpdateTemplateOptions
) {
  try {
    const template = await prisma.appTemplate.findUnique({
      where: {
        id: templateId
      }
    })

    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    const update = await checkTemplateUpdate(template, options)

    if (!update) {
      console.log(`Template ${template.id} is already up to date.`)
      return
    }

    printTemplateUpdate(update)
    await applyTemplateUpdate(update)
    console.log(`Updated template ${template.id}.`)
  } finally {
    await prisma.$disconnect()
  }
}

async function checkTemplateUpdate(
  template: AppTemplate,
  options: UpdateTemplateOptions = {}
) {
  const source = resolveUpdateSource(template, options)

  if (!source) {
    throw new NoUpdateSourceError()
  }

  const manifest = await fetchTemplateManifest(source.manifestUrl)
  const data = templateManifestToAppTemplateFields(manifest, source.manifestUrl)
  const changes = changedFields(template, data)

  if (changes.length === 0) {
    return null
  }

  return {
    changes,
    currentHash: hashJson(template.manifest),
    latestHash: hashJson(data.manifest),
    manifest,
    manifestUrl: source.manifestUrl,
    template
  }
}

async function applyTemplateUpdate(update: TemplateUpdate) {
  const data = templateManifestToAppTemplateFields(update.manifest, update.manifestUrl)

  await prisma.appTemplate.update({
    where: {
      id: update.template.id
    },
    data
  })
}

async function fetchTemplateManifest(manifestUrl: string) {
  const response = await fetch(manifestUrl, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch manifest ${manifestUrl}: ${response.status} ${response.statusText}`
    )
  }

  return parseTemplateManifest(await response.json())
}

function resolveUpdateSource(
  template: AppTemplate,
  options: UpdateTemplateOptions
): UpdateSource | null {
  if (options.manifestUrl) {
    return {
      manifestUrl: options.manifestUrl,
      reason: 'explicit manifest URL'
    }
  }

  const currentManifest = parseStoredManifest(template.manifest)
  const githubSource = currentManifest?.updates?.github

  if (githubSource) {
    return {
      manifestUrl: githubRawManifestUrl(githubSource),
      reason: 'manifest updates.github'
    }
  }

  if (template.manifestUrl?.startsWith('local:')) {
    return null
  }

  const repository = parseGithubRepository(template.git ?? '')
  const path =
    options.path ?? manifestPathFromUrl(template.manifestUrl) ?? 'manifest.json'
  const ref =
    options.ref ??
    currentManifest?.git.mount.defaultBranch ??
    inferGithubRef(template) ??
    'main'

  if (!repository) {
    return null
  }

  return {
    manifestUrl: githubRawManifestUrl({
      path,
      ref,
      repository
    }),
    reason: 'inferred from git remote'
  }
}

function parseStoredManifest(input: unknown) {
  if (!input) {
    return null
  }

  try {
    return parseTemplateManifest(input)
  } catch {
    return null
  }
}

function changedFields(
  template: AppTemplate,
  data: ReturnType<typeof templateManifestToAppTemplateFields>
) {
  return comparedFields.filter((field) => !sameJson(template[field], data[field]))
}

function sameJson(left: unknown, right: unknown) {
  return stableStringify(left ?? null) === stableStringify(right ?? null)
}

function hashJson(input: unknown) {
  return createHash('sha256')
    .update(stableStringify(input ?? null))
    .digest('hex')
    .slice(0, 12)
}

function stableStringify(input: unknown): string {
  if (!input || typeof input !== 'object') {
    return JSON.stringify(input)
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(',')}]`
  }

  return `{${Object.entries(input)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${JSON.stringify(key)}:${stableStringify(value)}`)
    .join(',')}}`
}

function githubRawManifestUrl({
  path,
  ref,
  repository
}: {
  path: string
  ref: string
  repository: string
}) {
  return `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(ref)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

function parseGithubRepository(remote: string) {
  const sshMatch = /^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/.exec(remote)

  if (sshMatch) {
    return sshMatch[1]
  }

  const httpsMatch = /^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/.exec(remote)

  return httpsMatch?.[1] ?? null
}

function manifestPathFromUrl(manifestUrl: string | null) {
  if (!manifestUrl || manifestUrl.startsWith('local:')) {
    return null
  }

  try {
    const url = new URL(manifestUrl)

    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      return parts.length >= 4 ? parts.slice(3).join('/') : null
    }

    if (url.hostname === 'cdn.jsdelivr.net') {
      const match = /^\/gh\/[^/]+\/[^/]+@[^/]+\/(.+)$/.exec(url.pathname)
      return match?.[1] ?? null
    }
  } catch {
    return null
  }

  return null
}

function inferGithubRef(template: AppTemplate) {
  if (!template.manifestUrl) {
    return null
  }

  try {
    const url = new URL(template.manifestUrl)

    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      return parts.length >= 4 ? parts[2] : null
    }
  } catch {
    return null
  }

  return null
}

function printTemplateUpdate(update: TemplateUpdate) {
  console.log(`Template ${update.template.id} has updates:`)
  console.log(`  manifest: ${update.manifestUrl}`)
  console.log(`  manifest hash: ${update.currentHash} -> ${update.latestHash}`)
  console.log(`  changed: ${update.changes.join(', ')}`)
}
