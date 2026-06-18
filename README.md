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
cd ..
make up
cd web
make dev
make worker
```

The root `make up` command bootstraps local SeaweedFS storage through manager and
writes scoped web bucket credentials to `web/.env`.

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
STORAGE_S3_ENDPOINT=http://localhost:8333
STORAGE_S3_INTERNAL_ENDPOINT=http://seaweedfs:8333
STORAGE_S3_ACCESS_KEY_ID=change-me-local-web-storage-access-key
STORAGE_S3_SECRET_ACCESS_KEY=change-me-local-web-storage-secret-key
STORAGE_S3_BUCKET=os7-local-web
```

`AGENT_URL` must point to the private Mastra agent service. The agent service
is trusted by the web backend and should not be exposed as a public API.

`REDIS_URL` is used by BullMQ queues. `REDIS_PUBSUB_URL` is used by the
agent run realtime/SSE bridge and can point to a separate Redis instance.

`STORAGE_S3_*` points web and worker at the internal SeaweedFS S3-compatible
endpoint. `STORAGE_S3_BUCKET` is the shared platform bucket used by web itself.
These credentials must be scoped to that bucket. SeaweedFS admin credentials
belong only to manager; when templates request isolated object storage with
`services.storage.required`, web asks manager to create the per-project bucket,
IAM user, access key, and bucket-scoped inline policy before passing project
credentials to the app service.

## First Template

```text
Money -> git@github.com:llm-to-apps/money-template.git
```
