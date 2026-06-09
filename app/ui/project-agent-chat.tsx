'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, ExternalLink, Lock, Send, Unlock, User } from 'lucide-react';

type ProjectAgentChatProps = {
  project: {
    id: string;
    name: string;
    status: string;
    domain: string;
    toolsUrl: string;
    mcpUrl: string;
    mcpToken: string | null;
  };
  initialMessages?: ChatMessage[];
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  kind?: 'message' | 'progress' | 'error';
};

type AgentStreamEvent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'progress';
      message: string;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'done';
    };

type AgentMode = 'use' | 'dev';

export function ProjectAgentChat({ initialMessages = [], project }: ProjectAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.length > 0
      ? initialMessages
      : [
          {
            id: 'welcome',
            role: 'assistant',
            content: `I am attached to ${project.name}. Ask me what you want to change or inspect.`
          }
        ]
  );
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<AgentMode>('use');
  const [isSending, setIsSending] = useState(false);
  const [showMcpToken, setShowMcpToken] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: 'end'
    });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    let hasAssistantText = false;

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: 'Agent started.',
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

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? `Agent request failed with ${response.status}`);
      }

      await readAgentStream(response.body, (event) => {
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
            replaceMessage(assistantMessageId, formatProgressMessage(event.message), 'progress');
          }
          return;
        }

        if (event.type === 'error') {
          appendToMessage(assistantMessageId, event.message, 'error');
        }
      });

      ensureAssistantMessage(assistantMessageId, 'Done.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent request failed';
      appendToMessage(assistantMessageId, message, 'error');
    } finally {
      setIsSending(false);
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

  function formatProgressMessage(content: string) {
    const line = content.split('\n')[0]?.trim();

    return line || 'Agent is working.';
  }

  const modeButtonLabel =
    mode === 'use'
      ? 'Use mode is active. Click to enable Dev mode.'
      : 'Dev mode is active. Click to return to Use mode.';

  return (
    <div className="agent-chat">
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
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <details className="mcp-connect">
        <summary>Connect MCP to ChatGPT</summary>
        <div className="mcp-connect-panel">
          <p>
            Create a custom MCP app in ChatGPT Developer mode and use this server URL.
            ChatGPT must be able to reach the domain publicly; localhost needs a tunnel.
          </p>
          <label>
            MCP server URL
            <input readOnly value={project.mcpUrl} />
          </label>
          <label>
            Bearer token
            <span className="mcp-token-row">
              <input
                readOnly
                type={showMcpToken ? 'text' : 'password'}
                value={project.mcpToken ?? 'Token is not available'}
              />
              <button
                onClick={() => setShowMcpToken((currentValue) => !currentValue)}
                type="button"
              >
                {showMcpToken ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <ol>
            <li>Open ChatGPT workspace settings and enable Developer mode.</li>
            <li>Create a custom MCP app.</li>
            <li>Paste the MCP server URL and configure Bearer token auth.</li>
            <li>Test the app and enable it in ChatGPT.</li>
          </ol>
          <a
            href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt"
            rel="noreferrer"
            target="_blank"
          >
            OpenAI MCP app instructions
            <ExternalLink size={14} />
          </a>
        </div>
      </details>

      <form className="chat-form" onSubmit={sendMessage}>
        <button
          aria-label={modeButtonLabel}
          aria-pressed={mode === 'dev'}
          className={`agent-mode-button mode-${mode}`}
          disabled={isSending}
          onClick={() => setMode((currentMode) => (currentMode === 'use' ? 'dev' : 'use'))}
          title={modeButtonLabel}
          type="button"
        >
          {mode === 'use' ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
        <textarea
          aria-label="Message agent"
          disabled={isSending}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === 'use'
              ? 'Ask the agent to use the app...'
              : 'Ask the agent to inspect or change code...'
          }
          rows={3}
          value={input}
        />
        <button disabled={isSending || !input.trim()} type="submit">
          <Send size={17} />
        </button>
      </form>
    </div>
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
      event.type === 'done'
    ) {
      return event;
    }
  } catch {
    return null;
  }

  return null;
}
