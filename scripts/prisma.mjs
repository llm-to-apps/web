#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { writePrismaSchema } from './prisma-schema.mjs'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const prismaBin = join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
)
const schema = writePrismaSchema()
const args = process.argv.slice(2)
const hasSchemaArg = args.some((arg) => arg === '--schema' || arg.startsWith('--schema='))
const prismaArgs = hasSchemaArg ? args : [...args, '--schema', schema.path]

if (!existsSync(prismaBin)) {
  throw new Error('Prisma CLI is not installed. Run npm install first.')
}

console.info(`[web prisma] provider=${schema.provider}`)

const result = spawnSync(prismaBin, prismaArgs, {
  cwd: rootDir,
  env: {
    ...process.env,
    RUST_LOG:
      schema.provider === 'sqlite' ? process.env.RUST_LOG || 'info' : process.env.RUST_LOG
  },
  stdio: 'inherit'
})

process.exit(result.status ?? 1)
