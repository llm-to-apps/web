'use client'

import {
  FormEvent,
  KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from 'react'
import { Bot, User } from 'lucide-react'
import {
  Avatar,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea
} from '@mantine/core'
import { useHover } from '@mantine/hooks'
import {
  formatChatErrorMessage,
  formatChatProgressMessage
} from '../_components/chat-progress'
import { ChatOptionsMenu } from './chat-options-menu'
import { useI18n } from '../_components/i18n-provider'
import type { ApiResponse } from '@/shared/api'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  kind?: 'message' | 'progress' | 'error'
  usage?: CreditUsage | null
}

type TokenUsage = {
  completionTokens?: number
  promptTokens?: number
  totalTokens?: number
}

type CreditUsage = {
  creditsUsed: number
}

type AgentStreamEvent =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'progress'
      message: string
      toolInput?: unknown
      toolName?: string
      toolState?: 'running' | 'finished'
    }
  | {
      type: 'error'
      message: string
    }
  | {
      type: 'usage'
      usage: TokenUsage
    }
  | {
      type: 'credits'
      creditsUsed: number
    }
  | {
      type: 'done'
    }

type UserAgentChatProps = {
  activeRunId?: string | null
  initialMessages?: ChatMessage[]
}

type AgentRunResponse = ApiResponse<{ runId: string }>

export function UserAgentChat({
  activeRunId = null,
  initialMessages = []
}: UserAgentChatProps) {
  const { t } = useI18n()
  const welcomeMessage: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: t.userAgent.welcome
  }
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.length > 0 ? initialMessages : [welcomeMessage]
  )
  const [input, setInput] = useState('')
  const [isClearing, setIsClearing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const activeRunRef = useRef<string | null>(null)
  const streamAgentRunRef = useRef<
    (runId: string, assistantMessageId: string) => Promise<void>
  >(async () => undefined)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: 'end'
    })
  }, [messages])

  useEffect(() => {
    streamAgentRunRef.current = streamAgentRun
  })

  useEffect(() => {
    if (!activeRunId || activeRunRef.current === activeRunId) {
      return
    }

    activeRunRef.current = activeRunId
    const assistantMessageId = `run-${activeRunId}`

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
    )
    setIsSending(true)
    streamAgentRunRef.current(activeRunId, assistantMessageId).finally(() => {
      setIsSending(false)
    })
  }, [activeRunId, t.chat.started])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendMessage()
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    void sendMessage()
  }

  async function sendMessage() {
    const content = input.trim()

    if (!content || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content
    }
    const assistantMessageId = crypto.randomUUID()

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: t.chat.started,
        kind: 'progress'
      }
    ])
    setInput('')
    setIsSending(true)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content
        })
      })

      const data = (await response.json().catch(() => null)) as AgentRunResponse | null

      if (!response.ok || !data || !data.ok) {
        throw new Error(
          data && !data.ok
            ? data.error.message
            : `${t.chat.requestFailed} (${response.status})`
        )
      }

      await streamAgentRun(data.data.runId, assistantMessageId)
      ensureAssistantMessage(assistantMessageId, t.chat.done)
    } catch (error) {
      const message = error instanceof Error ? error.message : t.chat.requestFailed
      replaceMessage(assistantMessageId, formatChatErrorMessage(message), 'error')
    } finally {
      setIsSending(false)
    }
  }

  async function clearHistory() {
    if (isSending || isClearing) {
      return
    }

    setIsClearing(true)

    try {
      const response = await fetch('/api/agent/chat/history', {
        method: 'DELETE'
      })
      const data = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok) {
        throw new Error(
          data && !data.ok
            ? data.error.message
            : `${t.chat.clearFailed} (${response.status})`
        )
      }

      setMessages([welcomeMessage])
    } catch (error) {
      const message = error instanceof Error ? error.message : t.chat.clearFailed
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: message,
          kind: 'error'
        }
      ])
    } finally {
      setIsClearing(false)
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
    )
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
    )
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
    )
  }

  function formatProgressMessage(event: Extract<AgentStreamEvent, { type: 'progress' }>) {
    return formatChatProgressMessage(event, t.chat.working)
  }

  async function streamAgentRun(runId: string, assistantMessageId: string) {
    let hasAssistantText = false

    await subscribeAgentRun(runId, (event) => {
      if (event.type === 'text') {
        if (!hasAssistantText) {
          hasAssistantText = true
          replaceMessage(assistantMessageId, event.text, 'message')
          return
        }

        appendToMessage(assistantMessageId, event.text)
        return
      }

      if (event.type === 'progress') {
        if (!hasAssistantText) {
          replaceMessage(assistantMessageId, formatProgressMessage(event), 'progress')
        }
        return
      }

      if (event.type === 'error') {
        const errorMessage = formatChatErrorMessage(event.message)
        if (!hasAssistantText) {
          replaceMessage(assistantMessageId, errorMessage, 'error')
          return
        }

        appendToMessage(assistantMessageId, `\n${errorMessage}`, 'error')
        return
      }

      if (event.type === 'usage') {
        return
      }

      if (event.type === 'credits') {
        updateMessageUsage(assistantMessageId, {
          creditsUsed: event.creditsUsed
        })
      }
    })
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
    )
  }

  return (
    <Paper
      aria-label={t.chat.messageAria}
      h="70vh"
      p="md"
      pos="relative"
      style={{ overflow: 'hidden' }}
      withBorder
    >
      <Box
        left={0}
        pos="absolute"
        right={0}
        style={{
          background:
            'linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.92) 58%, rgba(255,255,255,0) 100%)',
          zIndex: 2
        }}
        top={0}
      >
        <Group justify="flex-end" pb="xl" pt="md" px="md">
          <ChatOptionsMenu
            disabled={isSending || isClearing}
            isClearing={isClearing}
            onClearHistory={clearHistory}
          />
        </Group>
      </Box>
      <Stack h="100%" mih={0}>
        <ScrollArea flex={1} mih={0} aria-live="polite">
          <Stack gap="sm" pr="sm" pt={56}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                usage={message.role === 'assistant' ? message.usage : null}
              >
                <Group align="flex-start" gap="sm">
                  <Avatar color={message.role === 'assistant' ? 'os7' : 'gray'} size={30}>
                    {message.role === 'assistant' ? (
                      <Bot size={16} />
                    ) : (
                      <User size={16} />
                    )}
                  </Avatar>
                  <Stack gap={4} flex={1}>
                    <MessageText>
                      {message.kind === 'progress' ? (
                        <Group component="span" gap={6} wrap="nowrap">
                          <Loader size="xs" type="dots" />
                          <Text component="span">{message.content}</Text>
                        </Group>
                      ) : (
                        message.content
                      )}
                    </MessageText>
                  </Stack>
                </Group>
              </MessageBubble>
            ))}
            <div ref={messagesEndRef} />
          </Stack>
        </ScrollArea>

        <form onSubmit={handleSubmit}>
          <Stack>
            <Textarea
              aria-label={t.chat.messageAria}
              disabled={isSending}
              onKeyDown={handleInputKeyDown}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t.userAgent.placeholder}
              rows={3}
              value={input}
            />
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}

