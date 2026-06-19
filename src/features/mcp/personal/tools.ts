export function personalOsTools() {
  return [
    {
      name: 'list_apps',
      description: 'List applications available to the current OS7 user.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'apps_search',
      description:
        'Search installable OS7 app templates by user intent, category, or free-text query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Free-text app search query, such as "money" or "finance".'
          },
          category: {
            type: 'string',
            description: 'Optional app category, such as "finance" or "productivity".'
          },
          intent: {
            type: 'string',
            description:
              'Optional user intent in natural language, such as "organize my finances".'
          }
        },
        additionalProperties: false
      }
    },
    {
      name: 'apps_get',
      description: 'Get one OS7 app template from the catalog by app id.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'The app template id returned by apps_search, such as "money".'
          }
        },
        required: ['appId'],
        additionalProperties: false
      }
    },
    {
      name: 'apps_request_install',
      description:
        'Request installation of an OS7 app template for the current user. Returns an installed app id and deployment status.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'The app template id returned by apps_search, such as "money".'
          },
          reason: {
            type: 'string',
            description: 'Short user-facing reason for installing this app.'
          }
        },
        required: ['appId'],
        additionalProperties: false
      }
    },
    {
      name: 'apps_list_installed',
      description: 'List applications already installed for the current OS7 user.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'apps_get_install_status',
      description:
        'Check installation/deployment status by installed app id or app template id.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description:
              'Installed app project id returned by apps_request_install, or a template id such as "money".'
          }
        },
        required: ['appId'],
        additionalProperties: false
      }
    },
    {
      name: 'get_usage_summary',
      description: 'Return total agent credit usage for the current OS7 user.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'search_uploaded_files',
      description:
        'Search files attached to the current user message for relevant passages. Returns no passages when no files are attached.',
      inputSchema: {
        type: 'object',
        properties: {
          attachedFileIds: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Uploaded file ids attached to the current user message.'
          },
          query: {
            type: 'string',
            description: 'The semantic search query for uploaded file content.'
          },
          projectId: {
            type: 'string',
            description: 'Project id when searching project-agent attachments.'
          },
          scope: {
            type: 'string',
            enum: ['user_agent', 'project_agent'],
            description: 'Attachment scope to search.'
          }
        },
        required: ['attachedFileIds', 'query'],
        additionalProperties: false
      }
    },
    {
      name: 'ask_app_agent',
      description:
        'Delegate a task to one app agent in Use mode. This cannot modify app code or run Dev mode.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'The app id returned by list_apps.'
          },
          message: {
            type: 'string',
            description: 'The task or question for the app agent.'
          }
        },
        required: ['appId', 'message'],
        additionalProperties: false
      }
    }
  ]
}

export function toolJson(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: value
  }
}
