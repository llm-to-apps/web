'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { ChevronRight, MessageCircle, Search } from 'lucide-react'
import { AppIcon } from '@/app/_components/app-icon'
import { InstallButton } from '@/app/store/install-button'
import { useI18n } from '@/app/_components/i18n-provider'
import type { ApiResponse } from '@/shared/api'

type StoreTemplate = {
  id: string
  name: string
  description: string
  icon: string | null
  status: string
  git: string | null
  hubTopicId: string | null
  image: string | null
  appPort: number | null
  agentPort: number | null
  translations: Record<
    string,
    {
      description: string
      name: string
    }
  >
}

type StoreResponse = ApiResponse<{ templates: StoreTemplate[] }>

const companyTemplateIds = new Set(['bookingCalendar', 'kanban'])

export default function StorePage() {
  const { locale, t } = useI18n()
  const [categoryFilter, setCategoryFilter] = useState('personal')
  const [query, setQuery] = useState('')
  const [templates, setTemplates] = useState<StoreTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const categoryFilterOptions = useMemo(
    () => [
      { label: t.store.personal, value: 'personal' },
      { label: t.store.company, value: 'business' }
    ],
    [t.store.company, t.store.personal]
  )
  const filteredTemplates = useMemo(
    () =>
      templates?.filter((template) => {
        const category = companyTemplateIds.has(template.id) ? 'business' : 'personal'

        return (
          category === categoryFilter &&
          templateMatchesQuery(template, {
            locale,
            query
          })
        )
      }) ?? null,
    [categoryFilter, locale, query, templates]
  )

  useEffect(() => {
    let isCurrent = true

    async function loadTemplates() {
      const response = await fetch('/api/store/templates', {
        cache: 'no-store'
      })
      const data = (await response.json().catch(() => null)) as StoreResponse | null

      if (!isCurrent) {
        return
      }

      if (!response.ok || !data || !data.ok) {
        setError(
          data && !data.ok
            ? data.error.message
            : `Failed to load store (${response.status})`
        )
        return
      }

      setTemplates(data.data.templates)
    }

    void loadTemplates()

    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{t.pages.storeTitle}</Title>
        <Text c="dimmed">{t.pages.storeDescription}</Text>
      </div>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Group align="center" justify="space-between">
        <SegmentedControl
          data={categoryFilterOptions}
          onChange={setCategoryFilter}
          size="sm"
          value={categoryFilter}
        />
        <TextInput
          aria-label={t.store.searchAria}
          leftSection={<Search size={16} />}
          maw={360}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t.store.searchPlaceholder}
          value={query}
          w={{ base: '100%', sm: 320 }}
        />
      </Group>
      {!templates && !error ? (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Skeleton height={180} radius="lg" />
          <Skeleton height={180} radius="lg" />
        </SimpleGrid>
      ) : null}
      {filteredTemplates ? (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.id} locale={locale} template={template} />
          ))}
          <HubRequestCard />
        </SimpleGrid>
      ) : null}
    </Stack>
  )
}

function HubRequestCard() {
  const { t } = useI18n()

  return (
    <Card h="100%" mih={180}>
      <Stack align="center" gap="sm" h="100%" justify="center">
        <Title order={3}>{t.store.noResultsTitle}</Title>
        <Group gap="xs" justify="center">
          <Text c="dimmed">{t.store.askDevelopIn}</Text>
          <Button
            color="os7"
            component={Link}
            href="/hub"
            rightSection={<ChevronRight size={16} />}
            size="compact-sm"
            variant="light"
          >
            {t.store.hubLink}
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

function TemplateCard({ locale, template }: { locale: string; template: StoreTemplate }) {
  const { t } = useI18n()
  const localizedTemplate = localizeTemplate(template, locale)

  return (
    <Card>
      <Stack gap="md">
        <Group align="flex-start" wrap="nowrap">
          <AppIcon
            icon={template.icon ?? undefined}
            templateId={template.id}
            size="large"
          />
          <div>
            <Title order={3}>{localizedTemplate.name}</Title>
            <Text c="dimmed">{localizedTemplate.description}</Text>
          </div>
        </Group>
        <Group justify="space-between">
          {template.hubTopicId ? (
            <Button
              component={Link}
              href={`/hub/${encodeURIComponent(template.hubTopicId)}`}
              leftSection={<MessageCircle size={16} />}
              variant="subtle"
            >
              {t.store.discuss}
            </Button>
          ) : (
            <div />
          )}
          {isInstallableTemplate(template) ? (
            <InstallButton templateId={template.id} />
          ) : (
            <Badge leftSection={<Loader size="xs" type="dots" />}>
              {t.store.comingSoon}
            </Badge>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

function localizeTemplate(template: StoreTemplate, locale: string) {
  const translation = template.translations[locale] ?? template.translations.en

  return {
    description: translation?.description ?? template.description,
    name: translation?.name ?? template.name
  }
}

function templateMatchesQuery(
  template: StoreTemplate,
  {
    locale,
    query
  }: {
    locale: string
    query: string
  }
) {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return true
  }

  const localizedTemplate = localizeTemplate(template, locale)
  const searchText = normalizeSearchText(
    [
      template.id,
      template.name,
      template.description,
      localizedTemplate.name,
      localizedTemplate.description,
      ...Object.values(template.translations).flatMap((translation) => [
        translation.name,
        translation.description
      ])
    ].join(' ')
  )

  return searchText.includes(normalizedQuery)
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function isInstallableTemplate(template: StoreTemplate) {
  return (
    template.status === 'available' &&
    Boolean(template.git) &&
    Boolean(template.image) &&
    typeof template.appPort === 'number' &&
    typeof template.agentPort === 'number'
  )
}
