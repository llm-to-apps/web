import { NextRequest } from 'next/server'

import { getCurrentUser, type CurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { envNumber } from '@/server/env'
import { getUploadedFileQueue } from '@/server/files/queue'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { logError, logInfo } from '@/server/logger'
import { projectMemberWhere } from '@/server/project-members'
import { putPlatformStorageObject } from '@/server/storage'

const maxUploadBytes = envNumber('AGENT_FILE_UPLOAD_MAX_BYTES', 5 * 1024 * 1024)

type ProjectFileUploadContext = {
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
    },
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
    return jsonErrorMessage('Only text and image files are supported for now', 400)
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isSupportedAgentFileMimeType(mimeType: string) {
  return mimeType === 'text/plain' || isImageMimeType(mimeType)
}

function isImageMimeType(mimeType: string) {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
}
