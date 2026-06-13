import { redirect } from 'next/navigation';
import { Brain, Code2, UserRound } from 'lucide-react';

import { requireOnboardedUser } from '@/lib/onboarding';
import { getRequestDictionary } from '@/lib/i18n/server';
import { prisma } from '@/lib/db';
import { AppShell } from '../ui/app-shell';
import { ExperienceField, parseExperienceLevel } from '../ui/experience-field';
import { FormField } from '../ui/form-field';
import { LanguageSwitcher } from '../ui/language-switcher';
import { SettingsSubmitButton } from './submit-button';

export default async function SettingsPage() {
  const user = await requireOnboardedUser();
  const t = await getRequestDictionary();
  const experienceOptionLabels = {
    advanced: t.profile.experienceAdvanced,
    beginner: t.profile.experienceBeginner,
    none: t.profile.experienceNone
  };

  return (
    <AppShell
      user={user}
      title={t.settings.title}
      description={t.settings.description}
    >
      <section className="settings-section">
        <form action={updateProfileSettings} className="settings-card settings-profile-form">
          <div className="settings-card-heading">
            <h3>{t.settings.profileTitle}</h3>
            <p>{t.settings.profileDescription}</p>
          </div>

          <FormField
            autoComplete="name"
            defaultValue={user.name ?? ''}
            icon={<UserRound size={16} />}
            label={t.profile.nameLabel}
            name="name"
            placeholder={t.profile.namePlaceholder}
            required
          />

          <ExperienceField
            defaultValue={user.aiExperienceLevel}
            icon={<Brain size={16} />}
            label={t.profile.aiExperienceLabel}
            name="aiExperienceLevel"
            optionLabels={experienceOptionLabels}
          />

          <ExperienceField
            defaultValue={user.vibeCodingExperienceLevel}
            icon={<Code2 size={16} />}
            label={t.profile.vibeCodingExperienceLabel}
            name="vibeCodingExperienceLevel"
            optionLabels={experienceOptionLabels}
          />

          <div className="settings-form-actions">
            <SettingsSubmitButton loadingLabel={t.settings.saving}>
              {t.settings.saveChanges}
            </SettingsSubmitButton>
          </div>
        </form>

        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-copy">
              <h3>{t.settings.languageTitle}</h3>
              <p>{t.settings.languageDescription}</p>
            </div>
            <LanguageSwitcher variant="segmented" />
          </div>
        </div>
      </section>
    </AppShell>
  );
}

async function updateProfileSettings(formData: FormData) {
  'use server';

  const user = await requireOnboardedUser();
  const name = String(formData.get('name') ?? '').trim();

  if (!name) {
    redirect('/settings');
  }

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel: parseExperienceLevel(formData.get('aiExperienceLevel')),
      name,
      vibeCodingExperienceLevel: parseExperienceLevel(
        formData.get('vibeCodingExperienceLevel')
      )
    }
  });

  redirect('/settings');
}
