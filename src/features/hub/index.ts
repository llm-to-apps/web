import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

import { getCurrentUser, type CurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { enqueueHubArtifactAnalysis } from '@/server/hub/artifact-analysis-queue'
import { enqueueHubArtifactScreenshot } from '@/server/hub/artifact-screenshot-queue'
import { enqueueHubTopicEnrichment } from '@/server/hub/topic-enrichment-queue'
import {
  publishHubTopicChanged,
  subscribeHubTopicEvents
} from '@/server/hub/topic-events'
import { getUploadedFileQueue } from '@/server/files/queue'
import { enqueueUploadedFileThumbnail } from '@/server/files/thumbnail-queue'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import {
  deletePlatformStorageObject,
  getPlatformStorageObjectBuffer,
  putPlatformStorageObject
} from '@/server/storage'
import { parseJsonRequest } from '@/shared/schema'
import {
  createHubCommentSchema,
  createHubTopicSchema,
  formText,
  parseArtifactType
} from './schema'

type TopicContext = {
  params: Promise<{
    id: string
  }>
}

type ArtifactContext = {
  params: Promise<{
    artifactId: string
    id: string
  }>
}

type CommentContext = {
  params: Promise<{
    commentId: string
    id: string
  }>
}

const maxArtifactUploadBytes = 10 * 1024 * 1024
const maxInitialTopicArtifactFiles = 10
const maxTextArtifactBytes = 512 * 1024
const initialHubTopicStatus = 'analyzing'
const privateHubTopicStatus = 'analyzing'
const hubTopicListLimit = 50
const encoder = new TextEncoder()

export async function handleHubTopicsGet() {
  const user = await getCurrentUser()
  const viewerUserId = user?.id ?? '__public_viewer__'
  const rankedTopicIds = await getHotHubTopicIds(viewerUserId)
  const tags = await prisma.hubTag.findMany({
    orderBy: [
      {
        category: 'asc'
      },
      {
        sortOrder: 'asc'
      },
      {
        slug: 'asc'
      }
    ],
    select: {
      category: true,
      translations: {
        select: {
          locale: true,
          title: true
        }
      },
      slug: true
    }
  })

  const topics = await prisma.hubTopic.findMany({
    where: {
      id: {
        in: rankedTopicIds
      }
    },
    select: {
      _count: {
        select: {
          artifacts: true,
          comments: true,
          downvotes: true,
          upvotes: true
        }
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      category: true,
      createdAt: true,
      description: true,
      id: true,
      intent: true,
      slug: true,
      status: true,
      translations: {
        select: {
          description: true,
          intent: true,
          locale: true,
          title: true
        }
      },
      topicTags: {
        select: {
          tag: {
            select: {
              translations: {
                select: {
                  locale: true,
                  title: true
                }
              },
              slug: true
            }
          }
        }
      },
      title: true,
      downvotes: {
        where: {
          userId: viewerUserId
        },
        select: {
          id: true
        },
        take: 1
      },
      upvotes: {
        where: {
          userId: viewerUserId
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  })
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]))

  return jsonOk({
    tags: tags.map((tag) => serializeHubTag(tag)),
    topics: rankedTopicIds
      .flatMap((id) => {
        const topic = topicsById.get(id)
        return topic ? [topic] : []
      })
      .map((topic) => serializeTopicListItem(topic))
  })
}

export async function handleHubTopicsPost(request: NextRequest) {
  const user = await requireHubUser('Sign in before creating Hub topics')

  if (user instanceof Response) {
    return user
  }

  let data
  let files: File[] = []

  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const formData = await request.formData()
      const intent = formText(formData, 'intent')
      data = createHubTopicSchema.parse({
        category: formText(formData, 'category') || undefined,
        intent,
        title: formText(formData, 'title') || undefined
      })
      files = formData
        .getAll('files')
        .filter((value): value is File => value instanceof File && value.size > 0)
    } else {
      data = await parseJsonRequest(request, createHubTopicSchema)
    }
  } catch (error) {
    return jsonValidationError(error)
  }

  if (files.length > maxInitialTopicArtifactFiles) {
    return jsonErrorMessage('Attach up to 10 files', 400)
  }

  if (files.some((file) => file.size <= 0 || file.size > maxArtifactUploadBytes)) {
    return jsonErrorMessage('Uploaded file is empty or too large', 400)
  }

  const topicTitle = data.title?.trim() || titleFromIntent(data.intent)

  const topic = await prisma.hubTopic.create({
    data: {
      authorId: user.id,
      category: data.category,
      description: null,
      intent: data.intent,
      status: initialHubTopicStatus,
      title: topicTitle
    },
    select: {
      id: true
    }
  })
  await enqueueHubTopicEnrichment(topic.id)

  for (const file of files) {
    const uploadedFile = await uploadHubArtifactFile(file, user)

    if (!uploadedFile) {
      return jsonErrorMessage('Uploaded file is empty or too large', 400)
    }

    const artifact = await prisma.hubArtifact.create({
      data: {
        authorId: user.id,
        title: normalizeArtifactTitle(file.name).slice(0, 160),
        topicId: topic.id,
        type: 'file',
        uploadedFileId: uploadedFile.id
      },
      select: {
        id: true
      }
    })
    await enqueueHubFileArtifactProcessing({
      artifactId: artifact.id,
      uploadedFile
    })
  }

  return jsonOk({ topic }, { status: 201 })
}

