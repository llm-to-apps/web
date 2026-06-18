import { Prisma } from '@prisma/client'

import { prisma } from '@/server/db'
import { agentEmbeddingDimensions } from '@/server/env'
import { logError, logInfo, logWarn } from '@/server/logger'
import { getPlatformStorageObjectBuffer } from '@/server/storage'

import { embedTexts } from './embeddings'
import { chunkText } from './text-chunks'

export async function processUploadedFile(uploadedFileId: string) {
  const file = await prisma.uploadedFile.findUnique({
    where: { id: uploadedFileId }
  })

  if (!file) {
    logWarn('uploaded_file.processing.skipped_missing', { uploadedFileId })
    return { skipped: true }
  }

  if (isSupportedVisionMimeType(file.mimeType)) {
    await prisma.uploadedFile.update({
      where: { id: file.id },
      data: {
        error: null,
        processedAt: new Date(),
        status: 'processed'
      }
    })
    return {
      chunkCount: 0
    }
  }

  if (file.mimeType !== 'text/plain') {
    await markFailed(file.id, `Unsupported file type: ${file.mimeType}`)
    return { skipped: true }
  }

  await prisma.uploadedFile.update({
    where: { id: file.id },
    data: {
      error: null,
      status: 'processing'
    }
  })

  try {
    const buffer = await getPlatformStorageObjectBuffer({
      bucket: file.storageBucket,
      key: file.storageKey
    })
    const text = buffer.toString('utf8')
    const chunks = chunkText(text)
    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content))

    await prisma.$transaction(async (tx) => {
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
    })

    logInfo(
      'uploaded_file.processing.completed',
      {
        projectId: file.projectId,
        uploadedFileId: file.id,
        userId: file.userId
      },
      {
        chunkCount: chunks.length,
        sizeBytes: file.sizeBytes
      }
    )

    return {
      chunkCount: chunks.length
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

function vectorLiteral(embedding: number[] | undefined) {
  if (!embedding) {
    throw new Error('Missing embedding for uploaded file chunk')
  }

  return `[${embedding.join(',')}]`
}

async function markFailed(uploadedFileId: string, message: string) {
  await prisma.uploadedFile.update({
    where: { id: uploadedFileId },
    data: {
      error: message,
      status: 'failed'
    }
  })
}

function isSupportedVisionMimeType(mimeType: string) {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
}
