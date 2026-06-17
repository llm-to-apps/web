const toolDisplayNames: Record<string, string> = {
  askAppAgent: 'Ask app',
  buildProjectApp: 'Build app',
  callAppMcpTool: 'Call app tool',
  getPersonalUsageSummary: 'Get usage summary',
  getProjectAppLogs: 'Get app logs',
  getProjectAppStatus: 'Get app status',
  getProjectDiff: 'Get project diff',
  getProjectGitStatus: 'Get git status',
  listAppMcpTools: 'List app tools',
  listPersonalApps: 'List apps',
  listProjectFiles: 'List project files',
  patchProjectFiles: 'Patch project files',
  readProjectFile: 'Read project file',
  replaceTextInFile: 'Replace text in file',
  restartProjectProdServer: 'Restart prod',
  runProjectCommand: 'Run project command',
  runtimeStatus: 'Check runtime status',
  saveProjectChanges: 'Save project changes',
  searchProjectFiles: 'Search project files',
  startProjectDevServer: 'Start dev',
  stopProjectDevServer: 'Stop dev',
  writeProjectFile: 'Write project file'
}

type ChatProgressEvent = {
  message: string
  toolInput?: unknown
  toolName?: string
}

export function formatChatProgressMessage(event: ChatProgressEvent, fallback: string) {
  const toolName = event.toolName

  if (toolName) {
    return formatToolProgressEvent(event, toolName)
  }

  const message = event.message.trim()

  return message || fallback
}

export function formatChatErrorMessage(message: string) {
  const normalizedMessage = message.trim()

  if (!normalizedMessage) {
    return 'Agent error'
  }

  return normalizedMessage
}

function formatToolProgressEvent(event: ChatProgressEvent, toolName: string) {
  const displayName = formatToolDisplayName(toolName)
  const appName = toolName === 'askAppAgent' ? findAppName(event.toolInput) : ''

  return appName ? `${displayName}: ${appName}` : displayName
}

function formatToolDisplayName(toolName: string) {
  return toolDisplayNames[toolName] ?? humanizeIdentifier(toolName)
}

function humanizeIdentifier(value: string) {
  const spacedValue = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()

  if (!spacedValue) {
    return 'tool'
  }

  return `${spacedValue.charAt(0).toUpperCase()}${spacedValue.slice(1)}`
}

function findAppName(toolInput: unknown) {
  if (!isObjectRecord(toolInput)) {
    return ''
  }

  return typeof toolInput.appName === 'string' ? toolInput.appName.trim() : ''
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