export async function handleHubTopicGet(_request: NextRequest, context: TopicContext) {
  const user = await getCurrentUser()
  const { id } = await context.params
  const topic = await findHubTopic(id, user?.id ?? '__public_viewer__')

  if (!topic) {
    return jsonErrorMessage('Topic not found', 404)
  }

  return jsonOk({
    topic: serializeTopicDetail(topic)
  })
}

export async function handleHubTopicDelete(_request: NextRequest, context: TopicContext) {
  const user = await requireHubUser('Sign in before deleting Hub topics')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await prisma.hubTopic.findFirst({
    where: {
      OR: hubReferenceWhere(topicReference)
    },
    select: {
      artifacts: {
        select: {
          uploadedFile: {
            select: {
              id: true,
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
          }
        }
      },
      authorId: true,
      id: true
    }
  })

  if (!topic) {
    return jsonErrorMessage('Topic not found', 404)
  }

  if (topic.authorId !== user.id) {
    return jsonErrorMessage('Only the topic author can delete topics', 403)
  }

  const uploadedFiles = topic.artifacts
    .map((artifact) => artifact.uploadedFile)
    .filter((file): file is NonNullable<typeof file> => Boolean(file))

  for (const file of uploadedFiles) {
    await deleteUploadedFileStorageObjects(file)
  }

  await prisma.$transaction(async (tx) => {
    await tx.hubTopic.delete({
      where: {
        id: topic.id
      }
    })

    for (const file of uploadedFiles) {
      await markUploadedFileDeleted(tx, file)
    }
  })

  return jsonOk({})
}

export async function handleHubTopicEnrichPost(
  _request: NextRequest,
  context: TopicContext
) {
  const user = await requireHubUser('Sign in before enriching Hub topics')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await prisma.hubTopic.findFirst({
    where: {
      OR: hubReferenceWhere(topicReference)
    },
    select: {
      authorId: true,
      id: true
    }
  })

  if (!topic) {
    return jsonErrorMessage('Topic not found', 404)
  }

  if (topic.authorId !== user.id) {
    return jsonErrorMessage('Only the topic author can enrich topics', 403)
  }

  await prisma.hubTopic.update({
    where: {
      id: topic.id
    },
    data: {
      status: initialHubTopicStatus
    }
  })
  await enqueueHubTopicEnrichment(topic.id, { repeat: true })
  await publishHubTopicChanged({
    status: initialHubTopicStatus,
    topicId: topic.id,
    type: 'topic_changed'
  })

  return jsonOk({})
}

export async function handleHubTopicEventsGet(
  request: NextRequest,
  context: TopicContext
) {
  const user = await getCurrentUser()
  const { id } = await context.params
  const topic = await findVisibleHubTopicReference(id, user?.id ?? '__public_viewer__')

  if (!topic || !isHubTopicVisibleToUser(topic, user?.id ?? '__public_viewer__')) {
    return jsonErrorMessage('Topic not found', 404)
  }

  return new Response(createHubTopicEventStream(topic.id, request.signal), {
    headers: {
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    }
  })
}

export async function handleHubArtifactsPost(
  request: NextRequest,
  context: TopicContext
) {
  const user = await requireHubUser('Sign in before adding artifacts')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await findVisibleHubTopicReference(topicReference, user.id)

  if (!topic || !isHubTopicVisibleToUser(topic, user.id)) {
    return jsonErrorMessage('Topic not found', 404)
  }

  const formData = await request.formData().catch(() => null)

  if (!formData) {
    return jsonErrorMessage('Invalid artifact payload', 400)
  }

  const type = parseArtifactType(formData.get('type'))
  const explicitTitle = formText(formData, 'title')
  const description = formText(formData, 'description') || null
  const textContent = formText(formData, 'textContent') || null
  const externalUrls = parseExternalUrls(formText(formData, 'externalUrls'))

  if (!type) {
    return jsonErrorMessage('Artifact type is required', 400)
  }

  if (type === 'text' && !textContent) {
    return jsonErrorMessage('Text artifact content is required', 400)
  }

  if (
    type === 'text' &&
    textContent &&
    textSizeBytes(textContent) > maxTextArtifactBytes
  ) {
    return jsonErrorMessage('Text artifact content must be 512KB or smaller', 400)
  }

  if (type === 'link' && externalUrls.length === 0) {
    return jsonErrorMessage('At least one valid link URL is required', 400)
  }

  if (type === 'link' && externalUrls.some((url) => !isHttpUrl(url))) {
    return jsonErrorMessage('One or more link URLs are invalid', 400)
  }

  const files = formData
    .getAll('files')
    .filter((value): value is File => value instanceof File)

  if (type === 'file' && files.length === 0) {
    return jsonErrorMessage('Upload a file for file artifacts', 400)
  }

  if (type === 'file') {
    const artifacts = []

    for (const file of files) {
      const uploadedFile = await uploadHubArtifactFile(file, user)

      if (!uploadedFile) {
        return jsonErrorMessage('Uploaded file is empty or too large', 400)
      }

      const artifact = await prisma.hubArtifact.create({
        data: {
          authorId: user.id,
          description,
          title: (explicitTitle || normalizeArtifactTitle(file.name)).slice(0, 160),
          topicId: topic.id,
          type,
          uploadedFileId: uploadedFile.id
        },
        select: {
          id: true
        }
      })
      await enqueueHubFileArtifactProcessing({
        artifactId: artifact.id,
        uploadedFile
      })
      artifacts.push(artifact)
    }

    return jsonOk({ artifact: artifacts[0], artifacts }, { status: 201 })
  }

  if (type === 'link') {
    const artifacts = []

    for (const url of externalUrls) {
      const artifact = await prisma.hubArtifact.create({
        data: {
          authorId: user.id,
          description,
          externalUrl: url,
          title: (explicitTitle || titleFromUrl(url) || 'Link').slice(0, 160),
          topicId: topic.id,
          type
        },
        select: {
          id: true
        }
      })
      await enqueueHubArtifactScreenshot(artifact.id)
      artifacts.push(artifact)
    }

    return jsonOk({ artifact: artifacts[0], artifacts }, { status: 201 })
  }

  const artifactTitle = explicitTitle || titleFromText(textContent) || 'Artifact'

  const artifact = await prisma.hubArtifact.create({
    data: {
      authorId: user.id,
      description,
      textContent,
      title: artifactTitle.slice(0, 160),
      topicId: topic.id,
      type
    },
    select: {
      id: true
    }
  })
  await enqueueHubArtifactAnalysis(artifact.id)

  return jsonOk({ artifact }, { status: 201 })
}

function createHubTopicEventStream(topicId: string, signal: AbortSignal) {
  let isClosed = false
  let unsubscribe: { close: () => Promise<void> } | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = async () => {
        if (isClosed) {
          return
        }

        isClosed = true
        if (heartbeat) {
          clearInterval(heartbeat)
        }
        await unsubscribe?.close()
        controller.close()
      }

      unsubscribe = await subscribeHubTopicEvents(topicId, (event) => {
        if (isClosed) {
          return
        }

        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        )
      })
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15_000)
      signal.addEventListener('abort', () => {
        close().catch(() => undefined)
      })
    },
    async cancel() {
      isClosed = true
      if (heartbeat) {
        clearInterval(heartbeat)
      }
      await unsubscribe?.close()
    }
  })
}

