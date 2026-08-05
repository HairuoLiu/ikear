# 代码评审 — mobile-dev

- **评审人**：mobile-dev（Mobile/Frontend Engineer）
- **范围 1（REVIEWER 1）**：`ikear-backend` 的 SQL / seed / Edge Function，重点核对与 `supabaseDataSource.ts` 映射层的契约一致性
- **范围 2（REVIEWER 2）**：`ikear-mobile` 自身的 Supabase 集成代码质量
- **基线**：`tsc --noEmit` 通过；`npm test` 225 passed / 53 suites（修改前后均为绿）
- **严重度**：BLOCKER（阻断上线/集成） / MAJOR（功能或质量明确缺陷） / MINOR（改进项） / NIT（风格）

---

## 一、契约一致性核对结果（最高价值检查）

### 1.1 枚举值 —— 全部一致 ✅

| 枚举 | SQL 约束 | 前端契约 | 结论 |
| --- | --- | --- | --- |
| `condition`（4 值） | `0001_init.sql:87-89` `全新/良好/一般/磨损` | `types.ts:43` | ✅ 完全一致 |
| `status`（4 值） | `0001_init.sql:91-93` `active/expired/sold/archived` | `types.ts:45` | ✅ 完全一致 |
| `type`（2 值） | `0001_init.sql:95-97` `secondhand/accessory` | `types.ts:48` | ✅ 完全一致 |
| `category`（15 值） | `0001_init.sql:80-85` | `types.ts:11-26` + `categories.ts:4-20` | ✅ 15/15 逐项一致，顺序亦同 |

`seed.sql` 中使用的 `condition`（良好/全新/一般/磨损）与 `category`（sofa/chair/bed/lighting/storage）均落在合法集合内 ✅。

### 1.2 列名 / 类型映射核对

| 表 | SQL 列 | 映射函数 | 结论 |
| --- | --- | --- | --- |
| `profiles` | 9 列全覆盖 | `mapProfile` | ✅ 无漂移 |
| `conversations` | 7 列全覆盖 | `mapConversation` | ✅ 无漂移 |
| `messages` | 8 列全覆盖 | `mapMessage` | ✅ 无漂移 |
| `listings` | 18 列 | `mapListing` / `toRow` | ⚠️ **`views` 漏映射**（见 B-3，已修复） |
| `favorites` | 3 列 | —— | ⚠️ **无任何映射，表完全未被使用**（见 B-6） |

---

## 二、后端评审发现（REVIEWER 1）

### B-1 [BLOCKER] 缺少 `auth.users → profiles` 的自动建档触发器
`0001_init.sql` 全文没有 `handle_new_user` 触发器。真实注册流程只会写入 `auth.users`，`public.profiles` 不会有对应行，于是：
- `supabaseDataSource.hydrate()`（`supabaseDataSource.ts:134`）查不到 profile；
- `getProfile()`（`supabaseDataSource.ts:270-278`）回落到占位用户 `u_me`，「我的」页展示的是假身份。

`seed.sql:66-90` 手工插入了 profiles，恰好把这个缺口在本地环境掩盖掉了。
**建议**（后端 owner 执行）：

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nickname)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### B-2 [MAJOR] 「续期」存在三套实现、两种语义
| 实现 | 位置 | 行为 |
| --- | --- | --- |
| Edge Function | `refresh-listing/index.ts:123-130` | `expires_at = +30d`，`status='active'`，**不给曝光标** |
| 客户端直连 | `supabaseDataSource.ts:232-249` | 同上，**不给曝光标** |
| Store（当前 UI 实际走的） | `useStore.ts:323-325` → `expiry.refresh()` | `expires_at = +30d` **且 `boostedUntil = +24h`** |

`lib/expiry.ts:58-68` 把「刷新赠 24h 曝光」定义为业务规则，但后端两条路径都没实现，同一个按钮在 mock 与线上会产生不同结果。
另外 Edge Function 目前是**死代码**——App 侧没有任何 `functions.invoke('refresh-listing')`，客户端直接 update 表（RLS `listings_update_own` 已足够保证只有卖家能改）。
**建议**：二选一（推荐保留 Edge Function 作为唯一写入口以便未来加审计/风控），并在选中的那条路径里补 `boosted_until = now() + 24h`。

