import { prisma } from '../../src/server/db'
import {
  parseTemplateManifest,
  templateManifestToAppTemplateFields
} from '../../src/shared/templates/manifest'

export async function addTemplateCommand(manifestUrl: string) {
  const manifest = await fetchTemplateManifest(manifestUrl)
  const template = parseTemplateManifest(manifest)
  const data = templateManifestToAppTemplateFields(template, manifestUrl)

  await prisma.appTemplate.upsert({
    where: {
      id: data.id
    },
    create: data,
    update: data
  })

  await prisma.$disconnect()

  console.log(`Registered template ${data.id} from ${manifestUrl}`)
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

  return response.json() as Promise<unknown>
}
