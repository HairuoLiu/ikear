# Platform / Architecture Review — platform-dev (Reviewer 2)

审查范围：
1. mobile-dev 的 Supabase 集成（架构/标准/安全合规）
2. backend-dev 的 SQL / RLS（安全/最小权限/可扩展性）
3. 自有 CI / 部署 / 构建配置（含修复）

严重级别：**BLOCKER**（阻断上线）/ **MAJOR**（必须修）/ **MINOR**（应该修）/ **NIT**（可选）

验证基线（本地实测）：`tsc --noEmit` 通过；`npm test` 225/225 通过；`e2e/independent-e2e.ts` 10/10 通过。

---

## A. mobile-dev — Supabase 集成

### 先记优点（符合标准的部分）

- `src/lib/supabase.ts:29-37` 动态 `import('@supabase/supabase-js')` 确实把该包挡在了 mock/测试依赖图之外 —— 实测该包**根本没装**在 `node_modules`，225 个单测仍全绿，惰性加载有效。
- 客户端无任何密钥，只读 `EXPO_PUBLIC_*`（`supabase.ts:12-13`）；`service_role` 仅存在于 Edge Function。
- DataSource/Repository 抽象干净，切换点收敛为单行（`src/data/dataSource.ts:294`）。
- snake_case ↔ camelCase 映射集中在一层（`supabaseDataSource.ts:22-101`），未泄漏到 UI。
- 平台拆分**正确**：`biometrics.ts`（Web 兜底）/ `biometrics.native.ts`（Metro 在原生解析），调用方 `App.tsx:36` 用无扩展名路径，`expo-local-authentication` 不会进 Web 包。

### BLOCKER-1 — `createListing` 必崩：`auth.data` 不存在
`src/data/supabaseDataSource.ts:186,196`
```ts
const { data: auth } = await client.auth.getUser();   // auth 本身就是 data
seller_id: input.sellerId ?? auth.data.user?.id ?? 'u_me',   // auth.data === undefined → TypeError
```
同文件 `:116-117` 的写法才是对的（`auth?.user?.id`）。Supabase 模式下每次发布商品都会抛 `Cannot read properties of undefined (reading 'user')`。
修：`input.sellerId ?? auth?.user?.id`。之所以 tsc 没抓到，见 MAJOR-6。

### BLOCKER-2 — 会话从未建立，`hydrate()` 从未被调用
`src/data/supabaseDataSource.ts:114`
全仓 grep：`hydrate` 只有定义没有调用；`onAuthStateChange` / `signInWith*` / `signUp` 在 `src/**` 中**一次都没出现**。后果：
- `getProfile()` 永远返回硬编码占位 `{id:'u_me', nickname:'我'}`（`:237-247`），`getConversations()`/`getMessages()` 永远返回空 → 「我的」「消息」两个 tab 在真实后端下是空白的。
- `App.tsx:256` 的 `isAuthenticated` 只是本地 zustand 状态，与 Supabase session 无关。客户端始终以 `anon` 身份请求，`listings_insert_own`（要求 `seller_id = auth.uid()`）必然拒绝写入。

即「连通真实后端」这一里程碑目前在代码层面不成立。需要：登录接 `supabase.auth.signInWithPassword`、订阅 `onAuthStateChange`、登录成功后调用 `hydrate()`。

### MAJOR-3 — RN 缺少 storage adapter，session 无法持久化
`src/lib/supabase.ts:32-34` 传了 `persistSession: true` 但没给 `storage`。supabase-js v2 默认用 `localStorage`，RN 没有 → session 每次冷启动丢失（与配置意图矛盾）。`@react-native-async-storage/async-storage` 已在依赖里（`package.json:18`）。
修：`auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: Platform.OS === 'web' }`。

### MAJOR-4 — `getListing` 违反 `Promise<Listing | null>` 契约
`src/data/supabaseDataSource.ts:172` 用 `.single()`，0 行时 PostgREST 返回 PGRST116 错误 → 方法抛异常，而契约（`dataSource.ts:82`）要求返回 `null`。改用 `.maybeSingle()`。