### B-3 [MAJOR] `listings.views` 在 SQL 存在、UI 在用，但映射层丢弃
- SQL：`0001_init.sql:76` `views int not null default 0`，`seed.sql` 也写了真实值（143/88/301…）
- UI：`ListingDetailScreen.tsx:156`、`ProfileScreen.tsx:180-181` 都读 `listing.views`
- 映射：`mapListing` / `toRow` 原先均无 `views`

线上模式下浏览量恒为 0，「N 次浏览」在「我的」页直接不渲染。**已在我方文件修复**（见 §四 F-3）。

### B-4 [MAJOR] RLS 无法限制列，`messages` / `conversations` 的 UPDATE 权限过宽
- `0001_init.sql:273-277`：策略注释写的是「只允许接收方标记已读」，但 Postgres RLS **不能限制列**，实际上发送方可以在消息发出后任意改写 `content`（聊天记录可被篡改）。
- `0001_init.sql:250-254`：会话参与者可以改任意列，包括把 `seller_id` 改成第三方（`with check` 只要求自己仍是参与者之一）。

**建议**用列级 GRANT 收紧：

```sql
revoke update on public.messages from authenticated;
grant  update (read) on public.messages to authenticated;

revoke update on public.conversations from authenticated;
grant  update (last_message, last_message_at, unread_count) on public.conversations to authenticated;
```

### B-5 [MAJOR] `views` 计数在当前 RLS 下不可能实现
`listings_update_own`（`0001_init.sql:228-232`）只允许卖家 update，而浏览量必须由**买家**触发自增。前端无论如何都写不进去。
**建议**：加一个 `security definer` 的 RPC，例如 `increment_listing_views(p_id text)`，只允许 `views = views + 1`。

### B-6 [MAJOR] `favorites` 表建了但前后端都没用
`0001_init.sql:149-156` 定义了 `favorites`（含 RLS 与索引），`seed.sql:246-250` 也灌了数据；但前端收藏只存本地 AsyncStorage（`useStore.ts:215-221`），`supabaseDataSource` 里没有任何 favorites 读写（`getFavorites`（`supabaseDataSource.ts:291`）读的是内存 listings 缓存）。
结果：换设备 / 重装后收藏丢失，后端表是死表。**这属于 task #19 的功能补齐，我未改动**。

### B-7 [MINOR] 会话冗余字段没有触发器维护
`conversations.last_message / last_message_at / unread_count` 需要每次发消息后由客户端再发一次 update，两次写非原子，断网时会话列表会与消息不一致。
**建议**：`after insert on public.messages` 触发器里同步维护，并让 `unread_count` 自增。

### B-8 [MINOR] `listings_expiring_soon` 视图存在两个隐患
`0001_init.sql:290-295`：
1. `interval '3 days'` 是硬编码字面量，没有复用 `listing_ttl_days()` 那样的常量函数，PM 契约 `EXPIRING_SOON_DAYS` 改动时会漏改；
2. 视图默认是 `security invoker`（PG15+ 才有 `security_invoker` 选项）——在旧版本 Postgres 上视图以**创建者权限**执行，可能绕过 RLS。建议显式 `with (security_invoker = on)` 或改为函数。
另外前端目前完全没有用这个视图（临期判断走 `lib/expiry.needsRefreshReminder`），存在第二套口径的风险。

### B-9 [MINOR] `seed.sql` 直接写 `auth.users`
文件头已注明「切勿在生产执行」✅，但 `supabase db reset` 之外没有任何机制阻止误用。建议在 CI 里对 `seed.sql` 加一道「仅本地」的守卫（例如检查 `current_setting('app.env')`）。

