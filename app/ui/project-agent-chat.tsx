'use client';

import {
  forwardRef,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Bot,
  Lock,
  Unlock,
  User,
  Workflow
} from 'lucide-react';
import {
  formatChatErrorMessage,
  formatChatProgressMessage
} from './chat-progress';
import { cn } from '@/lib/utils';
import { useI18n } from './i18n-provider';
import { Textarea } from './textarea';

type ProjectAgentChatProps = {
  activeRunId?: string | null;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onSendingChange?: (isSending: boolean) => void;
  project: {
    id: string;
    name: string;
    status: string;
    domain: string;
    toolsUrl: string;
  };
  initialMessages?: ChatMessage[];
};

export type ProjectAgentChatHandle = {
  clearHistory: () => void;
};

type AgentRunResponse = {
  ok?: boolean;
  runId?: string;
  message?: string;
};

type ProjectChatStateResponse = {
  activeRunId?: string | null;
  messages?: ChatMessage[];
  ok?: boolean;
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  source?: string | null;
  content: string;
  kind?: 'message' | 'progress' | 'error';
  usage?: CreditUsage | null;
};

type TokenUsage = {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
};

type CreditUsage = {
  creditsUsed: number;
};

type AgentStreamEvent =
  | {
      type: 'text';
      text: string;
    }
	  | {
	      type: 'progress';
	      message: string;
	      toolInput?: unknown;
	      toolName?: string;
	      toolState?: 'running' | 'finished';
	    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'usage';
      usage: TokenUsage;
    }
  | {
      type: 'credits';
      creditsUsed: number;
    }
  | {
      type: 'done';
    };

export type AgentMode = 'use' | 'dev';

