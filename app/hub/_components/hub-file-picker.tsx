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
  fullWidth?: boolean
  label?: string
  locale: string
  onChange: (files: File[]) => void
  removeFileLabel: (name: string) => string
}

export function HubFilePicker({
  buttonLabel,
  description,
  disabled = false,
  files,
  fullWidth = false,
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
          {label ? <Text fw={500}>{label}</Text> : null}
          {description ? (
            <Text c="dimmed">
              {description}
            </Text>
          ) : null}
        </Stack>
        {!fullWidth ? (
          <Button
            disabled={disabled}
            leftSection={<Paperclip size={16} />}
            onClick={() => fileInputRef.current?.click()}
            variant="light"
          >
            {buttonLabel}
          </Button>
        ) : null}
      </Group>
      {fullWidth ? (
        <Button
          disabled={disabled}
          fullWidth={fullWidth}
          leftSection={<Paperclip size={16} />}
          onClick={() => fileInputRef.current?.click()}
          variant="light"
        >
          {buttonLabel}
        </Button>
      ) : null}
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
              <Text style={{ flex: 1, minWidth: 0 }} truncate>
                {file.name}
              </Text>
              <Group gap={4} wrap="nowrap">
                <Text c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {formatFileSize(file.size, locale)}
                </Text>
                <CloseButton
                  aria-label={removeFileLabel(file.name)}
                  onClick={() => removeFile(index)}
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