### B-10 [NIT] Edge Function 的 CORS 与错误信息
`refresh-listing/index.ts:33` 允许 `Access-Control-Allow-Origin: *`。该函数强制校验 Bearer token，风险可控；但既然 Web 端域名已知（Vercel/Cloudflare），建议收敛为白名单。
`index.ts:106/133` 把数据库原始 `error.message` 透传给客户端，可能泄漏表结构，建议只回通用文案 + 服务端日志。

---

## 三、移动端自评发现（REVIEWER 2）

### M-1 [BLOCKER] 数据源开关是死代码：生产路径全部硬编码 `mockDataSource`
`dataSource.ts:294` 精心做了 `supabaseEnabled() ? supabaseDataSource : mockDataSource` 的切换，但**所有调用方都绕过了它**：
- `feedCache.ts:141`（首页/探索的唯一取数入口）
- `useFavorites.ts:32`（收藏页）
- `ListingDetailScreen.tsx:64`（详情页搭配周边）

即使配好 `EXPO_PUBLIC_SUPABASE_*`，App 依然 100% 读 mock 数据。这是 task #19「接入线上后端」的头号阻塞点。**已修复**（F-1）。

### M-2 [BLOCKER] `createListing` 取 user id 的路径写错，必定抛 TypeError
```ts
const { data: auth } = await client.auth.getUser();   // auth 已经是 data
seller_id: input.sellerId ?? auth.data.user?.id ?? 'u_me'   // ← auth.data 是 undefined
```
`supabaseDataSource.ts:196`（原）解构过一次之后又访问 `.data`，`auth.data` 为 `undefined`，再读 `.user` 直接抛 `Cannot read properties of undefined`。即便侥幸走到兜底，`'u_me'` 也不是合法 uuid，会被 `seller_id uuid` 列拒绝（22P02）。同文件 `hydrate():125` 的写法（`auth?.user?.id`）才是对的。**已修复**（F-2）。

### M-3 [MAJOR] `getListing` 用 `.single()`，查无此条时抛错而非返回 `null`
接口契约是 `Promise<Listing | null>`（`dataSource.ts:82`），mock 实现也返回 `null`。PostgREST 在 0 行时返回 PGRST116 错误，`.single()` 会把它变成异常——收藏页 `Promise.all` 里只要有一条被删/被 RLS 过滤，整页收藏都会清空。**已修复为 `.maybeSingle()`**（F-4）。

### M-4 [MAJOR] Supabase 模式缺少 `settleStatus` 惰性结算，与 mock 行为不一致
`mockDataSource.getListings/getListing/getFavorites` 都会调 `settleStatus`（`dataSource.ts:118-123`），把「已过 `expiresAt` 但 DB 里仍是 active」的挂牌显示为 expired；`supabaseDataSource` 没有这一步。`ProfileScreen.tsx:13` 的注释明确要求「以 expiresAt 惰性结算」。**已在 `mapListing` 内统一补上**（F-5）。
（浏览流不受影响：`lib/browse.isPubliclyVisible` 本来就会把 TTL 过期项过滤掉。）

### M-5 [MAJOR] `hydrate()` 未登录时会发出非法查询 + N+1 请求
- 未登录时 `uid` 为 `undefined`，`.or('buyer_id.eq.,seller_id.eq.')`（原 `:125`）会拼出空 uuid 过滤条件被后端拒绝；
- 每个会话单独查一次消息（原 `:128-135`），会话数一多就是 N+1。

**已修复**：未登录直接清缓存返回；消息改为单次 `.in('conversation_id', ids)` 后在内存分组（F-6）。

### M-6 [MAJOR] Face ID 解锁失败会把用户永久锁在门外
`App.tsx` 的 `BiometricLock.tryAuth` 原先没有 try/catch。`expo-local-authentication` 在原生模块异常时会 reject，此时 `checking` 永远停在 `true`，界面卡在「正在通过 Face ID 验证…」的转圈上，**连重试按钮都不渲染**，用户只能删 App。**已修复为降级到可重试的失败态**（F-7）。

