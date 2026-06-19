'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip
} from '@mantine/core'
import {
  AlertTriangle,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Search,
  Trash2
} from 'lucide-react'
import { FormActions } from '@/app/_components/form-actions'
import { ModalTitle } from '@/app/_components/modal-title'
import { SessionGate } from '@/app/_components/session-gate'
import { useI18n } from '@/app/_components/i18n-provider'
import type { ApiResponse } from '@/shared/api'

type UploadedFile = {
  createdAt: string
  error: string | null
  id: string
  isDownloadable: boolean
  mimeType: string
  name: string
  project: {
    domain: string
    id: string
    name: string
  } | null
  projectId: string | null
  scope: string
  sizeBytes: number
  status: string
}

type FilesResponse = ApiResponse<{
  files: UploadedFile[]
  nextCursor: string | null
}>

const filesPageSize = 50
const UI_DELAY_MS = 250

export default function FilesPage() {
  return <SessionGate>{() => <FilesContent />}</SessionGate>
}

function FilesContent() {
  const { format, locale, t } = useI18n()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isSearchLoadingVisible, setIsSearchLoadingVisible] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [deleteTargetFile, setDeleteTargetFile] = useState<UploadedFile | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    [locale]
  )
  const fileSizeFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])

  const loadFiles = useCallback(async () => {
    setIsLoading(true)
    setNextCursor(null)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(filesPageSize)
      })

      if (query.trim()) {
        params.set('q', query.trim())
      }

      const response = await fetch(`/api/files?${params.toString()}`, {
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as FilesResponse | null

      if (!response.ok || !payload || !payload.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `Failed to load files (${response.status})`
        )
      }

      setFiles(payload.data.files)
      setNextCursor(payload.data.nextCursor)
    } catch (error) {
      setError(error instanceof Error ? error.message : t.files.loadFailed)
    } finally {
      setHasLoaded(true)
      setIsLoading(false)
    }
  }, [query, t.files.loadFailed])

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        void loadFiles()
      },
      query ? 180 : 0
    )

    return () => window.clearTimeout(timeout)
  }, [loadFiles, query])

  useEffect(() => {
    if (!hasLoaded || !isLoading) {
      setIsSearchLoadingVisible(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setIsSearchLoadingVisible(true)
    }, 180)

    return () => window.clearTimeout(timeout)
  }, [hasLoaded, isLoading])

  const loadMoreFiles = useCallback(async () => {
    if (!nextCursor || isLoading || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        cursor: nextCursor,
        limit: String(filesPageSize)
      })

      if (query.trim()) {
        params.set('q', query.trim())
      }

      const response = await fetch(`/api/files?${params.toString()}`, {
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as FilesResponse | null

      if (!response.ok || !payload || !payload.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `Failed to load files (${response.status})`
        )
      }

      setFiles((currentFiles) => {
        const seenIds = new Set(currentFiles.map((file) => file.id))
        const nextFiles = payload.data.files.filter((file) => !seenIds.has(file.id))
        return [...currentFiles, ...nextFiles]
      })
      setNextCursor(payload.data.nextCursor)
    } catch (error) {
      setError(error instanceof Error ? error.message : t.files.loadFailed)
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoading, isLoadingMore, nextCursor, query, t.files.loadFailed])

  useEffect(() => {
    const element = loadMoreRef.current

    if (!element || !nextCursor) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreFiles()
        }
      },
      {
        rootMargin: '320px'
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [loadMoreFiles, nextCursor])

  async function deleteFile(file: UploadedFile) {
    if (deletingFileId) {
      return
    }

    setDeletingFileId(file.id)
    setError(null)

    try {
      const [response] = await Promise.all([
        fetch(`/api/files/${encodeURIComponent(file.id)}`, {
          method: 'DELETE'
        }),
        waitForUiDelay()
      ])
      const payload = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !payload || !payload.ok) {
        throw new Error(
          payload && !payload.ok
            ? payload.error.message
            : `Failed to delete file (${response.status})`
        )
      }

      setFiles((currentFiles) =>
        currentFiles.filter((currentFile) => currentFile.id !== file.id)
      )
      setDeleteTargetFile(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : t.files.deleteFailed)
    } finally {
      setDeletingFileId(null)
    }
  }

  return (
    <>
      <Stack gap="md">
        <div>
          <Title order={2}>{t.files.title}</Title>
          <Text c="dimmed">{t.files.description}</Text>
        </div>

        <TextInput
          autoFocus
          leftSection={<Search size={15} />}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t.files.search}
          rightSection={
            isSearchLoadingVisible ? <Loader size="xs" type="dots" /> : null
          }
          size="sm"
          value={query}
        />

        {error ? <Alert color="red">{error}</Alert> : null}

        <Paper p={0} withBorder>
          {isLoading && !hasLoaded ? (
            <Stack gap={0}>
              {Array.from({ length: 5 }).map((_, index) => (
                <Box key={index} p="md">
                  <Skeleton height={22} mb={8} radius="sm" width="45%" />
                  <Skeleton height={16} radius="sm" width="70%" />
                </Box>
              ))}
            </Stack>
          ) : files.length === 0 ? (
            <Stack align="center" gap="xs" p="xl">
              <ThemeIcon radius="xl" size={44} variant="light">
                <FileText size={22} />
              </ThemeIcon>
              <Text fw={600}>{t.files.emptyTitle}</Text>
              <Text c="dimmed" maw={420} ta="center">
                {t.files.emptyDescription}
              </Text>
            </Stack>
          ) : (
            <>
              <Table.ScrollContainer minWidth={760} visibleFrom="sm">
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t.files.name}</Table.Th>
                      <Table.Th>{t.files.context}</Table.Th>
                      <Table.Th>{t.files.status}</Table.Th>
                      <Table.Th>{t.files.size}</Table.Th>
                      <Table.Th>{t.files.uploaded}</Table.Th>
                      <Table.Th aria-label={t.files.actions} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {files.map((file) => (
                      <Table.Tr key={file.id}>
                        <Table.Td>
                          <FileTitle file={file} />
                        </Table.Td>
                        <Table.Td>
                          <FileContext file={file} />
                        </Table.Td>
                        <Table.Td>
                          <FileStatus file={file} />
                        </Table.Td>
                        <Table.Td>
                          {formatFileSize(file.sizeBytes, fileSizeFormatter)}
                        </Table.Td>
                        <Table.Td>
                          {dateFormatter.format(new Date(file.createdAt))}
                        </Table.Td>
                        <Table.Td>
                          <FileActions
                            deleting={deletingFileId === file.id}
                            file={file}
                            onDelete={setDeleteTargetFile}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>

              <Stack gap={0} hiddenFrom="sm">
                {files.map((file) => (
                  <Box
                    key={file.id}
                    p="md"
                    style={{
                      borderTop: '1px solid var(--mantine-color-gray-2)'
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap">
                        <FileTitle file={file} />
                        <FileActions
                          deleting={deletingFileId === file.id}
                          file={file}
                          onDelete={setDeleteTargetFile}
                        />
                      </Group>
                      <Group gap="xs">
                        <FileStatus file={file} />
                        <Text c="dimmed">
                          {formatFileSize(file.sizeBytes, fileSizeFormatter)}
                        </Text>
                      </Group>
                      <FileContext file={file} />
                      <Text c="dimmed" size="xs">
                        {dateFormatter.format(new Date(file.createdAt))}
                      </Text>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </Paper>

        {nextCursor ? (
          <Group justify="center" ref={loadMoreRef}>
            <Button
              loading={isLoadingMore}
              onClick={() => void loadMoreFiles()}
              variant="subtle"
            >
              {isLoadingMore ? t.files.loadingMore : t.files.loadMore}
            </Button>
          </Group>
        ) : null}
      </Stack>

      <Modal
        opened={Boolean(deleteTargetFile)}
        onClose={() => setDeleteTargetFile(null)}
        size="sm"
        title={
          <ModalTitle
            icon={<AlertTriangle color="var(--mantine-color-red-6)" size={18} />}
          >
            {t.files.deleteTitle}
          </ModalTitle>
        }
      >
        <Stack gap="lg">
          {deleteTargetFile ? (
            <Text c="dimmed">
              {format(t.files.deleteDescription, { name: deleteTargetFile.name })}
            </Text>
          ) : null}
          <FormActions>
            <Button
              disabled={Boolean(deletingFileId)}
              onClick={() => setDeleteTargetFile(null)}
              variant="subtle"
            >
              {t.files.cancel}
            </Button>
            <Button
              color="red"
              leftSection={<Trash2 size={16} />}
              loading={Boolean(deletingFileId)}
              onClick={() => {
                if (deleteTargetFile) {
                  void deleteFile(deleteTargetFile)
                }
              }}
            >
              {t.files.delete}
            </Button>
          </FormActions>
        </Stack>
      </Modal>
    </>
  )
}

function FileTitle({ file }: { file: UploadedFile }) {
  const icon = file.mimeType.startsWith('image/') ? (
    <ImageIcon size={16} />
  ) : (
    <File size={16} />
  )

  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon radius="xl" size={32} variant="light">
        {icon}
      </ThemeIcon>
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} truncate>
          {file.name}
        </Text>
        <Text c="dimmed" size="xs" truncate>
          {file.mimeType}
        </Text>
      </Box>
    </Group>
  )
}

function FileStatus({ file }: { file: UploadedFile }) {
  const color =
    file.status === 'processed' ? 'green' : file.status === 'failed' ? 'red' : 'yellow'

  return (
    <Tooltip disabled={!file.error} label={file.error}>
      <Badge color={color} variant="light">
        {file.status}
      </Badge>
    </Tooltip>
  )
}

function FileActions({
  deleting,
  file,
  onDelete
}: {
  deleting: boolean
  file: UploadedFile
  onDelete: (file: UploadedFile) => void
}) {
  const { t } = useI18n()

  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <Tooltip label={file.isDownloadable ? t.files.download : t.files.unavailable}>
        <ActionIcon
          aria-label={t.files.download}
          component="a"
          disabled={!file.isDownloadable}
          href={`/api/files/${encodeURIComponent(file.id)}`}
          variant="subtle"
        >
          <Download size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t.files.delete}>
        <ActionIcon
          aria-label={t.files.delete}
          color="red"
          loading={deleting}
          onClick={() => onDelete(file)}
          variant="subtle"
        >
          <Trash2 size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

function FileContext({ file }: { file: UploadedFile }) {
  if (!file.project) {
    return null
  }

  return (
    <Text
      c="blue"
      component={Link}
      href={`/apps/${encodeURIComponent(file.project.id)}`}
      truncate
    >
      {file.project.name}
    </Text>
  )
}

function formatFileSize(sizeBytes: number, formatter: Intl.NumberFormat) {
  if (sizeBytes < 1024) {
    return `${formatter.format(sizeBytes)} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${formatter.format(Math.round(sizeBytes / 1024))} KB`
  }

  return `${formatter.format(Math.round((sizeBytes / 1024 / 1024) * 10) / 10)} MB`
}

function waitForUiDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, UI_DELAY_MS)
  })
}