export const ProjectAgentChat = forwardRef<ProjectAgentChatHandle, ProjectAgentChatProps>(
function ProjectAgentChat(
  {
    activeRunId = null,
    initialMessages = [],
    mode,
    onModeChange,
    onSendingChange,
    project
  },
  ref
) {
  const { format, t } = useI18n();
  const welcomeMessage: ChatMessage = useMemo(
    () => ({
      id: 'welcome',
      role: 'assistant',
      content: format(t.chat.welcome, { name: project.name })
    }),
    [format, project.name, t.chat.welcome]
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.length > 0
      ? initialMessages
      : [welcomeMessage]
  );
  const [input, setInput] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const isClearingRef = useRef(false);
  const isSendingRef = useRef(false);
  const previousModeRef = useRef<AgentMode>(mode);

  useEffect(() => {
    onSendingChange?.(isSending);
    isSendingRef.current = isSending;
  }, [isSending, onSendingChange]);

  useEffect(() => {
    isClearingRef.current = isClearing;
  }, [isClearing]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: 'end'
    });
  }, [messages]);

  useEffect(() => {
    if (previousModeRef.current === mode) {
      return;
    }

    previousModeRef.current = mode;
    activeRunRef.current = null;
    setMessages([welcomeMessage]);
  }, [mode, welcomeMessage]);

  useEffect(() => {
    if (!activeRunId || activeRunRef.current === activeRunId) {
      return;
    }

    startRunStream(activeRunId);
  }, [activeRunId, t.chat.started]);

  useEffect(() => {
    let isStopped = false;
    const source = new EventSource(
      `/api/projects/${encodeURIComponent(project.id)}/agent/chat/events`
    );

    const syncChatState = async () => {
      if (isStopped || isClearingRef.current) {
        return;
      }

      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/agent/chat?mode=${mode}`,
        {
          cache: 'no-store'
        }
      );
      const data = (await response.json().catch(() => null)) as ProjectChatStateResponse | null;

      if (isStopped || !response.ok || !data?.ok) {
        return;
      }

      if (!isSendingRef.current && data.messages) {
        setMessages(data.messages.length > 0 ? data.messages : [welcomeMessage]);
      }

      if (data.activeRunId && activeRunRef.current !== data.activeRunId) {
        startRunStream(data.activeRunId);
      } else if (!data.activeRunId) {
        activeRunRef.current = null;
      }
    };

    source.addEventListener('chat_changed', () => {
      void syncChatState();
    });
    void syncChatState();

    return () => {
      isStopped = true;
      source.close();
    };
  }, [mode, project.id, welcomeMessage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  }

  async function sendMessage() {
    const content = input.trim();

    if (!content || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content
    };
    const assistantMessageId = crypto.randomUUID();

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: t.chat.started,
        kind: 'progress'
      }
    ]);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content,
          mode
        })
      });

      const data = (await response.json().catch(() => null)) as AgentRunResponse | null;

      if (!response.ok || !data?.runId) {
        throw new Error(data?.message ?? `${t.chat.requestFailed} (${response.status})`);
      }

      activeRunRef.current = data.runId;
      await streamAgentRun(data.runId, assistantMessageId);
      ensureAssistantMessage(assistantMessageId, t.chat.done);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.chat.requestFailed;
      replaceMessage(assistantMessageId, formatChatErrorMessage(message), 'error');
    } finally {
      setIsSending(false);
    }
  }

  const clearHistory = useCallback(async () => {
    if (isSending || isClearing) {
      return;
    }

    setIsClearing(true);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/agent/chat/history?mode=${mode}`,
        {
          method: 'DELETE'
        }
      );
      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(data?.message ?? `${t.chat.clearFailed} (${response.status})`);
      }

      setMessages([welcomeMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.chat.clearFailed;
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: message,
          kind: 'error'
        }
      ]);
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, isSending, mode, project.id, t.chat.clearFailed, welcomeMessage]);

  useImperativeHandle(
    ref,
    () => ({
      clearHistory: () => {
        void clearHistory();
      }
    }),
    [clearHistory]
  );

  function replaceMessage(
    messageId: string,
    content: string,
    kind: ChatMessage['kind'] = 'message'
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content,
              kind
            }
          : message
      )
    );
  }

  function appendToMessage(
    messageId: string,
    content: string,
    kind: ChatMessage['kind'] = 'message'
  ) {
    setMessages((currentMessages) =>
      currentMessages.some((message) => message.id === messageId)
        ? currentMessages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: `${message.content}${content}`,
                  kind
                }
              : message
          )
        : [
            ...currentMessages,
            {
              id: messageId,
              role: 'assistant',
              content,
              kind
            }
          ]
    );
  }

  function ensureAssistantMessage(messageId: string, fallbackContent: string) {
    setMessages((currentMessages) => {
      const existingMessage = currentMessages.find((message) => message.id === messageId);

      if (existingMessage?.content.trim()) {
        return currentMessages;
      }

      if (existingMessage) {
        return currentMessages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: fallbackContent
              }
            : message
        );
      }

      return [
        ...currentMessages,
        {
          id: messageId,
          role: 'assistant',
          content: fallbackContent
        }
      ];
    });
  }

  function formatProgressMessage(event: Extract<AgentStreamEvent, { type: 'progress' }>) {
    return formatChatProgressMessage(event, t.chat.working);
  }

  function startRunStream(runId: string) {
    activeRunRef.current = runId;
    const assistantMessageId = `run-${runId}`;

    setMessages((currentMessages) =>
      currentMessages.some((message) => message.id === assistantMessageId)
        ? currentMessages
        : [
            ...currentMessages,
            {
              id: assistantMessageId,
              role: 'assistant',
              content: t.chat.started,
              kind: 'progress'
            }
          ]
    );
    setIsSending(true);
    streamAgentRun(runId, assistantMessageId).finally(() => {
      setIsSending(false);
    });
  }

  async function streamAgentRun(runId: string, assistantMessageId: string) {
    let hasAssistantText = false;

    await subscribeAgentRun(runId, (event) => {
      if (event.type === 'text') {
        if (!hasAssistantText) {
          hasAssistantText = true;
          replaceMessage(assistantMessageId, event.text, 'message');
          return;
        }
        appendToMessage(assistantMessageId, event.text);
        return;
      }

      if (event.type === 'progress') {
        if (!hasAssistantText) {
          replaceMessage(assistantMessageId, formatProgressMessage(event), 'progress');
        }
        return;
      }

      if (event.type === 'error') {
        const errorMessage = formatChatErrorMessage(event.message);
        if (!hasAssistantText) {
          replaceMessage(assistantMessageId, errorMessage, 'error');
          return;
        }

        appendToMessage(assistantMessageId, `\n${errorMessage}`, 'error');
        return;
      }

      if (event.type === 'usage') {
        return;
      }

      if (event.type === 'credits') {
        updateMessageUsage(assistantMessageId, {
          creditsUsed: event.creditsUsed
        });
      }
    });
  }

  function updateMessageUsage(messageId: string, usage: CreditUsage) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              usage
            }
          : message
      )
    );
  }

  return (
    <div className="agent-chat project-agent-chat">
      <div className="chat-messages" aria-live="polite">
        {messages.map((message) => (
          <article
            className={[
              'chat-message',
              message.role,
              message.source === 'user_agent' ? 'user-agent' : '',
              message.kind ?? 'message'
            ].join(' ')}
            key={message.id}
          >
            <div className="chat-avatar">
              {message.role === 'assistant' ? (
                <Bot size={16} />
              ) : message.source === 'user_agent' ? (
                <Workflow size={16} />
              ) : (
                <User size={16} />
              )}
            </div>
            <p>
              {message.kind === 'progress' ? (
                <span className="chat-progress-spinner" aria-hidden="true" />
              ) : null}
              <span>{message.content}</span>
            </p>
            {message.role === 'assistant' && message.usage ? (
              <CreditUsageBadge usage={message.usage} />
            ) : null}
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <div
          className="grid w-fit grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
          role="tablist"
          aria-label={t.chat.modeSwitcherLabel}
        >
          <button
            aria-selected={mode === 'use'}
            className={cn(
              'inline-flex min-h-8 min-w-20 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold text-slate-500 transition-[background-color,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60',
              mode === 'use' ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-950'
            )}
            disabled={isSending}
            onClick={() => onModeChange('use')}
            role="tab"
            title={t.chat.useModeLabel}
            type="button"
          >
            <Lock size={13} />
            {t.chat.useMode}
          </button>
          <button
            aria-selected={mode === 'dev'}
            className={cn(
              'inline-flex min-h-8 min-w-20 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold text-slate-500 transition-[background-color,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60',
              mode === 'dev' ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-950'
            )}
            disabled={isSending}
            onClick={() => onModeChange('dev')}
            role="tab"
            title={t.chat.devModeLabel}
            type="button"
          >
            <Unlock size={13} />
            {t.chat.devMode}
          </button>
        </div>
        <Textarea
          aria-label={t.chat.messageAria}
          disabled={isSending}
          onKeyDown={handleInputKeyDown}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === 'use'
              ? t.chat.usePlaceholder
              : t.chat.devPlaceholder
          }
          rows={3}
          value={input}
        />
      </form>
    </div>
  );
});

