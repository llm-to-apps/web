import { randomInt } from 'node:crypto';

import subdomainWords from '@/data/subdomain-words.json';
import type { prisma } from '@/lib/db';
import { cleanSubdomain } from '@/lib/templates';

type PrismaClientLike = typeof prisma;

const maxRandomAttempts = 30;

export async function createAvailableSubdomain({
  db,
  fallbackId,
  rootDomain
}: {
  db: PrismaClientLike;
  fallbackId: string;
  rootDomain: string;
}) {
  for (let attempt = 0; attempt < maxRandomAttempts; attempt += 1) {
    const subdomain = pickRandomSubdomainWord();
    const domain = `${subdomain}.${rootDomain}`;
    const existingProject = await db.project.findUnique({
      where: { domain },
      select: { id: true }
    });

    if (!existingProject) {
      return subdomain;
    }
  }

  const fallbackWord = pickRandomSubdomainWord();
  return cleanSubdomain(`${fallbackWord}-${fallbackId.slice(0, 6)}`);
}

export function pickRandomSubdomainWord() {
  return subdomainWords[randomInt(subdomainWords.length)];
}
