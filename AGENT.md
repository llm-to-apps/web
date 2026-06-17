# Web Agent Guide

This file contains project-specific rules for coding agents working on OS7 web.

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

After UI, routing, or dependency changes, run:

- `npm run typecheck`
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
- `npm run build`
