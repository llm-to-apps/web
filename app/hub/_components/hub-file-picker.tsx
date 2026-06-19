'use client'

import { useRef } from 'react'
import { Button, CloseButton, Group, Stack, Text } from '@mantine/core'
import { Paperclip } from 'lucide-react'
import { formatFileSize } from '@/app/hub/_utils/format-file-size'

type HubFilePickerProps = {
  buttonLabel: string
  description?: string
  disabled?: boolean
  files: File[]
  label: string
  locale: string
  onChange: (files: File[]) => void
  removeFileLabel: (name: string) => string
}

export function HubFilePicker({
  buttonLabel,
  description,
  disabled = false,
  files,
  label,
  locale,
  onChange,
  removeFileLabel
}: HubFilePickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles) {
      return
    }

    onChange([...files, ...Array.from(nextFiles)])
  }

  function removeFile(index: number) {
    onChange(files.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <Stack gap="xs">
      <input
        disabled={disabled}
        multiple
        onChange={(event) => {
          addFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
        ref={fileInputRef}
        style={{ display: 'none' }}
        type="file"
      />
      <Group justify="space-between">
        <Stack gap={2}>
          <Text fw={500} size="sm">
            {label}
          </Text>
          {description ? (
            <Text c="dimmed" size="xs">
              {description}
            </Text>
          ) : null}
        </Stack>
        <Button
          disabled={disabled}
          leftSection={<Paperclip size={16} />}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          variant="light"
        >
          {buttonLabel}
        </Button>
      </Group>
      {files.length > 0 ? (
        <Stack gap={6}>
          {files.map((file, index) => (
            <Group
              bg="gray.0"
              gap="xs"
              justify="space-between"
              key={`${file.name}:${file.size}:${index}`}
              p="xs"
              style={{
                borderRadius: 'var(--mantine-radius-sm)',
                minWidth: 0,
                width: '100%'
              }}
              wrap="nowrap"
            >
              <Text size="xs" style={{ flex: 1, minWidth: 0 }} truncate>
                {file.name}
              </Text>
              <Group gap={4} wrap="nowrap">
                <Text c="dimmed" size="xs" style={{ whiteSpace: 'nowrap' }}>
                  {formatFileSize(file.size, locale)}
                </Text>
                <CloseButton
                  aria-label={removeFileLabel(file.name)}
                  onClick={() => removeFile(index)}
                  size="xs"
                  variant="transparent"
                />
              </Group>
            </Group>
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}
