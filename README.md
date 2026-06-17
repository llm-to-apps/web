# OS7 Web

Next.js app for user registration and template deployment.

## Development

```bash
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Create new schema changes with Prisma migrations:

```bash
npm run prisma:migrate:dev -- --name describe_change
```

Production startup applies committed migrations with `prisma migrate deploy`.
Seed data is idempotent, but it should be run explicitly with `npm run db:seed`
or as part of `npm run db:bootstrap`, not on every app process start.

The production database provider is PostgreSQL. Fast local database e2e flows can
use SQLite through the generated Prisma schema path:

```bash
npm run db:test:reset
DATABASE_URL=file:$(pwd)/prisma/test-e2e.db npm run db:seed
```

SQLite uses `db push` only for isolated test databases. Production and CI should
continue to verify committed PostgreSQL migrations with `npm run db:deploy`.

For local Docker-based development:

```bash
make dev
make worker
```

If you use local macOS Node/npm after running Docker-based commands, reinstall
dependencies locally once:

```bash
rm -rf node_modules
npm install
```

## Environment

```text
MANAGER_URL=http://manager
AGENT_URL=http://agent
PLATFORM_BASE_URL=https://os7.dev
PLATFORM_DOMAIN=os7.dev
OAUTH_INTERNAL_BASE_URL=http://web
PROJECT_PUBLIC_SCHEME=https
DATABASE_URL=postgresql://os7:password@postgres:5432/os7_platform
AUTH_SECRET=change-me
REDIS_URL=redis://localhost:6379
REDIS_PUBSUB_URL=redis://localhost:6379
```

`AGENT_URL` must point to the private Mastra agent service. The agent service
is trusted by the web backend and should not be exposed as a public API.

`REDIS_URL` is used by BullMQ queues. `REDIS_PUBSUB_URL` is used by the
agent run realtime/SSE bridge and can point to a separate Redis instance.

## First Template

```text
Money -> git@github.com:llm-to-apps/money-template.git
```
