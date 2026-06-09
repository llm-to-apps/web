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
DATABASE_URL=mysql://root:password@mysql:3306/llagents_platform
AUTH_SECRET=change-me
REDIS_URL=redis://localhost:6379
```

## First Template

```text
Money -> git@github.com:llm-to-apps/money-template.git
```
