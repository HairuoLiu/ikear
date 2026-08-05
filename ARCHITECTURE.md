# IKEAR Architecture (Technical)

## 1. Repository Topology (2 repos, not 3)

```
ikear           (PUBLIC)  https://github.com/HairuoLiu/ikear
   └─ React Native + Expo 51 (TypeScript)
        compiles to → iOS  ·  Android  ·  Web (same codebase)

ikear-backend   (PRIVATE) https://github.com/HairuoLiu/ikear-backend
   └─ Supabase project: izoxfohuvnrfvatsrpnz.supabase.co
        migrations/ · RLS policies · seed.sql · edge functions
```

Rationale: Expo gives one codebase, multi-platform. Platform coupling points are
few (biometrics, image picker, `Platform.OS`), so splitting web/mobile into
separate repos would duplicate ~90% of the code for ~3 points of divergence.
A monorepo-style single frontend + a private backend is the right boundary.

## 2. Layered Architecture (frontend)

```
UI (screens/, components/)
   ↓  presentational, no backend types
Hooks (hooks/use*.ts)  +  Store (store/useStore.ts — Zustand)
   ↓
DataSource interface (data/dataSource.ts)   ← the seam
   ├─ mockDataSource        (in-memory, default, offline-first)
   └─ supabaseDataSource    (Supabase, activated when EXPO_PUBLIC_ env set)
   ↓
Supabase (Postgres + RLS)  /  in-memory cache
```

- **The seam**: `dataSource` is selected at module load —
  `supabaseEnabled()` returns true only when both `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` are present; otherwise the mock is used. No
  call site changes between modes.
- **Mapping**: `supabaseDataSource.ts` owns snake_case ↔ camelCase mappers
  (`mapListing`, `mapProfile`, `mapConversation`, `mapMessage`, `toRow`). DB rows
  never reach the UI as raw objects.

## 3. Data Contract (canonical model)

`Listing` (`src/data/types.ts`) is the single source of truth:
- `condition`: 全新 / 良好 / 一般 / 磨损 (4 values, enforced in SQL CHECK)
- `status`: active / expired / sold / archived (4 values, SQL CHECK)
- `category`: 15 IKEA-style top-level categories (SQL CHECK)
- `discount?: number` — percentage for relist-with-price-drop
- `expiresAt` — listings expire after 30d; refresh resets it

Backward-compatibility rule: schema evolution is **expand-contract** — never
rename/drop a live column. New fields are additive; old readers ignore them.

## 4. Security Model

- **Anon key** is public-safe and inlined into bundles at build time
  (`app.config.js` → `expo.extra` → `process.env.EXPO_PUBLIC_*`).
- **RLS** is the only gate. Every table has policies for: owner manages own rows,
  public read of active listings, authenticated users manage own favorites/
  messages.
- **service_role** used only inside edge functions (e.g. `refresh-listing`)
  secured server-side.
- Type drift is caught by `supabase gen types` + a bot PR that updates the
  frontend types.

## 5. Edge Functions

- `supabase/functions/refresh-listing/index.ts` (Deno): resets
  `expires_at = now() + 30d` for relist. Called with service_role; never from
  the client with anon.

## 6. CI/CD

**Frontend (`ikear`):**
- `.github/workflows/ci.yml`: on push/PR → `typecheck` + `test` (tsc clean,
  225 tests green).
- `.github/workflows/deploy-web.yml`: on push to `main` → `expo export
  --platform web` → publish to Vercel (Cloudflare Pages alternative documented in
  `CLOUDFLARE_DEPLOY.md`). Requires repo Secrets `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

**Backend (`ikear-backend`):**
- `.github/workflows/ci.yml`: Supabase CLI lint scaffold.
- Apply schema: `supabase db push` (needs CLI login) or paste
  `supabase/migrations/0001_init.sql` + `seed.sql` into the Dashboard SQL Editor.

## 7. Extensibility (how to add things)

- **New feature (UI + data)**: add a screen, a hook, a Zustand slice, and a
  `DataSource` method (implement in BOTH mock and Supabase). No other layer
  changes.
- **New backend**: implement `DataSource` against it and switch in
  `dataSource.ts`. UI untouched.
- **New platform-specific behavior**: add `feature.native.ts` + `feature.ts`
  (web-safe). Call sites import `feature` and Metro resolves per platform.
- **New edge function**: drop a folder under `supabase/functions/`, secure with
  RLS/service_role, add a `DataSource` call site.
