import { randomInt } from 'node:crypto';

import subdomainWords from '@/data/subdomain-words.json';
import type { prisma } from '@/lib/db';
import { cleanSubdomain } from '@/lib/templates';

type PrismaClientLike = typeof prisma;

const maxRandomAttempts = 30;

export async function createAvailableSubdomain({
  db,
  fallbackId,
  prefix,
  rootDomain
}: {
  db: PrismaClientLike;
  fallbackId: string;
  prefix: string;
  rootDomain: string;
}) {
  const cleanPrefix = cleanSubdomain(prefix);

  for (let attempt = 0; attempt < maxRandomAttempts; attempt += 1) {
    const subdomain = cleanSubdomain(`${cleanPrefix}-${pickRandomSubdomainWord()}`);
    const domain = `${subdomain}.${rootDomain}`;
    const existingProject = await db.project.findFirst({
      where: {
        domain,
        deletedAt: null,
        status: {
          notIn: ['deleting', 'deleted']
        }
      },
      select: { id: true }
    });

    if (!existingProject) {
      return subdomain;
    }
  }

  return cleanSubdomain(`${cleanPrefix}-${fallbackId.slice(0, 6)}`);
}

export function pickRandomSubdomainWord() {
  return subdomainWords[randomInt(subdomainWords.length)];
}
