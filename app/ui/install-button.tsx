'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { TemplateId } from '@/lib/templates';

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
  templateId: TemplateId;
};

export function InstallButton({ templateId }: InstallButtonProps) {
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
      const data = (await response.json()) as InstallResult;

      if (!response.ok || !data.ok) {
        setResult({
          ok: false,
          message: 'message' in data ? data.message : 'Install failed'
        });
        return;
      }

      setResult(data);
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Install failed'
      });
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    <div className="install-control">
      <button className="install-button" type="button" onClick={install} disabled={isInstalling}>
        {isInstalling ? <Loader2 size={17} /> : <Download size={17} />}
        {isInstalling ? 'Installing' : 'Install'}
      </button>
      {result ? (
        <div className={`inline-result ${result.ok ? 'success' : 'error'}`}>
          {result.ok ? `Queued ${result.url}` : result.message}
        </div>
      ) : null}
    </div>
  );
}
