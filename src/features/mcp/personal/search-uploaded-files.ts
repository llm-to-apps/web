import { Prisma } from '@prisma/client'

import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { prisma } from '@/server/db'
import { agentEmbeddingDimensions } from '@/server/env'
import { embedTexts } from '@/server/files/embeddings'

import { type McpContext } from './schema'
import { toolJson } from './tools'

type SearchUploadedFilesArguments = {
  attachedFileIds: string[]
  projectId?: string
  query?: string
  scope: 'project_agent' | 'user_agent'
}

export async function searchUploadedFilesTool({
  args,
  context,
  requestId,
  startedAt,
  toolName
}: {
  args: unknown
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const input = readSearchArgs(args)

  if (!input.query) {
    return toolJson({
      ok: false,
      message: 'Missing search query.'
    })
  }

  if (input.attachedFileIds.length === 0) {
    logAgentRun(
      'mcp.personal.search_uploaded_files.skipped_no_attachments',
      {
        requestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        toolName
      }
    )

    return toolJson({
      ok: true,
      query: input.query,
      results: []
    })
  }

  const [queryEmbedding] = await embedTexts([input.query])
  const results = await prisma.$queryRaw<
    Array<{
      chunkId: string
      content: string
      distance: number
      fileId: string
      fileName: string
      metadata: Prisma.JsonValue | null
    }>
  >(
    Prisma.sql`
      SELECT
        c.id AS "chunkId",
        c.content,
        c.metadata,
        c.embedding <=> ${vectorLiteral(queryEmbedding.embedding)}::vector AS distance,
        f.id AS "fileId",
        f."originalName" AS "fileName"
      FROM uploaded_file_chunks c
      INNER JOIN uploaded_files f ON f.id = c."uploadedFileId"
      WHERE
        f."userId" = ${context.user.id}
        AND f.scope = ${input.scope}
        AND (${input.scope} = 'user_agent' OR f."projectId" = ${input.projectId ?? ''})
        AND f.status = 'processed'
        AND f."deletedAt" IS NULL
        AND f.id IN (${Prisma.join(input.attachedFileIds)})
        AND c.embedding IS NOT NULL
        AND c."embeddingDimensions" = ${agentEmbeddingDimensions()}
      ORDER BY c.embedding <=> ${vectorLiteral(queryEmbedding.embedding)}::vector
      LIMIT 6
    `
  )

  logAgentRun(
    'mcp.personal.search_uploaded_files.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      resultCount: results.length,
      scope: input.scope,
      toolName
    }
  )

  return toolJson({
    ok: true,
    query: input.query,
    results: results.map((result) => ({
      chunkId: result.chunkId,
      content: result.content,
      distance: result.distance,
      fileId: result.fileId,
      fileName: result.fileName,
      metadata: result.metadata
    }))
  })
}

function readSearchArgs(args: unknown): SearchUploadedFilesArguments {
  if (!args || typeof args !== 'object') {
    return {
      attachedFileIds: [],
      scope: 'user_agent'
    }
  }

  const record = args as Record<string, unknown>

  return {
    attachedFileIds: Array.isArray(record.attachedFileIds)
      ? record.attachedFileIds.filter(isUuid)
      : [],
    projectId: typeof record.projectId === 'string' ? record.projectId : undefined,
    query: typeof record.query === 'string' ? record.query.trim() : undefined,
    scope: record.scope === 'project_agent' ? 'project_agent' : 'user_agent'
  }
}

function vectorLiteral(embedding: number[]) {
  return `[${embedding.join(',')}]`
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}