### M-7 [MAJOR] 整个 UI 层读的是 zustand mock 状态，而非数据源
`useStore.ts:184-194` 的 `login` 是「任意邮箱密码都通过」的演示实现；`listings: LISTINGS`（`:174`）、`publishDraft`（`:267`）、`sendMessage`（`:350`）全部只写内存。`useBrowse`、`ListingDetailScreen`、`ChatScreen` 都从 store 读数据。
也就是说：**即使 M-1 修好，写路径（登录/发布/发消息）仍未接后端**。这不是缺陷而是 task #19 的工作面，但需要 lead 明确知道剩余工作量：`login/register/logout` 换 `supabase.auth`、`publishDraft` 走 `dataSource.createListing`、消息走 `conversations/messages` 表 + Realtime 订阅。**我未改动。**

### M-8 [MAJOR] `src/types/supabase-js.d.ts` 的 ambient 声明会屏蔽真包类型
`@supabase/supabase-js` 已经写进 `package.json:34` 的 dependencies（但当前 node_modules 里没装）。一旦 `npm i` 装上，`declare module '@supabase/supabase-js'`（`supabase-js.d.ts:5-10`）仍会**优先于** node_modules 里的真实类型定义，整条 Supabase 链路退化成 `any`，编译期彻底失去类型保护。
**我未删除**——因为当前环境确实没装该包，删了会让 `tsc --noEmit` 立刻红。**建议 lead 在执行 `npm i @supabase/supabase-js` 的同一个 commit 里删掉这个 shim**，并把 `getSupabaseClient(): Promise<any>` 收紧为 `Promise<SupabaseClient<Database>>`。

### M-9 [MINOR] `getFavorites` 依赖「上一次 feed 查询」的残留缓存
`supabaseDataSource.ts:291-297` 从 `cache.listings` 里找，而 `cache.listings` 只在 `getListings` 成功时被整体覆盖（`:192`）。用户收藏了一件不在当前列表页里的商品（切了品类、或收藏后刷新过 feed），收藏页就查不到。
`useFavorites` 目前走的是 `getListing(id)` 逐条查（更可靠），所以暂未暴露；但 `DataSource.getFavorites` 这个同步接口本身设计有问题。
**建议**：接口整体 async 化，`getFavorites` 改为 `.in('id', ids)` 直查，或干脆废弃该方法。

### M-10 [MINOR] 搜索口径漂移：mock 搜「标题+描述」，线上只搜标题
`supabaseDataSource.ts:181` `ilike('title', ...)` vs `dataSource.ts:142-150` 同时匹配 `title` 和 `description`。
**未改动**：直觉写法 `.or('title.ilike.%q%,description.ilike.%q%')` 会把用户输入拼进 PostgREST 的过滤表达式，输入里的 `,` `(` `)` 会破坏语法（属于过滤注入面）。正确做法是先转义再拼，或走 `websearch_to_tsquery` 全文检索，需要后端配合建 tsvector 索引——建议列入 task #19。

### M-11 [MINOR] 同步接口 + 模块级可变缓存是长期债
`DataSource.getProfile/getConversations/getMessages/getFavorites` 是同步签名（`dataSource.ts:88-96`），逼得 Supabase 实现只能靠模块级 `cache` 单例（`supabaseDataSource.ts:114-119`）做 cache-aside。副作用：多账号切换时缓存不会自动失效（`logout` 没有清 `cache`）、测试之间会互相污染、无法做并发控制。
**建议**：把这 4 个方法改成 `Promise`，UI 侧用现有的 `useEffect + alive` 模式消费（`useFavorites` 已经是这个写法）。

### M-12 [MINOR] `hydrate()` 没有任何调用方
`hydrate` 是 Supabase 模式下 profile/会话/消息的唯一填充入口，但全仓没有一处调用（App 启动、登录成功后都没有）。platform-dev 独立复核后把它判为 BLOCKER，同意——只是根因在「auth 未接入」而非 hydrate 本身。
**已做一半**：把 `hydrate?(): Promise<void>` 加进 `DataSource` 接口并挂到 `supabaseDataSource`（F-13），调用方从此可以写 `await dataSource.hydrate?.()` 而不必 import 具体实现，分层不破。
**未接线**：`App.tsx` 里的实际调用留给 task #19 —— 当前 `useStore.login` 是「任意邮箱密码都通过」的 mock，此时调 hydrate 只会走到「未登录 → 清空缓存」分支，接了也没有可观测收益。登录换成 `supabase.auth.signInWithPassword` 的那一刻再补这一行才有意义。

