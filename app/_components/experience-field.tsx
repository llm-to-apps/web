'use client'

import type { ReactNode } from 'react'
import type { UserExperienceLevel } from '@prisma/client'
import { Group, Input, SegmentedControl, Stack, Text } from '@mantine/core'
import { GraduationCap, Sparkles, UserRound } from 'lucide-react'

type ExperienceFieldProps = {
  defaultValue?: UserExperienceLevel | null
  icon?: ReactNode
  label: string
  name: 'aiExperienceLevel' | 'vibeCodingExperienceLevel'
  optionLabels: Record<UserExperienceLevel, string>
}

const experienceOptions: Array<{
  icon: ReactNode
  value: UserExperienceLevel
}> = [
  { icon: <UserRound size={16} />, value: 'none' },
  { icon: <GraduationCap size={16} />, value: 'beginner' },
  { icon: <Sparkles size={16} />, value: 'advanced' }
]

export function ExperienceField({
  defaultValue = 'none',
  icon,
  label,
  name,
  optionLabels
}: ExperienceFieldProps) {
  const selectedValue = defaultValue ?? 'none'

  return (
    <Stack gap="xs">
      <Input.Label>
        <Group gap={6}>
          {icon}
          {label}
        </Group>
      </Input.Label>
      <SegmentedControl
        data={experienceOptions.map((option) => ({
          label: (
            <Group gap={6} justify="center" wrap="nowrap">
              {option.icon}
              <Text>{optionLabels[option.value]}</Text>
            </Group>
          ),
          value: option.value
        }))}
        defaultValue={selectedValue}
        name={name}
      />
    </Stack>
  )
}
