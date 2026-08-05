# IKEAR — QA 独立审计与签署报告

| 项 | 值 |
| --- | --- |
| 审计人 | qa-engineer（独立审计角色，不参与功能开发） |
| 日期 | 2026-08-04 |
| 被审对象 | `ikear-mobile`（前端）+ `ikear-backend`（Supabase schema / RLS） |
| 审计范围 | 质量门禁、Supabase 集成测试覆盖、上线前风险清单 |
| 结论 | **NO-GO（针对「切换到线上 Supabase」这一动作）** / mock 版本本身 **GO** |

> 说明：本次审计为只读审计。除本文件外未修改任何源码、标准或架构文档，未执行任何 git 提交。
> 三位开发的评审笔记（`docs/reviews/*.md`）在本报告完成时**尚未产出**（`docs/` 目录此前不存在，本文件为该目录首个文件），
> 因此本报告为完全独立得出的结论，未参考亦未受其影响。建议三份笔记就绪后做一次交叉比对。

---

## (a) 质量门禁结果

全部命令在 `ikear-mobile/` 下实际执行，输出如下。

| 门禁 | 命令 | 结果 | 判定 |
| --- | --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | exit 0，**0 个 error** | ✅ PASS |
| 单元/集成测试 | `npm test` | **tests 225 · suites 53 · pass 225 · fail 0 · skipped 0 · todo 0**（1.37s） | ✅ PASS（与基线 225/0 一致） |
| 独立 E2E（附加，非必需） | `node --experimental-strip-types --experimental-loader ./test/loader.mjs e2e/independent-e2e.ts` | **10 条旅程 · 通过 10 · 失败 0** | ✅ PASS |

`npm test` 尾部原始输出：

```
1..53
# tests 225
# suites 53
# pass 225
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1370.0643
```

### ⚠️ 门禁本身的两个盲区（重要）

门禁「全绿」并不等于「全覆盖」，以下两点会让绿灯产生误导：

1. **测试文件根本没有被类型检查。**
   `tsconfig.json` 的 `exclude` 含 `"**/*.test.ts"`，`include` 也不含 `test/`、`e2e/`。
   即 `tsc --noEmit` 的 0 error 只覆盖生产源码，约 20 个 `*.test.ts` 与 `test/setup.ts`、`e2e/independent-e2e.ts` 完全未参与类型检查。
   → 建议增加第二份 `tsconfig.test.json`（`include` 覆盖测试文件）并在 `ci:check` 中一并运行。

2. **依赖未真实安装，门禁是在「缺件」状态下通过的。**
   `package.json` 声明了 `"@supabase/supabase-js": "^2.45.0"`，但 `node_modules/@supabase` **不存在**。
   之所以仍能通过，是因为 `src/types/supabase-js.d.ts` 用 `declare module` 把整个 SDK 声明成了 `any`，且 `src/lib/supabase.ts` 用动态 `import()` 懒加载 —— 静态检查与测试图都碰不到这个包。
   → 真实安装该包后**必须重跑两条门禁**：ambient `declare module` 与 SDK 自带类型可能冲突，且 `any` 消失后会暴露目前被掩盖的类型错误（见 P0-2）。

3. **`package-lock.json` 缺失**，而两条 workflow（`ci.yml`、`deploy-web.yml`）都用 `npm ci` —— `npm ci` 在无 lockfile 时会直接失败。CI 目前不可能是绿的。

---

## (b) 测试覆盖缺口

### 结论：Supabase 集成层的测试覆盖率为 **0**

检索证据：

```
grep -rn -i "supabase" --include=*.test.ts src/   →  NO MATCH
```

225 个用例、53 个套件，**没有任何一个**触及 `src/data/supabaseDataSource.ts`（268 行）或 `src/lib/supabase.ts`（45 行）。
现有测试全部落在 mock 数据源与纯逻辑层（browse / expiry / badges / listingRules / messaging / categories / format / feedCache）。

根因不止「懒加载动态 import」这一条，而是三条叠加：

- `getSupabaseClient()` 通过 `await import('@supabase/supabase-js')` 惰性加载，测试图不含该包；
- 客户端被 `.d.ts` 声明为 `any`，**类型层面也提供不了任何保护**；
- `supabaseDataSource` 内部直接调用 `getSupabaseClient()`，**没有依赖注入入口**，无法在不改源码的前提下塞入 fake client。

