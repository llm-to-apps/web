import { lookup } from 'node:dns/promises'
import net from 'node:net'

import { prisma } from '@/server/db'
import {
  browserlessToken,
  browserlessUrl,
  envNumber,
  platformBaseUrl
} from '@/server/env'
import { generateUploadedFileThumbnail } from '@/server/files/thumbnailer'
import { publishHubArtifactChanged } from '@/server/hub/artifact-events'
import { logInfo, logWarn } from '@/server/logger'
import { putPlatformStorageObject } from '@/server/storage'

const screenshotMimeType = 'image/jpeg'
const screenshotScope = 'hub_url_screenshot'

export async function generateHubArtifactScreenshot(artifactId: string) {
  const artifact = await prisma.hubArtifact.findUnique({
    where: {
      id: artifactId
    },
    select: {
      authorId: true,
      externalUrl: true,
      id: true,
      status: true,
      title: true,
      topicId: true,
      type: true,
      uploadedFile: {
        select: {
          id: true,
          mimeType: true,
          thumbnailId: true
        }
      }
    }
  })

  if (!artifact) {
    logWarn('hub_artifact.screenshot.skipped_missing', { artifactId })
    return { skipped: true }
  }

  if (artifact.type !== 'link' || !artifact.externalUrl) {
    logInfo('hub_artifact.screenshot.skipped_non_link', {
      artifactId,
      type: artifact.type
    })
    return { skipped: true }
  }

  if (artifact.uploadedFile) {
    if (artifact.uploadedFile.mimeType.startsWith('image/') && !artifact.uploadedFile.thumbnailId) {
      await generateUploadedFileThumbnail(artifact.uploadedFile.id)
    }

    return { skipped: true }
  }

  await assertPublicHttpUrl(artifact.externalUrl)

  const screenshot = await captureScreenshot(artifact.externalUrl)
  const screenshotId = crypto.randomUUID()
  const screenshotName = `${safeScreenshotName(artifact.title)}.jpg`
  const storageKey = [
    'hub-url-screenshots',
    artifact.authorId,
    screenshotId,
    screenshotName
  ].join('/')
  const storageObject = await putPlatformStorageObject({
    body: screenshot,
    contentType: screenshotMimeType,
    key: storageKey
  })

  const linkedFile = await prisma.$transaction(async (tx) => {
    const file = await tx.uploadedFile.create({
      data: {
        id: screenshotId,
        mimeType: screenshotMimeType,
        originalName: screenshotName,
        scope: screenshotScope,
        sizeBytes: screenshot.byteLength,
        status: 'processed',
        storageBucket: storageObject.bucket,
        storageKey: storageObject.key,
        userId: artifact.authorId,
        processedAt: new Date()
      },
      select: {
        id: true
      }
    })

    const updateResult = await tx.hubArtifact.updateMany({
      where: {
        id: artifact.id,
        uploadedFileId: null
      },
      data: {
        uploadedFileId: file.id
      }
    })

    return updateResult.count > 0 ? file : null
  })

  if (!linkedFile) {
    logWarn('hub_artifact.screenshot.skipped_already_linked', { artifactId })
    return { skipped: true }
  }

  await generateUploadedFileThumbnail(linkedFile.id)
  await publishHubArtifactChanged({
    artifactId: artifact.id,
    status: artifact.status,
    topicId: artifact.topicId,
    type: 'artifact_changed'
  })

  logInfo('hub_artifact.screenshot.generated', {
    artifactId,
    screenshotId,
    sizeBytes: screenshot.byteLength
  })

  return {
    screenshotId
  }
}

async function captureScreenshot(url: string) {
  const baseUrl = browserlessUrl()

  if (!baseUrl) {
    throw new Error('BROWSERLESS_URL is required to capture URL screenshots')
  }

  const requestUrl = new URL('/screenshot', baseUrl)
  const token = browserlessToken()

  if (token) {
    requestUrl.searchParams.set('token', token)
  }

  const timeoutMs = envNumber('HUB_URL_SCREENSHOT_TIMEOUT_MS', 60_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(requestUrl, {
      body: JSON.stringify({
        url,
        options: {
          fullPage: true,
          quality: 86,
          type: 'jpeg'
        },
        viewport: {
          height: 1200,
          width: 1440
        },
        waitForTimeout: envNumber('HUB_URL_SCREENSHOT_WAIT_MS', 1000)
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
        `Browserless screenshot failed with ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`
      )
    }

    return Buffer.from(await response.arrayBuffer())
  } finally {
    clearTimeout(timeout)
  }
}

async function assertPublicHttpUrl(value: string) {
  const url = new URL(value)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs can be captured')
  }

  const platformHost = new URL(platformBaseUrl()).hostname

  if (url.hostname === platformHost) {
    return
  }

  const addresses = await lookup(url.hostname, {
    all: true,
    verbatim: true
  })

  if (addresses.some((address) => isPrivateAddress(address.address))) {
    throw new Error('Private network URLs cannot be captured')
  }
}

function isPrivateAddress(address: string) {
  const version = net.isIP(address)

  if (version === 4) {
    const parts = address.split('.').map((part) => Number(part))
    const [a, b] = parts

    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    )
  }

  if (version === 6) {
    const normalized = address.toLowerCase()

    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }

  return true
}

function safeScreenshotName(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return (normalized || 'url-screenshot').slice(0, 120)
}
