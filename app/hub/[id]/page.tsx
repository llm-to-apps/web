'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  FileInput,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
  Textarea
} from '@mantine/core'
import {
  ArrowBigDown,
  ArrowBigUp,
  ChevronRight,
  File,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  MessagesSquare,
  MessageSquare,
  Plus
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { useAuthModal } from '@/app/_components/auth-modal-provider'
import { BreadcrumbLabel } from '@/app/_components/breadcrumb-label'
import { useI18n } from '@/app/_components/i18n-provider'
import { ModalTitle } from '@/app/_components/modal-title'
import { useSession } from '@/app/_components/session-provider'
import { ArtifactStatusIcon } from '@/app/hub/_components/artifact-status-icon'
import { localizeHubComment } from '@/app/hub/_utils/localize-comment'
import { localizeHubTopic } from '@/app/hub/_utils/localize-topic'
import { waitForHubUiDelay } from '@/app/hub/_utils/ui-delay'
import type { ApiResponse } from '@/shared/api'
import type { HubArtifact, HubComment, HubTopicDetail } from '@/app/hub/types'

type TopicResponse = ApiResponse<{
  topic: HubTopicDetail
}>

type VoteKind = 'downvote' | 'upvote'

export default function HubTopicPage() {
  const params = useParams<{ id: string }>()
  const topicId = params.id
  const session = useSession()
  const { openAuthModal } = useAuthModal()
  const { locale, t } = useI18n()
  const hub = t.hub
  const canInteract = session.status === 'authenticated' && session.data.user.onboarded
  const [artifactFiles, setArtifactFiles] = useState<File[]>([])
  const [artifactText, setArtifactText] = useState('')
  const [artifactType, setArtifactType] = useState('text')
  const [artifactUrl, setArtifactUrl] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isArtifactModalOpen, setIsArtifactModalOpen] = useState(false)
  const [isCommenting, setIsCommenting] = useState(false)
  const [isSavingArtifact, setIsSavingArtifact] = useState(false)
  const [isVoting, setIsVoting] = useState(false)
  const [topic, setTopic] = useState<HubTopicDetail | null>(null)
  const hasPassedInitialUiDelayRef = useRef(false)
  const localizedTopic = topic ? localizeHubTopic(topic, locale) : null

  const loadTopic = useCallback(async () => {
    setError(null)

    try {
      const response = await fetch(`/api/hub/topics/${encodeURIComponent(topicId)}`, {
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as TopicResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.loadTopicFailed} (${response.status})`
        )
      }

      if (!hasPassedInitialUiDelayRef.current) {
        await waitForHubUiDelay()
        hasPassedInitialUiDelayRef.current = true
      }

      setTopic(payload.data.topic)
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.loadTopicFailed)
    }
  }, [hub.loadTopicFailed, topicId])

  useEffect(() => {
    void loadTopic()
  }, [loadTopic])

  useEffect(() => {
    const source = new EventSource(
      `/api/hub/topics/${encodeURIComponent(topicId)}/events`
    )

    source.addEventListener('artifact_changed', () => {
      void loadTopic()
    })

    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
    }
  }, [loadTopic, topicId])

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

  async function saveArtifact(filesOverride = artifactFiles) {
    if (!canInteract) {
      openAuthModal()
      return
    }

    if (isSavingArtifact) {
      return
    }

    setIsSavingArtifact(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set('type', artifactType)
      formData.set('textContent', artifactText)
      formData.set('externalUrls', artifactUrl)

      for (const file of filesOverride) {
        formData.append('files', file)
      }

      const response = await fetch(
        `/api/hub/topics/${encodeURIComponent(topicId)}/artifacts`,
        {
          body: formData,
          method: 'POST'
        }
      )
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.saveArtifactFailed} (${response.status})`
        )
      }

      setArtifactFiles([])
      setArtifactText('')
      setArtifactUrl('')
      setIsArtifactModalOpen(false)
      await loadTopic()
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.saveArtifactFailed)
    } finally {
      setIsSavingArtifact(false)
    }
  }

  async function addComment(body: string, parentId: string | null = null) {
    if (!canInteract) {
      openAuthModal()
      return false
    }

    if (isCommenting) {
      return false
    }

    setIsCommenting(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/hub/topics/${encodeURIComponent(topicId)}/comments`,
        {
          body: JSON.stringify({
            artifactId: null,
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

      await loadTopic()
      return true
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.addCommentFailed)
      return false
    } finally {
      setIsCommenting(false)
    }
  }

  async function saveComment() {
    const isSaved = await addComment(commentBody)

    if (isSaved) {
      setCommentBody('')
    }
  }

  async function vote(kind: VoteKind) {
    if (!canInteract) {
      openAuthModal()
      return
    }

    if (
      !topic ||
      isVoting ||
      (kind === 'upvote' && topic.viewerHasUpvoted) ||
      (kind === 'downvote' && topic.viewerHasDownvoted)
    ) {
      return
    }

    setIsVoting(true)
    setError(null)
    const previousTopic = topic
    setTopic(applyTopicVote(topic, kind))

    try {
      const response = await fetch(
        `/api/hub/topics/${encodeURIComponent(topic.id)}/${kind}`,
        {
          method: 'POST'
        }
      )
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.updateVoteFailed} (${response.status})`
        )
      }
    } catch (error) {
      setTopic(previousTopic)
      setError(error instanceof Error ? error.message : hub.updateVoteFailed)
    } finally {
      setIsVoting(false)
    }
  }

  return (
    <Stack gap="md">
      <Breadcrumbs separator={<ChevronRight size={14} />}>
        <Button
          component={Link}
          href="/hub"
          leftSection={<MessagesSquare size={15} />}
          size="compact-sm"
          variant="subtle"
        >
          {hub.title}
        </Button>
        {localizedTopic ? (
          <BreadcrumbLabel>{localizedTopic.title}</BreadcrumbLabel>
        ) : null}
      </Breadcrumbs>
      {localizedTopic ? (
        <div>
          <Title order={1}>{localizedTopic.title}</Title>
          {localizedTopic.intent ? <Text c="dimmed">{localizedTopic.intent}</Text> : null}
        </div>
      ) : (
        <Stack gap="xs">
          <Skeleton height={44} radius="sm" maw={420} />
          <Skeleton height={20} radius="sm" maw={720} />
        </Stack>
      )}
      {error ? <Alert color="red">{error}</Alert> : null}
      {!topic ? <Skeleton height={360} radius="md" /> : null}
      {topic ? (
        <SimpleGrid cols={{ base: 1, lg: 4 }} spacing="md">
          <Stack gap="md" style={{ gridColumn: 'span 3' }}>
            <Group align="stretch" gap="sm" wrap="nowrap">
              <Stack align="center" gap={2} miw={34} pt="sm">
                <ActionIcon
                  aria-disabled={topic.viewerHasUpvoted}
                  aria-label={hub.upvote}
                  color={topic.viewerHasUpvoted ? 'green' : 'gray'}
                  disabled={isVoting}
                  onClick={() => void vote('upvote')}
                  variant={topic.viewerHasUpvoted ? 'light' : 'subtle'}
                >
                  <ArrowBigUp size={20} />
                </ActionIcon>
                <Text fw={700} size="sm">
                  {topic.upvoteCount - topic.downvoteCount}
                </Text>
                <ActionIcon
                  aria-disabled={topic.viewerHasDownvoted}
                  aria-label={hub.downvote}
                  color={topic.viewerHasDownvoted ? 'red' : 'gray'}
                  disabled={isVoting}
                  onClick={() => void vote('downvote')}
                  variant={topic.viewerHasDownvoted ? 'light' : 'subtle'}
                >
                  <ArrowBigDown size={20} />
                </ActionIcon>
              </Stack>
              <Paper withBorder p="md" radius="md" style={{ flex: 1, minWidth: 0 }}>
                <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
                  <Group>
                    <Badge variant="light">
                      {topicStatusLabel(topic.status, hub.status)}
                    </Badge>
                  </Group>
                  <Group gap="xs">
                    <Badge color={topic.category === 'business' ? 'blue' : 'teal'}>
                      {categoryLabel(topic.category, hub.company)}
                    </Badge>
                    {topic.tags.map((tag) => (
                      <Badge color="gray" key={tag} variant="light">
                        {topicTagLabel(topic, tag, locale)}
                      </Badge>
                    ))}
                  </Group>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{localizedTopic?.intent}</Text>
                  <Group justify="flex-end">
                    <Text c="dimmed" size="sm">
                      {topic.author.name}
                    </Text>
                  </Group>
                </Stack>
              </Paper>
            </Group>

            <Paper p={0} radius="md">
              <Stack gap="md">
                <Group gap="xs">
                  <MessageSquare size={18} />
                  <Text fw={700}>{hub.comments}</Text>
                </Group>
                <CommentList
                  canVote={canInteract}
                  comments={topic.comments.filter((comment) => !comment.artifactId)}
                  isReplying={isCommenting}
                  onAddReply={addComment}
                  onCommentChanged={updateComment}
                  onError={setError}
                  onSignIn={openAuthModal}
                  topicId={topic.id}
                />
              </Stack>
            </Paper>

            <Stack gap="sm">
              {canInteract ? (
                <>
                  <Textarea
                    autosize
                    minRows={3}
                    onChange={(event) => setCommentBody(event.currentTarget.value)}
                    placeholder={hub.commentPlaceholder}
                    value={commentBody}
                  />
                  <Group justify="flex-end">
                    <Button loading={isCommenting} onClick={saveComment}>
                      {hub.addComment}
                    </Button>
                  </Group>
                </>
              ) : (
                <SignInPanel onSignIn={openAuthModal} text={hub.signInToDiscuss} />
              )}
            </Stack>
          </Stack>

          <Stack gap="md">
            <Group justify="flex-end">
              {canInteract ? (
                <Button
                  leftSection={<Plus size={16} />}
                  onClick={() => setIsArtifactModalOpen(true)}
                  size="sm"
                >
                  {hub.addArtifacts}
                </Button>
              ) : null}
            </Group>
            {!canInteract ? (
              <SignInPanel onSignIn={openAuthModal} text={hub.signInToInteract} />
            ) : null}
            {topic.artifacts.length === 0 ? (
              <Text c="dimmed" size="sm">
                {hub.noArtifacts}
              </Text>
            ) : null}
            {topic.artifacts.map((artifact) => (
              <ArtifactCard
                artifact={artifact}
                commentCount={artifact.commentCount}
                key={artifact.id}
                locale={locale}
                statusLabels={hub.artifactStatus}
                topicId={topic.slug ?? topic.id}
              />
            ))}
          </Stack>
        </SimpleGrid>
      ) : null}
      <Modal
        centered
        onClose={() => setIsArtifactModalOpen(false)}
        opened={isArtifactModalOpen}
        size="md"
        title={<ModalTitle icon={<Plus size={16} />}>{hub.addArtifact}</ModalTitle>}
      >
        <Stack gap="md">
          <SegmentedControl
            data={[
              { label: hub.artifactTypeText, value: 'text' },
              { label: hub.artifactTypeLink, value: 'link' },
              { label: hub.artifactTypeFile, value: 'file' }
            ]}
            onChange={setArtifactType}
            value={artifactType}
          />
          {artifactType === 'text' ? (
            <Textarea
              autosize
              aria-label={hub.artifactTextAria}
              minRows={7}
              onChange={(event) => setArtifactText(event.currentTarget.value)}
              placeholder={hub.artifactTextPlaceholder}
              value={artifactText}
            />
          ) : null}
          {artifactType === 'link' ? (
            <Textarea
              autosize
              aria-label={hub.artifactUrlAria}
              minRows={6}
              onChange={(event) => setArtifactUrl(event.currentTarget.value)}
              placeholder={hub.artifactUrlsPlaceholder}
              value={artifactUrl}
            />
          ) : null}
          {artifactType === 'file' ? (
            <FileInput
              aria-label={hub.artifactFilesAria}
              disabled={isSavingArtifact}
              multiple
              onChange={(nextFiles) => {
                const files = nextFiles ?? []
                setArtifactFiles(files)

                if (files.length > 0) {
                  void saveArtifact(files)
                }
              }}
              placeholder={hub.artifactFilesPlaceholder}
              value={artifactFiles}
            />
          ) : null}
          <Group justify="flex-end">
            <Button
              disabled={isSavingArtifact}
              onClick={() => setIsArtifactModalOpen(false)}
              variant="default"
            >
              {hub.cancel}
            </Button>
            {artifactType !== 'file' ? (
              <Button
                leftSection={<Plus size={16} />}
                loading={isSavingArtifact}
                onClick={() => void saveArtifact()}
              >
                {hub.addArtifact}
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

function ArtifactCard({
  artifact,
  commentCount,
  locale,
  statusLabels,
  topicId
}: {
  artifact: HubArtifact
  commentCount: number
  locale: string
  statusLabels: {
    analyzing: string
    checked: string
    error: string
  }
  topicId: string
}) {
  const icon =
    artifact.type === 'link' ? (
      <LinkIcon size={18} />
    ) : artifact.type === 'file' && artifact.file?.mimeType.startsWith('image/') ? (
      <ImageIcon size={20} />
    ) : artifact.type === 'file' ? (
      <File size={18} />
    ) : (
      <FileText size={18} />
    )
  const isImageArtifact =
    artifact.type === 'file' && artifact.file?.mimeType.startsWith('image/')
  const artifactReference = artifact.slug ?? artifact.id
  const fileUrl = `/api/hub/topics/${encodeURIComponent(topicId)}/artifacts/${encodeURIComponent(
    artifactReference
  )}/file`
  const thumbnailUrl = artifact.file?.thumbnail
    ? `/api/hub/topics/${encodeURIComponent(topicId)}/artifacts/${encodeURIComponent(
        artifactReference
      )}/thumbnail`
    : null
  const previewUrl = thumbnailUrl ?? (isImageArtifact ? fileUrl : null)

  return (
    <Card
      component={Link}
      href={`/hub/${topicId}/artifacts/${artifactReference}`}
      p="sm"
      radius="md"
      shadow="none"
      style={{ color: 'inherit', textDecoration: 'none' }}
      withBorder
    >
      <Stack gap="sm">
        <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
          <Box component="span" style={{ display: 'inline-flex', flexShrink: 0 }}>
            {icon}
          </Box>
          <Text fw={700} lineClamp={1}>
            {artifact.title}
          </Text>
        </Group>
        {previewUrl ? (
          <Box
            alt={artifact.title}
            component="img"
            src={previewUrl}
            style={{
              aspectRatio: '16 / 9',
              backgroundColor: 'var(--mantine-color-gray-1)',
              borderRadius: 'var(--mantine-radius-sm)',
              objectFit: 'cover'
            }}
            w="100%"
          />
        ) : null}
        {artifact.description ? (
          <Text c="dimmed" lineClamp={2} size="sm">
            {artifact.description}
          </Text>
        ) : null}
        {artifact.file && !previewUrl ? (
          <Text c="dimmed" lineClamp={1} size="sm">
            {artifact.file.name}
          </Text>
        ) : null}
        <Group justify="space-between">
          <Group gap={4}>
            <ArtifactStatusIcon labels={statusLabels} status={artifact.status} />
            {artifact.tags.map((tag) => (
              <Badge color="gray" key={tag} size="xs" variant="light">
                {artifactTagLabel(artifact, tag, locale)}
              </Badge>
            ))}
          </Group>
          <Group c="dimmed" gap={6}>
            <MessageSquare size={14} />
            <Text size="xs">{commentCount}</Text>
          </Group>
        </Group>
      </Stack>
    </Card>
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
    return (
      <Text c="dimmed" size="sm">
        {hub.noComments}
      </Text>
    )
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
              <ArrowBigUp size={16} />
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
              <ArrowBigDown size={16} />
            </ActionIcon>
          </Stack>
        )}
        <Paper bg="gray.0" p="sm" radius="md" style={{ flex: 1, minWidth: 0 }}>
          <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {localizeHubComment(comment, locale).body}
            </Text>
            <Group justify="space-between">
              <Button
                onClick={() => {
                  if (!canVote) {
                    onSignIn()
                    return
                  }

                  setIsReplyOpen((isOpen) => !isOpen)
                }}
                size="compact-xs"
                variant="subtle"
              >
                {hub.reply}
              </Button>
              <Text c="dimmed" size="xs">
                {comment.author.name}
              </Text>
            </Group>
          </Stack>
        </Paper>
      </Group>
      {isReplyOpen ? (
        <Stack gap="xs" pl={38}>
          <Textarea
            autosize
            minRows={2}
            onChange={(event) => setReplyBody(event.currentTarget.value)}
            placeholder={hub.replyPlaceholder}
            size="sm"
            value={replyBody}
          />
          <Group justify="flex-end">
            <Button onClick={() => setIsReplyOpen(false)} size="xs" variant="default">
              {hub.cancel}
            </Button>
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

function SignInPanel({ onSignIn, text }: { onSignIn: () => void; text: string }) {
  const { t } = useI18n()
  return (
    <Paper bg="gray.0" p="md" radius="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {text}
        </Text>
        <Button onClick={onSignIn} size="xs" variant="light">
          {t.hub.signIn}
        </Button>
      </Group>
    </Paper>
  )
}

function categoryLabel(category: string, companyLabel: string) {
  return category === 'business' ? companyLabel : category
}

function topicTagLabel(topic: HubTopicDetail, tag: string, locale: string) {
  const labels = topic.tagLabels[tag]
  return labels?.[locale] ?? labels?.en ?? tag
}

function artifactTagLabel(artifact: HubArtifact, tag: string, locale: string) {
  const labels = artifact.tagLabels[tag]
  return labels?.[locale] ?? labels?.en ?? tag
}

function applyTopicVote(topic: HubTopicDetail, kind: VoteKind): HubTopicDetail {
  if (kind === 'upvote') {
    return {
      ...topic,
      downvoteCount: topic.viewerHasDownvoted
        ? Math.max(0, topic.downvoteCount - 1)
        : topic.downvoteCount,
      upvoteCount: topic.upvoteCount + 1,
      viewerHasDownvoted: false,
      viewerHasUpvoted: true
    }
  }

  return {
    ...topic,
    downvoteCount: topic.downvoteCount + 1,
    upvoteCount: topic.viewerHasUpvoted
      ? Math.max(0, topic.upvoteCount - 1)
      : topic.upvoteCount,
    viewerHasDownvoted: true,
    viewerHasUpvoted: false
  }
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

function topicStatusLabel(
  status: string,
  labels: {
    analyzing: string
    inDevelopment: string
    discussing: string
    developed: string
  }
) {
  switch (status) {
    case 'analyzing':
      return labels.analyzing
    case 'discussing':
      return labels.discussing
    case 'in_development':
      return labels.inDevelopment
    case 'developed':
      return labels.developed
    default:
      return status
  }
}