### MAJOR-5 — `'u_me'` 兜底会污染真实数据库调用
`supabaseDataSource.ts:196` 的 `?? 'u_me'`：`'u_me'` 不是 UUID，insert 会以 `22P02 invalid input syntax for type uuid` 失败，错误信息对用户毫无意义。未登录应显式抛「请先登录」。

### MAJOR-6 — 类型 shim 把整个 SDK 变成 `any`，抵消了类型门禁
`src/types/supabase-js.d.ts:5-10` 用 `declare module '@supabase/supabase-js'` 声明为 `any`，但该包在 `package.json:34` 是**硬依赖**。ambient 声明优先级高于 `node_modules` 真实类型，于是 tsc 永远看不到真实 API —— BLOCKER-1 正是这样溜过去的。
且与 `supabase.ts:4-6` 注释「仅在启用时才需要安装」的叙述自相矛盾。二选一：
(a) 当作真实依赖 → 删除 shim，用官方 `SupabaseClient` 类型；
(b) 当作可选依赖 → 移到 `optionalDependencies`/peer，保留 shim。
建议 (a)，能立刻在编译期捕获 BLOCKER-1 这类错误。

### MAJOR-7 — 业务常量四处复制 + 绕过既有 Edge Function
`LISTING_TTL_DAYS = 30` 同时存在于：`src/data/dataSource.ts:26`、`src/data/supabaseDataSource.ts:138`、`refresh-listing/index.ts:27`、SQL `listing_ttl_days()`（`0001_init.sql:24-28`）。
更严重的是 `refreshListing`（`supabaseDataSource.ts:206-223`）在客户端直接改 `expires_at`/`status`，而不是调用已经写好的 `client.functions.invoke('refresh-listing', ...)` —— 既复制了业务规则，又迫使 RLS 必须给客户端开放这两列的写权限（见后端 MAJOR-B3），那个 Edge Function 目前是死代码。
建议：常量抽到 `src/data/constants.ts`（顺便消除 `dataSource ↔ supabaseDataSource` 的潜在循环依赖 —— 现在靠 type-only import 侥幸避开），refresh 一律走 Edge Function。

### MAJOR-8 — 两个 DataSource 实现行为不一致（违背同契约承诺）
- `getListings` 未做 `settleStatus()` 惰性结算（mock 见 `dataSource.ts:118`）→ 过期商品仍报 `status:'active'`，而数据库侧也没有任何东西会翻转它（见后端 MAJOR-B6）。
- `filter.query` 只搜 `title`（`:155`），mock 搜 title+description（`dataSource.ts:142-150`）。
- `getFavorites`（`:258-263`）从 `cache.listings` 取，而该缓存只装**最近一次带筛选**的 `getListings()` 结果 → 收藏项会莫名消失；mock 是全库查找（`dataSource.ts:267-274`）。
- 无 `supabaseDataSource.test.ts`：225 个通过的测试**一条都没覆盖这个文件**，这是上面几个 BLOCKER 未被发现的根因。建议至少加一组 fake client 的契约测试，两个实现跑同一份用例。

### MINOR-9 — `hydrate()` N+1 查询
`:128-135` 每个会话一次查询。改为一次 `.in('conversation_id', ids)` 后在内存分组。

### MINOR-10 — `ilike` 模式串未转义
`:155` `%${filter.query}%`。PostgREST 有参数化，不构成 SQL 注入，但用户输入里的 `,` `(` `)` `%` `*` 会破坏 PostgREST 过滤语法或意外放大匹配范围。入参需转义。

### MINOR-11 — 失败的 client promise 永久缓存
`src/lib/supabase.ts:29-37`：动态 import 一旦 reject，`_clientPromise` 会永远保留这个 rejected promise，后续调用无重试机会。应在 catch 中置回 `null`。

