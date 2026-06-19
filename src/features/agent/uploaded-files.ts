import { NextRequest } from 'next/server'

import { getCurrentUser, type CurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { envNumber } from '@/server/env'
import {
  deleteUploadedFileStorageObjects,
  markUploadedFileDeleted
} from '@/server/files/delete-uploaded-file'
import { getUploadedFileQueue } from '@/server/files/queue'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { logError, logInfo } from '@/server/logger'
import { projectMemberWhere } from '@/server/project-members'
import { getPlatformStorageObjectBuffer, putPlatformStorageObject } from '@/server/storage'

const maxUploadBytes = envNumber('AGENT_FILE_UPLOAD_MAX_BYTES', 5 * 1024 * 1024)
const defaultFilesPageSize = 50
const maxFilesPageSize = 100
const agentUploadedFileScopes = ['user_agent', 'project_agent']

type ProjectFileUploadContext = {
  params: Promise<{
    id: string
  }>
}

type UploadedFileContext = {
  params: Promise<{
    id: string
  }>
}

export async function handleUserAgentFileUploadPost(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before uploading files', 401)
  }

  return uploadAgentFile({
    request,
    scope: 'user_agent',
    user
  })
}

export async function handleUserAgentFilesGet(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before reading uploaded files', 401)
  }

  const ids = request.nextUrl.searchParams
    .getAll('ids')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(isUuid)

  if (ids.length === 0) {
    return jsonOk({
      files: []
    })
  }

  const files = await prisma.uploadedFile.findMany({
    where: {
      deletedAt: null,
      id: {
        in: ids
      },
      scope: 'user_agent',
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      error: true,
      id: true,
      originalName: true,
      sizeBytes: true,
      status: true
    }
  })

  return jsonOk({
    files: files.map((file) => ({
      error: file.error,
      id: file.id,
      name: file.originalName,
      sizeBytes: file.sizeBytes,
      status: file.status
    }))
  })
}

export async function handleUploadedFilesGet(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before reading uploaded files', 401)
  }

  const limit = parseFilesLimit(request.nextUrl.searchParams.get('limit'))
  const cursor = parseFilesCursor(request.nextUrl.searchParams.get('cursor'))
  const query = request.nextUrl.searchParams.get('q')?.trim()
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim()
  const scope = parseUploadedFileScope(request.nextUrl.searchParams.get('scope'))
  const status = parseUploadedFileStatus(request.nextUrl.searchParams.get('status'))
  const cursorWhere = cursor
    ? {
        OR: [
          {
            createdAt: {
              lt: cursor.createdAt
            }
          },
          {
            createdAt: cursor.createdAt,
            id: {
              lt: cursor.id
            }
          }
        ]
      }
    : {}

  const files = await prisma.uploadedFile.findMany({
    where: {
      ...cursorWhere,
      deletedAt: null,
      ...(projectId && isProjectId(projectId) ? { projectId } : {}),
      ...(query
        ? {
            originalName: {
              contains: query,
              mode: 'insensitive'
            }
          }
        : {}),
      scope: scope ?? { in: agentUploadedFileScopes },
      ...(status ? { status } : {}),
      userId: user.id
    },
    orderBy: [
      {
        createdAt: 'desc'
      },
      {
        id: 'desc'
      }
    ],
    take: limit + 1,
    select: {
      createdAt: true,
      error: true,
      id: true,
      mimeType: true,
      originalName: true,
      project: {
        select: {
          domain: true,
          id: true,
          templateName: true
        }
      },
      projectId: true,
      scope: true,
      sizeBytes: true,
      storageBucket: true,
      storageKey: true,
      status: true
    }
  })
  const pageFiles = files.slice(0, limit)
  const nextFile = files.length > limit ? pageFiles.at(-1) : null

  return jsonOk({
    files: pageFiles.map((file) => ({
      createdAt: file.createdAt.toISOString(),
      error: file.error,
      id: file.id,
      isDownloadable: Boolean(file.storageBucket && file.storageKey),
      mimeType: file.mimeType,
      name: file.originalName,
      project: file.project
        ? {
            domain: file.project.domain,
            id: file.project.id,
            name: file.project.templateName
          }
        : null,
      projectId: file.projectId,
      scope: file.scope,
      sizeBytes: file.sizeBytes,
      status: file.status
    })),
    nextCursor: nextFile
      ? encodeFilesCursor({
          createdAt: nextFile.createdAt,
          id: nextFile.id
        })
      : null
  })
}

