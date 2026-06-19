'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Title
} from '@mantine/core'
import { ArrowBigDown, ArrowBigUp, FileText, MessageSquare, Plus } from 'lucide-react'
import { useAuthModal } from '../_components/auth-modal-provider'
import { useI18n } from '../_components/i18n-provider'
import { useSession } from '../_components/session-provider'
import { localizeHubTopic } from './_utils/localize-topic'
import { waitForHubUiDelay } from './_utils/ui-delay'
import styles from './page.module.css'
import type { ApiResponse } from '@/shared/api'
import type { HubTag, HubTopicListItem } from '@/app/hub/types'

type TopicsResponse = ApiResponse<{
  tags: HubTag[]
  topics: HubTopicListItem[]
}>

type VoteKind = 'downvote' | 'upvote'
type StatusFilterOption = {
  label: string
  value: string
}

const redditEpochSeconds = 1134028003
const redditHotScaleSeconds = 45000
const hubCategoryStorageKey = 'os7_hub_category'
const allHubStatusFilter = 'all'
const hubTopicStatuses = [
  'analyzing',
  'discussing',
  'in_development',
  'developed'
] as const

export default function HubPage() {
  const [categoryFilter, setCategoryFilter] = useState('personal')
  const [error, setError] = useState<string | null>(null)
  const [isUrlFilterReady, setIsUrlFilterReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(allHubStatusFilter)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [hubTags, setHubTags] = useState<HubTag[]>([])
  const [topics, setTopics] = useState<HubTopicListItem[]>([])
  const hasPassedInitialUiDelayRef = useRef(false)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useSession()
  const { locale, t } = useI18n()
  const hub = t.hub
  const { openAuthModal } = useAuthModal()
  const canCreateTopic = session.status === 'authenticated' && session.data.user.onboarded
  const canVote = canCreateTopic
  const queryString = searchParams.toString()
  const categoryFilterOptions = useMemo(
    () => [
      { label: hub.personal, value: 'personal' },
      { label: hub.company, value: 'business' }
    ],
    [hub.company, hub.personal]
  )
  const statusFilterOptions = useMemo(
    () => [
      { label: hub.allStatuses, value: allHubStatusFilter },
      { label: hub.status.analyzing, value: 'analyzing' },
      { label: hub.status.discussing, value: 'discussing' },
      { label: hub.status.inDevelopment, value: 'in_development' },
      { label: hub.status.developed, value: 'developed' }
    ],
    [
      hub.allStatuses,
      hub.status.analyzing,
      hub.status.developed,
      hub.status.discussing,
      hub.status.inDevelopment
    ]
  )

  const loadTopics = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/hub/topics', { cache: 'no-store' })
      const payload = (await response.json().catch(() => null)) as TopicsResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${hub.loadFailed} (${response.status})`
        )
      }

      if (!hasPassedInitialUiDelayRef.current) {
        await waitForHubUiDelay()
        hasPassedInitialUiDelayRef.current = true
      }

      setTopics(payload.data.topics)
      setHubTags(payload.data.tags)
    } catch (error) {
      setError(error instanceof Error ? error.message : hub.loadFailed)
    } finally {
      setIsLoading(false)
    }
  }, [hub.loadFailed])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  useEffect(() => {
    const urlCategoryFilter = searchParams.get('for')
    const nextCategoryFilter = urlCategoryFilter
      ? categoryFilterFromUrl(urlCategoryFilter)
      : readStoredCategoryFilter()
    const nextStatusFilter = statusFilterFromUrl(searchParams.get('status'))
    const nextTagFilter = tagFilterFromUrl(searchParams)

    setCategoryFilter((currentCategoryFilter) =>
      currentCategoryFilter === nextCategoryFilter
        ? currentCategoryFilter
        : nextCategoryFilter
    )
    setTagFilter((currentTagFilter) =>
      currentTagFilter === nextTagFilter ? currentTagFilter : nextTagFilter
    )
    setStatusFilter((currentStatusFilter) =>
      currentStatusFilter === nextStatusFilter ? currentStatusFilter : nextStatusFilter
    )
    setIsUrlFilterReady(true)
  }, [queryString, searchParams])

  useEffect(() => {
    if (!isUrlFilterReady) {
      return
    }

    writeStoredCategoryFilter(categoryFilter)

    const nextSearchParams = new URLSearchParams(searchParams.toString())
    const categoryUrlValue = categoryFilterToUrl(categoryFilter)

    if (categoryUrlValue) {
      nextSearchParams.set('for', categoryUrlValue)
    } else {
      nextSearchParams.delete('for')
    }

    nextSearchParams.delete('tags')

    if (tagFilter) {
      nextSearchParams.set('tag', tagFilter)
    } else {
      nextSearchParams.delete('tag')
    }

    if (statusFilter === allHubStatusFilter) {
      nextSearchParams.delete('status')
    } else {
      nextSearchParams.set('status', statusFilter)
    }

    const nextQueryString = nextSearchParams.toString()

    if (nextQueryString !== queryString) {
      router.replace(`${pathname}${nextQueryString ? `?${nextQueryString}` : ''}`, {
        scroll: false
      })
    }
  }, [
    categoryFilter,
    isUrlFilterReady,
    pathname,
    queryString,
    router,
    searchParams,
    statusFilter,
    tagFilter
  ])

  const updateTopic = useCallback((nextTopic: HubTopicListItem) => {
    setTopics((currentTopics) =>
      sortHubTopicsByHot(
        currentTopics.map((topic) => (topic.id === nextTopic.id ? nextTopic : topic))
      )
    )
  }, [])

  const availableTags = useMemo(
    () => hubTags.filter((tag) => tag.category === categoryFilter),
    [categoryFilter, hubTags]
  )
  const tagLabels = useMemo(
    () => new Map(hubTags.map((tag) => [tag.slug, hubTagLabel(tag, locale)])),
    [hubTags, locale]
  )

  useEffect(() => {
    const availableSlugs = new Set(availableTags.map((tag) => tag.slug))
    setTagFilter((currentTag) =>
      currentTag && availableSlugs.has(currentTag) ? currentTag : null
    )
  }, [availableTags, categoryFilter])

  const toggleTagFilter = useCallback((tag: string) => {
    setTagFilter((currentTag) => (currentTag === tag ? null : tag))
  }, [])

  const filteredTopics = useMemo(
    () =>
      topics.filter((topic) => {
        const matchesCategory = topic.category === categoryFilter
        const matchesTag = !tagFilter || topic.tags.includes(tagFilter)
        const matchesStatus =
          statusFilter === allHubStatusFilter || topic.status === statusFilter

        return matchesCategory && matchesTag && matchesStatus
      }),
    [categoryFilter, statusFilter, tagFilter, topics]
  )

  return (
    <Stack gap="md">
      <Group align="flex-start" justify="space-between">
        <div>
          <Title order={2}>{hub.title}</Title>
          <Text c="dimmed">{hub.description}</Text>
        </div>
        <NewTopicButton
          canCreateTopic={canCreateTopic}
          label={hub.newTopic}
          onSignIn={openAuthModal}
        />
      </Group>

      <StatusFilterTabs
        onChange={setStatusFilter}
        options={statusFilterOptions}
        value={statusFilter}
      />

      <Group align="center" gap="xs">
        <SegmentedControl
          data={categoryFilterOptions}
          onChange={setCategoryFilter}
          size="sm"
          value={categoryFilter}
        />
        <Group gap={6} style={{ flex: 1, minWidth: 180 }}>
          {availableTags.length === 0 ? (
            <Text c="dimmed" size="xs">
              {hub.noTags}
            </Text>
          ) : (
            availableTags.map((tag) => {
              const isSelected = tagFilter === tag.slug

              return (
                <Badge
                  component="button"
                  key={`${tag.category}:${tag.slug}`}
                  onClick={() => toggleTagFilter(tag.slug)}
                  size="sm"
                  style={{
                    cursor: 'pointer',
                    fontSize: 11,
                    height: 22,
                    paddingInline: 8
                  }}
                  type="button"
                  variant="light"
                  color={isSelected ? 'green' : 'gray'}
                >
                  {hubTagLabel(tag, locale)}
                </Badge>
              )
            })
          )}
        </Group>
      </Group>

      {error ? <Alert color="red">{error}</Alert> : null}
      {isLoading ? (
        <>
          <Skeleton height={164} radius="md" />
          <Skeleton height={164} radius="md" />
        </>
      ) : null}
      {!isLoading && topics.length === 0 ? (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text fw={700}>{hub.noTopicsTitle}</Text>
            <Text c="dimmed">{hub.noTopicsDescription}</Text>
            <Group>
              <NewTopicButton
                canCreateTopic={canCreateTopic}
                label={hub.newTopic}
                onSignIn={openAuthModal}
              />
            </Group>
          </Stack>
        </Paper>
      ) : null}
      {!isLoading && topics.length > 0 && filteredTopics.length === 0 ? (
        <Paper withBorder p="md" radius="md">
          <Text c="dimmed">{hub.noTopicsMatch}</Text>
        </Paper>
      ) : null}
      {filteredTopics.map((topic) => (
        <TopicCard
          canVote={canVote}
          key={topic.id}
          onError={setError}
          onSignIn={openAuthModal}
          onTopicChanged={updateTopic}
          tagLabels={tagLabels}
          labels={{
            company: hub.company,
            downvote: hub.downvote,
            updateVoteFailed: hub.updateVoteFailed,
            upvote: hub.upvote,
            status: hub.status
          }}
          locale={locale}
          topic={topic}
        />
      ))}
    </Stack>
  )
}

function StatusFilterTabs({
  onChange,
  options,
  value
}: {
  onChange: (value: string) => void
  options: StatusFilterOption[]
  value: string
}) {
  return (
    <div aria-label="Topic status" className={styles.statusTabs} role="tablist">
      {options.map((option) => {
        const isSelected = option.value === value

        return (
          <button
            aria-selected={isSelected}
            className={styles.statusTab}
            data-active={isSelected}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const TopicCard = memo(function TopicCard({
  canVote,
  onError,
  onSignIn,
  onTopicChanged,
  tagLabels,
  labels,
  locale,
  topic
}: {
  canVote: boolean
  onError: (message: string) => void
  onSignIn: () => void
  onTopicChanged: (topic: HubTopicListItem) => void
  tagLabels: Map<string, string>
  labels: {
    company: string
    downvote: string
    updateVoteFailed: string
    upvote: string
    status: {
      analyzing: string
      inDevelopment: string
      discussing: string
      developed: string
    }
  }
  locale: string
  topic: HubTopicListItem
}) {
  const [isVoting, setIsVoting] = useState(false)
  const localizedTopic = localizeHubTopic(topic, locale)
  const score = (topic.upvoteCount ?? 0) - (topic.downvoteCount ?? 0)
  const isUpvoteDisabled = isVoting
  const isDownvoteDisabled = isVoting

  async function vote(kind: VoteKind) {
    if (!canVote) {
      onSignIn()
      return
    }

    if (
      isVoting ||
      (kind === 'upvote' && topic.viewerHasUpvoted) ||
      (kind === 'downvote' && topic.viewerHasDownvoted)
    ) {
      return
    }

    setIsVoting(true)
    onError('')
    const previousTopic = topic
    const nextTopic = applyTopicVote(topic, kind)
    onTopicChanged(nextTopic)

    try {
      const isRemoving =
        kind === 'upvote' ? topic.viewerHasUpvoted : topic.viewerHasDownvoted
      const response = await fetch(
        `/api/hub/topics/${encodeURIComponent(topic.id)}/${kind}`,
        {
          method: isRemoving ? 'DELETE' : 'POST'
        }
      )
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `${labels.updateVoteFailed} (${response.status})`
        )
      }
    } catch (error) {
      onTopicChanged(previousTopic)
      onError(error instanceof Error ? error.message : labels.updateVoteFailed)
    } finally {
      setIsVoting(false)
    }
  }

  function handleVoteClick(event: React.MouseEvent<HTMLButtonElement>, kind: VoteKind) {
    event.preventDefault()
    event.stopPropagation()
    void vote(kind)
  }

  return (
    <Group align="stretch" gap="sm" wrap="nowrap">
      <Stack align="center" gap={2} miw={34} pt="sm">
        <ActionIcon
          aria-disabled={topic.viewerHasUpvoted}
          aria-label={labels.upvote}
          color={topic.viewerHasUpvoted ? 'green' : 'gray'}
          disabled={isUpvoteDisabled}
          onClick={(event) => handleVoteClick(event, 'upvote')}
          variant={topic.viewerHasUpvoted ? 'light' : 'subtle'}
        >
          <ArrowBigUp size={20} />
        </ActionIcon>
        <Text fw={700} size="sm">
          {score}
        </Text>
        <ActionIcon
          aria-disabled={topic.viewerHasDownvoted}
          aria-label={labels.downvote}
          color={topic.viewerHasDownvoted ? 'red' : 'gray'}
          disabled={isDownvoteDisabled}
          onClick={(event) => handleVoteClick(event, 'downvote')}
          variant={topic.viewerHasDownvoted ? 'light' : 'subtle'}
        >
          <ArrowBigDown size={20} />
        </ActionIcon>
      </Stack>

      <Card
        component={Link}
        href={`/hub/${topic.slug ?? topic.id}`}
        p="md"
        radius="md"
        style={{ color: 'inherit', flex: 1, minWidth: 0, textDecoration: 'none' }}
        withBorder
      >
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text fw={800} lineClamp={1} size="lg">
                {localizedTopic.title}
              </Text>
            </Stack>
            <Badge variant="light">{topicStatusLabel(topic.status, labels.status)}</Badge>
          </Group>
          <Text c="dimmed" lineClamp={3} size="sm">
            {localizedTopic.intent}
          </Text>
          <Group gap="xs">
            <Badge
              color={topic.category === 'business' ? 'blue' : 'teal'}
              variant="light"
            >
              {categoryLabel(topic.category, labels.company)}
            </Badge>
            {topic.tags.map((tag) => (
              <Badge color="gray" key={tag} variant="light">
                {tagLabels.get(tag) ?? tag}
              </Badge>
            ))}
          </Group>
          <Group justify="space-between">
            <Text c="dimmed" size="sm">
              {topic.author.name}
            </Text>
            <Group c="dimmed" gap="md">
              <Group gap={6}>
                <FileText size={16} />
                <Text size="sm">{topic.artifactCount}</Text>
              </Group>
              <Group gap={6}>
                <MessageSquare size={16} />
                <Text size="sm">{topic.commentCount}</Text>
              </Group>
            </Group>
          </Group>
        </Stack>
      </Card>
    </Group>
  )
})

TopicCard.displayName = 'TopicCard'

function applyTopicVote(topic: HubTopicListItem, kind: VoteKind): HubTopicListItem {
  if (kind === 'upvote') {
    if (topic.viewerHasUpvoted) {
      return {
        ...topic,
        upvoteCount: Math.max(0, topic.upvoteCount - 1),
        viewerHasUpvoted: false
      }
    }

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

  if (topic.viewerHasDownvoted) {
    return {
      ...topic,
      downvoteCount: Math.max(0, topic.downvoteCount - 1),
      viewerHasDownvoted: false
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

function sortHubTopicsByHot(topics: HubTopicListItem[]) {
  return [...topics].sort((left, right) => {
    const rankDifference = hubTopicHotRank(right) - hubTopicHotRank(left)

    if (rankDifference !== 0) {
      return rankDifference
    }

    const createdDifference =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()

    if (createdDifference !== 0) {
      return createdDifference
    }

    return left.id.localeCompare(right.id)
  })
}

function hubTopicHotRank(topic: HubTopicListItem) {
  const score = topic.upvoteCount - topic.downvoteCount
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0
  const order = Math.log10(Math.max(Math.abs(score), 1))
  const createdAtSeconds = new Date(topic.createdAt).getTime() / 1000

  return sign * order + (createdAtSeconds - redditEpochSeconds) / redditHotScaleSeconds
}

function hubTagLabel(tag: HubTag, locale: string) {
  return tag.labels[locale] ?? tag.labels.en ?? tag.slug
}

function NewTopicButton({
  canCreateTopic,
  label,
  onSignIn
}: {
  canCreateTopic: boolean
  label: string
  onSignIn: () => void
}) {
  if (canCreateTopic) {
    return (
      <Button component={Link} href="/hub/new" leftSection={<Plus size={16} />}>
        {label}
      </Button>
    )
  }

  return (
    <Button leftSection={<Plus size={16} />} onClick={onSignIn}>
      {label}
    </Button>
  )
}

function categoryLabel(category: string, companyLabel: string) {
  return category === 'business' ? companyLabel : category
}

function categoryFilterFromUrl(value: string | null) {
  if (value === 'company') {
    return 'business'
  }

  if (value === 'personal') {
    return 'personal'
  }

  return 'personal'
}

function readStoredCategoryFilter() {
  if (typeof window === 'undefined') {
    return 'personal'
  }

  try {
    return categoryFilterFromUrl(window.localStorage.getItem(hubCategoryStorageKey))
  } catch {
    return 'personal'
  }
}

function writeStoredCategoryFilter(category: string) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      hubCategoryStorageKey,
      categoryFilterToUrl(category) ?? 'personal'
    )
  } catch {
    // Ignore storage failures, for example in private browsing modes.
  }
}

function categoryFilterToUrl(category: string) {
  if (category === 'business') {
    return 'company'
  }

  if (category === 'personal') {
    return 'personal'
  }

  return null
}

function statusFilterFromUrl(value: string | null) {
  if (!value) {
    return allHubStatusFilter
  }

  return hubTopicStatuses.some((status) => status === value) ? value : allHubStatusFilter
}

function tagFilterFromUrl(searchParams: URLSearchParams) {
  const value = searchParams.get('tag')
  const tag = value?.trim()

  return tag || null
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