### MINOR-12 — `BiometricSupport` 接口重复定义
`biometrics.ts:4-8` 与 `biometrics.native.ts:3-7` 各写一份，长期会漂移。抽到共享的 `biometrics.types.ts`，两端 `import type`。

### NIT-13 — 为消警告而生的死导出
`supabase.ts:41-44`（`SUPABASE_PROJECT_URL`、`_SupabaseListing`）与 `supabaseDataSource.ts:267`（`_UnusedFavorite`）。已经用了 `import type`，这些占位导出没必要，删掉。

---

## B. backend-dev — SQL / RLS

### MAJOR-B1 — 视图缺 `security_invoker`，注释与事实相反
`0001_init.sql:290-295`。Postgres 视图以**属主**权限执行（属主 `postgres` 带 BYPASSRLS），所以 `:288` 的注释「视图继承底层表的 RLS」是错的。当前影响可控（视图本身限定 `status='active'`，本就公开），但只要有人扩展这个视图就会漏数据，且 Supabase linter 会以 error 级别报 `security_definer_view`。
修：`create or replace view public.listings_expiring_soon with (security_invoker = true) as ...`

### MAJOR-B2 — `profiles` 全表公开，泄漏所有用户 email
`0001_init.sql:194-197` `using (true)`。任何人拿 anon key `select email from profiles` 就能拖走全部邮箱 —— PII 泄漏，违反最小权限。RLS 是行级的，`revoke select (email)` 也解决不了策略层的问题。
修：表本身收紧为「仅本人可读」，对外只暴露 `public_profiles` 视图（`id, nickname, avatar_url, city, rating, sold_count`，带 `security_invoker`）。

### MAJOR-B3 — 卖家可任意改写 `expires_at` / `boosted_until` / `views`
`0001_init.sql:228-232` 的 update 策略不限列。后果：
(a) 30 天 TTL 形同虚设，客户端可无限自我续期，`refresh-listing` 的业务校验被绕过；
(b) `boosted_until`（付费置顶）可自行授予 → 商业化直接被绕过；
(c) `views` 可自行刷高。
修：`revoke update (expires_at, boosted_until, views) on public.listings from authenticated, anon;` 或加 BEFORE UPDATE 触发器把这几列钉回 OLD 值，只允许 service_role / Edge Function 改。

### MAJOR-B4 — `views` 没有合法的写入路径
只有卖家能 update 自己的行 → 真正的浏览者永远无法 +1，而卖家可以随便加。需要一个 `security definer` 的 RPC（`increment_listing_views(text)`，并 `set search_path = ''`）。

### MAJOR-B5 — 单方删除会话即可摧毁对方的聊天记录
`0001_init.sql:256-259` 允许任一参与方 delete conversation，而 `messages.conversation_id` 是 `on delete cascade`（`:140`）→ 一方可单方面把双方消息全删。
修：去掉 DELETE 策略，改为按参与方软删除/归档；至少把级联改成 `on delete set null`。

### MAJOR-B6 — 没有任何东西会把商品置为 `expired`
`listings_select_active_public`（`:213-215`）只看 `status`，不看 `expires_at`，而全仓没有 cron / 触发器去翻转状态。已过期商品会一直公开展示，直到卖家碰巧改动它。
修：策略加 `and expires_at > now()`（立即见效、成本低），或加 `pg_cron` 定时清扫。与前端 MAJOR-8 是同一个坑的两端。

### MINOR-B7 — 会话可伪造
`0001_init.sql:245-248` 只要求调用者是买卖双方之一，因此用户可以捏造一个「对方是任意用户」的会话，且不校验 `seller_id` 是否等于该 `listing` 的真实卖家。
修：`with check (buyer_id = auth.uid() and seller_id = (select l.seller_id from public.listings l where l.id = listing_id))`。

### MINOR-B8 — 消息可注入任意会话/任意收件人
`0001_init.sql:267-270` 仅校验 `sender_id = auth.uid()`。用户可向任意 `conversation_id` 塞消息、`receiver_id` 填任意人 → 骚扰/钓鱼入口。应加会话成员资格 `exists(...)` 校验，并要求 `receiver_id` 是会话中的另一方。

