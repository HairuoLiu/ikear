# IKEAR — QA 独立审计与签署报告

| 项 | 值 |
| --- | --- |
| 审计人 | qa-engineer（独立审计角色，不参与功能开发） |
| 日期 | 2026-08-04 |
| 被审对象 | `ikear-mobile`（前端）+ `ikear-backend`（Supabase schema / RLS） |
| 审计轮次 | 初审 21:25–21:34 → **复审 22:02–22:10**（三位开发在初审期间并行提交了修复） |
| 结论 | **GO-WITH-NOTES** —— 分阶段切换：浏览/详情/发布链路可上线；消息/资料/store 链路 **暂不可切** |

> 本次为只读审计。除本文件外未修改任何源码、标准或架构文档，未执行任何 git 操作。
> **重要说明**：初审进行时，三位开发正在同一仓库并行修复。复审发现 8 个源文件已变更、新增 `src/data/supabaseDataSource.test.ts`。
> 本报告以**复审时的最新代码**为准；初审发现的问题及其处置结论完整保留在附录，作为审计轨迹。

---

## (a) 质量门禁结果

全部命令在 `ikear-mobile/` 下实际执行。

### 复审（最终，以此为准）

| 门禁 | 命令 | 结果 | 判定 |
| --- | --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | exit 0，**0 个 error** | ✅ PASS |
| 单元/集成测试 | `npm test` | **tests 248 · suites 61 · pass 248 · fail 0 · skipped 0 · todo 0** | ✅ PASS |
| 独立 E2E（附加） | `node --experimental-strip-types --experimental-loader ./test/loader.mjs e2e/independent-e2e.ts` | **10 条旅程 · 通过 10 · 失败 0** | ✅ PASS |

