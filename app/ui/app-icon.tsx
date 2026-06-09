import { CircleDollarSign } from 'lucide-react';
import type { TemplateId } from '@/lib/templates';

type AppIconProps = {
  templateId: TemplateId;
  size?: 'normal' | 'large';
};

export function AppIcon({ templateId, size = 'normal' }: AppIconProps) {
  return (
    <div className={`app-icon app-icon-${templateId} ${size === 'large' ? 'large' : ''}`}>
      <CircleDollarSign size={size === 'large' ? 34 : 26} />
    </div>
  );
}