export async function handleUploadedFileDownloadGet(
  _request: NextRequest,
  context: UploadedFileContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before downloading files', 401)
  }

  const { id } = await context.params

  if (!isUuid(id)) {
    return jsonErrorMessage('File not found', 404)
  }

  const file = await prisma.uploadedFile.findFirst({
    where: {
      deletedAt: null,
      id,
      scope: {
        in: agentUploadedFileScopes
      },
      userId: user.id
    },
    select: {
      mimeType: true,
      originalName: true,
      sizeBytes: true,
      storageBucket: true,
      storageKey: true
    }
  })

  if (!file) {
    return jsonErrorMessage('File not found', 404)
  }

  if (!file.storageBucket || !file.storageKey) {
    return jsonErrorMessage('File is not available for download', 409)
  }

  const body = await getPlatformStorageObjectBuffer({
    bucket: file.storageBucket,
    key: file.storageKey
  })

  return new Response(body, {
    headers: {
      'Content-Disposition': contentDispositionAttachment(file.originalName),
      'Content-Length': String(body.byteLength || file.sizeBytes),
      'Content-Type': file.mimeType
    }
  })
}

export async function handleUploadedFileDelete(
  _request: NextRequest,
  context: UploadedFileContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before deleting files', 401)
  }

  const { id } = await context.params

  if (!isUuid(id)) {
    return jsonErrorMessage('File not found', 404)
  }

  const file = await prisma.uploadedFile.findFirst({
    where: {
      deletedAt: null,
      id,
      scope: {
        in: agentUploadedFileScopes
      },
      userId: user.id
    },
    select: {
      id: true,
      projectId: true,
      storageBucket: true,
      storageKey: true,
      thumbnail: {
        select: {
          id: true,
          storageBucket: true,
          storageKey: true
        }
      }
    }
  })

  if (!file) {
    return jsonErrorMessage('File not found', 404)
  }

  await deleteUploadedFileStorageObjects(file)
  await prisma.$transaction(async (tx) => {
    await markUploadedFileDeleted(tx, file)
  })

  logInfo('uploaded_file.deleted', {
    projectId: file.projectId,
    uploadedFileId: file.id,
    userId: user.id
  })

  return jsonOk({})
}

export async function handleProjectAgentFileUploadPost(
  request: NextRequest,
  context: ProjectFileUploadContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before uploading files', 401)
  }

  const { id: projectId } = await context.params
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id: projectId,
      members: projectMemberWhere(user.id),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  return uploadAgentFile({
    projectId: project.id,
    request,
    scope: 'project_agent',
    user
  })
}

export async function handleProjectAgentFilesGet(
  request: NextRequest,
  context: ProjectFileUploadContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before reading uploaded files', 401)
  }

  const { id: projectId } = await context.params
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id: projectId,
      members: projectMemberWhere(user.id),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  const ids = request.nextUrl.searchParams
    .getAll('ids')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(isUuid)

  if (ids.length === 0) {
    return jsonOk({
      files: []
    })
  }

  const files = await prisma.uploadedFile.findMany({
    where: {
      deletedAt: null,
      id: {
        in: ids
      },
      projectId: project.id,
      scope: 'project_agent',
      userId: user.id
    },
    orderBy: {
      createdAt: 'asc'
    },
    select: {
      error: true,
      id: true,
      originalName: true,
      sizeBytes: true,
      status: true
    }
  })

  return jsonOk({
    files: files.map((file) => ({
      error: file.error,
      id: file.id,
      name: file.originalName,
      sizeBytes: file.sizeBytes,
      status: file.status
    }))
  })
}