```
# tests 248
# suites 61
# pass 248
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

相对基线（225 pass / 53 suites）**净增 23 个用例、8 个套件**，全部来自新增的 `supabaseDataSource.test.ts`。零失败、零跳过。

### 初审 → 复审 的门禁变化

| 时点 | tsc | tests | 备注 |
| --- | --- | --- | --- |
| 初审 21:30 | 0 error | 225 pass / 53 suites | 但 `@supabase/supabase-js` **未安装**、`package-lock.json` **缺失** —— 门禁是在缺件状态下通过的 |
| 复审 22:05 | 0 error | **248 pass / 61 suites** | SDK 已真实安装、lockfile 已生成，**装上真包后 tsc 仍为 0 error** ✅ |

初审时我提出的最大门禁疑虑（「装上真 SDK 后类型错误可能爆发」）已被复审实测排除。

### ⚠️ 门禁仍存的一个盲区

**测试文件不参与类型检查。** `tsconfig.json:19` 的 `exclude` 仍含 `"**/*.test.ts"`，`include` 也不含 `test/`、`e2e/`。
即 `tsc --noEmit` 的 0 error **不覆盖**任何测试文件 —— 包括本次新增的、恰恰是最需要类型保护的 `supabaseDataSource.test.ts`（23 个用例、内含手写 fake client）。
→ 建议增加 `tsconfig.test.json` 并纳入 `ci:check`。**（P2-4，未修复）**

---

## (b) 测试覆盖缺口

### 初审结论：Supabase 集成层覆盖率为 **0**

```
grep -rn -i "supabase" --include=*.test.ts src/   →  NO MATCH
```

225 个用例中**没有任何一个**触及 `supabaseDataSource.ts` 或 `lib/supabase.ts`。根因三条叠加：动态 `import()` 使测试图不含该包；`.d.ts` 把客户端声明为 `any` 导致类型层也无保护；`supabaseDataSource` 直接调用 `getSupabaseClient()`，无依赖注入入口。

### 复审结论：**该缺口已基本填平** ✅

新增 `src/data/supabaseDataSource.test.ts`，23 个用例 / 8 个套件：

| 套件 | 行 | 对应我初审提出的缺口 |
| --- | --- | --- |
| `mapListing` | 150 | **C1** ✅ |
| `getListings 查询构造` | 189 | **C4** ✅ |
| `getListing` | 223 | ✅ |
| `createListing` | 231 | ✅（含未登录抛错路径） |
| `refreshListing（0003 之后走 Edge Function）` | 286 | **P3-14** ✅ 顺带解决 |
| `toRow 特权列` | 337 | **C1** ✅（并覆盖 0003 列级权限） |
| `0003 新接口` | 372 | ✅ |
| `hydrate` | 413 | **C6** ✅ |

### 仍存的覆盖缺口

| # | 未覆盖对象 | 风险 | 建议 |
| --- | --- | --- | --- |
| C2 | `supabaseEnabled()` / `dataSource` 导出开关 | 开关逻辑本身仍无用例。初审已证实这个开关曾是死代码而无人察觉 | 抽成纯函数 `resolveDataSource(env)`，对「两个都设 / 只设一个 / 都不设」三种输入断言返回哪个实现 |
| C3 | `getSupabaseClient()` 未配置抛错、`_clientPromise` 单例复用 | 并发首调可能重复建客户端；错误文案回归无保护 | 断言未配置时 reject 且含指引文案；并发调 5 次断言 `createClient` 只被调 1 次 |
| C5 | **mock 与 supabase 双实现契约一致性** | 两套实现仍有 2 处已知分歧（P2-5、P2-6），无机制拦截新分歧 | 同一组输入分别喂给两个实现，断言输出形状与语义一致 |
| C7 | 测试文件自身不被类型检查 | 见上文盲区 | `tsconfig.test.json` |

---

## (c) 风险清单（复审后状态）

严重度：**P1 = 上线前必修** / **P2 = 上线前应修** / **P3 = 可排期**
初审的 4 项 P0 中 **3 项已修复**，详见附录。

### P1 — 上线前必修

#### P1-1 ❌ `useStore.ts` 仍直连 mock 数据，store 驱动的界面不会切换

`src/store/useStore.ts:9`：

```ts
import { CURRENT_USER, LISTINGS, MESSAGES, USERS } from '../data/mockData';
```

初审发现的「环境变量开关是死代码」已**部分修复**：`feedCache.ts:17`、`useFavorites.ts:7`、`ListingDetailScreen.tsx:36` 三处均已改为 `import { dataSource }` ✅。
但 Zustand store —— 也就是驱动大部分界面的主状态 —— **仍然绕过整个数据源层直接 import mock 常量**。
后果：切到 Supabase 后，走 `dataSource` 的浏览/详情/收藏链路会读真实数据，而 store 驱动的界面继续显示 mock 数据，**两者混杂**。这比全 mock 更难排查。

#### P1-2 ❌ `hydrate()` 仍无生产调用点

`hydrate` 已被提升为 `DataSource` 可选方法（`dataSource.ts:109`）、已在 `supabaseDataSource` 实现并有测试覆盖 ✅ —— 但全仓检索，**应用代码中无任何调用**（`src/App.tsx` 既无 `hydrate` 也无 `dataSource` 引用）。

`getProfile` / `getConversations` / `getMessages` / `getFavorites` 四个同步方法全靠 `hydrate()` 预注水。不调用 = 切到 Supabase 后这四个方法**永远返回空数组 / `nickname:'我'` 的占位 profile**。
这是最难在验收中被发现的一类故障：**不报错、不崩溃、只是静默空白**。

> 修复：在登录成功 / App 启动后 `await dataSource.hydrate?.()`，并处理失败分支（网络失败时应给出可见提示而非静默空列表）。

#### P1-3 ❌ `src/types/supabase-js.d.ts` 仍在，反而屏蔽了刚装好的真实类型

初审时该 shim 是**必要的**（包未安装）。现在 `@supabase/supabase-js` 已真实安装到 `node_modules`，但这个 ambient `declare module '@supabase/supabase-js'` 仍然存在，会**优先于 SDK 自带类型生效**，把 `createClient` 与整个客户端继续钉死成 `any`。

结果：装了真包却拿不到任何类型保护。初审那个 `auth.data.user?.id` 的崩溃级 bug（现已修复）之所以能躲过 `tsc`，根因正是这个 shim —— 而这个根因**至今未拔除**。

> 修复：删除 `src/types/supabase-js.d.ts`，重跑 `tsc --noEmit`，把暴露出来的真实类型错误逐个修掉。这才是把这类 bug 挡在门外的治本手段。

#### P1-4 ⚠️ `DataSource` 契约仍缺写操作，聊天与收藏无法落库

复审后接口新增了 `hydrate?` / `incrementListingViews?` / `getPublicProfile?`，但仍**没有** `sendMessage` / `createConversation` / 收藏 CRUD。

后端已建好 `messages` / `conversations` / `favorites` 三表及配套 RLS（0002 还做了防伪造会话、消息投递后不可篡改的触发器加固）。前端无写入路径 = 聊天发送与收藏动作仍只改内存，刷新即丢、跨设备不同步，**后端能力闲置**。

> 决策项：要么本期补齐，要么明确声明「本期只上线浏览+发布，聊天与云端收藏下期」。不建议含糊带过。

---

### P2 — 上线前应修

| # | 项 | 位置 | 说明 |
| --- | --- | --- | --- |
| P2-4 | 测试文件不参与类型检查 | `tsconfig.json:19` | 见 (a) 节盲区。新增的 23 个 Supabase 用例正处在这个盲区里 |
| P2-5 | `getFavorites` 只在 `cache.listings` 中查找 | `supabaseDataSource.ts:347` | 只在**上一次 `getListings` 的结果**里找。收藏的商品若不在当前 feed（换了分类/筛选/翻页），收藏页会**静默少条目**且不报错。mock 侧是在完整库中查找 → 行为分歧。建议改为按 id 直接查库 |
| P2-6 | 关键词搜索只匹配 title | `supabaseDataSource.ts:194` | mock 侧同时匹配 `title` + `description`。同一关键词两种模式结果不同，用户感知为「搜不到」。建议 `.or('title.ilike.%q%,description.ilike.%q%')` |

---

### P3 — 可排期

| # | 项 | 说明 |
| --- | --- | --- |
| P3-7 | `.env.example` 含真实 project ref | `EXPO_PUBLIC_SUPABASE_URL=https://izoxfohuvnrfvatsrpnz.supabase.co` 是真实项目地址。URL 按设计可公开（真正边界是 RLS，不构成密钥泄露），但**示例文件应用占位符**，避免他人误指生产实例。建议改为 `https://<your-project-ref>.supabase.co` |
| P3-8 | 仓库根遗留 6 个临时文件 | `verify-err.txt` / `verify-full.txt` / `verify-npm.txt` / `verify-one.txt` / `verify-out.txt` / `verify-raw.txt`，均为 untracked 的调试产物。应删除或加入 `.gitignore`，避免误提交。（非我创建，未代为删除） |
| P3-9 | 生物识别双实现接口重复 | `biometrics.ts`（Web）与 `biometrics.native.ts`（原生）各自复制 `BiometricSupport` 接口与三个导出。平台分流本身**正确**，但无测试或共享类型保证两侧不漂移。建议把接口抽到共享 `types.ts` |

