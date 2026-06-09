'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';

type ProjectAgentChatProps = {
  project: {
    id: string;
    name: string;
    status: string;
    domain: string;
    toolsUrl: string;
  };
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

export function ProjectAgentChat({ project }: ProjectAgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `I am attached to ${project.name}. Ask me what you want to change or inspect.`
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
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
          message: content
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
            <p>{message.content}</p>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-form" onSubmit={sendMessage}>
        <textarea
          aria-label="Message agent"
          disabled={isSending}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the agent to inspect or change the app..."
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
