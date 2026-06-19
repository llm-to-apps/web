import { Prisma } from '@prisma/client'

import { prisma } from '@/server/db'
import {
  agentEmbeddingDimensions,
  agentImageExtractionModel,
  agentPdfExtractionEngine,
  agentPdfExtractionFallbackEngine,
  agentPdfExtractionModel,
  openRouterApiKey,
  openRouterBaseUrl,
  uploadedFileExtractionMaxBytes
} from '@/server/env'
import { enqueueHubArtifactAnalysis } from '@/server/hub/artifact-analysis-queue'
import { publishHubArtifactChanged } from '@/server/hub/topic-events'
import { logError, logInfo, logWarn } from '@/server/logger'
import { getPlatformStorageObjectBuffer } from '@/server/storage'

import { embedTexts } from './embeddings'
import { chunkText } from './text-chunks'

type UploadedFileRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.uploadedFile.findUnique>>
>

type OpenRouterExtractionResponse = {
  choices?: Array<{
    message?: {
      annotations?: unknown[]
      content?: unknown
    }
  }>
  error?: {
    message?: string
    metadata?: {
      file_annotations?: unknown[]
    }
  }
}

type FileAnnotation = {
  file: {
    content?: Array<
      | {
          text?: string
          type: 'text'
        }
      | {
          type: string
        }
    >
    hash: string
  }
  type: 'file'
}

const hubUrlScreenshotScope = 'hub_url_screenshot'

export async function processUploadedFile(uploadedFileId: string) {
  const file = await prisma.uploadedFile.findUnique({
    where: { id: uploadedFileId }
  })

  if (!file) {
    logWarn('uploaded_file.processing.skipped_missing', { uploadedFileId })
    return { skipped: true }
  }

  if (file.deletedAt || file.status === 'deleted') {
    logWarn('uploaded_file.processing.skipped_deleted', { uploadedFileId })
    return { skipped: true }
  }

  if (isUrlScreenshotFile(file)) {
    const updateResult = await prisma.uploadedFile.updateMany({
      where: {
        deletedAt: null,
        id: file.id,
        status: {
          not: 'deleted'
        }
      },
      data: {
        error: null,
        status: 'processing'
      }
    })
    if (updateResult.count === 0) {
      return { skipped: true }
    }

    try {
      const buffer = await getPlatformStorageObjectBuffer({
        bucket: file.storageBucket,
        key: file.storageKey
      })
      const text = await extractImageTextWithOpenRouter(
        buffer,
        file.originalName,
        file.mimeType
      )
      if (await isUploadedFileDeleted(file.id)) {
        logWarn('uploaded_file.image_extraction.skipped_deleted_after_extract', {
          uploadedFileId: file.id
        })
        return { skipped: true }
      }
      const chunkCount = await saveExtractedFileText(file, text, {
        model: agentImageExtractionModel(),
        provider: 'openrouter'
      })
      await enqueueHubArtifactAnalysisForFile(file.id)

      logInfo(
        'uploaded_file.image_extraction.completed',
        {
          projectId: file.projectId,
          uploadedFileId: file.id,
          userId: file.userId
        },
        {
          chunkCount,
          scope: file.scope,
          sizeBytes: file.sizeBytes
        }
      )

      return {
        chunkCount
      }
    } catch (error) {
      await markFailed(
        file.id,
        error instanceof Error ? error.message : 'Processing failed'
      )
      logError(
        'uploaded_file.image_extraction.failed',
        {
          projectId: file.projectId,
          uploadedFileId: file.id,
          userId: file.userId
        },
        { error }
      )
      throw error
    }
  }

  if (isSupportedVisionMimeType(file.mimeType)) {
    const updateResult = await prisma.uploadedFile.updateMany({
      where: {
        deletedAt: null,
        id: file.id,
        status: {
          not: 'deleted'
        }
      },
      data: {
        error: null,
        processedAt: new Date(),
        status: 'processed'
      }
    })
    if (updateResult.count === 0) {
      return { skipped: true }
    }
    await enqueueHubArtifactAnalysisForFile(file.id)
    return {
      chunkCount: 0
    }
  }

  if (file.mimeType !== 'text/plain' && file.mimeType !== 'application/pdf') {
    await markFailed(file.id, `Unsupported file type: ${file.mimeType}`)
    return { skipped: true }
  }

  const updateResult = await prisma.uploadedFile.updateMany({
    where: {
      deletedAt: null,
      id: file.id,
      status: {
        not: 'deleted'
      }
    },
    data: {
      error: null,
      status: 'processing'
    }
  })
  if (updateResult.count === 0) {
    return { skipped: true }
  }

  try {
    const buffer = await getPlatformStorageObjectBuffer({
      bucket: file.storageBucket,
      key: file.storageKey
    })
    const text =
      file.mimeType === 'application/pdf'
        ? await extractPdfTextWithOpenRouter(buffer, file.originalName)
        : buffer.toString('utf8')
    if (await isUploadedFileDeleted(file.id)) {
      logWarn('uploaded_file.processing.skipped_deleted_after_extract', {
        uploadedFileId: file.id
      })
      return { skipped: true }
    }
    const chunkCount = await saveExtractedFileText(file, text, {
      model: file.mimeType === 'application/pdf' ? agentPdfExtractionModel() : null,
      provider: file.mimeType === 'application/pdf' ? 'openrouter' : 'local'
    })
    await enqueueHubArtifactAnalysisForFile(file.id)

    logInfo(
      'uploaded_file.processing.completed',
      {
        projectId: file.projectId,
        uploadedFileId: file.id,
        userId: file.userId
      },
      {
        chunkCount,
        sizeBytes: file.sizeBytes
      }
    )

    return {
      chunkCount
    }
  } catch (error) {
    await markFailed(
      file.id,
      error instanceof Error ? error.message : 'Processing failed'
    )
    logError(
      'uploaded_file.processing.failed',
      {
        projectId: file.projectId,
        uploadedFileId: file.id,
        userId: file.userId
      },
      { error }
    )
    throw error
  }
}

