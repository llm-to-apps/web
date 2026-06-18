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
