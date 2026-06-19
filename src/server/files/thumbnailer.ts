import path from 'node:path'
import sharp from 'sharp'

import { prisma } from '@/server/db'
import { browserlessToken, browserlessUrl, envNumber } from '@/server/env'
import { publishHubArtifactChanged } from '@/server/hub/artifact-events'
import { logInfo, logWarn } from '@/server/logger'
import { getPlatformStorageObjectBuffer, putPlatformStorageObject } from '@/server/storage'

const thumbnailMaxSizePx = 500
const thumbnailMimeType = 'image/webp'
const thumbnailExtension = '.webp'
const thumbnailScope = 'generated_thumbnail'

export async function generateUploadedFileThumbnail(uploadedFileId: string) {
  const file = await prisma.uploadedFile.findUnique({
    where: {
      id: uploadedFileId
    },
    select: {
      deletedAt: true,
      id: true,
      mimeType: true,
      originalName: true,
      projectId: true,
      scope: true,
      storageBucket: true,
      storageKey: true,
      thumbnailId: true,
      userId: true
    }
  })

  if (!file) {
    logWarn('uploaded_file.thumbnail.skipped_missing', { uploadedFileId })
    return { skipped: true }
  }

  if (file.deletedAt || file.scope === thumbnailScope || file.thumbnailId) {
    logInfo('uploaded_file.thumbnail.skipped_ineligible', {
      scope: file.scope,
      uploadedFileId
    })
    return { skipped: true }
  }

  if (!isThumbnailSource(file.mimeType)) {
    logInfo('uploaded_file.thumbnail.skipped_unsupported_source', {
      mimeType: file.mimeType,
      uploadedFileId
    })
    return { skipped: true }
  }

  if (!file.storageBucket || !file.storageKey) {
    logWarn('uploaded_file.thumbnail.skipped_missing_storage', { uploadedFileId })
    return { skipped: true }
  }

  const source = await getPlatformStorageObjectBuffer({
    bucket: file.storageBucket,
    key: file.storageKey
  })
  const imageSource =
    file.mimeType === 'application/pdf'
      ? await renderPdfFirstPage(source)
      : source
  const thumbnailBuffer = await sharp(imageSource, {
    failOn: 'none'
  })
    .rotate()
    .resize(thumbnailMaxSizePx, thumbnailMaxSizePx, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({
      quality: 82
    })
    .toBuffer()

  const thumbnailId = crypto.randomUUID()
  const thumbnailName = thumbnailFileName(file.originalName)
  const storageKey = ['generated-thumbnails', file.userId, thumbnailId, thumbnailName].join(
    '/'
  )

  const storageObject = await putPlatformStorageObject({
    body: thumbnailBuffer,
    contentType: thumbnailMimeType,
    key: storageKey
  })

  const linkedArtifacts = await prisma.$transaction(async (tx) => {
    const thumbnail = await tx.uploadedFile.create({
      data: {
        id: thumbnailId,
        mimeType: thumbnailMimeType,
        originalName: thumbnailName,
        projectId: file.projectId,
        scope: thumbnailScope,
        sizeBytes: thumbnailBuffer.byteLength,
        status: 'processed',
        storageBucket: storageObject.bucket,
        storageKey: storageObject.key,
        userId: file.userId,
        processedAt: new Date()
      },
      select: {
        id: true
      }
    })

    await tx.uploadedFile.updateMany({
      where: {
        id: file.id,
        thumbnailId: null
      },
      data: {
        thumbnailId: thumbnail.id
      }
    })

    return tx.hubArtifact.findMany({
      where: {
        uploadedFileId: file.id
      },
      select: {
        id: true,
        status: true,
        topicId: true
      }
    })
  })

  await Promise.all(
    linkedArtifacts.map((artifact) =>
      publishHubArtifactChanged({
        artifactId: artifact.id,
        status: artifact.status,
        topicId: artifact.topicId,
        type: 'artifact_changed'
      })
    )
  )

  logInfo('uploaded_file.thumbnail.generated', {
    sizeBytes: thumbnailBuffer.byteLength,
    thumbnailId,
    uploadedFileId
  })

  return {
    thumbnailId
  }
}

function thumbnailFileName(originalName: string) {
  const parsed = path.parse(originalName)
  const baseName = parsed.name.trim() || 'thumbnail'

  return `${baseName}-thumbnail${thumbnailExtension}`
}

function isThumbnailSource(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf'
}

async function renderPdfFirstPage(buffer: Buffer) {
  const baseUrl = browserlessUrl()

  if (!baseUrl) {
    throw new Error('BROWSERLESS_URL is required to render PDF thumbnails')
  }

  const requestUrl = new URL('/screenshot', baseUrl)
  const token = browserlessToken()

  if (token) {
    requestUrl.searchParams.set('token', token)
  }

  const timeoutMs = envNumber('HUB_PDF_THUMBNAIL_TIMEOUT_MS', 60_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(requestUrl, {
      body: JSON.stringify({
        url: `data:application/pdf;base64,${buffer.toString('base64')}`,
        options: {
          fullPage: false,
          quality: 86,
          type: 'jpeg'
        },
        viewport: {
          height: envNumber('HUB_PDF_THUMBNAIL_VIEWPORT_HEIGHT', 1200),
          width: envNumber('HUB_PDF_THUMBNAIL_VIEWPORT_WIDTH', 900)
        },
        waitForTimeout: envNumber('HUB_PDF_THUMBNAIL_WAIT_MS', 1000)
      }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: controller.signal
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Browserless PDF thumbnail failed with ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`
      )
    }

    return Buffer.from(await response.arrayBuffer())
  } finally {
    clearTimeout(timeout)
  }
}
