import type { ReactNode } from 'react';
import type { UserExperienceLevel } from '@prisma/client';

type ExperienceFieldProps = {
  defaultValue?: UserExperienceLevel | null;
  icon?: ReactNode;
  label: string;
  name: 'aiExperienceLevel' | 'vibeCodingExperienceLevel';
  optionLabels: Record<UserExperienceLevel, string>;
};

const experienceOptions: Array<{
  value: UserExperienceLevel;
}> = [
  { value: 'none' },
  { value: 'beginner' },
  { value: 'advanced' }
];

export function ExperienceField({
  defaultValue = 'none',
  icon,
  label,
  name,
  optionLabels
}: ExperienceFieldProps) {
  const selectedValue = defaultValue ?? 'none';

  return (
    <fieldset className="experience-fieldset">
      <legend>
        {icon ? <span className="experience-fieldset-icon">{icon}</span> : null}
        {label}
      </legend>
      <div className="experience-options">
        {experienceOptions.map((option) => (
          <label className="experience-option" key={option.value}>
            <input
              defaultChecked={option.value === selectedValue}
              name={name}
              type="radio"
              value={option.value}
            />
            <span>{optionLabels[option.value]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function parseExperienceLevel(value: FormDataEntryValue | null): UserExperienceLevel {
  return value === 'beginner' || value === 'advanced' ? value : 'none';
}
