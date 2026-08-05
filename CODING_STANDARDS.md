# IKEAR Coding Standards

Big-tech–grade engineering standards for the IKEAR marketplace (React Native +
Expo 51, TypeScript, Supabase). These apply to **both** repositories
(`HairuoLiu/ikear` frontend, `HairuoLiu/ikear-backend` backend).

## 1. Language & Tooling

- **TypeScript strict mode** everywhere (`strict: true`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` where feasible). `tsc --noEmit` must be **0 errors**.
- **Formatting**: Prettier (2-space indent, LF line endings, no trailing commas
  drama). Enforced in CI.
- **Lint**: ESLint with TypeScript + React/React-Native rules. No `any` in
  committed code except at explicit, documented boundaries (e.g. the Supabase
  dynamic-import shim).
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `refactor:`, `docs:`, `ci:`, `test:`, `chore:`). Every commit
  message records **what changed and why** — see repo history for the pattern.
- **Branching**: `main` is protected. Work happens on feature branches; merges via
  reviewed PRs only.

## 2. Code Review (mandatory, 2 approvals)

> Requirement: every change is reviewed by **two** programmers, neither of whom is
> the author. At least one reviewer must be from a **different domain** than the
> author (mobile ↔ backend ↔ platform).

| Author domain | Reviewer 1 | Reviewer 2 |
|---------------|-----------|-----------|
| Mobile (RN/Expo) | Backend dev | Platform dev |
| Backend (Supabase/SQL) | Mobile dev | Platform dev |
| Platform (CI/build/config) | Mobile dev | Backend dev |

- A change is **not mergeable** until both approvals are recorded.
- Reviewers check: correctness, security (RLS/secret handling), test coverage,
  adherence to patterns below, and extensibility impact.
- A **separate QA** role performs independent audit + sign-off (does not count as
  one of the two dev approvals).

## 3. Design Patterns

- **Repository / DataSource abstraction**: UI never talks to a backend directly.
  It depends on the `DataSource` interface (`src/data/dataSource.ts`). Swap mock
  ↔ Supabase by implementing the interface — call sites are unchanged.
- **Unidirectional data flow**: Screens → hooks → Zustand store → DataSource.
  No backend types leak into UI props; map at the data layer
  (snake_case ↔ camelCase).
- **MVVM-ish on screens**: presentational components are dumb; logic lives in
  hooks. Keep `useState`/`useEffect` shallow.
- **Platform split via file extension**: native-only code goes in
  `*.native.ts`; web-safe fallback in the base file. Metro resolves per platform.
  Never `import` a native-only module from the web bundle.
- **Lazy optional dependencies**: heavy/optional deps (e.g. `@supabase/supabase-js`)
  are `import()`-ed dynamically so they stay out of the unit-test / tsc graph and
  the web bundle path that doesn't need them.
- **Single Responsibility**: one reason to change per module. Business constants
  (TTL = 30d, pre-warn 3d, 15 categories) live in one shared place; the DB enforces
  them a second time via CHECK/enum.

## 4. Security

- **RLS is the only access boundary.** The public **anon key is safe to ship**
  (it is inlined via `EXPO_PUBLIC_`). `service_role` is **server-only** and may
  appear only inside Supabase edge functions.
- **No secrets in the client.** Only `EXPO_PUBLIC_`-prefixed, non-sensitive values
  are inlined at build time. `.env.local` is git-ignored.
- **Least privilege in SQL**: each RLS policy grants the minimum needed; `USING`
  and `WITH CHECK` are both specified for `INSERT`/`UPDATE`.
- **Input validation**: validate at the edge (zod/schema) and again in SQL CHECK
  constraints.

## 5. Testing

- **Unit** (domain logic) + **integration** (DataSource against mock) +
  **independent E2E** (journey-level, written by someone other than the
  implementer). Target: **225 unit/integration tests green**, tsc clean, before
  any merge.
- New backend-facing behavior gets a test that exercises the `DataSource`
  contract, not just the mock.
- Coverage gate in CI; no net decrease in covered lines on a PR.

## 6. Performance & UX

- App cold start target < 3s; memory < 100MB for core flows; battery < 5%/hr
  active use.
- Offline-first: cache-aside reads with TTL; queue writes when offline; reconcile
  on reconnect.
- Platform-native feel: iOS HIG vs Material 3 patterns; haptics; no janky lists
  (windowed rendering, `getItemLayout` where needed).
