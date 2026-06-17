'use client';

import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Alert, Center, Grid, GridCol, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useParams } from 'next/navigation';
import { formatMessage } from '../../../lib/i18n/dictionaries';
import { useI18n } from '../../_components/i18n-provider';
import { ProjectAgentPanel } from './project-agent-panel';
import { ProjectOAuthBridge } from './project-oauth-bridge';

type ProjectWorkspace = {
  activeRunId: string | null;
  appOrigin: string;
  messages: ComponentProps<typeof ProjectAgentPanel>['initialMessages'];
  project: ComponentProps<typeof ProjectAgentPanel>['project'] & {
    deployError: string | null;
  };
  usageSummary: ComponentProps<typeof ProjectAgentPanel>['usageSummary'];
};

type ProjectWorkspaceResponse =
  | ({
      ok: true;
    } & ProjectWorkspace)
  | {
      ok: false;
      message: string;
    };

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const [data, setData] = useState<ProjectWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadProject() {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(params.id)}/workspace`,
        {
          cache: 'no-store'
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | ProjectWorkspaceResponse
        | null;

      if (!isCurrent) {
        return;
      }

      if (!response.ok || !payload || !payload.ok) {
        setError(
          payload && 'message' in payload
            ? payload.message
            : `Failed to load application (${response.status})`
        );
        return;
      }

      setData({
        activeRunId: payload.activeRunId,
        appOrigin: payload.appOrigin,
        messages: payload.messages,
        project: payload.project,
        usageSummary: payload.usageSummary
      });
    }

    void loadProject();

    return () => {
      isCurrent = false;
    };
  }, [params.id]);

  if (error) {
    return (
      <Center h="100vh" p="md">
        <Alert color="red">{error}</Alert>
      </Center>
    );
  }

  if (!data) {
    return (
      <Grid h="100vh" p="md" styles={{ inner: { height: '100%' } }}>
        <GridCol display="flex" h={{ base: 'auto', lg: '100%' }} span={{ base: 12, lg: 4 }}>
          <Skeleton flex={1} radius="md" />
        </GridCol>
        <GridCol display="flex" h={{ base: 'auto', lg: '100%' }} span={{ base: 12, lg: 8 }}>
          <Skeleton flex={1} radius="md" />
        </GridCol>
      </Grid>
    );
  }

  return (
    <Grid h="100vh" p="md" styles={{ inner: { height: '100%' } }}>
      <ProjectOAuthBridge appOrigin={data.appOrigin} projectId={data.project.id} />
      <GridCol display="flex" h={{ base: 'auto', lg: '100%' }} span={{ base: 12, lg: 4 }}>
        <ProjectAgentPanel
          activeRunId={data.activeRunId}
          initialMessages={data.messages}
          project={data.project}
          usageSummary={data.usageSummary}
        />
      </GridCol>

      <GridCol display="flex" h={{ base: 'auto', lg: '100%' }} span={{ base: 12, lg: 8 }}>
        <Stack flex={1} gap="sm" h="100%" mih={0} w="100%">
          {data.project.status === 'ready' ? (
            <Paper
              flex={1}
              style={{ overflow: 'hidden' }}
              withBorder
            >
              <iframe
                src={data.project.appUrl}
                style={{
                  border: 0,
                  display: 'block',
                  height: '100%',
                  width: '100%'
                }}
                title={formatMessage(t.project.iframeTitle, { name: data.project.name })}
              />
            </Paper>
          ) : (
            <Paper flex={1} withBorder>
              <Center h="100%">
                <Stack align="center">
                  <Title order={2}>
                    {formatMessage(t.project.applicationStatus, {
                      status: data.project.status
                    })}
                  </Title>
                  <Text c="dimmed">{data.project.deployError || t.project.previewPending}</Text>
                </Stack>
              </Center>
            </Paper>
          )}
        </Stack>
      </GridCol>
    </Grid>
  );
}
