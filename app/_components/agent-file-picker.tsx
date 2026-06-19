'use client'

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Group,
  Loader,
  Menu,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton
} from '@mantine/core'
import { Check, FileText, FolderOpen, Paperclip, Search, Upload } from 'lucide-react'
import { useI18n } from './i18n-provider'
import { ModalTitle } from './modal-title'
import type { ApiResponse } from '@/shared/api'

export type AgentPickerFile = {
  error: string | null
  id: string
  name: string
  sizeBytes: number
  status: string
}

type FilesResponse = ApiResponse<{
  files: AgentPickerFile[]
  nextCursor: string | null
}>

type AgentFilePickerProps = {
  attachedFileIds: string[]
  disabled?: boolean
  isUploading?: boolean
  onSelectFile: (file: AgentPickerFile) => void
  onUploadFile: (file: File) => Promise<void>
  projectId?: string
  scope: 'project_agent' | 'user_agent'
}

export function AgentFilePicker({
  attachedFileIds,
  disabled = false,
  isUploading = false,
  onSelectFile,
  onUploadFile,
  projectId,
  scope
}: AgentFilePickerProps) {
  const { t } = useI18n()
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<AgentPickerFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isSearchLoadingVisible, setIsSearchLoadingVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const attachedFileIdSet = new Set(attachedFileIds)

  const loadFiles = useCallback(async () => {
    if (!isSelectOpen) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: '20',
        scope,
        status: 'processed'
      })

      if (projectId) {
        params.set('projectId', projectId)
      }

      if (query.trim()) {
        params.set('q', query.trim())
      }

      const response = await fetch(`/api/files?${params.toString()}`, {
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as FilesResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(t.files.loadFailed)
      }

      setFiles(payload.data.files)
      setHasLoaded(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : t.files.loadFailed)
      setHasLoaded(true)
    } finally {
      setIsLoading(false)
    }
  }, [isSelectOpen, projectId, query, scope, t.files.loadFailed])

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
    if (!isSelectOpen) {
      return
    }

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true })
    })
  }, [isSelectOpen])

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

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || isUploading) {
      return
    }

    await onUploadFile(file)
  }

  function selectFile(file: AgentPickerFile) {
    if (attachedFileIdSet.has(file.id)) {
      return
    }

    onSelectFile(file)
    setIsSelectOpen(false)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        accept=".txt,.pdf,text/plain,application/pdf,image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void handleFileChange(event)}
        type="file"
      />
      <Menu position="top-start" shadow="md" withinPortal>
        <Menu.Target>
          <ActionIcon
            aria-label={t.files.attach}
            disabled={disabled}
            loading={isUploading}
            type="button"
            variant="subtle"
          >
            <Paperclip size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Upload size={16} />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t.files.uploadNew}
          </Menu.Item>
          <Menu.Item
            leftSection={<FolderOpen size={16} />}
            onClick={() => setIsSelectOpen(true)}
          >
            {t.files.chooseUploaded}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={isSelectOpen}
        onClose={() => setIsSelectOpen(false)}
        size="md"
        title={
          <ModalTitle icon={<FolderOpen size={18} />}>
            {t.files.chooseUploaded}
          </ModalTitle>
        }
      >
        <Stack gap="sm">
          <TextInput
            autoFocus
            data-autofocus
            leftSection={<Search size={15} />}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t.files.search}
            ref={searchInputRef}
            rightSection={
              isSearchLoadingVisible ? <Loader size="xs" type="dots" /> : null
            }
            size="sm"
            value={query}
          />

          <ScrollArea h="clamp(220px, 45vh, 360px)" type="auto">
            <Stack gap={4}>
              {isLoading && !hasLoaded ? (
                <Group gap="xs" p="xs">
                  <Loader size="xs" type="dots" />
                  <Text c="dimmed">{t.files.loading}</Text>
                </Group>
              ) : null}
              {error ? <Text c="red">{error}</Text> : null}
              {!isLoading && !error && files.length === 0 ? (
                <Text c="dimmed">{t.files.noReadyFiles}</Text>
              ) : null}
              {files.map((file) => {
                const isAttached = attachedFileIdSet.has(file.id)

                return (
                  <UnstyledButton
                    disabled={isAttached}
                    key={file.id}
                    onClick={() => selectFile(file)}
                    p="xs"
                    style={{
                      borderRadius: 6,
                      opacity: isAttached ? 0.55 : 1
                    }}
                  >
                    <Group gap="xs" wrap="nowrap">
                      {isAttached ? (
                        <Check color="var(--mantine-color-green-7)" size={16} />
                      ) : (
                        <FileText color="var(--mantine-color-gray-6)" size={16} />
                      )}
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Text truncate>{file.name}</Text>
                        <Text c="dimmed" size="xs">
                          {formatFileSize(file.sizeBytes)}
                        </Text>
                      </Stack>
                    </Group>
                  </UnstyledButton>
                )
              })}
            </Stack>
          </ScrollArea>
        </Stack>
      </Modal>
    </>
  )
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${Math.round((sizeBytes / 1024 / 1024) * 10) / 10} MB`
}
