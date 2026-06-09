# LLAgents Web

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
MANAGER_URL=http://manager:8080
AGENT_URL=http://agent:4111
APP_ROOT_DOMAIN=llmagents.com
DATABASE_URL=postgresql://llagents:password@postgres:5432/llagents_platform
AUTH_SECRET=change-me
REDIS_URL=redis://localhost:6379
AGENT_MEMORY_DEBUG=false
```

Set `AGENT_MEMORY_DEBUG=true` to show Mastra Memory scope in the agent chat
progress message while debugging.

## First Template

```text
Money -> git@github.com:llm-to-apps/money-template.git
```
