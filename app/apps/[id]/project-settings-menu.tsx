'use client'

import { useState } from 'react'
import { ActionIcon, Button, Checkbox, Menu, Modal, Stack, Text } from '@mantine/core'
import { AlertTriangle, Eraser, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react'
import { useI18n } from '../../_components/i18n-provider'
import { FormActions } from '../../_components/form-actions'
import { ModalTitle } from '../../_components/modal-title'
import { useRouter } from 'next/navigation'
import type { ApiResponse } from '@/shared/api'

type ProjectSettingsMenuProps = {
  isClearHistoryDisabled?: boolean
  onClearHistory?: () => void
  project: {
    appUrl: string
    id: string
    domain: string
    templateName: string
  }
}

type DeleteConfirmations = {
  database: boolean
  code: boolean
  data: boolean
}

const initialDeleteConfirmations: DeleteConfirmations = {
  database: false,
  code: false,
  data: false
}

export function ProjectSettingsMenu({
  isClearHistoryDisabled = false,
  onClearHistory,
  project
}: ProjectSettingsMenuProps) {
  const router = useRouter()
  const { format, t } = useI18n()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmations, setDeleteConfirmations] = useState<DeleteConfirmations>(
    initialDeleteConfirmations
  )
  const canConfirmDelete =
    deleteConfirmations.database && deleteConfirmations.code && deleteConfirmations.data

  function updateDeleteConfirmation(key: keyof DeleteConfirmations, value: boolean) {
    setDeleteConfirmations((currentValue) => ({
      ...currentValue,
      [key]: value
    }))
  }

  async function deleteProject() {
    if (!canConfirmDelete || isDeleting) {
      return
    }

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE'
      })
      const data = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || !data?.ok) {
        throw new Error(data && !data.ok ? data.error.message : t.desktop.deleteFailed)
      }

      setIsDeleteOpen(false)
      router.push('/home')
      router.refresh()
    } catch {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Menu position="bottom-end" shadow="md">
        <Menu.Target>
          <ActionIcon
            aria-label={t.project.settingsAria}
            title={t.project.settingsAria}
            variant="subtle"
          >
            <MoreHorizontal size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component="a"
            href={project.appUrl}
            leftSection={<ExternalLink size={16} />}
            rel="noreferrer"
            target="_blank"
          >
            {t.project.open}
          </Menu.Item>
          {onClearHistory ? (
            <Menu.Item
              disabled={isClearHistoryDisabled}
              leftSection={<Eraser size={16} />}
              onClick={() => {
                onClearHistory()
              }}
            >
              {t.chat.clearAria}
            </Menu.Item>
          ) : null}
          <Menu.Item
            color="red"
            leftSection={<Trash2 size={16} />}
            onClick={() => {
              setIsDeleteOpen(true)
            }}
          >
            {t.desktop.deleteAction}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false)
          setDeleteConfirmations(initialDeleteConfirmations)
        }}
        size="sm"
        title={
          <ModalTitle
            description={t.desktop.deleteDescription}
            icon={<AlertTriangle color="var(--mantine-color-red-6)" size={18} />}
          >
            {format(t.desktop.deleteTitle, { name: project.templateName })}
          </ModalTitle>
        }
      >
        <Stack>
          <Text c="dimmed">
            {format(t.desktop.deleteBody, { domain: project.domain })}
          </Text>

          <Checkbox
            checked={deleteConfirmations.database}
            label={t.desktop.confirmDatabase}
            onChange={(event) =>
              updateDeleteConfirmation('database', event.currentTarget.checked)
            }
          />
          <Checkbox
            checked={deleteConfirmations.code}
            label={t.desktop.confirmCode}
            onChange={(event) =>
              updateDeleteConfirmation('code', event.currentTarget.checked)
            }
          />
          <Checkbox
            checked={deleteConfirmations.data}
            label={t.desktop.confirmData}
            onChange={(event) =>
              updateDeleteConfirmation('data', event.currentTarget.checked)
            }
          />
        </Stack>

        <FormActions>
          <Button
            disabled={isDeleting}
            onClick={() => setIsDeleteOpen(false)}
            variant="subtle"
          >
            {t.desktop.cancel}
          </Button>
          <Button
            leftSection={<Trash2 size={16} />}
            disabled={!canConfirmDelete}
            loading={isDeleting}
            color="red"
            onClick={() => void deleteProject()}
          >
            {t.desktop.deleteAction}
          </Button>
        </FormActions>
      </Modal>
    </>
  )
}
