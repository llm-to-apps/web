'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Card, Group, Loader, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { AppIcon } from '../_components/app-icon';
import { AppLayout } from '../_components/app-layout';
import { SessionGate } from '../_components/session-gate';
import type { SessionData } from '../_components/session-provider';
import { InstallButton } from './install-button';
import { useI18n } from '../_components/i18n-provider';

type StoreTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  status: string;
  git: string | null;
  image: string | null;
  appPort: number | null;
  agentPort: number | null;
};

type StoreResponse =
  | {
      ok: true;
      templates: StoreTemplate[];
    }
  | {
      ok: false;
      message: string;
    };

export default function StorePage() {
  return (
    <SessionGate>
      {(session) => <StoreContent session={session} />}
    </SessionGate>
  );
}

function StoreContent({ session }: { session: SessionData }) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<StoreTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadTemplates() {
      const response = await fetch('/api/store/templates', {
        cache: 'no-store'
      });
      const data = (await response.json().catch(() => null)) as StoreResponse | null;

      if (!isCurrent) {
        return;
      }

      if (!response.ok || !data || !data.ok) {
        setError(
          data && 'message' in data
            ? data.message
            : `Failed to load store (${response.status})`
        );
        return;
      }

      setTemplates(data.templates);
    }

    void loadTemplates();

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <AppLayout usageSummary={session.usageSummary} user={session.user}>
      {error ? <Alert color="red">{error}</Alert> : null}
      {!templates && !error ? (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Skeleton height={180} radius="lg" />
          <Skeleton height={180} radius="lg" />
        </SimpleGrid>
      ) : null}
      {templates ? (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {templates.map((template) => (
            <Card key={template.id}>
              <Stack gap="md">
                <Group align="flex-start" wrap="nowrap">
                  <AppIcon icon={template.icon ?? undefined} templateId={template.id} size="large" />
                  <div>
                    <Title order={3}>
                      {t.templates[template.id as keyof typeof t.templates]?.name ??
                        template.name}
                    </Title>
                    <Text c="dimmed">
                      {t.templates[template.id as keyof typeof t.templates]?.description ??
                        template.description}
                    </Text>
                  </div>
                </Group>
                <Group justify="flex-end">
                  {isInstallableTemplate(template) ? (
                    <InstallButton templateId={template.id} />
                  ) : (
                    <Badge leftSection={<Loader size="xs" type="dots" />}>
                      {t.store.comingSoon}
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      ) : null}
    </AppLayout>
  );
}

function isInstallableTemplate(template: StoreTemplate) {
  return (
    template.status === 'available' &&
    Boolean(template.git) &&
    Boolean(template.image) &&
    typeof template.appPort === 'number' &&
    typeof template.agentPort === 'number'
  );
}
