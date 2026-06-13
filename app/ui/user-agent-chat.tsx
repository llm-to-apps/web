'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Bot, User } from 'lucide-react';
import {
  formatChatErrorMessage,
  formatChatProgressMessage
} from './chat-progress';
import { ChatOptionsMenu } from './chat-options-menu';
import { useI18n } from './i18n-provider';
import { Textarea } from './textarea';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
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

type UserAgentChatProps = {
  activeRunId?: string | null;
  initialMessages?: ChatMessage[];
};

type AgentRunResponse = {
  ok?: boolean;
  runId?: string;
  message?: string;
};

export function UserAgentChat({
  activeRunId = null,
  initialMessages = []
}: UserAgentChatProps) {
  const { t } = useI18n();
  const welcomeMessage: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: t.userAgent.welcome
  };
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: 'end'
    });
  }, [messages]);

  useEffect(() => {
    if (!activeRunId || activeRunRef.current === activeRunId) {
      return;
    }

    activeRunRef.current = activeRunId;
    const assistantMessageId = `run-${activeRunId}`;

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
    streamAgentRun(activeRunId, assistantMessageId).finally(() => {
      setIsSending(false);
    });
  }, [activeRunId, t.chat.started]);

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

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
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
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content
        })
      });

      const data = (await response.json().catch(() => null)) as AgentRunResponse | null;

      if (!response.ok || !data?.runId) {
        throw new Error(data?.message ?? `${t.chat.requestFailed} (${response.status})`);
      }

      await streamAgentRun(data.runId, assistantMessageId);
      ensureAssistantMessage(assistantMessageId, t.chat.done);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.chat.requestFailed;
      replaceMessage(assistantMessageId, formatChatErrorMessage(message), 'error');
    } finally {
      setIsSending(false);
    }
  }

  async function clearHistory() {
    if (isSending || isClearing) {
      return;
    }

    setIsClearing(true);

    try {
      const response = await fetch('/api/agent/chat/history', {
        method: 'DELETE'
      });
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
  }

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
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId && !message.content.trim()
          ? {
              ...message,
              content: fallbackContent
            }
          : message
      )
    );
  }

  function formatProgressMessage(event: Extract<AgentStreamEvent, { type: 'progress' }>) {
    return formatChatProgressMessage(event, t.chat.working);
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
    <section className="user-agent-panel" aria-label={t.chat.messageAria}>
      <div className="agent-chat">
        <div className="chat-toolbar">
          <ChatOptionsMenu
            disabled={isSending || isClearing}
            isClearing={isClearing}
            onClearHistory={clearHistory}
          />
        </div>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <article
              className={`chat-message ${message.role} ${message.kind ?? 'message'}`}
              key={message.id}
            >
              <div className="chat-avatar">
                {message.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
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

        <form className="user-chat-form" onSubmit={handleSubmit}>
          <Textarea
            aria-label={t.chat.messageAria}
            disabled={isSending}
            onKeyDown={handleInputKeyDown}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.userAgent.placeholder}
            rows={3}
            value={input}
          />
        </form>
      </div>
    </section>
  );
}

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

function flushStreamLines(buffer: string, onEvent: (event: AgentStreamEvent) => void) {
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
