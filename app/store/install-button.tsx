'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Stack } from '@mantine/core';
import { useI18n } from '../_components/i18n-provider';

type InstallResult =
  | {
      ok: true;
      url: string;
      projectId: string;
      template: string;
      status: string;
      jobId: string;
    }
  | {
      ok: false;
      message: string;
    };

type InstallButtonProps = {
  templateId: string;
};

export function InstallButton({ templateId }: InstallButtonProps) {
  const { format, t } = useI18n();
  const router = useRouter();
  const [isInstalling, setIsInstalling] = useState(false);
  const [result, setResult] = useState<InstallResult | null>(null);

  async function install() {
    setIsInstalling(true);
    setResult(null);

    try {
      const response = await fetch('/api/projects/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ templateId })
      });
      const data = await readInstallResult(response, (status) =>
        format(t.store.emptyResponse, { status })
      );

      if (!response.ok || !data.ok) {
        setResult({
          ok: false,
          message: 'message' in data ? data.message : t.store.installFailed
        });
        return;
      }

      setResult(data);
      router.push('/home');
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : t.store.installFailed
      });
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    <Stack align="flex-end" gap="xs">
      <Button
        leftSection={<Download size={17} />}
        loading={isInstalling}
        onClick={install}
      >
        {t.store.install}
      </Button>
      {result ? (
        <Alert color={result.ok ? 'green' : 'red'}>
          {result.ok ? format(t.store.queued, { url: result.url }) : result.message}
        </Alert>
      ) : null}
    </Stack>
  );
}

async function readInstallResult(
  response: Response,
  formatEmptyResponse: (status: number) => string
): Promise<InstallResult> {
  const text = await response.text();

  if (!text) {
    return {
      ok: false,
      message: formatEmptyResponse(response.status)
    };
  }

  try {
    return JSON.parse(text) as InstallResult;
  } catch {
    return {
      ok: false,
      message: text.slice(0, 200) || formatEmptyResponse(response.status)
    };
  }
}
