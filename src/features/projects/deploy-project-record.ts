import { type ProjectResources } from '@/server/deploy/project-resources'
import { type CurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'

import { type InstallableAppTemplate } from './deploy-template'

export async function createQueuedProjectRecord({
  agentToolsToken,
  devDomain,
  domain,
  id,
  projectRepositoryUrl,
  publicScheme,
  resourceState,
  slug,
  template,
  user
}: {
  agentToolsToken: string
  devDomain: string
  domain: string
  id: string
  projectRepositoryUrl: string
  publicScheme: string
  resourceState: ProjectResources
  slug: string
  template: InstallableAppTemplate
  user: CurrentUser
}) {
  return prisma.project.create({
    data: {
      id,
      userId: user.id,
      templateId: template.id,
      templateName: template.name,
      git: projectRepositoryUrl,
      slug,
      domain,
      devDomain,
      url: `${publicScheme}://${domain}`,
      devUrl: `${publicScheme}://${devDomain}`,
      status: 'queued',
      appPort: template.appPort,
      agentPort: template.agentPort,
      agentToolsToken,
      resources: resourceState,
      members: {
        create: {
          role: 'admin',
          userId: user.id
        }
      }
    }
  })
}
