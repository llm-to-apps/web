'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Center, Container, Group, Paper, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { Brain, Code2, Sparkles, UserRound } from 'lucide-react';
import { ExperienceField } from '../_components/experience-field';
import { FormActions } from '../_components/form-actions';
import { SessionGate } from '../_components/session-gate';
import type { SessionData } from '../_components/session-provider';
import { useI18n } from '../_components/i18n-provider';
import { Os7Logo } from '../../ui-kit/src/os7-brand';

type OnboardingResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export default function WelcomePage() {
  return (
    <SessionGate requireOnboarded={false}>
      {(session) => <WelcomeContent session={session} />}
    </SessionGate>
  );
}

function WelcomeContent({ session }: { session: SessionData }) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const experienceOptionLabels = {
    advanced: t.profile.experienceAdvanced,
    beginner: t.profile.experienceBeginner,
    none: t.profile.experienceNone
  };

  useEffect(() => {
    if (session.user.onboarded) {
      router.replace('/home');
    }
  }, [router, session.user.onboarded]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') ?? '').trim();

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aiExperienceLevel: formData.get('aiExperienceLevel'),
          name,
          vibeCodingExperienceLevel: formData.get('vibeCodingExperienceLevel')
        })
      });
      const data = (await response.json().catch(() => null)) as OnboardingResponse | null;

      if (!response.ok || !data || !data.ok) {
        throw new Error(
          data && 'message' in data
            ? data.message
            : `Failed to complete onboarding (${response.status})`
        );
      }

      router.push('/home');
    } catch (error) {
      setError(error instanceof Error ? error.message : t.welcome.nameRequired);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Container py="xl">
      <Center>
        <Stack gap="lg" w="100%">
          <Group>
            <Os7Logo w={90} />
            <Text c="dimmed" fw={700} size="xs">
              Beta
            </Text>
          </Group>

          <Paper component="form" onSubmit={handleSubmit} p="xl" withBorder>
            <Stack gap="md">
              <Group align="flex-start">
                <ThemeIcon>
                  <Sparkles size={22} />
                </ThemeIcon>
                <div>
                  <Title id="welcome-title" order={1}>{t.welcome.title}</Title>
                  <Text c="dimmed">{t.welcome.description}</Text>
                </div>
              </Group>

              {error ? <Alert color="red">{error}</Alert> : null}

              <TextInput
                autoComplete="name"
                defaultValue={session.user.name ?? ''}
                label={t.profile.nameLabel}
                leftSection={<UserRound size={16} />}
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

              <FormActions>
                <Button loading={isSaving} type="submit">
                  {t.welcome.continue}
                </Button>
              </FormActions>
            </Stack>
          </Paper>
        </Stack>
      </Center>
    </Container>
  );
}
