import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Dumbbell,
  HeartPulse,
  NotebookPen,
  PanelsTopLeft,
  Smile,
  Utensils
} from 'lucide-react';

type AppIconProps = {
  icon?: string;
  templateId: string;
  size?: 'normal' | 'large';
};

const iconComponents = {
  booking: CalendarDays,
  crm: BookOpen,
  habits: ClipboardList,
  jobs: BriefcaseBusiness,
  kanban: PanelsTopLeft,
  meal: Utensils,
  money: CircleDollarSign,
  mood: Smile,
  notes: NotebookPen,
  pomodoro: Clock3,
  subscriptions: HeartPulse,
  workout: Dumbbell
} as const;

const templateIconFallbacks: Record<string, keyof typeof iconComponents> = {
  bookingCalendar: 'booking',
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
};

export function AppIcon({ icon, templateId, size = 'normal' }: AppIconProps) {
  const iconName = icon ?? templateIconFallbacks[templateId] ?? 'money';
  const Icon = isTemplateIcon(iconName) ? iconComponents[iconName] : CircleDollarSign;

  return (
    <div className={`app-icon app-icon-${templateId} ${size === 'large' ? 'large' : ''}`}>
      <Icon size={size === 'large' ? 34 : 26} />
    </div>
  );
}

function isTemplateIcon(iconName: string): iconName is keyof typeof iconComponents {
  return iconName in iconComponents;
}
