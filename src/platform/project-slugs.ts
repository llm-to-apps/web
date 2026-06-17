import { randomInt } from 'node:crypto'

import slugWords from '../../data/slug-words.json'
import type { prisma } from '../server/db'
import { cleanSlug } from './templates'

type PrismaClientLike = typeof prisma

const maxRandomAttempts = 30

export async function createAvailableProjectSlug({
  db,
  fallbackId,
  prefix
}: {
  db: PrismaClientLike
  fallbackId: string
  prefix: string
}) {
  const cleanPrefix = cleanSlug(prefix)

  for (let attempt = 0; attempt < maxRandomAttempts; attempt += 1) {
    const slug = cleanSlug(`${cleanPrefix}-${pickRandomSlugWord()}`)
    const existingProject = await db.project.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: {
          notIn: ['deleting', 'deleted']
        }
      },
      select: { id: true }
    })

    if (!existingProject) {
      return slug
    }
  }

  return cleanSlug(`${cleanPrefix}-${fallbackId.slice(0, 6)}`)
}

export function pickRandomSlugWord() {
  return slugWords[randomInt(slugWords.length)]
}