export async function handleHubArtifactFileGet(
  _request: NextRequest,
  context: ArtifactContext
) {
  const user = await getCurrentUser()
  const viewerUserId = user?.id ?? '__public_viewer__'
  const { artifactId, id: topicReference } = await context.params

  const artifact = await prisma.hubArtifact.findFirst({
    where: {
      OR: hubReferenceWhere(artifactId),
      topic: {
        AND: [
          {
            OR: hubReferenceWhere(topicReference)
          },
          {
            OR: [
              {
                status: {
                  not: privateHubTopicStatus
                }
              },
              {
                authorId: viewerUserId
              }
            ]
          }
        ]
      }
    },
    select: {
      uploadedFile: {
        select: {
          mimeType: true,
          originalName: true,
          sizeBytes: true,
          storageBucket: true,
          storageKey: true
        }
      }
    }
  })

  const file = artifact?.uploadedFile

  if (!file) {
    return jsonErrorMessage('Artifact file not found', 404)
  }

  if (!file.storageBucket || !file.storageKey) {
    return jsonErrorMessage('Artifact file is not available', 409)
  }

  const body = await getPlatformStorageObjectBuffer({
    bucket: file.storageBucket,
    key: file.storageKey
  })

  return new Response(body, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': contentDispositionInline(file.originalName),
      'Content-Length': String(body.byteLength || file.sizeBytes),
      'Content-Type': file.mimeType
    }
  })
}

