# QA Mail Manager — Frontend

Frontend for the QA Mail Manager internal tool: generate and manage [Mail.tm](https://mail.tm) test accounts and read their inboxes (with OTP detection) through the backend API in `../backend`. The frontend never talks to Mail.tm directly and never sees account passwords or tokens.

## Features

- **Dashboard** — account totals per status and domain, recently generated accounts, quick actions.
- **Accounts** — generate accounts with an optional tag and note, edit tag/note, change status, delete; server-side search and status filter with infinite scroll.
- **Inbox** — three resizable panes (accounts · messages · message detail) modelled on the shadcn mail example:
  - accounts with the most recent mail first, searchable, infinite scroll, collapsible to initials;
  - messages newest first, server-side search, "Unread" filter, infinite scroll, auto-refresh every 30 s;
  - messages are marked as read when opened and can be deleted; HTML mail renders in a sandboxed iframe;
  - verification codes are detected only next to an OTP keyword (code, OTP, kode, verifikasi, …) and can be copied in one click.
- **Settings** — theme, sidebar preference, backend connection status, reset local preferences.
- Responsive: below 1024 px the inbox becomes a single-pane flow; below 768 px the sidebar moves into a sheet.

## Tech Stack

- [Bun](https://bun.sh) — runtime & package manager
- [React 19](https://react.dev)
- [Vite](https://vitejs.dev)
- TypeScript
- [TanStack Router](https://tanstack.com/router) — file-based routing
- [TanStack Query](https://tanstack.com/query) — server state, infinite queries, optimistic updates
- [Zustand](https://zustand-demo.pmnd.rs) — client state
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) — Nova preset (Radix base, Lucide icons)
- React Hook Form — account tag/note forms
- Axios — API client (`VITE_API_URL`)
- [Vitest](https://vitest.dev) — unit tests
- [Prettier](https://prettier.io) — formatting (`.prettierrc.json`)
- clsx + tailwind-merge — via the `cn()` helper
- lucide-react, sonner, date-fns

## Requirements

- [Bun](https://bun.sh) v1.3+

## Getting Started

Install dependencies:

```bash
bun install
```

Copy the environment file and adjust as needed:

```bash
cp .env.example .env
```

Run the dev server:

```bash
bun dev
```

Build for production:

```bash
bun run build
```

Preview the production build:

```bash
bun run preview
```

Lint the project:

```bash
bun run lint
```

Format the code (Prettier, with Tailwind class sorting) or check formatting:

```bash
bun run format
bun run format:check
```

Run the unit tests (OTP detection, formatting helpers, inbox cache updates):

```bash
bun run test        # once
bun run test:watch  # watch mode
```

> This project uses Bun exclusively. Do not use npm, pnpm, or yarn.

## Folder Structure

```
src/
├── components/
│   ├── layout/          # AppSidebar, AppHeader, AppLayout
│   ├── common/          # PageContainer, StatCard, SectionCard, EmptyState, LoadMoreTrigger
│   └── ui/              # shadcn/ui primitives
├── features/
│   ├── account/
│   │   ├── api.ts       # /accounts endpoints
│   │   ├── queries.ts   # query keys + infinite/stats/detail hooks
│   │   ├── status.ts    # status labels and colours shared across pages
│   │   └── components/  # accounts table, generate/edit dialogs
│   └── inbox/
│       ├── api.ts       # /accounts/:id/messages endpoints
│       ├── queries.ts   # message query hooks and cache helpers
│       ├── utils/       # OTP detection, sender/initials formatting
│       └── components/  # inbox container, account list, message list/detail, OTP card
├── hooks/               # useMediaQuery, useDebouncedValue, useRefresh
├── lib/                 # axios instance, query client, api-error helper, cn()
├── providers/           # AppProviders, QueryProvider, ThemeProvider
├── routes/              # TanStack Router file-based routes (dashboard, accounts, inbox, settings)
├── store/               # Zustand stores (sidebar, theme) persisted to localStorage
├── types/               # API, account and message types (mirror backend/docs/openapi.yaml)
├── styles/
│   └── globals.css      # Tailwind v4 + shadcn CSS variables
├── App.tsx              # Router + providers bootstrap
└── main.tsx             # React entry point
```

Tests live next to the code they cover as `*.test.ts`.

## Routing (TanStack Router)

Routes are file-based under `src/routes`. The router plugin (`@tanstack/router-plugin`) scans this folder and generates `src/routeTree.gen.ts` automatically whenever you run `bun dev` or `bun run build` — do not edit that file by hand.

To add a new route:

1. Create a new file in `src/routes`, e.g. `src/routes/settings.tsx`.
2. Export a `Route` using `createFileRoute`:

   ```tsx
   import { createFileRoute } from '@tanstack/react-router'

   export const Route = createFileRoute('/settings')({
     component: SettingsPage,
   })

   function SettingsPage() {
     return <div>Settings</div>
   }
   ```

3. Start (or restart) `bun dev`; the route tree regenerates and the new route becomes available.

Shared layout (sidebar) lives in `src/routes/__root.tsx` and wraps every route via `<Outlet />`.

## Using shadcn/ui

Components already generated live in `src/components/ui`. To add a new one:

```bash
bunx shadcn@latest add <component-name>
```

> Known issue in this workspace: the CLI sometimes writes new files into a literal `./@/...` folder at the project root instead of resolving the `@/*` alias to `src/`. If that happens, move the generated files into `src/components/ui` and delete the stray `@` folder.

## State (Zustand)

- `useAppStore` (`src/store/app.store.ts`) — `sidebarCollapsed` (persisted), mobile sidebar sheet state
- `useThemeStore` (`src/store/theme.store.ts`) — `theme`, `setTheme()` (defaults to `dark`, persisted)

Server data (accounts, messages) lives in TanStack Query, not Zustand. All account query keys start with
`["accounts"]`, so invalidating that prefix refreshes lists, stats and details together.

## Environment Variables

See `.env.example`:

```env
VITE_API_URL=http://localhost:8080/api
```