### MINOR-B9 — 发件人可事后篡改已送达消息
`0001_init.sql:273-277` 的 update 对双方开放且不限列：发件人能改 `content`，任一方都能翻 `read`。最小权限应是「仅收件人、且仅 `read` 列」。

### MINOR-B10 — 函数未固定 `search_path`
`:24-34` 两个函数缺 `set search_path = ''`，Supabase linter 的 `function_search_path_mutable`。此处风险低（全限定名、不碰表），但建议统一补上。

### MINOR-B11 — 可扩展性：枚举写死在 CHECK 约束里
`category` 15 个值写在 CHECK（`:80-85`），`condition` 用中文字面量（`:88`）。新增品类或做多语言都要 ALTER 线上表 + 前后端同步发版。更利于增量演进的形态是 `categories` 查找表 + FK（或稳定 ASCII code + 展示层映射）。
另：`profiles` 没有 `handle_new_user` 触发器，注册后资料行依赖客户端自己补插，漏插就永远没有 profile。

### NIT-B12 — `listings.id` 客户端可控
`:61` 是可写的 `text`，insert 策略不约束 id，用户可自选（例如伪造成 `lst_seed_*` 或抢占未来 id）。建议 `uuid` + `gen_random_uuid()`，或加格式 CHECK。

### NIT-B13 — 迁移规范（总体良好）
`create table if not exists` / `drop policy if exists` + `create policy` / `create index if not exists` / `create or replace function` 全部幂等可重跑 ✓；无 rename、无 drop 线上列 ✓，符合 additive 要求。缺：后续迁移命名约定说明、无 down migration（Supabase 场景可接受，建议在 README 写明）。

### seed.sql
明确限定本地（`:4-5`）✓，固定 UUID + `on conflict do nothing` 幂等 ✓，还记录了 GoTrue 空串 token 的坑（`:13-15`）✓。
- NIT：直接写 `auth.users`，一旦误在 linked 项目上跑 `supabase db reset` 会动到生产 auth，建议 README 补一条禁令。
- NIT：没有 `expired` / `sold` 状态的种子数据，生命周期 UI 在本地没有可用样本。

### functions/refresh-listing/index.ts
鉴权模型是对的：service_role 不下发（`:19`）、用 `getUser(accessToken)` 校验调用者（`:92`）、校验归属（`:113`）、终态拦截（`:118`）、`expiresAt` 服务端计算（`:123`）✓。
- MINOR：`Access-Control-Allow-Origin: '*'`（`:33`）—— 纯 bearer token 无 CSRF 风险，但仍建议收敛到 Web 域名。
- MINOR：`LISTING_TTL_DAYS`（`:27`）是常量的第 4 份拷贝，应读 `public.listing_ttl_days()`。
- MINOR：客户端从未调用它（前端 MAJOR-7），当前是死代码；也缺 `config.toml` 的 `verify_jwt` 说明。
- NIT：`:99` 读与 `:125` 写之间存在竞态，并发下可能把刚卖出的商品复活。写入时补一个状态条件即可原子化。

### backend CI（`ikear-backend/.github/workflows/ci.yml`，非我方文件，仅建议）
所有步骤都挂 `continue-on-error: true` —— 即使 `supabase start` 应用迁移失败，job 依然全绿，**等于没有门禁**。至少把 "Start local Supabase stack" 的 `continue-on-error` 去掉，让 `0001_init.sql` / `seed.sql` 跑不起来时能挡住 PR。
另 `:78` `deno check supabase/functions/**/index.ts` 依赖 `**`，`sh` 默认不开 globstar 不会递归展开，应写 `supabase/functions/*/index.ts`。

---

## C. 自有 CI / 部署 / 构建配置（已修复）

