import { type AppTemplate } from '@prisma/client'

import { prisma } from '@/server/db'
import { createAvailableProjectSlug } from '@/platform/project-slugs'
import {
  cleanSlug,
  isInstallableTemplate,
  type InstallableTemplate
} from '@/platform/templates'
import { appError, appOk, type AppResult } from '@/shared/result'

export type InstallableAppTemplate = AppTemplate & InstallableTemplate

export async function loadInstallableTemplate(
  templateId: string
): Promise<AppResult<InstallableAppTemplate>> {
  const template = await prisma.appTemplate.findUnique({
    where: { id: templateId }
  })

  if (!template || !isInstallableTemplate(template)) {
    return appError('BAD_REQUEST', 'This template is not available for install yet')
  }

  return appOk(template)
}

export async function resolveDeploySlug({
  fallbackId,
  requestedSlug,
  templateId
}: {
  fallbackId: string
  requestedSlug?: string
  templateId: string
}): Promise<AppResult<string>> {
  const slug = requestedSlug
    ? cleanSlug(requestedSlug)
    : await createAvailableProjectSlug({
        db: prisma,
        fallbackId,
        prefix: templateId
      })

  if (!slug) {
    return appError('BAD_REQUEST', 'A valid slug is required')
  }

  const existingProject = await prisma.project.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    }
  })

  if (existingProject) {
    return appError('CONFLICT', 'This slug is already deployed')
  }

  return appOk(slug)
}