### 具体缺口清单与建议

| # | 未覆盖对象 | 风险 | 建议做法（低成本优先） |
| --- | --- | --- | --- |
| C1 | `mapListing` / `mapProfile` / `mapConversation` / `mapMessage` / `toRow` | snake_case ↔ camelCase 映射写错字段名，`any` 与运行期都不报错，只会静默丢字段 | 这些是**纯函数**，导出后即可直接单测。性价比最高，建议优先补齐（每个 mapper 一个「全字段往返」用例 + 一个「缺省值回落」用例） |
| C2 | `supabaseEnabled()` / `dataSource` 导出开关 | 开关逻辑错误无人发现（本次已发现它实际是死代码，见 P0-1） | 把开关抽成可测纯函数 `resolveDataSource(env)`，对「两个都设 / 只设一个 / 都不设」三种输入断言返回哪个实现 |
| C3 | `getSupabaseClient()` 未配置时抛错、单例复用（`_clientPromise` 只解析一次） | 并发首调可能重复建客户端；错误文案回归无保护 | 断言未配置时 reject 且含指引文案；并发调 5 次断言 `createClient` 只被调用 1 次 |
| C4 | `getListings` 的 filter → query builder 组装（`.eq/.in/.ilike/.order` 调用序列） | 过滤/排序条件漏传或传错列名，线上才发现 | 注入一个记录调用链的 fake builder，断言生成的调用序列（含 `location->>city` 这类 jsonb 列名） |
| C5 | **mock 与 supabase 双实现的契约一致性** | 两套实现行为已经出现分歧（见 P2-8），且无任何机制拦截 | 新增一个「契约一致性」套件：同一组输入分别喂给 `mockDataSource` 与注入 fake 的 `supabaseDataSource`，断言输出形状与语义一致 |
| C6 | `hydrate()` | 目前无调用点、无测试，属于纯粹的死代码（见 P0-4） | 接线后补一个「预拉取后同步方法能读到数据」的用例 |

### 前置改造建议（使上述测试成为可能）

给 `supabaseDataSource` 增加一个仅供测试的 client 注入点（例如导出 `__setClientFactory()`，或把模块改成 `createSupabaseDataSource(getClient)` 工厂 + 默认实例）。
这是一次小改动，但能把 313 行目前**零覆盖**的集成代码变成可测代码。

---

## (c) 风险清单

严重度：**P0 = 阻断上线** / **P1 = 上线前必修** / **P2 = 上线前应修** / **P3 = 可排期**

### P0 — 阻断「连接线上 Supabase」

#### P0-1 ❌ 环境变量开关是死代码，切换后 App 行为完全不变

`dataSource.ts:294` 定义了：

```ts
export const dataSource: DataSource = supabaseEnabled() ? supabaseDataSource : mockDataSource;
```

但**没有任何生产代码 import 这个 `dataSource`**。全仓检索，所有消费方都绕过了它：

| 文件 | 实际写法 |
| --- | --- |
| `src/data/feedCache.ts:16,141` | `import { mockDataSource } from './dataSource'` → `mockDataSource.getListings(...)` |
| `src/hooks/useFavorites.ts:7,32` | `import { mockDataSource }` → `mockDataSource.getListing(id)` |
| `src/screens/ListingDetailScreen.tsx:36,64` | `import { mockDataSource }` |
| `src/store/useStore.ts:9` | 更彻底 —— 直接 `import { CURRENT_USER, LISTINGS, MESSAGES, USERS } from '../data/mockData'`，连数据源层都跳过了 |

后果：即使正确配置了 `EXPO_PUBLIC_SUPABASE_URL` + `ANON_KEY`，首页 feed、收藏、详情、以及由 Zustand store 驱动的全部界面，**依然 100% 读 mock 数据**。
「改一行 `export const dataSource` 即可切后端」这一架构承诺当前**不成立**。

> 修复：把上述 4 处改为 `import { dataSource }`；`useStore` 需要把 mock 常量初始化改成经数据源异步注水。这不是一行改动，需按真实工作量排期。

#### P0-2 ❌ `supabaseDataSource.ts:196` 双重 `.data`，`createListing` 必崩