---

### 团队指定的 4 项集成风险 — 逐条核验

| 风险项 | 复审结论 | 严重度 |
| --- | --- | --- |
| `dataSource.ts` 环境变量开关 | ⚠️ **部分通过** —— 初审时开关无任何消费方（纯死代码），现 3 处消费方已正确接线 ✅；但 `useStore.ts:9` 仍直连 mockData，且 `hydrate()` 无调用点，切换后会出现「真实数据与 mock 数据混杂 + 社交模块静默空白」 | **P1** |
| RLS 对齐 | ✅ **通过（含 1 项待办）** —— 后端质量高：0001 建表+默认 deny，0002 收紧公开可见性为 `active and expires_at > now()`、注册自动建档触发器、会话/消息防伪造与不可篡改触发器、`security_invoker` 视图、helper 固定 `search_path`；0003 列级权限加固（堵住 anon 批量抓邮箱、禁止自改 rating/sold_count/expires_at/boosted_until/views）；0004 消息通道加固。前端侧初审发现的 `seller_id` 兜底 `'u_me'` 与 uuid + `auth.uid()` 冲突**已修复** ✅（改为未登录即抛可读错误）。**唯一待办**：messages/conversations/favorites 的策略仍无前端写入路径可用（P1-4） | **P1**（仅剩契约缺口） |
| 生物识别 Web 分流 | ✅ **通过** —— `biometrics.ts`（Web 返回不可用并引导邮箱/WebAuthn）与 `biometrics.native.ts`（expo-local-authentication）导出签名一致，Metro 平台解析顺序正确（原生优先 `.native.ts`，Web 回落 `.ts`），调用方 `App.tsx:36`、`ProfileScreen.tsx:43` 无需感知。仅存接口重复的漂移风险 | **P3** |
| Web 构建配置 | ✅ **通过** —— 初审发现的两个问题均已修复：① `deploy-web.yml:71` 现在会在构建后写入 `dist/vercel.json`（只含 rewrites，且注释明确说明不能直接拷根 `vercel.json`，因其带 `buildCommand` 会导致 Vercel 在 dist 内重新构建）✅；② `app.config.js` 的 `extra` 已从错误的 `config.expo.extra` 层级改到顶层 `config.extra`，并补了说明注释 ✅。`package-lock.json` 已生成，`npm ci` 可用 ✅ | ✅ |