export async function handleHubArtifactThumbnailGet(
  _request: NextRequest,
  context: ArtifactContext
) {
  const user = await getCurrentUser()
  const viewerUserId = user?.id ?? '__public_viewer__'
  const { artifactId, id: topicReference } = await context.params

  const artifact = await prisma.hubArtifact.findFirst({
    where: {
      OR: hubReferenceWhere(artifactId),
      topic: {
        AND: [
          {
            OR: hubReferenceWhere(topicReference)
          },
          {
            OR: [
              {
                status: {
                  not: privateHubTopicStatus
                }
              },
              {
                authorId: viewerUserId
              }
            ]
          }
        ]
      }
    },
    select: {
      uploadedFile: {
        select: {
          thumbnail: {
            select: {
              mimeType: true,
              originalName: true,
              sizeBytes: true,
              storageBucket: true,
              storageKey: true
            }
          }
        }
      }
    }
  })

  const file = artifact?.uploadedFile?.thumbnail

  if (!file) {
    return jsonErrorMessage('Artifact thumbnail not found', 404)
  }

  if (!file.storageBucket || !file.storageKey) {
    return jsonErrorMessage('Artifact thumbnail is not available', 409)
  }

  const body = await getPlatformStorageObjectBuffer({
    bucket: file.storageBucket,
    key: file.storageKey
  })

  return new Response(body, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': contentDispositionInline(file.originalName),
      'Content-Length': String(body.byteLength || file.sizeBytes),
      'Content-Type': file.mimeType
    }
  })
}

