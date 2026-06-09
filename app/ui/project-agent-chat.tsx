'use client';

import { FormEvent, useState } from 'react';
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
};

type ChatResult =
  | {
      ok: true;
      message: ChatMessage;
    }
  | {
      ok: false;
      message: string;
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

    setMessages((currentMessages) => [...currentMessages, userMessage]);
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
      const data = (await response.json()) as ChatResult;

      setMessages((currentMessages) => [
        ...currentMessages,
        data.ok
          ? data.message
          : {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: data.message
            }
      ]);
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Agent request failed'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="agent-chat">
      <div className="agent-context">
        <span>Agent tools</span>
        <strong>{project.toolsUrl}</strong>
      </div>

      <div className="chat-messages" aria-live="polite">
        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <div className="chat-avatar">
              {message.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <p>{message.content}</p>
          </article>
        ))}
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