---

## (d) 结论与建议

### 判定

| 场景 | 判定 |
| --- | --- |
| 交付 / 演示**当前 mock 版本** | ✅ **GO** —— 门禁全绿（tsc 0 error、248/248、E2E 10/10） |
| **切换线上 Supabase：浏览 / 详情 / 发布 链路** | 🟡 **GO-WITH-NOTES** —— 代码路径已通、有测试覆盖，但须先做完下方冒烟验证 |
| **切换线上 Supabase：消息 / 个人资料 / store 驱动界面** | 🔴 **NO-GO** —— P1-1（store 直连 mock）+ P1-2（hydrate 无调用）会导致数据混杂与静默空白 |
| 部署 Web（mock 模式，任务 #20） | ✅ **GO** —— lockfile 与 SPA rewrites 均已修复 |

**综合结论：GO-WITH-NOTES（分阶段切换）。**

### 判定依据

初审时我给出 NO-GO，三条硬伤为：开关不通电、切过去必崩、依赖没装。复审确认：

- ✅ 崩溃级 bug（`auth.data.user?.id`）已修复，并补了未登录的可读错误
- ✅ SDK 已装、lockfile 已生成，且**装上真包后 tsc 仍 0 error**
- ✅ 开关已为浏览/详情/收藏三处接线
- ✅ 零覆盖的集成层现有 23 个用例
- ❌ 但 store 仍直连 mock、`hydrate()` 仍无人调用 —— 全量切换会产生**数据混杂**与**社交模块静默空白**

三位开发在极短时间内的修复质量很高，剩余项已从「崩溃级」降为「接线不完整」，故从 NO-GO 上调为分阶段 GO。

### 转为完全 GO 的验收清单