### BLOCKER-C1（已修）— 无 lockfile 却用 `npm ci` + `cache: npm`，CI 与部署 100% 失败
仓库没有 `package-lock.json`，而两个 workflow 都用了 `cache: 'npm'`（找不到 lock 文件时 `actions/setup-node` 直接硬失败）和 `npm ci`（无 lockfile 必失败）。**任何一次 CI 或部署都会在 Setup Node 步骤挂掉**。
已修：去掉 `cache: npm`，改 `npm install --no-audit --no-fund`，并留 TODO。（`ci.yml:17-27`、`deploy-web.yml:37-45`）
→ 交给 lead 的后续项：提交 `package-lock.json` 才是根治（可复现构建 + 缓存加速），之后改回 `npm ci`。

### MAJOR-C2（已修）— `app.config.js` 把 `extra` 塞进了不存在的 `expo` 层
原 `app.config.js:11-18` 返回 `{...config, expo: {...config.expo, extra}}`。但 Expo 动态配置回调拿到的 `config` 已经是**摊平后**的 expo 对象（`config.name === 'IKEAR'`，`config.expo === undefined`），结果生成的是 `expoConfig.expo.extra`，`Constants.expoConfig.extra` 恒为 undefined —— 文件注释里承诺的兜底读取路径是坏的。
已修为顶层 `extra` 合并，并以 app.json 为输入实跑验证：`extra = {supabaseUrl, supabaseAnonKey}`、无嵌套 `expo` 键、`name` 保持 `IKEAR`。

### MAJOR-C3（已修）— Vercel 部署丢失 SPA 回退，深链 404
`deploy-web.yml` 用 `working-directory: dist`，这会把 `dist` 当作 Vercel 项目根，仓库根的 `vercel.json`（以及其中的 `rewrites`）根本不生效 → 任何非 `/` 路由刷新或深链都 404。
已修：在部署前生成一份**只含 rewrites** 的 `dist/vercel.json`。（不能直接拷根文件：它带 `buildCommand`，会让 Vercel 在 `dist` 里再构建一次。）

### MINOR-C4（已修）— secrets 直接插值进 shell + 缺失时静默发布 mock 站点
原 `deploy-web.yml:48-49` 把 secret 直接拼进命令，值里带换行就能伪造额外的 `GITHUB_ENV` 条目。已改为 `env:` 传入，并加前置校验：缺少 `EXPO_PUBLIC_*` 时直接失败，而不是悄悄上线一个连着 mock 数据的站点。

### MINOR-C5（已修）— 现成的 E2E 验收没进 CI
`e2e/independent-e2e.ts` 已存在且确定性可跑，但没有入口脚本、CI 也没跑。已新增 `npm run e2e`（`package.json:12`）与对应 CI 步骤，本地实测 10/10 通过。

### MINOR-C6（仅报告，未改）— 约 30 个测试文件从未被类型检查
`tsconfig.json:19` 同时排除了 `**/*.test.ts` 和 `src/test-globals.d.ts`，但后者**已不存在**——推测这正是当初不得不排除测试文件的原因。实测把它们放回 include 会报一片 TS2582/TS2304（`describe`/`it`/`expect`/`beforeEach` 由 `test/setup.ts` 注入）。
根治只需恢复那一个全局声明文件（位于 `src/**`，属 mobile-dev 范围），之后即可删掉 exclude。我未擅自改动，以免弄挂 CI。

### MINOR-C7（仅报告，未改）— `.env.example` 写了真实项目 URL
`.env.example:3` 是真实的 `https://izoxfohuvnrfvatsrpnz.supabase.co` 而非占位符。它本身不是密钥（设计上就会内联进每个客户端包），但示例文件不该指向我们的项目。是否替换为 `https://<your-project-ref>.supabase.co` 请 lead 决定 —— 可能有人正依赖它做本地联调，故未擅动。

