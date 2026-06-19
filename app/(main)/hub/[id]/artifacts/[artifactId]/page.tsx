'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Anchor,
  ActionIcon,
  Badge,
  Box,
  Button,
  Grid,
  GridCol,
  Group,
  Menu,
  Paper,
  Skeleton,
  Stack,
  Text,
  Textarea
} from '@mantine/core'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Trash2
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useAppBreadcrumbItems } from '@/app/_components/app-breadcrumbs'
import { useAuthFlow } from '@/app/_components/auth-flow-provider'
import { useI18n } from '@/app/_components/i18n-provider'
import { MarkdownContent } from '@/app/_components/markdown-content'
import { ArtifactStatusIcon } from '@/app/hub/_components/artifact-status-icon'
import { formatFileSize } from '@/app/hub/_utils/format-file-size'
import { localizeHubArtifact } from '@/app/hub/_utils/localize-artifact'
import { localizeHubComment } from '@/app/hub/_utils/localize-comment'
import { localizeHubTopic } from '@/app/hub/_utils/localize-topic'
import { waitForHubUiDelay } from '@/app/hub/_utils/ui-delay'
import { useSession } from '@/app/_components/session-provider'
import type { ApiResponse } from '@/shared/api'
import type { HubArtifact, HubComment, HubTopicDetail } from '@/app/hub/types'

type TopicResponse = ApiResponse<{
  topic: HubTopicDetail
}>

type VoteKind = 'downvote' | 'upvote'