```ts
const { data: auth } = await client.auth.getUser();   // auth 已经是 data，即 { user }
...
seller_id: input.sellerId ?? auth.data.user?.id ?? 'u_me',   // ← auth.data 是 undefined
```

`getUser()` 返回 `{ data: { user }, error }`，已解构为 `auth`，正确写法应是 `auth.user?.id` —— 同文件 `hydrate()` 第 116–117 行就是正确的，两处不一致。
未显式传 `sellerId` 时，`auth.data` 为 `undefined`，读 `.user` 抛 `TypeError`，发布流程直接崩溃。
因客户端被 `.d.ts` 声明为 `any`，**`tsc` 抓不到这个错**，225 个用例也碰不到这行。

#### P0-3 ❌ 依赖未安装 + 无 lockfile

`@supabase/supabase-js` 在 `dependencies` 中但未落地到 `node_modules`；`package-lock.json` 缺失导致 `npm ci` 在 `ci.yml` 与 `deploy-web.yml` 中都会失败。
上线前须：`npm install` 生成并提交 lockfile → 重跑 `tsc` + `npm test` → 确认 ambient `.d.ts` 是否需要删除或收窄。

#### P0-4 ❌ `hydrate()` 无调用点

`supabaseDataSource` 的四个同步方法（`getProfile` / `getConversations` / `getMessages` / `getFavorites`）走 cache-aside，全靠 `hydrate()` 预注水。
全仓检索 `hydrate` 只有定义与注释，**无任何调用**。切到 Supabase 后这四个方法将永远返回空数组 / `nickname: '我'` 的占位 profile —— 消息、会话、个人资料页会静默空白（不报错，更难排查）。

---

### P1 — 上线前必修

#### P1-5 ⚠️ `seller_id` 类型与 RLS 不匹配

后端 `listings.seller_id` 是 `uuid not null references auth.users(id)`，RLS 为 `with check (seller_id = auth.uid())`。
前端 `supabaseDataSource.createListing` 的兜底值是字符串 `'u_me'`（mock 用户 id）。
一旦走到兜底分支：先触发 Postgres `22P02 invalid input syntax for type uuid`，即便格式合法也会被 RLS 拒绝。
**未登录状态下不存在任何可成功发布的路径** —— 这是正确的安全行为，但前端目前没有对应的「请先登录」引导，会表现为一个原始错误。

#### P1-6 ⚠️ DataSource 契约缺少写操作，聊天与收藏无法落库

后端已建好 `messages` / `conversations` / `favorites` 三张表及配套 RLS（0002 还做了防伪造会话、消息不可篡改的加固），但前端 `DataSource` 接口**只有读**：
没有 `sendMessage`、`createConversation`、`toggleFavorite` / `getFavoriteIds`。
即：接上线上后端后，聊天发送与收藏动作仍只改内存 store，刷新即丢，且**跨设备不同步**。后端能力被闲置。

#### P1-7 ⚠️ 测试文件不参与类型检查

见 (a) 节盲区 1。属于门禁自身的可信度问题，建议与上线改造同批修复。

---

### P2 — 上线前应修

#### P2-8 ⚠️ mock 与 Supabase 双实现行为分歧（三处）

| 分歧点 | mock 行为 | Supabase 行为 | 影响 |
| --- | --- | --- | --- |
| 关键词搜索 | 同时匹配 `title` + `description`（`dataSource.ts:142-150`） | 只 `ilike('title', ...)`（`supabaseDataSource.ts:155`） | 同一关键词在两种模式下结果不同，用户感知为「搜不到」 |
| 过期惰性结算 | 读取时 `settleStatus`，过期的 active 自动显示为 expired | `mapListing` 不做结算，原样返回 DB 的 `status` | 公开 feed 侧已被 0002 的 RLS（`status='active' and expires_at > now()`）兜住；但**卖家自己的「我的房源」页**走 `listings_select_own`（无 `expires_at` 条件），在 `pg_cron` 结算前会把已过期挂牌显示成 active，续期提醒失效 |
| `getFavorites` | 在完整内存库中查找 | 只在 `cache.listings`（**上一次 `getListings` 的结果**）中查找 | 收藏的商品若不在当前 feed 结果里（换了分类/筛选/翻页），收藏页会**静默少条目**，不报错 |

