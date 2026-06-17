'use client'

import {
  forwardRef,
  FormEvent,
  KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { Bot, Code2, MousePointer2, User, Workflow } from 'lucide-react'
import {
  Avatar,
  Badge,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea
} from '@mantine/core'
import { useHover } from '@mantine/hooks'
import {
  formatChatErrorMessage,
  formatChatProgressMessage
} from '../../_components/chat-progress'
import { useI18n } from '../../_components/i18n-provider'
import type { ApiResponse } from '@/shared/api'

type ProjectAgentChatProps = {
  activeRunId?: string | null
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  onSendingChange?: (isSending: boolean) => void
  project: {
    id: string
    name: string
    status: string
    domain: string
    toolsUrl: string
  }
  initialMessages?: ChatMessage[]
}

export type ProjectAgentChatHandle = {
  clearHistory: () => void
}

type AgentRunResponse = ApiResponse<{ runId: string }>

type ProjectChatStateResponse = ApiResponse<{
  activeRunId: string | null
  messages: ChatMessage[]
}>

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  source?: string | null
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

export type AgentMode = 'use' | 'dev'

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
    const { format, t } = useI18n()
    const welcomeMessage: ChatMessage = useMemo(
      () => ({
        id: 'welcome',
        role: 'assistant',
        content: format(t.chat.welcome, { name: project.name })
      }),
      [format, project.name, t.chat.welcome]
    )
    const [messages, setMessages] = useState<ChatMessage[]>(
      initialMessages.length > 0 ? initialMessages : [welcomeMessage]
    )
    const [input, setInput] = useState('')
    const [isClearing, setIsClearing] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement | null>(null)
    const activeRunRef = useRef<string | null>(null)
    const startRunStreamRef = useRef<(runId: string) => void>(() => undefined)
    const isClearingRef = useRef(false)
    const isSendingRef = useRef(false)
    const previousModeRef = useRef<AgentMode>(mode)

    useEffect(() => {
      onSendingChange?.(isSending)
      isSendingRef.current = isSending
    }, [isSending, onSendingChange])

    useEffect(() => {
      isClearingRef.current = isClearing
    }, [isClearing])

    useEffect(() => {
      startRunStreamRef.current = startRunStream
    })

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({
        block: 'end'
      })
    }, [messages])

    useEffect(() => {
      if (previousModeRef.current === mode) {
        return
      }

      previousModeRef.current = mode
      activeRunRef.current = null
      setMessages([welcomeMessage])
    }, [mode, welcomeMessage])

    useEffect(() => {
      if (!activeRunId || activeRunRef.current === activeRunId) {
        return
      }

      startRunStreamRef.current(activeRunId)
    }, [activeRunId])

    useEffect(() => {
      let isStopped = false
      const source = new EventSource(
        `/api/projects/${encodeURIComponent(project.id)}/agent/chat/events`
      )

      const syncChatState = async () => {
        if (isStopped || isClearingRef.current) {
          return
        }

        const response = await fetch(
          `/api/projects/${encodeURIComponent(project.id)}/agent/chat?mode=${mode}`,
          {
            cache: 'no-store'
          }
        )
        const data = (await response
          .json()
          .catch(() => null)) as ProjectChatStateResponse | null

        if (isStopped || !response.ok || !data?.ok) {
          return
        }

        if (!isSendingRef.current && data.data.messages) {
          setMessages(
            data.data.messages.length > 0 ? data.data.messages : [welcomeMessage]
          )
        }

        if (data.data.activeRunId && activeRunRef.current !== data.data.activeRunId) {
          startRunStreamRef.current(data.data.activeRunId)
        } else if (!data.data.activeRunId) {
          activeRunRef.current = null
        }
      }

      source.addEventListener('chat_changed', () => {
        void syncChatState()
      })
      void syncChatState()

      return () => {
        isStopped = true
        source.close()
      }
    }, [mode, project.id, welcomeMessage])

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

      setMessages((currentMessages) => [...currentMessages, userMessage])
      setMessages((currentMessages) => [
        ...currentMessages,
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
        const response = await fetch(
          `/api/projects/${encodeURIComponent(project.id)}/agent/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: content,
              mode
            })
          }
        )

        const data = (await response.json().catch(() => null)) as AgentRunResponse | null

        if (!response.ok || !data || !data.ok) {
          throw new Error(
            data && !data.ok
              ? data.error.message
              : `${t.chat.requestFailed} (${response.status})`
          )
        }

        activeRunRef.current = data.data.runId
        await streamAgentRun(data.data.runId, assistantMessageId)
        ensureAssistantMessage(assistantMessageId, t.chat.done)
      } catch (error) {
        const message = error instanceof Error ? error.message : t.chat.requestFailed
        replaceMessage(assistantMessageId, formatChatErrorMessage(message), 'error')
      } finally {
        setIsSending(false)
      }
    }

    const clearHistory = useCallback(async () => {
      if (isSending || isClearing) {
        return
      }

      setIsClearing(true)

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(project.id)}/agent/chat/history?mode=${mode}`,
          {
            method: 'DELETE'
          }
        )
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
    }, [isClearing, isSending, mode, project.id, t.chat.clearFailed, welcomeMessage])

    useImperativeHandle(
      ref,
      () => ({
        clearHistory: () => {
          void clearHistory()
        }
      }),
      [clearHistory]
    )

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
      setMessages((currentMessages) => {
        const existingMessage = currentMessages.find(
          (message) => message.id === messageId
        )

        if (existingMessage?.content.trim()) {
          return currentMessages
        }

        if (existingMessage) {
          return currentMessages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: fallbackContent
                }
              : message
          )
        }

        return [
          ...currentMessages,
          {
            id: messageId,
            role: 'assistant',
            content: fallbackContent
          }
        ]
      })
    }

    function formatProgressMessage(
      event: Extract<AgentStreamEvent, { type: 'progress' }>
    ) {
      return formatChatProgressMessage(event, t.chat.working)
    }

    function startRunStream(runId: string) {
      activeRunRef.current = runId
      const assistantMessageId = `run-${runId}`

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
      streamAgentRun(runId, assistantMessageId).finally(() => {
        setIsSending(false)
      })
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
      <Stack flex={1} mih={0}>
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
                    ) : message.source === 'user_agent' ? (
                      <Workflow size={16} />
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
          <Stack gap="sm">
            <SegmentedControl
              aria-label={t.chat.modeSwitcherLabel}
              data={[
                {
                  label: (
                    <Group gap={6} justify="center" wrap="nowrap">
                      <MousePointer2 size={16} />
                      <Text>{t.chat.useMode}</Text>
                    </Group>
                  ),
                  value: 'use'
                },
                {
                  label: (
                    <Group gap={6} justify="center" wrap="nowrap">
                      <Code2 size={16} />
                      <Text>{t.chat.devMode}</Text>
                    </Group>
                  ),
                  value: 'dev'
                }
              ]}
              disabled={isSending}
              onChange={(value) => onModeChange(value as AgentMode)}
              value={mode}
            />
            <Textarea
              aria-label={t.chat.messageAria}
              disabled={isSending}
              onKeyDown={handleInputKeyDown}
              onChange={(event) => setInput(event.target.value)}
              placeholder={mode === 'use' ? t.chat.usePlaceholder : t.chat.devPlaceholder}
              rows={3}
              value={input}
            />
          </Stack>
        </form>
      </Stack>
    )
  }
)

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
