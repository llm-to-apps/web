import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Brain, Code2, Sparkles, UserRound } from 'lucide-react';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRequestDictionary } from '@/lib/i18n/server';
import { ExperienceField, parseExperienceLevel } from '../ui/experience-field';
import { FormField } from '../ui/form-field';
import { WelcomeSubmitButton } from './submit-button';

type WelcomePageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const user = await getCurrentUser();
  const resolvedSearchParams = await searchParams;
  const t = await getRequestDictionary();
  const experienceOptionLabels = {
    advanced: t.profile.experienceAdvanced,
    beginner: t.profile.experienceBeginner,
    none: t.profile.experienceNone
  };

  if (!user) {
    redirect('/');
  }

  if (user.onboarded) {
    redirect('/home');
  }

  return (
    <main className="welcome-layout">
      <section className="welcome-shell" aria-labelledby="welcome-title">
        <div className="welcome-brand">
          <Image src="/brand/os7-logo.svg" alt="OS7" width={84} height={44} priority />
          <span>Beta</span>
        </div>

        <form action={completeOnboarding} className="welcome-card">
          <div className="welcome-card-header">
            <div className="welcome-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <h1 id="welcome-title">{t.welcome.title}</h1>
              <p>{t.welcome.description}</p>
            </div>
          </div>

          {resolvedSearchParams?.error ? (
            <p className="welcome-error">{resolvedSearchParams.error}</p>
          ) : null}

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
            icon={<Brain size={16} />}
            label={t.profile.aiExperienceLabel}
            name="aiExperienceLevel"
            optionLabels={experienceOptionLabels}
          />

          <ExperienceField
            icon={<Code2 size={16} />}
            label={t.profile.vibeCodingExperienceLabel}
            name="vibeCodingExperienceLevel"
            optionLabels={experienceOptionLabels}
          />

          <div className="welcome-actions">
            <WelcomeSubmitButton loadingLabel={t.welcome.saving}>
              {t.welcome.continue}
            </WelcomeSubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}

async function completeOnboarding(formData: FormData) {
  'use server';

  const user = await getCurrentUser();
  const t = await getRequestDictionary();

  if (!user) {
    redirect('/');
  }

  const name = String(formData.get('name') ?? '').trim();
  const aiExperienceLevel = parseExperienceLevel(formData.get('aiExperienceLevel'));
  const vibeCodingExperienceLevel = parseExperienceLevel(
    formData.get('vibeCodingExperienceLevel')
  );

  if (!name) {
    const welcomeUrl = new URL('/welcome', 'http://os7.local');
    welcomeUrl.searchParams.set('error', t.welcome.nameRequired);
    redirect(`${welcomeUrl.pathname}${welcomeUrl.search}`);
  }

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel,
      name,
      onboarded: true,
      vibeCodingExperienceLevel
    }
  });

  redirect('/home');
}