建议：在 `mapListing` 中复用 `settleStatus` 保持口径一致；`getFavorites` 改为按 id 直接查库；搜索补上 `description`（可用 `.or('title.ilike.%q%,description.ilike.%q%')`）。

#### P2-9 ⚠️ Web 构建/部署配置：SPA rewrites 不会生效

`vercel.json`（仓库根）定义了 `/(.*) → /index.html` 的 rewrites，但 `deploy-web.yml` 用的是
`amondnet/vercel-action` + `working-directory: dist` —— 上传的是**已构建好的 `dist` 目录本身**，
根目录的 `vercel.json` 不在 `dist` 内，因此其 `rewrites` 与 `buildCommand` 均不会被应用。
当前 App 用 React Navigation 而非 expo-router，正常使用只停留在 `/`，影响有限；但任何深链或非根路径刷新会 404。
建议：构建后把一份 `vercel.json`（只保留 rewrites）拷进 `dist`，或改用 Vercel 的 Git 集成让根 `vercel.json` 生效。

#### P2-10 ⚠️ `app.config.js` 的 `extra` 层级写错

```js
return { ...config, expo: { ...config.expo, extra: {...} } };
```

Expo 传入的 `config` **已经是扁平化的 ExpoConfig**（即 `app.json` 里 `expo` 键的内容被提升到顶层），`config.expo` 为 `undefined`。
这样写会在 ExpoConfig 内部再造一层 `expo`，`extra` 落在错误层级，`Constants.expoConfig.extra.supabaseUrl` 取不到值。
当前无实际故障（代码统一读 `process.env.EXPO_PUBLIC_*`，全仓无 `expo-constants` 使用），但配置是错的且具误导性。
正确写法：`return { ...config, extra: { ...config.extra, supabaseUrl, supabaseAnonKey } }`。

---

### P3 — 可排期

| # | 项 | 说明 |
| --- | --- | --- |
| P3-11 | `.env.example` 含真实 project ref | `EXPO_PUBLIC_SUPABASE_URL=https://izoxfohuvnrfvatsrpnz.supabase.co` 是真实项目地址。URL 本身按设计可公开（真正边界是 RLS，此处不构成密钥泄露），但**示例文件应使用占位符**，避免误导他人指向生产实例。建议改为 `https://<your-project-ref>.supabase.co` |
| P3-12 | 生物识别双实现接口漂移风险 | `biometrics.ts`（Web）与 `biometrics.native.ts`（原生）各自复制了一份 `BiometricSupport` 接口与三个导出。平台分流本身**正确**（Metro 对原生优先解析 `.native.ts`，Web 回落 `.ts`；`tsc` 走 `.ts` 且两侧签名一致），但无任何测试或共享类型文件保证两侧不漂移。建议把 `BiometricSupport` 抽到共享 `types.ts` 由双方 import |
| P3-13 | `listings.views` 未映射 | DB 有 `views int not null default 0`，前端 `Listing` 类型与 `mapListing` 均未包含，浏览量能力闲置 |
| P3-14 | 续期逻辑两处实现 | 后端已有 `supabase/functions/refresh-listing` Edge Function，前端 `refreshListing` 却直接 `.update({status,expires_at})`。TTL=30 天的常量因此存在于 mock、supabaseDataSource、DB 默认值、Edge Function 四处，易漂移。建议统一走 Edge Function 或明确废弃它 |

---

### 团队指定的 4 项集成风险 — 逐条核验结论