### NIT-C8 — `vercel.json` ✓
严格合法 JSON（已解析验证），无 `//` 注释；`buildCommand` / `outputDirectory` 与 `expo export --platform web` → `dist` 一致，也与 `CLOUDFLARE_DEPLOY.md:14-17` 对齐。
需要留意：两条部署路径语义不同 —— Git 集成路径用根 `vercel.json`、环境变量要配在 Vercel 项目设置里；Actions 路径是本地构建 + GH secrets。workflow 头部注释已说明。

### NIT-C9 — `babel.config.js` 与路径别名不匹配
preset + reanimated 插件置于最后 ✓ 正确。但 `tsconfig.json:14-16` 声明了 `@/*` 别名，Babel 侧没有 `module-resolver`，一旦有人真用 `@/xxx`，类型检查会过、Metro 运行时会挂。目前全是相对导入所以未暴露 —— 要么补 resolver，要么删别名。

### NIT-C10 — Node 版本未锁定
`ci.yml` 用浮动的 `node-version: '22'`，而 `--experimental-strip-types` 需要 ≥ 22.6。建议加 `.nvmrc` 或锁定具体小版本。

---

## 修改文件清单（仅限自有配置）

| 文件 | 改动 |
| --- | --- |
| `app.config.js` | `extra` 提到顶层，修复 `Constants.expoConfig.extra` 恒 undefined |
| `.github/workflows/ci.yml` | 去 `cache: npm`、`npm ci`→`npm install`；新增 e2e 步骤 |
| `.github/workflows/deploy-web.yml` | 同上依赖安装修复；secrets 走 `env:` 并加缺失校验；部署前写入 `dist/vercel.json` SPA 回退 |
| `package.json` | 新增 `e2e` script（仅 scripts 段） |

未改动：`vercel.json`（本就正确）、`tsconfig.json`、`.env.example`、`babel.config.js`、`CLOUDFLARE_DEPLOY.md`。

## 建议的处理顺序

1. BLOCKER-C1 已修 —— 但请 lead 补提交 `package-lock.json`。
2. BLOCKER-1、BLOCKER-2（mobile-dev）：不修则「连通真实后端」无法验收。
3. MAJOR-B2、B3、B5（backend-dev）：数据泄漏 / 商业化绕过 / 数据可被单方摧毁。
4. MAJOR-6 + MAJOR-8 的契约测试：补上类型与测试，才能防住同类回归。

---

# 第二轮 — 复审 backend-dev 的 0002 / 0003（platform-dev）

backend-dev 已提交 `0002_security_hardening.sql`、`0003_privilege_hardening.sql`。
B 节的 MAJOR-B1/B2/B3/B4/B5/B6 与 MINOR-B7/B8/B9/B10 均已处理，迁移全部保持
additive（无 rename、无 drop 线上列）。以下只记「我的意见被纠正的地方」和「新发现」。

## R2-0 — 我上一轮的 security_invoker 建议是错的，采纳 backend-dev 的纠正

我在 MAJOR-B2 里建议 `public_profiles` 视图加 `security_invoker`。这是错的：
表策略收紧成 `id = auth.uid()` 之后，invoker 视图会继承该策略，查别人恒返回 0 行，
视图直接作废。这里必须走属主权限，用视图定义本身充当列白名单。

正确的判据不是「视图一律加 security_invoker」，而是看视图暴露什么：
- 暴露**完整行** → 必须加（`listings_expiring_soon`，0002:106-114 已加，还做了 PG15 版本判断）
- 暴露**安全列子集** → 刻意不加（`public_profiles`，0003:39-55）

代价是 Supabase linter 会对 `public_profiles` 报 `security_definer_view`，属预期内。
backend-dev 已在 0003:26-31 和 README 标注「别顺手修掉」，这个标注很重要，保留。

## R2-1 — 已验证：触发器不会误伤服务端角色

`current_user not in ('authenticated', 'anon')`（0003:72、0003:129）是对的。
PostgREST 连接后按 JWT 的 role claim 执行 `SET LOCAL ROLE`，因此：
- 客户端请求 → `authenticated` / `anon` → 走管控分支 ✓
- refresh-listing（service_role key）→ `service_role` → 放行，续期不受影响 ✓
- `settle_expired_listings()` / `increment_listing_views()`（SECURITY DEFINER）
  → 函数内 `current_user` = 属主 → 放行，不会被自己的触发器挡住 ✓