export async function handleHubArtifactDelete(
  _request: NextRequest,
  context: ArtifactContext
) {
  const user = await requireHubUser('Sign in before deleting artifacts')

  if (user instanceof Response) {
    return user
  }

  const { artifactId, id: topicReference } = await context.params
  const artifact = await prisma.hubArtifact.findFirst({
    where: {
      OR: hubReferenceWhere(artifactId),
      topic: {
        OR: hubReferenceWhere(topicReference)
      }
    },
    select: {
      id: true,
      topic: {
        select: {
          authorId: true,
          id: true
        }
      },
      uploadedFile: {
        select: {
          id: true,
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
      }
    }
  })

  if (!artifact) {
    return jsonErrorMessage('Artifact not found', 404)
  }

  if (artifact.topic.authorId !== user.id) {
    return jsonErrorMessage('Only the topic author can delete artifacts', 403)
  }

  if (artifact.uploadedFile) {
    await deleteUploadedFileStorageObjects(artifact.uploadedFile)
  }

  await prisma.$transaction(async (tx) => {
    await tx.hubArtifact.delete({
      where: {
        id: artifact.id
      }
    })

    if (artifact.uploadedFile) {
      await markUploadedFileDeleted(tx, artifact.uploadedFile)
    }
  })

  return jsonOk({})
}

type DeletedUploadedFile = {
  id: string
  storageBucket: string
  storageKey: string
  thumbnail: {
    id: string
    storageBucket: string
    storageKey: string
  } | null
}

async function deleteUploadedFileStorageObjects(file: DeletedUploadedFile) {
  if (file.storageBucket && file.storageKey) {
    await deletePlatformStorageObject({
      bucket: file.storageBucket,
      key: file.storageKey
    })
  }

  if (file.thumbnail?.storageBucket && file.thumbnail.storageKey) {
    await deletePlatformStorageObject({
      bucket: file.thumbnail.storageBucket,
      key: file.thumbnail.storageKey
    })
  }
}

async function markUploadedFileDeleted(
  tx: Prisma.TransactionClient,
  file: DeletedUploadedFile
) {
  if (file.thumbnail) {
    await tx.uploadedFileChunk.deleteMany({
      where: {
        uploadedFileId: file.thumbnail.id
      }
    })
    await tx.uploadedFile.update({
      where: {
        id: file.thumbnail.id
      },
      data: {
        deletedAt: new Date(),
        error: null,
        status: 'deleted',
        storageBucket: '',
        storageKey: ''
      }
    })
  }

  await tx.uploadedFileChunk.deleteMany({
    where: {
      uploadedFileId: file.id
    }
  })
  await tx.uploadedFile.update({
    where: {
      id: file.id
    },
    data: {
      deletedAt: new Date(),
      error: null,
      status: 'deleted',
      storageBucket: '',
      storageKey: '',
      thumbnailId: null
    }
  })
}

export async function handleHubCommentsPost(request: NextRequest, context: TopicContext) {
  const user = await requireHubUser('Sign in before commenting')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await findVisibleHubTopicReference(topicReference, user.id)

  if (!topic || !isHubTopicVisibleToUser(topic, user.id)) {
    return jsonErrorMessage('Topic not found', 404)
  }

  let data

  try {
    data = await parseJsonRequest(request, createHubCommentSchema)
  } catch (error) {
    return jsonValidationError(error)
  }

  let artifactId = data.artifactId || null
  let parentId = data.parentId || null

  if (parentId) {
    const parent = await prisma.hubComment.findFirst({
      where: {
        id: parentId,
        topicId: topic.id
      },
      select: {
        artifactId: true,
        id: true
      }
    })

    if (!parent) {
      return jsonErrorMessage('Parent comment not found', 404)
    }

    artifactId = parent.artifactId
    parentId = parent.id
  }

  if (artifactId) {
    const artifact = await prisma.hubArtifact.findFirst({
      where: {
        OR: hubReferenceWhere(artifactId),
        topicId: topic.id
      },
      select: {
        id: true
      }
    })

    if (!artifact) {
      return jsonErrorMessage('Artifact not found', 404)
    }

    artifactId = artifact.id
  }

  const comment = await prisma.hubComment.create({
    data: {
      artifactId,
      authorId: user.id,
      body: data.body,
      parentId,
      topicId: topic.id
    },
    select: {
      id: true
    }
  })

  return jsonOk({ comment }, { status: 201 })
}

export async function handleHubUpvotePost(_request: NextRequest, context: TopicContext) {
  const user = await requireHubUser('Sign in before upvoting')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await findVisibleHubTopicReference(topicReference, user.id)

  if (!topic || !isHubTopicVisibleToUser(topic, user.id)) {
    return jsonErrorMessage('Topic not found', 404)
  }

  await prisma.hubUpvote.upsert({
    create: {
      topicId: topic.id,
      userId: user.id
    },
    update: {},
    where: {
      topicId_userId: {
        topicId: topic.id,
        userId: user.id
      }
    }
  })
  await prisma.hubDownvote.deleteMany({
    where: {
      topicId: topic.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubUpvoteDelete(
  _request: NextRequest,
  context: TopicContext
) {
  const user = await requireHubUser('Sign in before removing upvotes')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await findVisibleHubTopicReference(topicReference, user.id)

  if (!topic) {
    return jsonErrorMessage('Topic not found', 404)
  }

  await prisma.hubUpvote.deleteMany({
    where: {
      topicId: topic.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubDownvotePost(
  _request: NextRequest,
  context: TopicContext
) {
  const user = await requireHubUser('Sign in before downvoting')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await findVisibleHubTopicReference(topicReference, user.id)

  if (!topic || !isHubTopicVisibleToUser(topic, user.id)) {
    return jsonErrorMessage('Topic not found', 404)
  }

  await prisma.hubDownvote.upsert({
    create: {
      topicId: topic.id,
      userId: user.id
    },
    update: {},
    where: {
      topicId_userId: {
        topicId: topic.id,
        userId: user.id
      }
    }
  })
  await prisma.hubUpvote.deleteMany({
    where: {
      topicId: topic.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubDownvoteDelete(
  _request: NextRequest,
  context: TopicContext
) {
  const user = await requireHubUser('Sign in before removing downvotes')

  if (user instanceof Response) {
    return user
  }

  const { id: topicReference } = await context.params
  const topic = await findVisibleHubTopicReference(topicReference, user.id)

  if (!topic) {
    return jsonErrorMessage('Topic not found', 404)
  }

  await prisma.hubDownvote.deleteMany({
    where: {
      topicId: topic.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubCommentUpvotePost(
  _request: NextRequest,
  context: CommentContext
) {
  const user = await requireHubUser('Sign in before upvoting comments')

  if (user instanceof Response) {
    return user
  }

  const { commentId, id: topicId } = await context.params
  const comment = await findVisibleHubComment(topicId, commentId, user.id)

  if (!comment) {
    return jsonErrorMessage('Comment not found', 404)
  }

  if (comment.parentId) {
    return jsonErrorMessage('Replies cannot be voted on', 400)
  }

  await prisma.hubCommentUpvote.upsert({
    create: {
      commentId: comment.id,
      userId: user.id
    },
    update: {},
    where: {
      commentId_userId: {
        commentId: comment.id,
        userId: user.id
      }
    }
  })
  await prisma.hubCommentDownvote.deleteMany({
    where: {
      commentId: comment.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubCommentUpvoteDelete(
  _request: NextRequest,
  context: CommentContext
) {
  const user = await requireHubUser('Sign in before removing comment upvotes')

  if (user instanceof Response) {
    return user
  }

  const { commentId, id: topicId } = await context.params
  const comment = await findVisibleHubComment(topicId, commentId, user.id)

  if (!comment) {
    return jsonErrorMessage('Comment not found', 404)
  }

  await prisma.hubCommentUpvote.deleteMany({
    where: {
      commentId: comment.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubCommentDownvotePost(
  _request: NextRequest,
  context: CommentContext
) {
  const user = await requireHubUser('Sign in before downvoting comments')

  if (user instanceof Response) {
    return user
  }

  const { commentId, id: topicId } = await context.params
  const comment = await findVisibleHubComment(topicId, commentId, user.id)

  if (!comment) {
    return jsonErrorMessage('Comment not found', 404)
  }

  if (comment.parentId) {
    return jsonErrorMessage('Replies cannot be voted on', 400)
  }

  await prisma.hubCommentDownvote.upsert({
    create: {
      commentId: comment.id,
      userId: user.id
    },
    update: {},
    where: {
      commentId_userId: {
        commentId: comment.id,
        userId: user.id
      }
    }
  })
  await prisma.hubCommentUpvote.deleteMany({
    where: {
      commentId: comment.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

export async function handleHubCommentDownvoteDelete(
  _request: NextRequest,
  context: CommentContext
) {
  const user = await requireHubUser('Sign in before removing comment downvotes')

  if (user instanceof Response) {
    return user
  }

  const { commentId, id: topicId } = await context.params
  const comment = await findVisibleHubComment(topicId, commentId, user.id)

  if (!comment) {
    return jsonErrorMessage('Comment not found', 404)
  }

  await prisma.hubCommentDownvote.deleteMany({
    where: {
      commentId: comment.id,
      userId: user.id
    }
  })

  return jsonOk({})
}

async function requireHubUser(message: string): Promise<CurrentUser | Response> {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage(message, 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  return user
}

function hubReferenceWhere(reference: string) {
  return [
    {
      id: reference
    },
    {
      slug: reference
    }
  ]
}

async function findVisibleHubTopicReference(reference: string, userId: string) {
  const topic = await prisma.hubTopic.findFirst({
    where: {
      OR: hubReferenceWhere(reference)
    },
    select: {
      authorId: true,
      id: true,
      status: true
    }
  })

  if (!topic || !isHubTopicVisibleToUser(topic, userId)) {
    return null
  }

  return topic
}

async function getHotHubTopicIds(viewerUserId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      WITH ranked_topics AS (
        SELECT
          t.id,
          t."createdAt",
          (
            COALESCE(upvotes.count, 0)::integer -
            COALESCE(downvotes.count, 0)::integer
          ) AS vote_score
        FROM hub_topics t
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS count
          FROM hub_upvotes u
          WHERE u."topicId" = t.id
        ) upvotes ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS count
          FROM hub_downvotes d
          WHERE d."topicId" = t.id
        ) downvotes ON TRUE
        WHERE t.status <> ${privateHubTopicStatus}
          OR t."authorId" = ${viewerUserId}
      )
      SELECT id
      FROM ranked_topics
      ORDER BY
        (
          CASE
            WHEN vote_score > 0 THEN 1
            WHEN vote_score < 0 THEN -1
            ELSE 0
          END
          * (LN(GREATEST(ABS(vote_score), 1)) / LN(10))
          + ((EXTRACT(EPOCH FROM "createdAt") - 1134028003) / 45000)
        ) DESC,
        "createdAt" DESC,
        id ASC
      LIMIT ${hubTopicListLimit}
    `
  )

  return rows.map((row) => row.id)
}

async function findHubTopic(reference: string, userId: string) {
  return prisma.hubTopic.findFirst({
    where: {
      AND: [
        {
          OR: hubReferenceWhere(reference)
        },
        {
          OR: [
            {
              status: {
                not: privateHubTopicStatus
              }
            },
            {
              authorId: userId
            }
          ]
        }
      ]
    },
    select: {
      _count: {
        select: {
          downvotes: true,
          upvotes: true
        }
      },
      appUrl: true,
      artifacts: {
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          _count: {
            select: {
              comments: true
            }
          },
          author: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          createdAt: true,
          description: true,
          externalUrl: true,
          id: true,
          slug: true,
          status: true,
          textContent: true,
          title: true,
          type: true,
          uploadedFile: {
            select: {
              id: true,
              extractions: {
                orderBy: {
                  updatedAt: 'desc'
                },
                select: {
                  content: true,
                  format: true,
                  metadata: true
                },
                take: 1,
                where: {
                  format: 'markdown'
                }
              },
              mimeType: true,
              originalName: true,
              sizeBytes: true,
              status: true,
              thumbnail: {
                select: {
                  id: true,
                  mimeType: true,
                  originalName: true,
                  sizeBytes: true,
                  status: true
                }
              }
            }
          },
          artifactTags: {
            select: {
              tag: {
                select: {
                  slug: true,
                  translations: {
                    select: {
                      locale: true,
                      title: true
                    }
                  }
                }
              }
            }
          }
        }
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      category: true,
      slug: true,
      topicTags: {
        select: {
          tag: {
            select: {
              translations: {
                select: {
                  locale: true,
                  title: true
                }
              },
              slug: true
            }
          }
        }
      },
      comments: {
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          artifactId: true,
          _count: {
            select: {
              downvotes: true,
              upvotes: true
            }
          },
          author: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          body: true,
          createdAt: true,
          id: true,
          parentId: true,
          translations: {
            select: {
              body: true,
              locale: true
            }
          },
          downvotes: {
            where: {
              userId
            },
            select: {
              id: true
            },
            take: 1
          },
          upvotes: {
            where: {
              userId
            },
            select: {
              id: true
            },
            take: 1
          }
        }
      },
      createdAt: true,
      description: true,
      id: true,
      intent: true,
      status: true,
      title: true,
      translations: {
        select: {
          description: true,
          intent: true,
          locale: true,
          title: true
        }
      },
      downvotes: {
        where: {
          userId
        },
        select: {
          id: true
        },
        take: 1
      },
      upvotes: {
        where: {
          userId
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  })
}

async function findVisibleHubComment(
  topicReference: string,
  commentId: string,
  userId: string
) {
  const comment = await prisma.hubComment.findFirst({
    where: {
      id: commentId,
      topic: {
        OR: hubReferenceWhere(topicReference)
      }
    },
    select: {
      id: true,
      parentId: true,
      topic: {
        select: {
          authorId: true,
          status: true
        }
      }
    }
  })

  if (!comment || !isHubTopicVisibleToUser(comment.topic, userId)) {
    return null
  }

  return comment
}

function isHubTopicVisibleToUser(
  topic: { authorId: string; status: string },
  userId: string
) {
  return topic.status !== privateHubTopicStatus || topic.authorId === userId
}

async function uploadHubArtifactFile(file: File, user: CurrentUser) {
  if (file.size <= 0 || file.size > maxArtifactUploadBytes) {
    return null
  }

  const uploadedFileId = crypto.randomUUID()
  const originalName = normalizeFileName(file.name)
  const mimeType = normalizeMimeType(file)
  const storageKey = ['hub-artifacts', user.id, uploadedFileId, originalName].join('/')

  const uploadedFile = await prisma.uploadedFile.create({
    data: {
      id: uploadedFileId,
      mimeType,
      originalName,
      scope: 'hub_artifact',
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

  const storageObject = await putPlatformStorageObject({
    body: Buffer.from(await file.arrayBuffer()),
    contentType: mimeType,
    key: storageKey
  })

  const uploadedStatus = isSupportedVisionMimeType(mimeType) ? 'processed' : 'queued'
  await prisma.uploadedFile.update({
    where: {
      id: uploadedFile.id
    },
    data: {
      processedAt: uploadedStatus === 'processed' ? new Date() : undefined,
      status: uploadedStatus,
      storageBucket: storageObject.bucket,
      storageKey: storageObject.key
    }
  })

  return {
    id: uploadedFile.id,
    mimeType,
    status: uploadedStatus
  }
}

async function enqueueHubFileArtifactProcessing({
  artifactId,
  uploadedFile
}: {
  artifactId: string
  uploadedFile: {
    id: string
    mimeType: string
    status: string
  }
}) {
  if (
    uploadedFile.mimeType.startsWith('image/') ||
    uploadedFile.mimeType === 'application/pdf'
  ) {
    await enqueueUploadedFileThumbnail(uploadedFile.id)
  }

  if (uploadedFile.status === 'processed') {
    await enqueueHubArtifactAnalysis(artifactId)
    return
  }

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

type HubTopicListRecord = {
  _count: {
    artifacts: number
    comments: number
    downvotes: number
    upvotes: number
  }
  author: {
    email: string
    id: string
    name: string | null
  }
  category: string
  createdAt: Date
  description: string | null
  id: string
  intent: string
  slug: string | null
  status: string
  translations: HubTopicTranslationRecord[]
  topicTags: Array<{
    tag: {
      slug: string
    }
  }>
  title: string
  downvotes: { id: string }[]
  upvotes: { id: string }[]
}

function serializeTopicListItem(topic: HubTopicListRecord) {
  return {
    artifactCount: topic._count.artifacts,
    author: serializeAuthor(topic.author),
    category: topic.category,
    commentCount: topic._count.comments,
    createdAt: topic.createdAt.toISOString(),
    description: topic.description,
    id: topic.id,
    intent: topic.intent,
    slug: topic.slug,
    status: topic.status,
    tags: serializeTopicTags(topic),
    title: topic.title,
    translations: serializeTopicTranslations(topic.translations),
    downvoteCount: topic._count.downvotes,
    upvoteCount: topic._count.upvotes,
    viewerHasDownvoted: topic.downvotes.length > 0,
    viewerHasUpvoted: topic.upvotes.length > 0
  }
}

function serializeTopicDetail(
  topic: NonNullable<Awaited<ReturnType<typeof findHubTopic>>>
) {
  return {
    appUrl: topic.appUrl,
    artifacts: topic.artifacts.map((artifact) => ({
      author: serializeAuthor(artifact.author),
      commentCount: artifact._count.comments,
      createdAt: artifact.createdAt.toISOString(),
      description: artifact.description,
      externalUrl: artifact.externalUrl,
      file: artifact.uploadedFile
        ? {
            id: artifact.uploadedFile.id,
            extraction: artifact.uploadedFile.extractions[0]
              ? {
                  content: artifact.uploadedFile.extractions[0].content,
                  format: artifact.uploadedFile.extractions[0].format,
                  metadata: artifact.uploadedFile.extractions[0].metadata
                }
              : null,
            mimeType: artifact.uploadedFile.mimeType,
            name: artifact.uploadedFile.originalName,
            sizeBytes: artifact.uploadedFile.sizeBytes,
            status: artifact.uploadedFile.status,
            thumbnail: artifact.uploadedFile.thumbnail
              ? {
                  id: artifact.uploadedFile.thumbnail.id,
                  mimeType: artifact.uploadedFile.thumbnail.mimeType,
                  name: artifact.uploadedFile.thumbnail.originalName,
                  sizeBytes: artifact.uploadedFile.thumbnail.sizeBytes,
                  status: artifact.uploadedFile.thumbnail.status
                }
              : null
          }
        : null,
      id: artifact.id,
      slug: artifact.slug,
      status: artifact.status,
      tagLabels: serializeArtifactTagLabels(artifact.artifactTags),
      tags: serializeArtifactTags(artifact.artifactTags),
      textContent: artifact.textContent,
      title: artifact.title,
      type: artifact.type
    })),
    author: serializeAuthor(topic.author),
    category: topic.category,
    comments: topic.comments.map((comment) => ({
      artifactId: comment.artifactId,
      author: serializeAuthor(comment.author),
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      downvoteCount: comment._count.downvotes,
      id: comment.id,
      parentId: comment.parentId,
      translations: serializeCommentTranslations(comment.translations),
      upvoteCount: comment._count.upvotes,
      viewerHasDownvoted: comment.downvotes.length > 0,
      viewerHasUpvoted: comment.upvotes.length > 0
    })),
    createdAt: topic.createdAt.toISOString(),
    description: topic.description,
    id: topic.id,
    intent: topic.intent,
    slug: topic.slug,
    status: topic.status,
    tagLabels: serializeTopicTagLabels(topic.topicTags),
    tags: serializeTopicTags(topic),
    title: topic.title,
    translations: serializeTopicTranslations(topic.translations),
    downvoteCount: topic._count.downvotes,
    upvoteCount: topic._count.upvotes,
    viewerHasDownvoted: topic.downvotes.length > 0,
    viewerHasUpvoted: topic.upvotes.length > 0
  }
}

function serializeAuthor(author: { email: string; id: string; name: string | null }) {
  return {
    id: author.id,
    name: author.name || author.email
  }
}

type HubTagTranslationRecord = {
  locale: string
  title: string
}

type HubTopicTranslationRecord = {
  description: string | null
  intent: string
  locale: string
  title: string
}

type HubCommentTranslationRecord = {
  body: string
  locale: string
}

function serializeCommentTranslations(translations: HubCommentTranslationRecord[]) {
  return Object.fromEntries(
    translations.map((translation) => [
      translation.locale,
      {
        body: translation.body
      }
    ])
  )
}

function serializeTopicTranslations(translations: HubTopicTranslationRecord[]) {
  return Object.fromEntries(
    translations.map((translation) => [
      translation.locale,
      {
        description: translation.description,
        intent: translation.intent,
        title: translation.title
      }
    ])
  )
}

function serializeHubTag(tag: {
  category: string
  slug: string
  translations: HubTagTranslationRecord[]
}) {
  return {
    category: tag.category,
    labels: serializeTagLabels(tag.translations),
    slug: tag.slug
  }
}

function serializeTopicTags(topic: { topicTags: Array<{ tag: { slug: string } }> }) {
  return topic.topicTags.map((topicTag) => topicTag.tag.slug)
}

function serializeTopicTagLabels(
  topicTags: Array<{ tag: { slug: string; translations: HubTagTranslationRecord[] } }>
) {
  return Object.fromEntries(
    topicTags.map((topicTag) => [
      topicTag.tag.slug,
      serializeTagLabels(topicTag.tag.translations)
    ])
  )
}

function serializeArtifactTags(artifactTags: Array<{ tag: { slug: string } }>) {
  return artifactTags.map((artifactTag) => artifactTag.tag.slug)
}

function serializeArtifactTagLabels(
  artifactTags: Array<{ tag: { slug: string; translations: HubTagTranslationRecord[] } }>
) {
  return Object.fromEntries(
    artifactTags.map((artifactTag) => [
      artifactTag.tag.slug,
      serializeTagLabels(artifactTag.tag.translations)
    ])
  )
}

function serializeTagLabels(translations: HubTagTranslationRecord[]) {
  return Object.fromEntries(
    translations.map((translation) => [translation.locale, translation.title])
  )
}

function normalizeMimeType(file: File) {
  if (file.type) {
    return file.type
  }

  if (file.name.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf'
  }

  return 'application/octet-stream'
}

function isSupportedVisionMimeType(mimeType: string) {
  return (
    mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
  )
}

function normalizeFileName(name: string) {
  const trimmed = name.trim() || 'artifact'
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function textSizeBytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function normalizeArtifactTitle(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return 'File artifact'
  }

  return trimmed.slice(0, 160)
}

function titleFromText(value: string | null) {
  if (!value) {
    return null
  }

  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ? firstLine.slice(0, 80) : null
}

function titleFromUrl(value: string | null) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '') || value
  } catch {
    return value.slice(0, 80)
  }
}

function parseExternalUrls(value: string) {
  return [
    ...new Set(
      value
        .split(/[\r\n\t ]+/)
        .map((url) => url.trim())
        .filter(Boolean)
    )
  ]
}

function titleFromIntent(value: string) {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return (firstLine || value.trim()).slice(0, 160)
}

function isHttpUrl(value: string | null) {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function contentDispositionInline(fileName: string) {
  const asciiName = fileName.replace(/["\\\r\n]/g, '_')
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