| 风险项 | 核验结论 | 严重度 |
| --- | --- | --- |
| `dataSource.ts` 的环境变量开关 | ❌ **不通过** —— 开关存在但无消费方，属死代码；切换后行为不变（P0-1）。另注：`dataSource` 是模块加载期求值的 `const`，运行时无法改变，这一点在 Expo 构建期内联的前提下可接受 | **P0** |
| RLS 对齐 | ⚠️ **部分通过** —— 后端 0001+0002 质量高（默认 deny、公开可见性收紧为 `active and expires_at > now()`、注册自动建档触发器、会话/消息防伪造与不可篡改触发器、`security_invoker` 视图、helper 固定 `search_path`），前端列名映射与 `location->>city` 表达式索引亦对齐；**但**前端 `seller_id` 兜底 `'u_me'` 与 uuid + `auth.uid()` 冲突（P1-5），且缺写操作导致 messages/conversations/favorites 的策略无前端可用（P1-6） | **P1** |
| 生物识别 Web 分流 | ✅ **通过** —— `biometrics.ts`（Web 返回不可用并引导邮箱/WebAuthn）与 `biometrics.native.ts`（expo-local-authentication）导出签名一致，平台解析顺序正确，调用方（`App.tsx:36`、`ProfileScreen.tsx:43`）无需感知。仅存接口重复的漂移风险（P3-12） | **P3** |
| Web 构建配置 | ⚠️ **部分通过** —— `expo export --platform web` 路径可用、`EXPO_PUBLIC_*` 经 workflow 注入正确、`.gitignore` 已排除 `.env*`；但 `vercel.json` 的 rewrites 因 `working-directory: dist` 而失效（P2-9），`app.config.js` 的 `extra` 层级错误（P2-10），且 `npm ci` 因缺 lockfile 会失败（P0-3） | **P2**（`npm ci` 部分为 P0） |

---

## (d) 结论与建议

### 判定

| 场景 | 判定 |
| --- | --- |
| 继续交付 / 演示**当前 mock 版本** | ✅ **GO** —— 门禁全绿（tsc 0 error、225/225、E2E 10/10），质量扎实 |
| **切换到线上 Supabase**（任务 #19） | 🔴 **NO-GO** |
| 部署 Web（任务 #20，mock 模式） | 🟡 **GO-WITH-NOTES** —— 需先补 lockfile 修好 `npm ci`，并处理 rewrites |

### NO-GO 理由（三条硬伤，任一单独即可阻断）

1. **开关不通电** —— 配好环境变量也不会切换数据源，全部界面仍读 mock（P0-1）。
2. **切过去就崩** —— `createListing` 在 `auth.data.user?.id` 处必抛 TypeError，且类型系统与测试双双失明（P0-2）。
3. **依赖没装、CI 跑不起来** —— SDK 未安装、无 lockfile，`npm ci` 必失败；装上后门禁需重跑，结果未知（P0-3）。

即使前两条修好，`hydrate()` 无调用点（P0-4）会让消息与个人资料静默空白 —— 这是最难在验收中被发现的一类故障。

### 转为 GO 的最小验收清单

上线前须逐项完成并复验：

- [ ] **P0-1** 4 处消费方改用 `dataSource`；`useStore` 改为经数据源注水，不再直接 import `mockData`
- [ ] **P0-2** `auth.data.user?.id` → `auth.user?.id`；顺带全文件排查同类解构错误
- [ ] **P0-3** `npm install @supabase/supabase-js` → 提交 `package-lock.json` → **重跑 `tsc --noEmit` 与 `npm test` 并确认仍为 0 error / 225 pass**；评估 `src/types/supabase-js.d.ts` 是否应删除（保留会继续屏蔽真实类型）
- [ ] **P0-4** 在登录成功 / App 启动后调用 `hydrate()`，并处理其失败分支
- [ ] **P1-5** 未登录时不进入发布流程，给出明确引导；移除 `'u_me'` 兜底，改为「无 uid 即报错」
- [ ] **P1-6** `DataSource` 补齐 `sendMessage` / `createConversation` / 收藏 CRUD，或明确声明本期不上线聊天与云端收藏
- [ ] **C1/C5** 至少补齐 mapper 纯函数单测 + 一个双实现契约一致性套件，让 Supabase 路径不再零覆盖
- [ ] **P2-9** 修复 Web SPA rewrites
- [ ] 用**真实 Supabase 实例**做一次冒烟：匿名浏览 feed → 注册（验证 profiles 触发器建档）→ 发布 → 续期 → 过期结算 → 会话与消息读写，逐条对照 RLS 是否按预期放行/拒绝

### 给团队的提示

后端 `ikear-backend` 的两份 migration（尤其 0002 的安全加固）质量明显高于前端集成层 —— 后端已把 RLS 与生命周期做扎实，**当前短板集中在前端「最后一公里」的接线上**：开关没接、注水没调、写操作没实现。
建议把上述 P0 四项作为任务 #19 的实际工作内容来排期，而不是当作「改一行配置」。

---

*本报告由 qa-engineer 独立出具。所有门禁数据均为实际执行输出，所有代码问题均已标注 `文件:行号` 可复核。*
