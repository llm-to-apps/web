import { PrismaClient } from '@prisma/client'

import { isDevelopmentEnv, isProductionEnv } from './env'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDevelopmentEnv() ? ['error', 'warn'] : ['error']
  })

if (!isProductionEnv()) {
  globalForPrisma.prisma = prisma
}