export default function HubArtifactPage() {
  const params = useParams<{ artifactId: string; id: string }>()
  const router = useRouter()
  const session = useSession()
  const { openAuthFlow } = useAuthFlow()
  const { locale, t } = useI18n()
  const hub = t.hub
  const canVote = session.status === 'authenticated' && session.data.user.onboarded
  const [artifact, setArtifact] = useState<HubArtifact | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCommenting, setIsCommenting] = useState(false)
  const [isDeletingArtifact, setIsDeletingArtifact] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [topic, setTopic] = useState<HubTopicDetail | null>(null)
  const hasPassedInitialUiDelayRef = useRef(false)

  const loadArtifact = useCallback(async () => {
    setError(null)

    try {
      const response = await fetch(`/api/hub/topics/${encodeURIComponent(params.id)}`, {
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as TopicResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.loadArtifactFailed} (${response.status})`
        )
      }

      const foundArtifact = payload.data.topic.artifacts.find(
        (candidate) =>
          candidate.id === params.artifactId || candidate.slug === params.artifactId
      )

      if (!foundArtifact) {
        throw new Error(hub.artifactNotFound)
      }

      if (!hasPassedInitialUiDelayRef.current) {
        await waitForHubUiDelay()
        hasPassedInitialUiDelayRef.current = true
      }

      setTopic(payload.data.topic)
      setArtifact(foundArtifact)
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.loadArtifactFailed)
    }
  }, [hub.artifactNotFound, hub.loadArtifactFailed, params.artifactId, params.id])

  useEffect(() => {
    void loadArtifact()
  }, [loadArtifact])

  useEffect(() => {
    const source = new EventSource(
      `/api/hub/topics/${encodeURIComponent(params.id)}/events`
    )

    source.addEventListener('artifact_changed', () => {
      void loadArtifact()
    })
    source.addEventListener('topic_changed', () => {
      void loadArtifact()
    })

    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
    }
  }, [loadArtifact, params.id])

  const updateComment = useCallback((nextComment: HubComment) => {
    setTopic((currentTopic) =>
      currentTopic
        ? {
            ...currentTopic,
            comments: currentTopic.comments.map((comment) =>
              comment.id === nextComment.id ? nextComment : comment
            )
          }
        : currentTopic
    )
  }, [])

  const addComment = useCallback(
    async (body: string, parentId: string | null = null) => {
      if (!canVote) {
        openAuthFlow()
        return false
      }

      if (isCommenting) {
        return false
      }

      setIsCommenting(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/hub/topics/${encodeURIComponent(params.id)}/comments`,
          {
            body: JSON.stringify({
              artifactId: parentId ? null : params.artifactId,
              body,
              parentId
            }),
            headers: {
              'Content-Type': 'application/json'
            },
            method: 'POST'
          }
        )
        const payload = (await response.json().catch(() => null)) as ApiResponse | null

        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload && !payload.ok
              ? payload.error.message
              : `${hub.addCommentFailed} (${response.status})`
          )
        }

        await loadArtifact()
        return true
      } catch (error) {
        setError(error instanceof Error ? error.message : hub.addCommentFailed)
        return false
      } finally {
        setIsCommenting(false)
      }
    },
    [
      canVote,
      hub.addCommentFailed,
      isCommenting,
      loadArtifact,
      openAuthFlow,
      params.artifactId,
      params.id
    ]
  )

  const addReply = useCallback(
    async (body: string, parentId: string) => {
      if (isReplying) {
        return false
      }

      setIsReplying(true)

      try {
        return await addComment(body, parentId)
      } finally {
        setIsReplying(false)
      }
    },
    [addComment, isReplying]
  )

  async function saveComment() {
    const isSaved = await addComment(commentBody)

    if (isSaved) {
      setCommentBody('')
    }
  }

  const comments = useMemo(
    () => topic?.comments.filter((comment) => comment.artifactId === artifact?.id) ?? [],
    [artifact?.id, topic?.comments]
  )
  const artifactFileUrl = artifact?.file
    ? `/api/hub/topics/${encodeURIComponent(params.id)}/artifacts/${encodeURIComponent(
        artifact.slug ?? artifact.id
      )}/file`
    : null
  const artifactThumbnailUrl = artifact?.file?.thumbnail
    ? `/api/hub/topics/${encodeURIComponent(params.id)}/artifacts/${encodeURIComponent(
        artifact.slug ?? artifact.id
      )}/thumbnail`
    : null
  const isImageArtifact = artifact?.file?.mimeType.startsWith('image/') ?? false
  const localizedTopic = topic ? localizeHubTopic(topic, locale) : null
  const localizedArtifact = artifact ? localizeHubArtifact(artifact, locale) : null
  const topicBreadcrumbHref = topic ? `/hub/${topic.slug ?? params.id}` : null
  const topicBreadcrumbTitle = localizedTopic?.title
  const artifactBreadcrumbHref =
    topic && artifact
      ? `/hub/${topic.slug ?? params.id}/artifacts/${artifact.slug ?? artifact.id}`
      : null
  const artifactBreadcrumbTitle = artifact
    ? (localizedArtifact?.title ?? artifact.title)
    : null
  const breadcrumbItems = useMemo(
    () =>
      topicBreadcrumbHref &&
      topicBreadcrumbTitle &&
      artifactBreadcrumbHref &&
      artifactBreadcrumbTitle
        ? [
            {
              href: '/hub',
              label: hub.title
            },
            {
              href: topicBreadcrumbHref,
              label: topicBreadcrumbTitle
            },
            {
              href: artifactBreadcrumbHref,
              label: artifactBreadcrumbTitle
            }
          ]
        : null,
    [
      artifactBreadcrumbHref,
      artifactBreadcrumbTitle,
      hub.title,
      topicBreadcrumbHref,
      topicBreadcrumbTitle
    ]
  )
  useAppBreadcrumbItems(breadcrumbItems)
  const canDeleteArtifact =
    session.status === 'authenticated' && topic?.author.id === session.data.user.id

  async function deleteArtifact() {
    if (!topic || !artifact || isDeletingArtifact) {
      return
    }

    setIsDeletingArtifact(true)
    setError(null)

    try {
      const topicReference = topic.slug ?? topic.id
      const artifactReference = artifact.slug ?? artifact.id
      const response = await fetch(
        `/api/hub/topics/${encodeURIComponent(topicReference)}/artifacts/${encodeURIComponent(
          artifactReference
        )}`,
        {
          method: 'DELETE'
        }
      )
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.deleteArtifactFailed} (${response.status})`
        )
      }

      router.push(`/hub/${topicReference}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.deleteArtifactFailed)
    } finally {
      setIsDeletingArtifact(false)
    }
  }

  return (
    <Stack gap="md">
      {error ? <Alert color="red">{error}</Alert> : null}
      {!artifact ? <Skeleton height={280} radius="md" /> : null}
      {artifact ? (
        <Grid>
          <GridCol span={{ base: 12, lg: 6 }}>
            <Paper withBorder p="md" radius="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Group gap="xs">
                    <FileText size={18} />
                    <Text fw={700}>{localizedArtifact?.title ?? artifact.title}</Text>
                  </Group>
                  <Group gap="xs">
                    {canDeleteArtifact ? (
                      <Menu position="bottom-end" shadow="md">
                        <Menu.Target>
                          <ActionIcon
                            aria-label={hub.deleteArtifact}
                            disabled={isDeletingArtifact}
                            variant="subtle"
                          >
                            <MoreHorizontal size={17} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            color="red"
                            leftSection={<Trash2 size={16} />}
                            onClick={() => void deleteArtifact()}
                          >
                            {hub.deleteArtifact}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    ) : null}
                  </Group>
                </Group>
                {artifact.description ? (
                  <Text c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                    {artifact.description}
                  </Text>
                ) : null}
                {artifact.type === 'text' ? (
                  <Paper bg="gray.0" p="md" radius="md">
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{artifact.textContent}</Text>
                  </Paper>
                ) : null}
                {artifact.type === 'link' && artifact.externalUrl ? (
                  <Anchor href={artifact.externalUrl} target="_blank">
                    <Group gap="xs">
                      <ExternalLink size={16} />
                      <span>{artifact.externalUrl}</span>
                    </Group>
                  </Anchor>
                ) : null}
                {artifact.file ? (
                  <Stack gap="md">
                    <Paper bg="gray.0" p="md" radius="md">
                      <Stack gap="sm">
                        {(isImageArtifact && artifactFileUrl) || artifactThumbnailUrl ? (
                          <Box
                            alt={localizedArtifact?.title ?? artifact.title}
                            component="img"
                            src={
                              isImageArtifact && artifactFileUrl
                                ? artifactFileUrl
                                : (artifactThumbnailUrl ?? undefined)
                            }
                            style={{
                              borderRadius: 'var(--mantine-radius-sm)',
                              display: 'block',
                              height: 'auto',
                              maxHeight: '70vh',
                              objectFit: 'contain',
                              width: '100%'
                            }}
                          />
                        ) : null}
                      </Stack>
                    </Paper>
                    {artifact.file.extraction?.content ? (
                      <Paper bg="gray.0" p="md" radius="md">
                        <MarkdownContent content={artifact.file.extraction.content} />
                      </Paper>
                    ) : null}
                  </Stack>
                ) : null}
                <Group justify="flex-end">
                  <Group gap="xs">
                    <ArtifactStatusIcon
                      labels={hub.artifactStatus}
                      status={artifact.status}
                    />
                    {artifact.file ? (
                      <Text c="dimmed" size="xs">
                        {formatFileSize(artifact.file.sizeBytes, locale)}
                      </Text>
                    ) : null}
                    {artifact.tags.map((tag) => (
                      <Badge color="gray" key={tag} size="sm" variant="light">
                        {artifactTagLabel(artifact, tag, locale)}
                      </Badge>
                    ))}
                    <Badge>{artifact.type}</Badge>
                  </Group>
                </Group>
              </Stack>
            </Paper>
          </GridCol>

          <GridCol span={{ base: 12, lg: 6 }}>
            <Stack gap="md" style={{ minWidth: 0 }}>
              <Paper p={0} radius="md">
                <Stack gap="md">
                  <Group gap="xs">
                    <MessageSquare size={18} />
                    <Text fw={700}>{hub.comments}</Text>
                  </Group>
                  <CommentList
                    canVote={canVote}
                    comments={comments}
                    isReplying={isReplying || isCommenting}
                    onAddReply={addReply}
                    onCommentChanged={updateComment}
                    onError={setError}
                    onSignIn={openAuthFlow}
                    topicId={params.id}
                  />
                </Stack>
              </Paper>
              <Stack gap="sm">
                <Textarea
                  onChange={(event) => setCommentBody(event.currentTarget.value)}
                  placeholder={hub.commentPlaceholder}
                  value={commentBody}
                />
                <Group justify="flex-end">
                  <Button loading={isCommenting} onClick={saveComment}>
                    {hub.addComment}
                  </Button>
                </Group>
              </Stack>
            </Stack>
          </GridCol>
        </Grid>
      ) : null}
    </Stack>
  )
}

