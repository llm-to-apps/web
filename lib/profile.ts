import type { UserExperienceLevel } from '@prisma/client';

export function parseExperienceLevel(value: FormDataEntryValue | null): UserExperienceLevel {
  return value === 'beginner' || value === 'advanced' ? value : 'none';
}