- `seed.sql` / migration（postgres）→ 放行，种子数据的 `created_at` 回填不受影响 ✓

即「加固不会把自己锁死」这点成立。backend-dev 补的 INSERT 分支（0003:133-143）
也确实堵住了我漏掉的绕过姿势 —— 只防 UPDATE 的话，发布时直接塞
`boosted_until` 就绕过去了。`created_at` 可改 = 免费顶帖，也是我漏掉的。

---

## R2-2（MAJOR，新发现）— 0002 让 `seed.sql` 的资料数据静默失效

`0002_security_hardening.sql:47-50` 在 `auth.users` 上加了 AFTER INSERT 触发器
`on_auth_user_created`。而 `seed.sql` 的执行顺序是：

1. `seed.sql:16` 插入 2 个 `auth.users` → 触发器立即建出 profiles 行
   （`city=''`、`avatar_url=null`、`rating=null`、`sold_count=0`、`created_at=now()`）
2. `seed.sql:66` 再插 profiles，带着 `rating 4.8` / `sold_count 12` / 头像 /
   `上海·徐汇区` / `created_at = now() - 180 days`
3. 但这句结尾是 **`on conflict (id) do nothing`**（`seed.sql:90`）→ 主键已存在
   → 整行丢弃，第 2 步的数据**一条都没落库**

结果：`supabase db reset` 之后本地卖家资料全是空的 —— 没有评分、没有成交数、
没有城市、没有头像。刚加的 `public_profiles` 视图查出来几乎全 null，
商品详情页的卖家信息块在本地没有可用样本，评分相关 UI 无法自测。

修：把 `seed.sql:90` 改成 `on conflict (id) do update set`（列出各列）。
`listings` / `conversations` / `messages` 的 `do nothing` 不受影响，保持原样即可。

## R2-3（MAJOR，新发现）— 「续期赠 24h 曝光」在服务端已无任何合法路径

`src/lib/expiry.ts:58-68` 的 `refresh()` 同时写两列：

```ts
expiresAt:    now + 30d,
boostedUntil: now + 24h,   // 「赠 24h 曝光」是 PM 契约的一部分
```

`ProfileScreen.tsx:325` 的注释也写明「重置 TTL 30 天 + 赠 24h 曝光（boostedUntil）」。

0003 之后：客户端改 `boosted_until` → 42501（0003:151-154，正确）。
但 **`refresh-listing` Edge Function 也不发放曝光** —— 它只写
`{ expires_at, status }`（`functions/refresh-listing/index.ts:127`）。

于是这条产品行为**两条路都走不通**：客户端被拒，服务端不发。
0003:139 的「推广位只能由平台侧发放」是对的，但平台侧现在没有发放动作。

建议：在 `refresh-listing` 里补 `boosted_until = now() + 24h`。
这本来就是平台侧发放，与「用户不能自授」不矛盾。
如果 PM 要改契约（比如改成付费才有），那要同步改 `expiry.ts:66` 和 ProfileScreen 文案。
请 lead 确认走哪条。

## R2-4（MAJOR，新发现）— 「降价重上架」会产出隐身商品

`useStore.ts:336-348` 的 `discountRelist` 会一次性写 `price` / `discount` /
`expiresAt` / `status:'active'`。0003 之后：

- 走 `updateListing` → 带了 `expires_at` → **42501 直接报错**，功能挂掉；
- 即使去掉 `expiresAt` 只改 `price` + `status:'active'`，对一个已过期的商品来说，
  `expires_at` 仍停在过去 → 0002:93 的 `status='active' and expires_at > now()`
  让它对买家**完全不可见**，而卖家侧因为 `listings_select_own` 看得到，
  会以为已经重新上架了；下一次 `settle_expired_listings()` 又把它打回 `expired`。

