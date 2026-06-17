import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceSchemaPath = join(rootDir, 'prisma/schema.prisma')

export function resolveDatabaseProvider() {
  const explicitProvider = process.env.DATABASE_PROVIDER

  if (explicitProvider) {
    return normalizeProvider(explicitProvider)
  }

  const databaseUrl = process.env.DATABASE_URL ?? ''

  if (databaseUrl.startsWith('file:')) {
    return 'sqlite'
  }

  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return 'postgresql'
  }

  return 'postgresql'
}

export function writePrismaSchema() {
  const provider = resolveDatabaseProvider()
  const generatedSchemaPath = join(rootDir, `prisma/schema.generated.${provider}.prisma`)
  const sourceSchema = readFileSync(sourceSchemaPath, 'utf8')
  const providerSchema = sourceSchema.replace(
    /provider\s*=\s*"(postgresql|sqlite)"/,
    `provider = "${provider}"`
  )
  const generatedSchema =
    provider === 'sqlite' ? stripNativeDatabaseTypes(providerSchema) : providerSchema

  mkdirSync(dirname(generatedSchemaPath), { recursive: true })
  writeFileSync(generatedSchemaPath, generatedSchema)

  return {
    path: generatedSchemaPath,
    provider
  }
}

function normalizeProvider(provider) {
  if (provider === 'postgresql' || provider === 'sqlite') {
    return provider
  }

  throw new Error('DATABASE_PROVIDER must be postgresql or sqlite')
}

function stripNativeDatabaseTypes(schema) {
  return schema.replace(/\s+@db\.[A-Za-z]+(?:\([^)]*\))?/g, '')
}