async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = flushStreamLines(buffer, onEvent);
  }

  buffer += decoder.decode();
  flushStreamLines(`${buffer}\n`, onEvent);
  reader.releaseLock();
}

function flushStreamLines(
  buffer: string,
  onEvent: (event: AgentStreamEvent) => void
) {
  const lines = buffer.split('\n');
  const remainder = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const event = parseAgentStreamEvent(line);

    if (event) {
      onEvent(event);
    }
  }

  return remainder;
}

function parseAgentStreamEvent(line: string): AgentStreamEvent | null {
  try {
    const event = JSON.parse(line) as AgentStreamEvent;

    if (
      event.type === 'text' ||
      event.type === 'progress' ||
      event.type === 'error' ||
      event.type === 'usage' ||
      event.type === 'credits' ||
      event.type === 'done'
    ) {
      return event;
    }
  } catch {
    return null;
  }

  return null;
}

function subscribeAgentRun(
  runId: string,
  onEvent: (event: AgentStreamEvent) => void
) {
  return new Promise<void>((resolve, reject) => {
    const source = new EventSource(`/api/agent/runs/${encodeURIComponent(runId)}/events`);

    source.onmessage = (message) => {
      const event = parseAgentRunEvent(message.data);

      if (!event) {
        return;
      }

      onEvent(event);

      if (event.type === 'done') {
        source.close();
        resolve();
      }

      if (event.type === 'error') {
        source.close();
        resolve();
      }
    };

    source.onerror = () => {
      source.close();
      reject(new Error('Agent event stream failed'));
    };
  });
}

function parseAgentRunEvent(data: string): AgentStreamEvent | null {
  try {
    const event = JSON.parse(data) as AgentStreamEvent;

    if (
      event.type === 'text' ||
      event.type === 'progress' ||
      event.type === 'error' ||
      event.type === 'usage' ||
      event.type === 'credits' ||
      event.type === 'done'
    ) {
      return event;
    }
  } catch {
    return null;
  }

  return null;
}

function CreditUsageBadge({ usage }: { usage: CreditUsage }) {
  const { locale } = useI18n();

  if (usage.creditsUsed <= 0) {
    return null;
  }

  const formattedCredits = formatCredits(usage.creditsUsed, locale);

  return <span className="chat-usage" title={`${formattedCredits} credits used`}>{formattedCredits} ₵</span>;
}

function formatCredits(value: number, locale?: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value);
}
