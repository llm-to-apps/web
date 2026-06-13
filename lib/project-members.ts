import type { ProjectMemberRole } from '@prisma/client';

export const projectMemberRoles = ['admin', 'editor', 'viewer'] as const;

export type ProjectAccess = 'view' | 'edit' | 'admin';

const accessRoles: Record<ProjectAccess, ProjectMemberRole[]> = {
  admin: ['admin'],
  edit: ['admin', 'editor'],
  view: ['admin', 'editor', 'viewer']
};

export function projectMemberWhere(userId: string, access: ProjectAccess = 'view') {
  return {
    some: {
      role: {
        in: accessRoles[access]
      },
      userId
    }
  };
}

export function canUseProjectAgent(role: ProjectMemberRole, mode: 'dev' | 'use') {
  if (mode === 'dev') {
    return role === 'admin';
  }

  return role === 'admin' || role === 'editor';
}