### M-13 [NIT] 平台分层与懒加载写法正确 ✅
- `biometrics.ts`（Web 默认）+ `biometrics.native.ts`（原生）符合 Metro 的 `.native.*` 解析规则，两边导出签名一致，调用方零分支 ✅
- `lib/supabase.ts` 的 `await import('@supabase/supabase-js')` 确实能让 mock 模式与 `node --test` 不加载该包 ✅
- 已顺手修掉：动态 import 失败会把 rejected promise 永久缓存，网络恢复也无法自愈（F-8）
- 已顺手清理：`_UnusedFavorite` / `_SupabaseListing` 两个「防未使用告警」占位类型导出（F-9）

### M-14 [NIT] `biometrics.native.ts` 三个 `await` 均未包 try/catch
`getBiometricSupport`（`:9-25`）里 `hasHardwareAsync/isEnrolledAsync/supportedAuthenticationTypesAsync` 任一 reject 都会向上冒泡。M-6 的修复已在调用侧兜住，此处保持原样即可，但更稳妥的是在模块内部就 `catch → { available:false }`。

### M-15 [MAJOR] RN 端没注入 AsyncStorage，session 冷启动必丢（platform-dev 提出）
`supabase.ts` 原先只给了 `persistSession: true`，但 supabase-js 的默认存储是 `localStorage` —— RN 里根本不存在，session 只活在内存，杀进程即掉登录。
**已修复**（F-11）：动态 import `@react-native-async-storage/async-storage` 注入 `auth.storage`，取不到时回落 SDK 默认（Web 上就是 localStorage，行为正确）。必须用动态 import：本模块被 `dataSource` 静态引用、会进入 node 单测模块图，顶层 import RN 包会直接把 `npm test` 打挂。顺带关掉了 RN 无意义的 `detectSessionInUrl`。

### M-16 [MAJOR] 零测试覆盖是前面几个 BLOCKER 的根因（platform-dev 提出）
`supabaseDataSource.ts` 此前 0 用例，225 个测试一条都没碰它，所以 M-2 那种「必崩」的写法能一路绿灯——`src/types/supabase-js.d.ts` 的 ambient shim 又把 SDK 降级成 `any`，类型层同样拦不住。
**已修复**（F-12）：新增 `supabaseDataSource.test.ts`，用注入式 fake client 覆盖映射层与查询构造，共 23 例。其中 4 例是针对本次 BLOCKER 的回归锁：`seller_id` 取值路径、未登录抛错、`getListing` 返回 null、以及「2 个会话只查 1 次 messages」的 N+1 防护。
配套加了 `__setSupabaseClient()` 测试钩子（`supabase.ts`），与既有的 `__setFeedStorage` / `__resetMockDb` 同一套约定。

---

## 三之二、后端 0003_privilege_hardening 带来的破坏性变更（backend-dev 通知）

0003 用 BEFORE INSERT/UPDATE 触发器做列级管控，直接影响我方三处写路径。已全部适配：

### X-1 [BLOCKER→已修] 续期改走 Edge Function
`listings.expires_at` / `boosted_until` 对客户端只读，原先 `refreshListing` 的直接 `update` 会抛 42501。
**已改为** `client.functions.invoke('refresh-listing', { body: { listingId } })`（F-14）。要点：
- `functions.invoke` 的错误语义与 postgrest 不同——非 2xx 时 `error` 非空、但函数自己返回的 `{ ok:false, error }` 仍在 `data` 里，**两边都要读**才能拿到可读原因。已按此实现并加测试。
- 终态（sold/archived）保持「原样返回、不打服务端」，与 `mockDataSource` 同口径，顺带省掉一次必定 409 的往返。
- 副作用（正面）：TTL=30 的最后一份客户端拷贝随之消失，有效期长度现在只有服务端一个来源。

