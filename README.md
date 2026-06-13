# OS7 Web

Next.js app for user registration and template deployment.

## Development

```bash
npm install
npm run prisma:push
npm run dev
```

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
Money -> git@github.com:os7/money-template.git
```