async function saveExtractedFileText(
  file: UploadedFileRecord,
  text: string,
  source: {
    model: string | null
    provider: string
  }
) {
  const normalizedText = text.trim()

  if (!normalizedText) {
    throw new Error('Extracted file text is empty')
  }

  const chunks = chunkText(normalizedText)
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content))
  const extraction = truncateTextByBytes(normalizedText, uploadedFileExtractionMaxBytes())

  const saved = await prisma.$transaction(async (tx) => {
    const currentFile = await tx.uploadedFile.findUnique({
      where: {
        id: file.id
      },
      select: {
        deletedAt: true,
        status: true
      }
    })

    if (!currentFile || currentFile.deletedAt || currentFile.status === 'deleted') {
      return false
    }

    await tx.uploadedFileExtraction.upsert({
      where: {
        uploadedFileId_format: {
          format: 'markdown',
          uploadedFileId: file.id
        }
      },
      update: {
        content: extraction.content,
        metadata: extraction.metadata,
        model: source.model,
        provider: source.provider
      },
      create: {
        content: extraction.content,
        format: 'markdown',
        metadata: extraction.metadata,
        model: source.model,
        provider: source.provider,
        uploadedFileId: file.id
      }
    })

    await tx.uploadedFileChunk.deleteMany({
      where: {
        uploadedFileId: file.id
      }
    })

    const chunkRows = chunks.map((chunk, index) => ({
      embedding: embeddings[index]?.embedding,
      embeddingModel: embeddings[index]?.model,
      row: {
        chunkIndex: index,
        content: chunk.content,
        embeddingDimensions: agentEmbeddingDimensions(),
        embeddingModel: embeddings[index]?.model,
        metadata: {
          endOffset: chunk.endOffset,
          embeddingModel: embeddings[index]?.model,
          fileId: file.id,
          fileName: file.originalName,
          mimeType: file.mimeType,
          startOffset: chunk.startOffset
        },
        projectId: file.projectId,
        uploadedFileId: file.id,
        userId: file.userId,
        id: crypto.randomUUID()
      }
    }))

    await tx.uploadedFileChunk.createMany({
      data: chunkRows.map((chunk) => chunk.row)
    })

    for (const chunk of chunkRows) {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE uploaded_file_chunks
          SET embedding = ${vectorLiteral(chunk.embedding)}::vector
          WHERE id = ${chunk.row.id}
        `
      )
    }

    await tx.uploadedFile.update({
      where: { id: file.id },
      data: {
        error: null,
        processedAt: new Date(),
        status: 'processed'
      }
    })

    return true
  })

  return saved ? chunks.length : 0
}

function truncateTextByBytes(content: string, maxBytes: number) {
  const originalBytes = Buffer.byteLength(content, 'utf8')

  if (originalBytes <= maxBytes) {
    return {
      content,
      metadata: {
        originalBytes,
        storedBytes: originalBytes,
        truncated: false
      }
    }
  }

  let storedContent = content.slice(0, maxBytes)

  while (Buffer.byteLength(storedContent, 'utf8') > maxBytes) {
    storedContent = storedContent.slice(0, -1)
  }

  return {
    content: storedContent,
    metadata: {
      limitBytes: maxBytes,
      originalBytes,
      storedBytes: Buffer.byteLength(storedContent, 'utf8'),
      truncated: true
    }
  }
}

async function extractPdfTextWithOpenRouter(buffer: Buffer, fileName: string) {
  const primaryEngine = agentPdfExtractionEngine()
  const fallbackEngine = agentPdfExtractionFallbackEngine()
  const primaryText = await requestPdfExtraction({
    buffer,
    engine: primaryEngine,
    fileName
  })

  if (!isWeakPdfExtraction(primaryText) || fallbackEngine === primaryEngine) {
    return primaryText
  }

  logWarn('uploaded_file.pdf_extraction.fallback_started', {
    fallbackEngine,
    primaryEngine
  })

  return requestPdfExtraction({
    buffer,
    engine: fallbackEngine,
    fileName
  })
}

async function requestPdfExtraction({
  buffer,
  engine,
  fileName
}: {
  buffer: Buffer
  engine: string
  fileName: string
}) {
  const response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    body: JSON.stringify({
      model: agentPdfExtractionModel(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Extract the readable text from this PDF as Markdown.',
                'If the PDF contains screenshots, scans, UI mockups, or image-only pages, describe the visible content in useful detail.',
                'For UI screens, capture screen names, visible labels, buttons, navigation, components, layout, colors, and important states.',
                'Preserve headings, lists, tables, labels, and important structure when text exists.',
                'Return only the extracted document content. Do not summarize.'
              ].join(' ')
            },
            {
              type: 'file',
              file: {
                filename: fileName,
                file_data: `data:application/pdf;base64,${buffer.toString('base64')}`
              }
            }
          ]
        }
      ],
      plugins: [
        {
          id: 'file-parser',
          pdf: {
            engine
          }
        }
      ],
      stream: false
    }),
    headers: {
      Authorization: `Bearer ${openRouterApiKey()}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  const body = (await response
    .json()
    .catch(() => null)) as OpenRouterExtractionResponse | null

  if (!response.ok) {
    const annotationsText = extractTextFromFileAnnotations(body)

    if (annotationsText) {
      return annotationsText
    }

    throw new Error(
      body?.error?.message ??
        `OpenRouter PDF extraction failed with status ${response.status}`
    )
  }

  const message = body?.choices?.[0]?.message
  const messageText = extractMessageText(message?.content)
  const annotationsText = extractTextFromFileAnnotations(body)

  if (
    annotationsText &&
    !isWeakPdfExtraction(annotationsText) &&
    isWeakPdfExtraction(messageText)
  ) {
    return annotationsText
  }

  return messageText || annotationsText
}

async function extractImageTextWithOpenRouter(
  buffer: Buffer,
  fileName: string,
  mimeType: string
) {
  const response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    body: JSON.stringify({
      model: agentImageExtractionModel(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `File name: ${fileName}.`,
                'Extract all readable text from this screenshot as Markdown.',
                'Also describe the visible page or UI in useful detail for future app-development analysis.',
                'Capture headings, navigation, sections, forms, buttons, labels, tables, prices, and important visual states.',
                'Preserve structure with Markdown headings and lists.',
                'Return only the extracted page content. Do not summarize.'
              ].join(' ')
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${buffer.toString('base64')}`
              }
            }
          ]
        }
      ],
      stream: false
    }),
    headers: {
      Authorization: `Bearer ${openRouterApiKey()}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  const body = (await response
    .json()
    .catch(() => null)) as OpenRouterExtractionResponse | null

  if (!response.ok) {
    throw new Error(
      body?.error?.message ??
        `OpenRouter image extraction failed with status ${response.status}`
    )
  }

  return extractMessageText(body?.choices?.[0]?.message?.content)
}

function isWeakPdfExtraction(content: string) {
  const normalized = content.trim().toLowerCase()

  return (
    normalized.length < 200 ||
    (normalized.includes('## metadata') &&
      normalized.includes('## contents') &&
      normalized.length < 1_000) ||
    normalized.includes("i'm unable to extract") ||
    normalized.includes('i am unable to extract') ||
    normalized.includes("can't extract text") ||
    normalized.includes('cannot extract text') ||
    normalized.includes('cannot extract text from the provided') ||
    normalized.includes('cannot directly access files') ||
    normalized.includes('cannot access files') ||
    normalized.includes("i'm unable to access") ||
    normalized.includes('i am unable to access') ||
    normalized.includes('unable to access or extract') ||
    normalized.includes('not supported in this environment') ||
    normalized.includes('unable to extract content') ||
    normalized.includes('provide the text') ||
    normalized.includes('paste it here') ||
    normalized.includes('could provide the text')
  )
}

function extractMessageText(content: unknown) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) =>
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      part.type === 'text' &&
      'text' in part &&
      typeof part.text === 'string'
        ? part.text
        : ''
    )
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function extractTextFromFileAnnotations(response: OpenRouterExtractionResponse | null) {
  const annotations = [
    ...(response?.choices?.[0]?.message?.annotations ?? []),
    ...(response?.error?.metadata?.file_annotations ?? [])
  ].filter(isFileAnnotation)
  const seen = new Set<string>()
  const texts: string[] = []

  for (const annotation of annotations) {
    if (seen.has(annotation.file.hash)) {
      continue
    }

    seen.add(annotation.file.hash)
    texts.push(
      ...(annotation.file.content ?? [])
        .filter((part): part is { text: string; type: 'text' } => part.type === 'text')
        .map((part) => part.text.trim())
        .filter(Boolean)
    )
  }

  return texts.join('\n\n').trim()
}

function isFileAnnotation(value: unknown): value is FileAnnotation {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false
  }

  const candidate = value as { file?: { hash?: unknown }; type?: unknown }
  return candidate.type === 'file' && typeof candidate.file?.hash === 'string'
}

function vectorLiteral(embedding: number[] | undefined) {
  if (!embedding) {
    throw new Error('Missing embedding for uploaded file chunk')
  }

  return `[${embedding.join(',')}]`
}

async function markFailed(uploadedFileId: string, message: string) {
  const updateResult = await prisma.uploadedFile.updateMany({
    where: {
      deletedAt: null,
      id: uploadedFileId,
      status: {
        not: 'deleted'
      }
    },
    data: {
      error: message,
      status: 'failed'
    }
  })

  if (updateResult.count === 0) {
    return
  }

  await markHubArtifactFileProcessingFailed(uploadedFileId, message)
}

async function isUploadedFileDeleted(uploadedFileId: string) {
  const file = await prisma.uploadedFile.findUnique({
    where: {
      id: uploadedFileId
    },
    select: {
      deletedAt: true,
      status: true
    }
  })

  return !file || Boolean(file.deletedAt) || file.status === 'deleted'
}

async function enqueueHubArtifactAnalysisForFile(uploadedFileId: string) {
  const artifact = await prisma.hubArtifact.findFirst({
    where: {
      uploadedFileId
    },
    select: {
      id: true
    }
  })

  if (!artifact) {
    return
  }

  await enqueueHubArtifactAnalysis(artifact.id)
}

async function markHubArtifactFileProcessingFailed(
  uploadedFileId: string,
  message: string
) {
  const artifact = await prisma.hubArtifact.updateMany({
    where: {
      uploadedFileId
    },
    data: {
      status: 'error'
    }
  })

  if (artifact.count === 0) {
    return
  }

  const updatedArtifacts = await prisma.hubArtifact.findMany({
    where: {
      uploadedFileId
    },
    select: {
      id: true,
      topicId: true
    }
  })

  await Promise.all(
    updatedArtifacts.map((updatedArtifact) =>
      publishHubArtifactChanged({
        artifactId: updatedArtifact.id,
        status: 'error',
        topicId: updatedArtifact.topicId,
        type: 'artifact_changed'
      }).catch((error) => {
        logWarn(
          'uploaded_file.processing.hub_artifact_error_publish_failed',
          {
            uploadedFileId,
            uploadedFileProcessingError: message
          },
          {
            error: error instanceof Error ? error.message : String(error)
          }
        )
      })
    )
  )
}

function isSupportedVisionMimeType(mimeType: string) {
  return (
    mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
  )
}

function isUrlScreenshotFile(file: UploadedFileRecord) {
  return file.scope === hubUrlScreenshotScope && isSupportedVisionMimeType(file.mimeType)
}