- [ ] **P1-1** `useStore` 改为经 `dataSource` 注水，移除 `import ... from '../data/mockData'`
- [ ] **P1-2** 在登录成功 / App 启动后调用 `await dataSource.hydrate?.()`，并处理失败分支（不可静默吞掉）
- [ ] **P1-3** 删除 `src/types/supabase-js.d.ts`，重跑 `tsc --noEmit`，修掉真实类型暴露出的错误 —— **这是防止同类 bug 再次逃逸的治本项**
- [ ] **P1-4** 补齐 `sendMessage` / `createConversation` / 收藏 CRUD，或明确书面声明本期不上线聊天与云端收藏
- [ ] **P2-4** 增加 `tsconfig.test.json` 让测试文件纳入类型检查
- [ ] **P2-5 / P2-6** 修 `getFavorites` 查库、搜索补 `description`
- [ ] **C2 / C5** 补开关纯函数用例 + 双实现契约一致性套件
- [ ] **真机冒烟**（用真实 Supabase 实例，逐条对照 RLS 是否按预期放行/拒绝）：
      匿名浏览 feed → 注册（验证 profiles 触发器建档）→ 发布 → 续期（走 Edge Function）→ 过期结算 → 详情页读 `public_profiles`（确认拿不到 email）→ 尝试自改 rating/expires_at（应被 0003 触发器钉回）

### 给团队的提示

后端（4 份 migration，安全加固扎实）与前端集成层（映射、查询构造、错误处理均已有测试）质量都不错。
**当前短板集中在「最后一公里的接线」**：store 没接、注水没调、类型 shim 没拔。这三项都不是大改动，但**任何一项遗漏都会让线上切换看起来「能跑」却数据错乱**，且不会触发任何报错 —— 建议作为任务 #19 的显式验收项逐条勾核，而不是依赖门禁绿灯。

---

## 附录：初审发现问题的处置轨迹

初审（21:25–21:34，基于 225 用例时的代码）共提出 14 项。复审逐项复核结果：

| 初审编号 | 问题 | 复审状态 |
| --- | --- | --- |
| P0-1 | 环境变量开关是死代码，4 处消费方全部绕过 | ⚠️ **部分修复** —— 3 处已接线，`useStore` 仍未接（→ 现 P1-1） |
| P0-2 | `supabaseDataSource.ts:196` `auth.data.user?.id` 双重 `.data`，`createListing` 必崩 | ✅ **已修复** —— 改为 `auth?.user?.id` |
| P0-3 | SDK 未安装 + 无 `package-lock.json`，`npm ci` 必失败 | ✅ **已修复** —— 均已就位，且装包后 tsc 仍 0 error |
| P0-4 | `hydrate()` 无调用点 | ⚠️ **部分修复** —— 已入接口+实现+测试，仍无生产调用（→ 现 P1-2） |
| P1-5 | `seller_id` 兜底 `'u_me'` 与 uuid + RLS 冲突 | ✅ **已修复** —— 未登录时抛可读错误 |
| P1-6 | DataSource 缺写操作（消息/收藏） | ❌ **未修复**（→ 现 P1-4） |
| P1-7 | 测试文件不参与类型检查 | ❌ **未修复**（→ 现 P2-4） |
| P2-8a | 搜索只匹配 title（mock 匹配 title+description） | ❌ **未修复**（→ 现 P2-6） |
| P2-8b | Supabase 侧不做过期惰性结算 | ✅ **已修复** —— `mapListing` 已按 mock 同口径结算 |
| P2-8c | `getFavorites` 只查 `cache.listings` | ❌ **未修复**（→ 现 P2-5） |
| P2-9 | `vercel.json` rewrites 因 `working-directory: dist` 失效 | ✅ **已修复** —— 构建后写入 `dist/vercel.json` |
| P2-10 | `app.config.js` 的 `extra` 层级错误 | ✅ **已修复** —— 改到顶层并补注释 |
| P3-11 | `.env.example` 含真实 project ref | ❌ **未修复**（→ 现 P3-7） |
| P3-13 | `listings.views` 未映射 | ✅ **已修复** —— `mapListing` 已含 `views` |
| P3-14 | 续期逻辑与 Edge Function 重复 | ✅ **已修复** —— 改为走 Edge Function 并有测试 |

**处置率：9 项已修复、2 项部分修复、4 项未修复（1 项为初审后新识别的 P1-3）。**

---

*本报告由 qa-engineer 独立出具。所有门禁数据均为实际执行输出，所有代码问题均标注 `文件:行号` 可复核。*