async function uploadAgentFile({
  projectId,
  request,
  scope,
  user
}: {
  projectId?: string
  request: NextRequest
  scope: 'project_agent' | 'user_agent'
  user: CurrentUser
}) {
  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')

  if (!(file instanceof File)) {
    return jsonErrorMessage('Upload a file in the "file" form field', 400)
  }

  const mimeType = normalizeMimeType(file)

  if (!isSupportedAgentFileMimeType(mimeType)) {
    return jsonErrorMessage('Only text, PDF, and image files are supported for now', 400)
  }

  if (file.size <= 0) {
    return jsonErrorMessage('Uploaded file is empty', 400)
  }

  if (file.size > maxUploadBytes) {
    return jsonErrorMessage('Uploaded file is too large', 413)
  }

  const uploadedFileId = crypto.randomUUID()
  const originalName = normalizeFileName(file.name)
  const storageKey = [
    'agent-uploads',
    user.id,
    projectId ?? 'personal',
    uploadedFileId,
    originalName
  ].join('/')

  const uploadedFile = await prisma.uploadedFile.create({
    data: {
      id: uploadedFileId,
      mimeType,
      originalName,
      projectId,
      scope,
      sizeBytes: file.size,
      status: 'uploading',
      storageBucket: '',
      storageKey,
      userId: user.id
    },
    select: {
      id: true
    }
  })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const storageObject = await putPlatformStorageObject({
      body: buffer,
      contentType: mimeType,
      key: storageKey
    })

    const uploadedStatus = isImageMimeType(mimeType) ? 'processed' : 'queued'
    await prisma.uploadedFile.update({
      where: { id: uploadedFile.id },
      data: {
        processedAt: uploadedStatus === 'processed' ? new Date() : undefined,
        status: uploadedStatus,
        storageBucket: storageObject.bucket,
        storageKey: storageObject.key
      }
    })

    if (uploadedStatus === 'queued') {
      await getUploadedFileQueue().add(
        'process-uploaded-file',
        {
          uploadedFileId: uploadedFile.id
        },
        {
          jobId: uploadedFile.id
        }
      )
    }

    logInfo(
      'uploaded_file.upload.completed',
      {
        projectId,
        uploadedFileId: uploadedFile.id,
        userId: user.id
      },
      {
        mimeType,
        scope,
        sizeBytes: file.size
      }
    )

    return jsonOk(
      {
        file: {
          id: uploadedFile.id,
          name: originalName,
          status: uploadedStatus
        }
      },
      { status: 201 }
    )
  } catch (error) {
    await prisma.uploadedFile
      .update({
        where: { id: uploadedFile.id },
        data: {
          error: error instanceof Error ? error.message : 'Upload failed',
          status: 'failed'
        }
      })
      .catch(() => null)

    logError(
      'uploaded_file.upload.failed',
      {
        projectId,
        uploadedFileId: uploadedFile.id,
        userId: user.id
      },
      { error }
    )

    return jsonErrorMessage('Failed to upload file', 500)
  }
}

function normalizeMimeType(file: File) {
  if (file.type) {
    return file.type.toLowerCase()
  }

  if (file.name.toLowerCase().endsWith('.txt')) {
    return 'text/plain'
  }

  if (file.name.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf'
  }

  if (file.name.toLowerCase().endsWith('.png')) {
    return 'image/png'
  }

  if (file.name.toLowerCase().match(/\.(jpg|jpeg)$/)) {
    return 'image/jpeg'
  }

  if (file.name.toLowerCase().endsWith('.webp')) {
    return 'image/webp'
  }

  return 'application/octet-stream'
}

function normalizeFileName(name: string) {
  const trimmed = name.trim() || 'uploaded.txt'
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function contentDispositionAttachment(fileName: string) {
  const asciiName = fileName.replace(/["\\\r\n]/g, '_')
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isSupportedAgentFileMimeType(mimeType: string) {
  return (
    mimeType === 'text/plain' ||
    mimeType === 'application/pdf' ||
    isImageMimeType(mimeType)
  )
}

function isImageMimeType(mimeType: string) {
  return (
    mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
  )
}

function parseFilesLimit(value: string | null) {
  const limit = Number(value)

  if (!Number.isInteger(limit) || limit <= 0) {
    return defaultFilesPageSize
  }

  return Math.min(limit, maxFilesPageSize)
}

function encodeFilesCursor(cursor: { createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id
    })
  ).toString('base64url')
}

function parseFilesCursor(value: string | null) {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown
      id?: unknown
    }

    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      return null
    }

    const createdAt = new Date(parsed.createdAt)

    if (Number.isNaN(createdAt.getTime()) || !isUuid(parsed.id)) {
      return null
    }

    return {
      createdAt,
      id: parsed.id
    }
  } catch {
    return null
  }
}

function parseUploadedFileScope(value: string | null) {
  return value === 'project_agent' || value === 'user_agent' ? value : null
}

function parseUploadedFileStatus(value: string | null) {
  return value && /^[a-z_]+$/i.test(value) ? value : null
}

function isProjectId(value: string) {
  return /^[a-z0-9_-]{4,64}$/i.test(value)
}
