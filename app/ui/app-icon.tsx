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
import { templates, type TemplateId } from '@/lib/templates';

type AppIconProps = {
  templateId: TemplateId | string;
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

export function AppIcon({ templateId, size = 'normal' }: AppIconProps) {
  const template = templates[templateId as TemplateId];
  const iconName = template?.icon ?? 'money';
  const Icon = iconComponents[iconName] ?? CircleDollarSign;

  return (
    <div className={`app-icon app-icon-${templateId} ${size === 'large' ? 'large' : ''}`}>
      <Icon size={size === 'large' ? 34 : 26} />
    </div>
  );
}