### X-2 [MAJOR→已修] `toRow()` 剔除被钉回的列
`views` / `created_at` / `seller_id` 发了也会被静默钉回 → 不再下发（F-15）。
`expiresAt` / `boostedUntil` 会 raise 42501 → 改为**客户端提前抛可读错误**并指向 `refreshListing()`，而不是把一个含糊的数据库报错抛给用户。

### X-3 [MAJOR→已修] `views` 的写入路径补齐
配合 B-3 的读映射，详情页挂载时 fire-and-forget 调 `rpc('increment_listing_views', { p_listing_id })`（F-16、F-17）。走可选方法 `dataSource.incrementListingViews?.()`，mock 模式天然退化为 no-op。

### X-4 [MINOR] `public_profiles` 视图已封装、但 UI 未切换
`profiles` 收紧成仅本人可读后，展示他人资料必须走 `public_profiles`。`hydrate()` 读自己的那句 `.eq('id', uid)` 不受影响 ✅。
**已封装** `getPublicProfile(id)`（F-18，读视图并把不存在的 email 补成空串）；**未改 UI**：`ListingDetailScreen:175-183` 现在读的是 mock 挂在 Listing 上的 `seller` 快照，切成异步取数需要加载态/占位，属于 task #19。

### X-5 [MAJOR] ⚠️ 「刷新赠 24h 曝光」这条产品规则现在无法实现
`lib/expiry.refresh()`（`:58-68`）与 `useStore.refreshListing`（`:323-325`，UI 实际入口，`ProfileScreen.tsx:325` 的注释也明写「赠 24h 曝光」）会设置 `boostedUntil`。
但 0003 之后 `boosted_until` 只能由平台侧发放，而 `refresh-listing` Edge Function **只改 expires_at 和 status、不发曝光位**。
结论：这条规则一旦接上真实后端就会静默消失（客户端设了会被 42501 拒绝）。**需要 PM/后端定夺**——要么 Edge Function 里补 `boosted_until = now() + 24h`，要么正式废弃该规则并同步改掉 `lib/expiry.refresh()` 与 UI 文案。我未擅自改动产品规则。

### X-6 [MINOR] `useStore.discountRelist` 同样会撞上只读列
`useStore.ts:336-348` 的降价重上架直接设 `expiresAt`。目前纯内存不报错，但 task #19 把它接到 `dataSource` 时必须拆成两步：`updateListing({ price, discount, status })` + `refreshListing(id)`。

---

## 四、本次已修改的文件（均为 mobile-dev 所有）