function CommentList({
  canVote,
  comments,
  isReplying,
  onAddReply,
  onCommentChanged,
  onError,
  onSignIn,
  topicId
}: {
  canVote: boolean
  comments: HubComment[]
  isReplying: boolean
  onAddReply: (body: string, parentId: string) => Promise<boolean>
  onCommentChanged: (comment: HubComment) => void
  onError: (message: string) => void
  onSignIn: () => void
  topicId: string
}) {
  const { t } = useI18n()
  const hub = t.hub
  const rootComments = comments.filter((comment) => !comment.parentId)

  if (rootComments.length === 0) {
    return <Text c="dimmed">{hub.noComments}</Text>
  }

  return (
    <Stack gap="xs">
      {rootComments.map((comment) => (
        <CommentItem
          canVote={canVote}
          comment={comment}
          comments={comments}
          isReplying={isReplying}
          key={comment.id}
          onAddReply={onAddReply}
          onCommentChanged={onCommentChanged}
          onError={onError}
          onSignIn={onSignIn}
          topicId={topicId}
        />
      ))}
    </Stack>
  )
}

function CommentItem({
  canVote,
  comment,
  comments,
  isReplying,
  onAddReply,
  onCommentChanged,
  onError,
  onSignIn,
  topicId
}: {
  canVote: boolean
  comment: HubComment
  comments: HubComment[]
  isReplying: boolean
  onAddReply: (body: string, parentId: string) => Promise<boolean>
  onCommentChanged: (comment: HubComment) => void
  onError: (message: string) => void
  onSignIn: () => void
  topicId: string
}) {
  const { locale, t } = useI18n()
  const hub = t.hub
  const [isVoting, setIsVoting] = useState(false)
  const [isReplyOpen, setIsReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const isReply = Boolean(comment.parentId)
  const replies = comments.filter((candidate) => candidate.parentId === comment.id)

  async function vote(kind: VoteKind) {
    if (isReply) {
      return
    }

    if (!canVote) {
      onSignIn()
      return
    }

    if (
      isVoting ||
      (kind === 'upvote' && comment.viewerHasUpvoted) ||
      (kind === 'downvote' && comment.viewerHasDownvoted)
    ) {
      return
    }

    setIsVoting(true)
    onError('')
    const previousComment = comment
    onCommentChanged(applyCommentVote(comment, kind))

    try {
      const response = await fetch(
        `/api/hub/topics/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(
          comment.id
        )}/${kind}`,
        {
          method: 'POST'
        }
      )
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.updateCommentVoteFailed} (${response.status})`
        )
      }
    } catch (error) {
      onCommentChanged(previousComment)
      onError(error instanceof Error ? error.message : hub.updateCommentVoteFailed)
    } finally {
      setIsVoting(false)
    }
  }

  async function saveReply() {
    const isSaved = await onAddReply(replyBody, comment.id)

    if (isSaved) {
      setReplyBody('')
      setIsReplyOpen(false)
    }
  }

  return (
    <Stack gap="xs">
      <Group align="stretch" gap="sm" wrap="nowrap">
        {isReply ? null : (
          <Stack align="center" gap={1} miw={28} pt={4}>
            <ActionIcon
              aria-disabled={comment.viewerHasUpvoted}
              aria-label={hub.upvoteComment}
              color={comment.viewerHasUpvoted ? 'green' : 'gray'}
              disabled={isVoting}
              onClick={() => void vote('upvote')}
              size="sm"
              variant={comment.viewerHasUpvoted ? 'light' : 'subtle'}
            >
              <ChevronUp size={16} />
            </ActionIcon>
            <Text fw={700} size="xs">
              {comment.upvoteCount - comment.downvoteCount}
            </Text>
            <ActionIcon
              aria-disabled={comment.viewerHasDownvoted}
              aria-label={hub.downvoteComment}
              color={comment.viewerHasDownvoted ? 'red' : 'gray'}
              disabled={isVoting}
              onClick={() => void vote('downvote')}
              size="sm"
              variant={comment.viewerHasDownvoted ? 'light' : 'subtle'}
            >
              <ChevronDown size={16} />
            </ActionIcon>
          </Stack>
        )}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Paper bg="gray.0" p="sm" radius="md">
            <Stack gap={6}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {localizeHubComment(comment, locale).body}
              </Text>
              <Text c="dimmed" size="xs">
                {comment.author.name}
              </Text>
            </Stack>
          </Paper>
          <Group justify="flex-start">
            <Button
              onClick={() => {
                if (!canVote) {
                  onSignIn()
                  return
                }

                setIsReplyOpen((isOpen) => !isOpen)
              }}
              rightSection={
                isReplyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />
              }
              size="compact-xs"
              variant="subtle"
            >
              {hub.reply}
            </Button>
          </Group>
        </Stack>
      </Group>
      {isReplyOpen ? (
        <Stack gap="xs" pl={38}>
          <Textarea
            minRows={2}
            onChange={(event) => setReplyBody(event.currentTarget.value)}
            placeholder={hub.replyPlaceholder}
            size="sm"
            value={replyBody}
          />
          <Group justify="flex-end">
            <Button disabled={isReplying} onClick={saveReply} size="xs">
              {hub.reply}
            </Button>
          </Group>
        </Stack>
      ) : null}
      {replies.length > 0 ? (
        <Stack gap="xs" pl={38}>
          {replies.map((reply) => (
            <CommentItem
              canVote={canVote}
              comment={reply}
              comments={comments}
              isReplying={isReplying}
              key={reply.id}
              onAddReply={onAddReply}
              onCommentChanged={onCommentChanged}
              onError={onError}
              onSignIn={onSignIn}
              topicId={topicId}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}

function artifactTagLabel(artifact: HubArtifact, tag: string, locale: string) {
  const labels = artifact.tagLabels[tag]
  return labels?.[locale] ?? labels?.en ?? tag
}

function applyCommentVote(comment: HubComment, kind: VoteKind): HubComment {
  if (kind === 'upvote') {
    return {
      ...comment,
      downvoteCount: comment.viewerHasDownvoted
        ? Math.max(0, comment.downvoteCount - 1)
        : comment.downvoteCount,
      upvoteCount: comment.upvoteCount + 1,
      viewerHasDownvoted: false,
      viewerHasUpvoted: true
    }
  }

  return {
    ...comment,
    downvoteCount: comment.downvoteCount + 1,
    upvoteCount: comment.viewerHasUpvoted
      ? Math.max(0, comment.upvoteCount - 1)
      : comment.upvoteCount,
    viewerHasDownvoted: true,
    viewerHasUpvoted: false
  }
}