function MessageBubble({
  children,
  usage
}: {
  children: ReactNode
  usage?: CreditUsage | null
}) {
  const { hovered, ref } = useHover()

  return (
    <Paper ref={ref} p="sm" pos="relative" withBorder>
      {hovered && usage ? <CreditUsageBadge usage={usage} /> : null}
      {children}
    </Paper>
  )
}

function CreditUsageBadge({ usage }: { usage: CreditUsage }) {
  const { locale } = useI18n()

  if (usage.creditsUsed <= 0) {
    return null
  }

  const formattedCredits = formatCredits(usage.creditsUsed, locale)

  return (
    <Badge pos="absolute" right={8} top={8} title={`${formattedCredits} credits used`}>
      {formattedCredits} ₵
    </Badge>
  )
}

function MessageText({ children }: { children: ReactNode }) {
  return (
    <Text component="pre" ff="inherit" lh="md" m={0} pt={4} textWrap="wrap">
      {children}
    </Text>
  )
}

function formatCredits(value: number, locale?: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value)
}

function subscribeAgentRun(runId: string, onEvent: (event: AgentStreamEvent) => void) {
  return new Promise<void>((resolve, reject) => {
    const source = new EventSource(`/api/agent/runs/${encodeURIComponent(runId)}/events`)

    source.onmessage = (message) => {
      const event = parseAgentRunEvent(message.data)

      if (!event) {
        return
      }

      onEvent(event)

      if (event.type === 'done') {
        source.close()
        resolve()
      }

      if (event.type === 'error') {
        source.close()
        resolve()
      }
    }

    source.onerror = () => {
      source.close()
      reject(new Error('Agent event stream failed'))
    }
  })
}

function parseAgentRunEvent(data: string): AgentStreamEvent | null {
  try {
    const event = JSON.parse(data) as AgentStreamEvent

    if (
      event.type === 'text' ||
      event.type === 'progress' ||
      event.type === 'error' ||
      event.type === 'usage' ||
      event.type === 'credits' ||
      event.type === 'done'
    ) {
      return event
    }
  } catch {
    return null
  }

  return null
}