| # | 文件:行 | 修改 | 对应发现 |
| --- | --- | --- | --- |
| F-1 | `feedCache.ts:16,141` / `useFavorites.ts:7,32` / `ListingDetailScreen.tsx:36,64` | `mockDataSource` → `dataSource`，让后端开关真正生效 | M-1 |
| F-2 | `supabaseDataSource.ts:215-218` | 修正 `auth.data.user?.id` → `auth?.user?.id`；去掉非法 uuid 兜底 `'u_me'`，未登录改为抛可读错误 | M-2 |
| F-3 | `supabaseDataSource.ts:40,107` | `mapListing` 补 `views`，`toRow` 补 `views` | B-3 |
| F-4 | `supabaseDataSource.ts:198-201` | `getListing` 改 `.maybeSingle()`，查无返回 `null` | M-3 |
| F-5 | `supabaseDataSource.ts:42-47` | `mapListing` 内做 TTL 惰性结算，与 `settleStatus` 同口径 | M-4 |
| F-6 | `supabaseDataSource.ts:122-162` | `hydrate` 未登录早退 + 消息改单次 `.in()` 查询消除 N+1；profile 改 `maybeSingle` | M-5 |
| F-7 | `App.tsx:204-227` | `BiometricLock.tryAuth` 包 try/catch，异常降级为可重试失败态 | M-6 |
| F-8 | `supabase.ts:36-40` | 动态 import 失败时清空 `_clientPromise`，允许后续重试 | M-13 |
| F-9 | `supabase.ts` / `supabaseDataSource.ts` | 删除 `_SupabaseListing`、`_UnusedFavorite` 占位导出及其无用 import | M-13 |
| F-10 | `supabaseDataSource.ts:164` | `TTL_MS` 复用 `lib/expiry` 的 `TTL_DAYS * DAY_MS`，消除第三处 30 天硬编码 | —— |
| F-11 | `supabase.ts:21-52` | 注入 AsyncStorage 作为 auth storage（动态 import）；关闭 RN 无意义的 `detectSessionInUrl` | M-15 |
| F-12 | `supabaseDataSource.test.ts`（新增，23 例）+ `supabase.ts:__setSupabaseClient` | fake client 契约测试，锁住本次全部 BLOCKER | M-16 |
| F-13 | `dataSource.ts:96-118` + `supabaseDataSource.ts:167` | `DataSource` 增加可选 `hydrate?()`，并挂到 supabase 实现 | M-12 |
| F-14 | `supabaseDataSource.ts:257-286` | `refreshListing` 改走 `functions.invoke('refresh-listing')`，正确处理 invoke 的双通道错误 | X-1 |
| F-15 | `supabaseDataSource.ts:89-116` | `toRow` 剔除 `views`/`created_at`/`seller_id`；`expiresAt`/`boostedUntil` 提前抛可读错误 | X-2 |
| F-16 | `supabaseDataSource.ts:288-297` | 新增 `incrementListingViews`，走 `increment_listing_views` RPC | X-3 |
| F-17 | `ListingDetailScreen.tsx:73-80` | 详情页挂载时 fire-and-forget 计一次浏览量 | X-3 |
| F-18 | `supabaseDataSource.ts:299-313` | 新增 `getPublicProfile`，读 `public_profiles` 视图 | X-4 |
| F-19 | `dataSource.ts:33-40` | `LISTING_TTL_DAYS` / `DAY` 转发 `lib/expiry` 的常量，30 这个数字前端只剩一处定义 | —— |

**验证**：`npx tsc --noEmit` 通过；`npm test` **248/248** 通过（基线 225 + 新增 23，零回归）。
**未提交**：按分工要求，未执行 `git commit` / `git push`，交由 lead 集成。

> 注：本轮 shell（Git Bash）出现 `dofork` 崩溃，验证改用 PowerShell 执行，结论不受影响。

---

## 五、给 lead 的收敛建议（按优先级）

1. **B-1（profiles 触发器）** 是接线上后端时最先炸的点（0002 若已包含则可勾掉）。
2. **X-5「刷新赠 24h 曝光」需要产品决策** —— 0003 之后客户端无法设置 `boosted_until`，而 Edge Function 也没发放，这条规则会静默消失。要么服务端补发，要么正式废弃并改掉 `lib/expiry.refresh()` 与 UI 文案。这是本轮唯一需要 PM 拍板的项。
3. **M-7 / M-12**：数据源开关已经通了（F-1），但写路径（登录/发布/发消息）仍在 store 内存里，这是 task #19 的主要工作量，建议单独立项。接线顺序建议：`supabase.auth` → `onAuthStateChange` → `dataSource.hydrate?.()` → 发布/消息。
4. **M-8**：`npm i @supabase/supabase-js` 与删除 `src/types/supabase-js.d.ts` 必须放在**同一个 commit**。⚠️ 纠正 platform-dev 的建议：该包目前**并未安装**在 `node_modules`（只写在 `package.json:34`），此刻单独删 shim 会让 `tsc --noEmit` 立刻变红。
5. **B-4**：上线前收紧 messages/conversations 的列级 UPDATE 权限（0003 只处理了 profiles/listings），当前聊天记录仍可被发送方事后篡改。
6. **X-6**：`useStore.discountRelist` 接后端时要拆成 `updateListing` + `refreshListing` 两步，不能直接设 `expiresAt`。
