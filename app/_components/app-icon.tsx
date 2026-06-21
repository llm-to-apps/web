import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Dumbbell,
  HeartPulse,
  IdCard,
  NotebookPen,
  PanelsTopLeft,
  Smile,
  Utensils
} from 'lucide-react'
import { ThemeIcon } from '@mantine/core'

type AppIconProps = {
  icon?: string
  templateId: string
  size?: 'normal' | 'large'
}

const iconComponents = {
  booking: CalendarDays,
  crm: BookOpen,
  habits: ClipboardList,
  jobs: BriefcaseBusiness,
  kanban: PanelsTopLeft,
  'id-card': IdCard,
  meal: Utensils,
  money: CircleDollarSign,
  mood: Smile,
  notes: NotebookPen,
  pomodoro: Clock3,
  subscriptions: HeartPulse,
  workout: Dumbbell
} as const

const templateIconFallbacks: Record<string, keyof typeof iconComponents> = {
  bookingCalendar: 'booking',
  'gpt-card': 'id-card',
  'gpt-card-dev': 'id-card',
  habitTracker: 'habits',
  jobSearchCrm: 'jobs',
  kanban: 'kanban',
  mealPlanner: 'meal',
  money: 'money',
  moodJournal: 'mood',
  notes: 'notes',
  personalCrm: 'crm',
  pomodoro: 'pomodoro',
  subscriptionTracker: 'subscriptions',
  workoutTracker: 'workout'
}

export function AppIcon({ icon, templateId, size = 'normal' }: AppIconProps) {
  const iconName = icon ?? templateIconFallbacks[templateId] ?? 'money'
  const Icon = isTemplateIcon(iconName) ? iconComponents[iconName] : CircleDollarSign
  const iconSize = size === 'large' ? 34 : 24
  const boxSize = size === 'large' ? 72 : 48

  return (
    <ThemeIcon size={boxSize} variant="light">
      <Icon size={iconSize} />
    </ThemeIcon>
  )
}

function isTemplateIcon(iconName: string): iconName is keyof typeof iconComponents {
  return iconName in iconComponents
}
