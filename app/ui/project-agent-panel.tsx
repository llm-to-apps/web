'use client';

import { useCallback, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ActionLink } from './action-link';
import { useI18n } from './i18n-provider';
import {
  ProjectAgentChat,
  type AgentMode,
  type ProjectAgentChatHandle
} from './project-agent-chat';
import { ProjectSettingsMenu } from './project-settings-menu';

type ProjectAgentPanelProps = {
  activeRunId?: string | null;
  appUrl: string;
  initialMessages?: Array<{
    id: string;
    role: 'assistant' | 'user';
    source?: string | null;
    content: string;
    usage?: {
      creditsUsed: number;
    } | null;
  }>;
  project: {
    id: string;
    name: string;
    status: string;
    domain: string;
    toolsUrl: string;
  };
  usageSummary?: {
    title: string;
    total: string;
  } | null;
};

export function ProjectAgentPanel({
  activeRunId = null,
  appUrl,
  initialMessages = [],
  project,
  usageSummary = null
}: ProjectAgentPanelProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<AgentMode>('use');
  const [isSending, setIsSending] = useState(false);
  const chatRef = useRef<ProjectAgentChatHandle | null>(null);

  const handleSendingChange = useCallback((nextIsSending: boolean) => {
    setIsSending(nextIsSending);
  }, []);

  return (
    <section className="agent-column">
      <header className="project-header">
        <ActionLink className="min-h-8 border-transparent px-0 py-1" href="/home" variant="ghost">
          <ArrowLeft size={17} />
          {t.project.appsBack}
        </ActionLink>
        <div className="project-header-actions">
          {usageSummary ? (
            <span className="project-credit-summary" title={usageSummary.title}>
              <strong>{usageSummary.total}</strong>
            </span>
          ) : null}
          <ProjectSettingsMenu
            isClearHistoryDisabled={isSending}
            onClearHistory={() => chatRef.current?.clearHistory()}
            project={{
              id: project.id,
              domain: project.domain,
              templateName: project.name
            }}
          />
        </div>
      </header>

      <ProjectAgentChat
        activeRunId={activeRunId}
        initialMessages={initialMessages}
        mode={mode}
        onModeChange={setMode}
        onSendingChange={handleSendingChange}
        project={project}
        ref={chatRef}
      />
    </section>
  );
}