即「降价重上架」必须先经 `refresh-listing` 拿到新的 `expires_at`，再改价。
`e2e/independent-e2e.ts` 里那条「先续期复活再降价」的顺序恰好是对的
（`src/data/lifecycle.test.ts:84-87` 同），但 `discountRelist` 本身是一步到位的写法，
Supabase 模式下这个顺序约束没有被表达出来。属于 mobile-dev 的改动范围，已同步。

## R2-5（MINOR，新发现）— `conversation_id is null` 把消息参与者校验短路了

`0002:192-201`：

```sql
and (
  conversation_id is null      -- ← 这一支直接跳过下面所有校验
  or exists ( ...会话参与者校验... )
)
```

`conversation_id` 是可空列（0001:140，为「兼容早期未归档的历史消息」而留）。
因此仍然可以带着任意 `receiver_id`、不带 `conversation_id` 插入消息，
对方的 `messages_select_participant`（`receiver_id = auth.uid()`）会让他收到 ——
我上一轮 MINOR-B8 提的骚扰/钓鱼通道只关掉了「注入指定会话」那一半。

本项目是全新项目，没有真正的历史数据，建议直接要求
`conversation_id is not null`。当前 UI 触发不到（Supabase 模式还没有发消息的写入口），
但 PostgREST 是公开端点，拿 anon token 直接 curl 即可。

## R2-6（MINOR）— 0002/0003 新增的 4 个触发器函数缺 `set search_path`

0002:249-250 特意给 0001 的两个 helper 补了 `search_path`，但它自己和 0003 新增的
非 definer 触发器函数都没设：

- `guard_conversation_identity`（0002:152）
- `guard_message_immutability`（0002:213）
- `guard_profile_privileged_columns`（0003:65）
- `guard_listing_privileged_columns`（0003:124）

它们不是 SECURITY DEFINER，且内部引用都是 schema-qualified（`public.listing_default_expiry()`），
**没有实际的提权风险**。但 `db lint` 的 `function_search_path_mutable` 是按函数报的，
会新增 4 条告警，把刚清理干净的 lint 输出又弄脏。建议统一补
`set search_path = public, pg_temp`，与 0002 的口径一致。

（顺带：backend-dev 选 `public, pg_temp` 而不是我说的 `''` —— `pg_temp` 放末位
即可避免临时表劫持，且不用把 `public.` 前缀写满每一处，这个取舍我认同。）

## R2-7（NIT）— `increment_listing_views` 无节流

`0003:180-198` 授予了 `anon`，任何人可无限调用给任意 active 商品 +1。
从「卖家不能自己刷」变成了「所有人都能刷」，`views` 作为热度指标仍不可信。
真要可信需要按 IP/用户去重（独立表 + 唯一约束），超出本轮范围，先记着。

## R2-8 — 部署顺序依赖（给 lead）

0003 把 `profiles` 收紧为 `id = auth.uid()` 之后，**未登录会话读不到任何 profile**。
而 mobile-dev 的 BLOCKER-2（前端从不调用 `supabase.auth`，客户端始终是 anon）
意味着 0003 上线后 `hydrate()` 的资料读取会从「拿到空数据」变成「稳定拿不到」。

不是 0003 的错（前端本来就没登录），但两者必须**一起上线**：
先上 0003 而前端登录还没接好，「我的」页会彻底空白。
建议 lead 把「0003 部署」与「mobile-dev 接入 supabase.auth」绑成同一个批次。

## 第二轮结论

0002/0003 的方向和实现都是对的，我上一轮的 `security_invoker` 建议被正确纠正。
剩余项按优先级：R2-2（本地种子数据已失效，影响所有人自测）> R2-3 / R2-4
（两条产品行为在 Supabase 模式下已断，需要 PM/lead 拍板）> R2-5 > R2-6 > R2-7。
其中 R2-3、R2-4 跨前后端，建议由 lead 统一指派，不要两边各改一半。
