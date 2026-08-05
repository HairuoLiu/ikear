# IKEAR — Usage Guide (for future AIs / collaborators)

This file tells a future agent everything needed to pick this project up cold.

## What this is
A second-hand **IKEA furniture C2C marketplace**. One React Native + Expo 51
(TypeScript) codebase compiles to **iOS, Android, and Web**. Backend is
**Supabase** (Postgres + RLS + edge functions) in a separate private repo.

## Repositories
- Frontend (public): `HairuoLiu/ikear` → https://github.com/HairuoLiu/ikear
- Backend (private): `HairuoLiu/ikear-backend` → https://github.com/HairuoLiu/ikear-backend
- Supabase project: `izoxfohuvnrfvatsrpnz.supabase.co`

## Local layout
- Frontend code: `ikear-mobile/` (root of the public repo). Key dirs:
  `src/screens`, `src/components`, `src/hooks`, `src/store`, `src/data`
  (DataSource + types + mock), `src/lib` (domain logic + biometrics).
- Backend code: `ikear-backend/supabase/` (`migrations/`, `functions/`,
  `seed.sql`).

## How to run
```bash
cd ikear-mobile
npm install
npx expo start --ios        # or --android
npx expo start --web        # Web dev server
npx expo export --platform web   # production web build -> dist/
```
- Without Supabase env, the app runs on the **mock** DataSource (offline-first,
  fully functional UI). To use live data, see below.

## How to connect to live Supabase
1. Copy `ikear-mobile/.env.example` → `ikear-mobile/.env.local`.
2. Fill `EXPO_PUBLIC_SUPABASE_URL` (already set to the project URL) and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public anon key — safe to inline).
3. Restart the dev server / rebuild. `dataSource.ts` auto-switches to
   `supabaseDataSource` when both vars are present.
4. Apply the backend schema: `supabase db push` (needs CLI login) OR paste
   `ikear-backend/supabase/migrations/0001_init.sql` + `seed.sql` into the
   Supabase Dashboard SQL Editor.
- `EXPO_PUBLIC_*` values are inlined into iOS/Android/Web bundles at build
  time (see `app.config.js`). They are NOT runtime env vars.

## How to test
```bash
cd ikear-mobile
npx tsc --noEmit      # must be 0 errors
npm test              # 225 unit/integration tests, 0 fail
```
- Test stack: Node 22 `--experimental-strip-types` + a jest-compatible `expect`
  shim (`test/setup.ts`) + extensionless resolver (`test/loader.mjs`). Test
  files are excluded from `tsconfig` build but type-checked separately.
- Independent E2E: `e2e/independent-e2e.ts` (journey-level, owned by QA, not the
  implementer).

## How to deploy Web
- Vercel: push to `main` triggers `.github/workflows/deploy-web.yml`
  (needs repo Secrets `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- Cloudflare Pages: see `CLOUDFLARE_DEPLOY.md` (build `expo export --platform
  web`, output `dist/`, SPA rewrite to `index.html`).
- Native apps: EAS Build (`expo prebuild` → Xcode / Android Studio archive).

## Engineering process (mandatory)
- **Team**: 3 programmer roles (mobile, backend, platform/architecture) + a
  separate QA. See `CODING_STANDARDS.md`.
- **Review**: every change needs **2 approvals** from programmers other than the
  author, at least one from a different domain. QA does independent audit/sign-off.
- **Standards**: strict TS, Conventional Commits, RLS-only security, Repository
  pattern, platform split via `*.native.ts`. Full detail in `CODING_STANDARDS.md`
  and `ARCHITECTURE.md`.

## Known pitfalls (learned the hard way)
- A Cyrillic 'А' in an env-var name (`SUPАBASE_URL`) compiles fine but fails at
  runtime — watch copy-paste from docs.
- `ListingFilter` lives in `dataSource.ts`, not `./types` — import from the right
  module or you get TS2305.
- `expo-local-authentication` method is `supportedAuthenticationTypesAsync()`
  (not `supportedTypesAsync`).
- Biometrics must be split: `biometrics.ts` (web-safe, returns
  `available:false`) + `biometrics.native.ts` (real Face ID) or the Web bundle
  crashes.
- `vercel.json` must be strict JSON — no `//` comments (Vercel rejects them).
- Git on Windows normalizes CRLF — the `LF will be replaced by CRLF` warnings are
  benign.
- Windows `rm` is wrapped by safe-delete and may block deletes — use PowerShell
  `Remove-Item -LiteralPath "..." -Force` for forced deletes.

## Left to do (non-blocking)
- Fill frontend repo Secrets (anon key) + run `supabase db push`.
- Real-device walkthrough (Camera / Face ID limited in simulators).
- EAS Build + App Store / Google Play submission.
- Web deploy token + first production publish.
