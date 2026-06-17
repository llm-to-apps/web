# Web Agent Guide

This file contains project-specific rules for coding agents working on OS7 web.

## Code Organization

- Keep `app/` focused on Next.js pages, layouts, route handlers, and small route
  wiring.
- Put domain use cases in `src/features/*`; routes should call these services
  instead of owning business logic directly.
- Split large features by responsibility. Prefer small files such as
  `*-route.ts`, `*-query.ts`, `*-runtime.ts`, `*-events.ts`, `*-types.ts`,
  `*-access.ts`, and focused command helpers instead of one feature file owning
  parsing, auth checks, database queries, queue writes, and response mapping.
- Put server-only infrastructure in `src/server/*`, such as env, database,
  request-origin, auth adapters, queues, and external service clients.
- Keep `src/server/*` organized by domain: `auth`, `oauth`, `agent`, `deploy`,
  and `integrations` for external systems.
- Put shared contracts and pure utilities in `src/shared/*`, including
  `AppResult`, `AppError`, manifest types, schema helpers, and DTO types.
- Put platform orchestration helpers in `src/platform/*`, such as app template,
  runtime, deployment, and manager abstractions.
- Prefer path aliases (`@/features`, `@/server`, `@/shared`, `@/platform`) for
  new code.
- Do not add `lib/*` compatibility exports. New and migrated code must import
  directly from `src/server`, `src/features`, `src/shared`, or `src/platform`.

## API Contracts

- Public OS7 JSON APIs should return `{ ok: true, ...payload }` or
  `{ ok: false, message, code? }`.
- Use `jsonOk` and `jsonErrorMessage` from `@/server/http` for ordinary public
  API responses so DTOs stay typed without changing the wire format.
- Use `AppResult` plus `jsonResult` for service/use-case flows that already
  return `appOk`/`appError`.
- Keep protocol routes protocol-native: OAuth, MCP JSON-RPC, SSE, and health
  endpoints do not need the public OS7 `{ ok, message }` helper when their
  protocol requires a different shape.
- Route handlers should parse request/context, authenticate, call a feature or
  server service, and map the response. Business logic belongs below the route.

## Logging And Audit

- Server, feature, worker, and integration code must use `@/server/logger`.
  Do not write raw `console.*` outside the central logger.
- Use stable event names such as `projects.deploy.started` or
  `deployment.job.failed_permanently`. Put changing data in structured fields,
  not in the event string.
- Include useful context whenever it exists: `requestId`, `userId`, `projectId`,
  `runId`, `jobId`, `operation`, `status`, and `elapsedMs`.
- Never log secrets, cookies, authorization headers, OAuth codes, tokens,
  passwords, database URLs, or full request/response bodies that may contain
  credentials or user-private content.
- Server-side unexpected errors must go through the central logger so they are
  reported to Sentry when `SENTRY_DSN` is configured. Sentry is optional; local
  and dev environments must keep working without Sentry env vars.
- Keep Sentry payloads safe and narrow. Redact tokens, cookies, OAuth codes,
  secrets, provider payloads, SQL details, and large personal-data objects
  before reporting.
- Use `@/server/agent/run-logger` for agent run lifecycle logs so agent events
  stay searchable and consistently shaped.
- Mutating MCP tools, runtime actions, and background jobs that change visible
  state must notify the UI through the same realtime/invalidation path used by
  the matching HTTP or service flow.
- Audit-worthy actions should be logged at the service/use-case boundary, not
  only inside route handlers, so HTTP, MCP, jobs, and agents share the same
  behavior.

## UI Rules

Web uses Mantine as the UI framework.

- Prefer Mantine components from `@mantine/core` and `@mantine/hooks`.
- Use Mantine layout primitives such as `AppShell`, `Container`, `Stack`,
  `Group`, `SimpleGrid`, `Paper`, `Card`, `Modal`, `Menu`, and `ScrollArea`.
- Use framework components before writing custom controls or custom CSS.
- Do not reintroduce Tailwind, shadcn/ui, Radix wrapper components, or
  class-variance-authority button variants.
- Keep shared OS7 theme and brand helpers in `ui-kit/src`.
- Keep `app/mantine-provider.tsx` as a thin Mantine provider wrapper.
- Keep mobile behavior responsive through Mantine props before local media CSS.

## Verification

Before committing architecture, routing, API, dependency, or UI changes, run:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run worker:build`
- `npm run build`

Use `npm run format` after broad refactors or before fixing formatting-only CI
failures.
