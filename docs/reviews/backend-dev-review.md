# 后端工程师代码评审 — backend-dev

**评审人**：backend-dev（Supabase / Postgres / RLS / Edge Functions）
**评审范围**
1. **REVIEWER 1 — 移动端 Supabase 集成**：`ikear-mobile/src/data/supabaseDataSource.ts`、`src/lib/supabase.ts`、`src/data/dataSource.ts`，逐字段比对 `ikear-backend/supabase/migrations/0001_init.sql`
2. **REVIEWER 2 — 后端自查**：migrations / RLS / seed / Edge Function

**严重度**：BLOCKER（上线即坏 / 安全漏洞）> MAJOR（功能不正确）> MINOR（可用但不对）> NIT（风格）

**方法说明**：本机没有 Docker / Supabase CLI / psql，`0002` 迁移**未经实机执行验证**，仅做人工语法与语义复核。合入前请务必跑一次 `supabase db reset` 验证（详见文末「验证清单」）。

---

## 一、结论速览

| # | 严重度 | 归属 | 问题 |
|---|---|---|---|
| A1 | **BLOCKER** | 前端 | 首页/发布根本不走 `dataSource`，接了 Supabase 也只显示 mock 数据 |
| A2 | **BLOCKER** | 前端 | `hydrate()` 从未被调用 → Supabase 模式下资料/会话/消息永远为空 |
| A3 | **BLOCKER** | 前端 | `createListing` 里 `auth.data.user?.id` 取值路径错误，必抛 TypeError |
| A4 | **MAJOR** | 前端 | `seller_id` 回落 `'u_me'` 写进 `uuid` 列 → `22P02` |
| A5 | **BLOCKER** | 双方 | 30 天过期在服务端**完全没有实现**（已在后端 `0002` 修复） |
| A6 | **MAJOR** | 前端 | `getListing` 用 `.single()`，查不到时抛错而非返回 `null`，违反 DataSource 契约 |
| A7 | **MAJOR** | 前端 | `mapListing` 漏掉 `views` 列，详情页/我的页浏览量恒为 0 |
| A8 | **MAJOR** | 前端 | `hydrate()` 未登录时拼出 `buyer_id.eq.` 空值 → `22P02` |
| A9 | **MAJOR** | 前端 | `getFavorites` 只查内存缓存，`favorites` 表在前端是死表 |
| B1 | **MAJOR**（已修） | 后端 | `listings_expiring_soon` 视图默认绕过 RLS |
| B2 | **MAJOR**（已修） | 后端 | `conversations` 的 INSERT/UPDATE 可伪造对家、DELETE 可级联删对方消息 |
| B3 | **MAJOR**（已修） | 后端 | `messages` 可注入他人会话；发送方可篡改已投递内容 |
| B4 | **MAJOR**（已修） | 后端 | 注册后没有自动建 `profiles` 行 |
| B5 | **MINOR** | 后端 | `refresh-listing` Edge Function 前端从未调用，与前端直更逻辑双份实现 |
| B8 | **BLOCKER**（已修） | 后端 | `profiles` 对 anon 全表可读 → 全站用户邮箱可被批量抓取 |
| B9 | **MAJOR**（已修） | 后端 | `listings` UPDATE 不限列 → 卖家可自改 `expires_at`/`boosted_until`/`views`/`created_at` |
| B10 | **MAJOR**（已修） | 后端 | `profiles` UPDATE 不限列 → 用户可自己给自己打 5.0 分 |

| B12 | **MAJOR**（已修） | 后端 | `messages` 的 INSERT 策略有 `conversation_id is null` 旁路 → 陌生人可直投私信 |

> B8–B10 来自 platform-dev（Reviewer 2）的交叉评审，是我第一轮自查漏掉的**列级**权限问题 —— 我当时只盯着「行」（RLS 能表达的部分），没有横向检查「这一行里哪些列该由谁写」。已在 `0003_privilege_hardening.sql` 修复。
>
> B12 来自 platform-dev 对 0002/0003 的复审 —— **是我自己在 0002 里新写进去的漏洞**，已在 `0004_message_channel_hardening.sql` 修复。

**表名、列名、类型层面的漂移：0 处。** 五张表的所有列都能在 `0001_init.sql` 里一一对上（对照表见附录 C）。真正的问题不在字段名，而在**行为契约**：前端的 `settleStatus` 语义、DataSource 的 `null` 语义、以及大量代码压根没接上数据源。

---

## 二、REVIEWER 1 — 移动端 Supabase 集成

### A1 · BLOCKER — 浏览与发布完全绕开了 `dataSource`

- `ikear-mobile/src/store/useStore.ts:174` — `listings: LISTINGS`，直接把 `mockData` 的常量数组当作初始状态
- `ikear-mobile/src/screens/HomeScreen.tsx:73` — `useStore((s) => s.listings)`
- `ikear-mobile/src/store/useStore.ts:276-299` — `publishDraft` 自己在内存里造 `id: 'l_' + t` 的 Listing 并 `set({ listings: [...] })`，从不调用 `dataSource.createListing`

`supabaseDataSource` 写得很完整，但**没有任何页面调用它的 `getListings`**（全仓 grep `getListings(` 在 screens 下 0 命中）。因此即使配好 `EXPO_PUBLIC_SUPABASE_*`，首页还是 mock 数据，发布的商品也永远进不了数据库。

> 建议：store 增加 `loadListings()`（`dataSource.getListings(toBrowseFilter(...))` → `set({ listings })`），`publishDraft` 改为 `await dataSource.createListing(...)` 后再写回 store。这是打通前后端的第一颗扣子。

### A2 · BLOCKER — `hydrate()` 是孤儿函数

`ikear-mobile/src/data/supabaseDataSource.ts:114` 导出了 `hydrate()`，全仓 grep 只有定义、没有调用。而 `getProfile / getConversations / getMessages` 是 cache-aside 的同步读（`:237-256`），缓存永远是空的：

- `getProfile()` 恒返回 `id:'u_me'`、昵称「我」的假用户（`:239-246`）
- `getConversations()` 恒返回 `[]`，`getMessages()` 恒返回 `[]`

> 建议：在 App 启动 / 登录成功后 `await hydrate()`；或把这三个方法改成 async（DataSource 接口注释里已经预告过这个演进方向）。

### A3 · BLOCKER — `auth.data.user?.id` 取值路径错误

`ikear-mobile/src/data/supabaseDataSource.ts:186,196`

```ts
const { data: auth } = await client.auth.getUser();   // auth === { user }
seller_id: input.sellerId ?? auth.data.user?.id ?? 'u_me',  // auth.data 是 undefined
```

已经把 `data` 解构重命名成 `auth` 了，又去读 `auth.data.user`。可选链在 `user?.id` 上，挡不住 `auth.data` 为 `undefined`，**必抛** `Cannot read properties of undefined (reading 'user')`。只要 `input.sellerId` 没传（正常发布路径就是不传），发布必崩。

> 修复：`auth.user?.id`。

### A4 · MAJOR — `'u_me'` 兜底会写坏 uuid 列

同上一行。`listings.seller_id` 是 `uuid not null references auth.users(id)`（`0001_init.sql:70`），写入 `'u_me'` 会直接报 `22P02 invalid input syntax for type uuid`；就算类型对了也过不了 `listings_insert_own` 的 `with check (seller_id = auth.uid())`。

> 修复：拿不到用户 id 时应当抛「请先登录」，而不是塞一个假 id。后端 README「seller_id 类型约定」一节写的就是这条。

### A5 · BLOCKER — 30 天过期契约在服务端不存在（后端已修）

这是两边口径差最大的一处：

| | mock | Supabase 模式（修复前） |
|---|---|---|
| 过期结算 | `dataSource.ts:118 settleStatus()` 读时惰性结算 | **无**。`mapListing`（`supabaseDataSource.ts:22`）不做任何结算 |
| 服务端 | — | **无**触发器、无定时任务，`status` 永远停在 `active` |
| 公开可见性 | — | `listings_select_active_public` 只看 `status='active'` |

结果：Supabase 模式下商品**永不过期**，`LISTING_TTL_DAYS = 30` 只是个摆设，过期商品会一直挂在首页。

**后端侧已修**（`0002_security_hardening.sql`）：新增 `settle_expired_listings()` 结算函数（配 pg_cron），并把公开 SELECT 策略收紧为 `status='active' and expires_at > now()`。

**仍需前端配合（两点）**：
1. `mapListing` 应当套一层 `settleStatus()`，否则在 cron 两次执行之间，卖家看到的自己的商品仍是 `active`，「已过期 / 去刷新」的 UI 分支不会亮。
2. 「我的-已过期」列表若用 `getListings({ status:'expired' })`，服务端过滤的是**原始列**，未结算的行会漏掉。建议改成按 `sellerId` 拉全量、客户端 `settleStatus` 后再分组。

> 注意行为变化：收紧后**买家读不到过期商品**（返回 0 行）。这符合产品语义，但如果详情页要展示「该商品已过期」，需要改成显示空态而不是报错。如果 PM 希望过期商品仍可浏览，把 `0002` 第 2 节的策略退回 `status = 'active'` 即可，一行的事。

### A6 · MAJOR — `getListing` 违反 `Promise<Listing | null>` 契约

`ikear-mobile/src/data/supabaseDataSource.ts:172-174`

```ts
const { data, error } = await client.from('listings').select('*').eq('id', id).single();
if (error) throw new Error(`getListing 失败: ${error.message}`);
```

`.single()` 在 0 行时返回 `PGRST116` 错误，于是**「商品不存在」被当成异常抛出**；而 mock 实现（`dataSource.ts:192-195`）返回 `null`，接口签名也写的是 `Listing | null`。RLS 收紧后（A5），买家访问过期商品同样会走到这条分支。

`useFavorites.ts:32-38` 正是按 `null` 写的（`rows.filter((l) => l != null)`），现在会被 `.catch()` 整体吞掉 → 收藏页一条不剩。

> 修复：改用 `.maybeSingle()`，`data` 为空时 `return null`。

### A7 · MAJOR — `views` 没有映射

DB 有 `listings.views int not null default 0`（`0001_init.sql:76`），UI 也在用：

- `ikear-mobile/src/screens/ListingDetailScreen.tsx:156` — `{listing.views ?? 0}`
- `ikear-mobile/src/screens/ProfileScreen.tsx:180-181` — `{listing.views} 次浏览`

但 `mapListing`（`supabaseDataSource.ts:22-41`）没有 `views: row.views`，Supabase 模式下浏览量恒为 0 / 不显示。

> 修复：`views: row.views ?? 0`。顺带一提，目前也没有任何地方给 `views` 做自增，需要的话我可以在后端加一个 `increment_listing_views(listing_id)` RPC（`security definer` + 只允许 +1）。

### A8 · MAJOR — 未登录时 `hydrate()` 会拼出非法 uuid 过滤器

`ikear-mobile/src/data/supabaseDataSource.ts:125`

```ts
.or(`buyer_id.eq.${uid ?? ''},seller_id.eq.${uid ?? ''}`)
```

`uid` 为空时生成 `buyer_id.eq.,seller_id.eq.`，Postgres 报 `22P02 invalid input syntax for type uuid: ""`。而且 `error` 被忽略（只解构了 `data`），会静默变成空列表。

> 修复：`if (!uid) { cache.conversations = []; cache.messages = {}; return; }`。另外这里还有 N+1：会话数 × 1 次消息查询（`:128-135`），建议一次性 `.in('conversation_id', ids)` 拉回来再本地分组。

### A9 · MAJOR — `favorites` 表在前端是死表

`ikear-mobile/src/data/supabaseDataSource.ts:258-263` 的 `getFavorites(ids)` 只在 `cache.listings`（上一次 `getListings` 的结果）里找，**从不查 `public.favorites`**；收藏关系存在 `useStore` 的本地持久化里（`useStore.ts:150,215-219`）。

后果：换设备 / 重装丢收藏；只要收藏的商品不在最近一次列表结果里就查不到。后端的 `favorites` 表 + RLS 目前是完全空转的。

> 建议：`toggleFavorite` 写 `favorites` 表（RLS 已就绪，`user_id = auth.uid()` 全操作放行），`getFavorites` 改成 `.select('listing_id, listings(*)')` 一次 join 取回。

### A10 · MINOR — 搜索口径不一致

`supabaseDataSource.ts:155` 只 `ilike('title', ...)`；mock（`dataSource.ts:142-150`）同时匹配 `title` 和 `description`。

> 修复：`.or('title.ilike.%kw%,description.ilike.%kw%')`。注意 `filter.query` 里的 `,` `%` `(` `)` 需要转义，否则会破坏 PostgREST 的 `or` 语法（**这是一个注入面**，虽然 PostgREST 会做参数化，但过滤器表达式本身是拼出来的）。

### A11 · MINOR — `refresh-listing` Edge Function 从未被调用

前端 `refreshListing`（`supabaseDataSource.ts:206-223`）直接 `update` 表；全仓 grep `functions.invoke` = 0 命中。两套 TTL=30 的实现（前端 `TTL_MS`、函数 `LISTING_TTL_DAYS`），迟早漂移。

从安全角度看，前端直更**是安全的**（`listings_update_own` 已经把范围限死在卖家自己），所以这个 Edge Function 其实是冗余的。二选一即可：前端改调 `functions.invoke('refresh-listing')`，或者删掉函数。**建议保留函数、前端改调它** —— 函数里有「终态拒绝续期」的服务端校验（返回 409），前端那份是客户端判断（`:214`），绕过前端就没了。

### A12 · NIT — 类型与结构

- `supabaseDataSource.ts:22,43,57,69,83` 全是 `row: any`。建议用 `supabase gen types typescript` 生成 `Database` 类型，把漂移交给编译器守。这正是本次评审需要人工逐列比对的原因。
- `supabaseDataSource.ts:267` 的 `export type _UnusedFavorite = Favorite;` 和 `lib/supabase.ts:44` 的 `_SupabaseListing`：用「导出一个假类型」来消告警不太干净，`import type` 直接删掉即可。
- `toRow`（`:83-101`）允许 patch `sellerId` / `createdAt`。RLS 挡得住改成别人（`with check`），但没必要开这个口子，建议从 `toRow` 里剔除。
- `lib/supabase.ts:32-34`：React Native 上没配 `storage: AsyncStorage`，`persistSession: true` 在原生端可能存不住 session（Web 有 localStorage 所以看不出问题）。接真机时会踩。

---

## 三、REVIEWER 2 — 后端自查（含已修项）

所有修复都放在**新增的** `ikear-backend/supabase/migrations/0002_security_hardening.sql`，未改动 `0001_init.sql`（遵守「已推送的 migration 不可修改」的规范），且不含任何列的重命名 / 删除。

### B1 · MAJOR（已修）— 视图默认绕过 RLS

`0001_init.sql:290-297` 的注释写着「视图继承底层表的 RLS」——**这个说法是错的**。Postgres 视图默认以**视图属主**（`postgres`，`BYPASSRLS`）的身份读底层表，PostgREST 又会把 `public` 下的视图暴露成端点。

本例侥幸没造成数据泄露（视图只筛 `status='active'`，本来就是公开可读的行），但这是个随时会踩的模式陷阱：任何人往这个视图里加一列敏感字段，就是一次实打实的越权。

**修复**：`0002` 第 3 节 `alter view ... set (security_invoker = on)`，用 `server_version_num >= 150000` 包了一层版本判断以兼容 PG14。README 也补了「新增视图必须加 `security_invoker`」的硬性规定。

### B2 · MAJOR（已修）— `conversations` 策略过宽

`0001_init.sql:245-259`：

- **INSERT** 只要求「我是参与者之一」。攻击者可以构造 `{listing_id: 任意, buyer_id: 受害者, seller_id: 自己}`，往任何人的收件箱里塞会话；`seller_id` 也不要求是该商品的真实卖家。
- **UPDATE** 的 `with check` 同样只要求「改完之后我还是参与者」。**卖家可以把 `buyer_id` 改成第三方**，把整条会话（含历史消息）转移给不相干的人。RLS 的 `WITH CHECK` 看不到 `OLD`，光靠策略拦不住。
- **DELETE** 任一方都能硬删，`messages.conversation_id ... on delete cascade`（`0001_init.sql:140`）会连带删掉**对方**的全部消息。买家一键抹掉卖家的聊天记录，属于数据丢失面。

**修复**（`0002` 第 4 节）：
1. INSERT 增加 `seller_id = (select l.seller_id from listings l where l.id = listing_id)`，保证对家是商品的真实卖家；
2. 新增 `guard_conversation_identity()` BEFORE UPDATE 触发器，锁死 `listing_id / buyer_id / seller_id`；
3. 撤掉 DELETE 策略（前端无删除会话功能，验证过 0 调用点）。将来要做「删除会话」请用软隐藏列，README 已注明。

### B3 · MAJOR（已修）— `messages` 策略过宽

`0001_init.sql:267-277`：

- **INSERT** 只校验 `sender_id = auth.uid()`，`conversation_id` 可以填**别人的会话 id**。由于 SELECT 策略是 `sender or receiver = auth.uid()`，攻击者只要把 `receiver_id` 填成该会话的一方，这条伪造消息就会**出现在受害者的会话线程里**（消息注入 / 钓鱼）。
- **UPDATE** 双方都能改任意列。发送方可以在对方读过之后**篡改已投递的消息内容**——聊天记录不可信，纠纷时无法举证。策略注释写的是「只允许接收方标记已读」，但实现并没有做到。

**修复**（`0002` 第 5 节）：
1. INSERT 增加「不能发给自己」+「带 `conversation_id` 时必须是该会话参与者且 `receiver` 是会话另一方」（子查询本身也受 `conversations` 的 RLS 约束，非参与者连行都查不到，天然拒绝）；
2. UPDATE 收紧为 `receiver_id = auth.uid()`；
3. 新增 `guard_message_immutability()` 触发器，UPDATE 只放行 `read` 列。

### B4 · MAJOR（已修）— 注册后没有 `profiles` 行

`0001` 只有 `profiles_insert_self` 策略，没有 `auth.users` 的建档触发器。而前端 `hydrate()`（`supabaseDataSource.ts:119`）直接 `.select('*').eq('id', uid).single()` —— 新注册用户没有 profile 行，`.single()` 返回 `PGRST116`，`cache.profile` 永远为空，整个「我的」页面退化成假用户。

**修复**（`0002` 第 1 节）：`handle_new_user()` + `on_auth_user_created` 触发器（Supabase 官方推荐模式），昵称取 `raw_user_meta_data.nickname`，回落 `full_name`，再回落邮箱前缀。`security definer` + `set search_path = public, pg_temp` + 对 `anon/authenticated` `revoke execute`。

**连带修复 `seed.sql`**：触发器会先建出「昵称 + 空城市」的骨架行，原来的 `on conflict (id) do nothing` 会让 seed 里的评分 / 成交数 / 城市被静默丢弃 → 已改成 `do update set`。

### B5 · 其余后端问题（未改，供决策）

| 严重度 | 位置 | 问题 |
|---|---|---|
| MINOR | `functions/refresh-listing/index.ts:46-61` | 支持 `GET ?id=` 触发写操作，违反 HTTP 语义（GET 应当是安全/幂等的）。有 Bearer 鉴权兜着，风险不高，但建议只留 POST |
| MINOR | 同上 `:118-120` | 终态返回 409；前端 `refreshListing:214` 是静默返回原对象。两套语义，合并时以哪边为准需要拍板 |
| MINOR | 同上 `:32-36` | `Access-Control-Allow-Origin: '*'`。凭 Bearer token 鉴权可以接受，但生产建议收敛到已知域名，并给 OPTIONS 加 `Access-Control-Max-Age` |
| MINOR | 同上 | 无限流。任何登录用户都能高频刷同一个商品续期，建议加个「同一 listing N 分钟内只能续期一次」的约束（可以用 `listings.updated_at` 或单独一张 `listing_refresh_log`） |
| MINOR | `0001_init.sql:132-141` | 没有 `updated_at` 列，排查问题时无法判断行的最后修改时间。建议后续 migration 给 `listings` / `conversations` 加 `updated_at` + `moddatetime` 触发器 |
| MINOR | `0001_init.sql:115-125` | `conversations` 缺 `unique (listing_id, buyer_id)`，同一买家对同一商品可以开出多条会话。补唯一约束前需要先确认线上无重复数据，故未擅自加 |
| ~~NIT~~ | `0001_init.sql:49` | ~~`rating` 可自改~~ → **定级修正为 MAJOR，见 B10，已在 0003 修复** |
| NIT | `README.md:8` | 暴露了项目 URL。这不是密钥（anon key 本来就是公开的），无需处理，仅记录 |

此外 platform-dev 指出 `.github/workflows/ci.yml` 有两个问题：每一步都挂了 `continue-on-error`（`supabase start` 应用迁移失败 job 也全绿，等于没有门禁），以及 `deno check supabase/functions/**/index.ts` 里的 `**` 在未开 globstar 的 sh 下不会递归展开（应写成 `*/index.ts`）。**两条我都认同，但按分工约定我不改 CI 配置**，留给 lead 决定由谁动手。建议至少放开 "Start local Supabase stack" 这一步的失败 —— 0002/0003 引入了触发器和视图，正是最需要迁移能否真实执行这道门禁的时候。

### B8 · BLOCKER（已修）— `profiles` 全表可读 = 全站邮箱公开接口

`0001_init.sql:194-197` 的 `profiles_select_public using (true)`。anon key 是公开的，因此任何人都可以：

```
GET /rest/v1/profiles?select=email    # 全站用户邮箱，一次拉完
```

这是本次评审里危害最直接的一条 —— 撞库、钓鱼、营销骚扰的一手材料，且属于个人信息泄露。**我第一轮自查漏了它**：我核对了「谁能读哪些行」，却默认了「profiles 本来就该公开」这个 0001 注释里的前提，没有回头质疑这个前提本身。

**修复**（`0003` 第 1 节）拆成两层：

- 表 `profiles`：策略收紧为 `id = auth.uid()`，本人仍能读到自己的 email（`hydrate()` 不受影响）；
- 视图 `public_profiles`：只暴露 `id / nickname / avatar_url / city / district / rating / sold_count / created_at`，无 email，`grant select to anon, authenticated`。

已确认对前端零破坏：全仓 `from('profiles')` 只有 `supabaseDataSource.ts:134` 一处，且是 `.eq('id', uid)` 读自己；详情页展示的 `seller?.nickname/city/rating/soldCount`（`ListingDetailScreen.tsx:175-183`）正好是 `public_profiles` 的列集合，且目前取自 mock 而非查库。

> **对 platform-dev 建议的一处纠正**：`public_profiles` **不能**加 `security_invoker`。加了它就会继承「仅本人可读」的策略，查别人时恒返回 0 行，视图直接作废。这里必须保持属主权限执行 —— 用视图定义本身充当列白名单，这是 definer 视图的正当用法。与 `listings_expiring_soon` 必须加 `security_invoker` 并不矛盾：那个视图暴露的是完整行，安全性依赖 RLS；这个视图暴露的是列子集，安全性依赖列白名单。两者的判断标准是「视图暴露完整行还是安全列子集」，README 已把这条规则写进去。
>
> 代价：Supabase linter 会对 `public_profiles` 报 `security_definer_view`。这是**预期内**的，README 已注明不要顺手"修掉"。

### B9 · MAJOR（已修）— `listings` UPDATE 不限列，业务规则可被自我授予

`0001_init.sql:228-232` 的 `listings_update_own` 只校验「这行是我的」，不校验「改了哪些列」。RLS 是行级的，天生表达不了列级约束。后果：

| 列 | 卖家自改的后果 |
|---|---|
| `expires_at` | **无限自我续期**，`LISTING_TTL_DAYS = 30` 彻底失效，同时绕过 `refresh-listing` 里「sold/archived 终态拒绝续期」的服务端校验 |
| `boosted_until` | 免费自授推广置顶 —— 这是明确规划中的付费点（README 业务常量节），等于收入漏损 |
| `views` | 浏览量随意注水，商品热度不可信 |
| `created_at` | 改成 `now()` 就能在**默认的「最新」排序**里无限自我置顶，等于免费顶帖 |

而前端 `toRow()`（`supabaseDataSource.ts:83-101`）恰好把这四列全都放进了可 patch 集合，路径是通的。

**修复**（`0003` 第 3 节）用 BEFORE UPDATE 触发器做列级管控，对客户端角色（`authenticated` / `anon`）生效，服务端角色（`service_role` / `postgres` / cron）放行：

- `expires_at` / `boosted_until`：**报错**（`errcode 42501`），让调用方明确知道该走哪条路；
- `views` / `created_at` / `seller_id`：静默钉回 OLD 值（客户端本就不该发这几列，报错反而误伤正常编辑）。

> ⚠️ **这是一个有意的破坏性变更**：前端现在的 `refreshListing`（`supabaseDataSource.ts:215-220` 直接 `update expires_at`）会开始报错。续期**必须**改走 `functions.invoke('refresh-listing')` —— 那里才有终态校验和服务端计算的 `expiresAt`。这同时也解决了 A11 提到的「TTL=30 两份实现迟早漂移」。已单独同步 mobile-dev。
>
> 如果 lead 认为这个改动应当推迟，回滚成本是一行：`drop trigger trg_guard_listing_privileged_columns on public.listings;`。但在回滚状态下，30 天有效期这条核心业务规则在服务端是不成立的。

### B10 · MAJOR（已修）— `profiles` UPDATE 不限列，可自己给自己刷分

同一类问题。我在第一轮把它记成了 NIT（见 B5 表格末行，理由是「当前没有评分体系」），**这个定级偏低了**：`rating` / `sold_count` 已经在详情页渲染（`ListingDetailScreen.tsx:182-183`），并且 0003 把它们放进了公开视图，用户自己 `update profiles set rating = 5, sold_count = 999` 就能伪造信誉。这直接影响 C2C 平台最核心的信任信号。

**修复**（`0003` 第 2 节）：触发器把 `email` / `rating` / `sold_count` / `id` / `created_at` 钉回原值。`email` 一并纳入是因为改 `profiles.email` 并不会改 `auth.users`，只会让两边静默不一致。

### B11 · `views` 的合法写入路径（新增）

B9 把 `views` 钉死之后，它就没有任何写入口了 —— 其实从 0001 起就一直如此（A7 提到前端连读都没读）。`0003` 第 4 节补了 `increment_listing_views(p_listing_id text)`：`security definer` 绕过 RLS 与触发器，但函数体只允许 `+1`，且只对 `active and expires_at > now()` 的商品生效，返回 `void` 不泄露商品存在性。已 `grant execute to anon, authenticated`。

### B12 · MAJOR（已修）— 我在 0002 里自己留的私信旁路

0002 第 5 节我把 `messages` 的 INSERT 策略写成了：

```sql
and (
  conversation_id is null                    -- ← 这一支把下面整段短路了
  or exists ( ...参与者校验... )
)
```

我加 `conversation_id is null` 是为了兼容 `0001:140` 那句「可空，兼容早期未归档到会话的历史消息」的注释。但**布尔短路意味着：只要不填 `conversation_id`，参与者校验根本不会执行**。于是攻击者仍然可以

```
POST /rest/v1/messages  { sender_id: 自己, receiver_id: 任意用户, content: "..." }
```

向全站任何人直投消息 —— 而 SELECT 策略是 `sender or receiver = auth.uid()`，收件人照样能看到。我以为 B3 关掉了骚扰通道，实际只关了「注入指定会话」那一半，**「陌生人直投」这半扇门是我亲手留的**。

更根本的问题是那条兼容性注释本身：`0001` 就是**初始** migration，它所"兼容"的历史数据在本项目里从不存在。为一个虚构的历史包袱开的口子，恰好落在安全校验的必经之路上。

**修复**（`0004`）两层一起上：

1. `messages.conversation_id` 收为 `NOT NULL`（前置检查有脏数据时给出可操作的报错，而不是让 `set not null` 抛一句干巴巴的 "column contains null values"）；
2. INSERT 策略删掉 `is null` 分支。

两层缺一不可 —— `NOT NULL` 只保证「必须填」，挡不住填**别人的**会话 id；策略才管「填的是我参与、且收件人也在其中的那个会话」。

**连带的产品语义**（已写进 README）：私信不再有陌生人直投通道。要给某人发第一条消息，必须先建 conversation，而建 conversation 又要求 `seller_id` 是该商品的真实卖家（B2）。两条合起来，私信只能沿「对某个商品联系卖家」这一条路径发起 —— 这正是 C2C 平台应有的形状。

> 对 mobile-dev 的影响：将来实现发消息时，必须先 upsert conversation 拿到 id，再插 message。目前前端还没有发消息的实现（`DataSource` 只有 `getMessages`），所以是零破坏。

### B13 · MINOR（已修）— 触发器函数缺 `search_path`

0002/0003 新增的 4 个 `security invoker` 触发器函数（`guard_conversation_identity` / `guard_message_immutability` / `guard_profile_privileged_columns` / `guard_listing_privileged_columns`）都没设 `search_path`。它们引用全部 schema-qualified，没有实际提权面，但 `db lint` 的 `function_search_path_mutable` 是**按函数报**的，会新增 4 条告警，把 0002 第 7 节刚清干净的 lint 又弄脏。

`0004` 第 3 节用 `alter function ... set search_path` 补上（而非重建，避免函数体在两处 migration 里各写一遍、日后改一处漏一处）。

### B14 · R2-2 复核结论：已在第一轮修复，非新增问题

platform-dev 报的 `seed.sql:90 on conflict (id) do nothing` 导致种子资料被吞 —— 这条**第一轮就已经修了**（见 B4 末尾），当前 `seed.sql:93-101` 是 `on conflict (id) do update set`，八个列全部覆盖。platform-dev 复审时看的是改动前的行号。

结论一致、无需再改，但两人独立指向同一处说明这个耦合确实隐蔽：**给 `auth.users` 加建档触发器，会让所有针对 `profiles` 的 `do nothing` upsert 静默失效**。已在 seed 里就地写了注释说明因果，避免后人把它改回 `do nothing`。

### B6 · 做得对的地方

- 所有表都 `enable row level security`，且 select/insert/update/delete 分开写，没有偷懒用 `for all`（`favorites` 那处的 `for all` 是合理的，条件完全对称）；
- 用户外键统一 `uuid references auth.users(id) on delete cascade`，RLS 里可以直接 `= auth.uid()` 而不用类型转换，索引也能命中 —— 这个决策省了很多后患；
- 枚举用 `CHECK` 约束而不是 PG `enum` 类型：改枚举值只需要一条 `alter constraint`，不用 `alter type`，对增量迁移友好；
- Edge Function 的「先鉴权、再操作」模式（`index.ts:85-115`）是对的，service_role 也只从环境变量取、没有下发客户端；
- `.gitignore` 对 `.env*` / `*.local` 的覆盖是完整的，`supabase/.env.local` 能被 `.env.*` 匹配到。

### B7 · 新增索引

`supabaseDataSource.getListings:147-148` 会按 `location->>city` / `location->>district` 过滤，`0001` 没有对应索引，全表扫描。`0002` 第 6 节补了两个表达式索引，外加一个 `(expires_at) where status='active'` 的部分索引给结算函数和「即将过期」用。

---

## 四、我改动的文件（仅后端）

| 文件 | 改动 |
|---|---|
| `ikear-backend/supabase/migrations/0002_security_hardening.sql` | **新增**。注册建档触发器、过期结算函数 + 公开可见性收紧、视图 `security_invoker`、conversations/messages RLS 收紧 + 两个不可变触发器、jsonb 表达式索引、helper 函数固定 `search_path` |
| `ikear-backend/supabase/migrations/0003_privilege_hardening.sql` | **新增**（第二轮，响应 platform-dev 的交叉评审）。profiles 收紧为仅本人可读 + `public_profiles` 列白名单视图；profiles / listings 特权列的 BEFORE UPDATE 触发器；`increment_listing_views` RPC |
| `ikear-backend/supabase/migrations/0004_message_channel_hardening.sql` | **新增**（第三轮，响应 platform-dev 复审）。`messages.conversation_id` 收为 NOT NULL + INSERT 策略去掉 null 旁路；4 个触发器函数补 `search_path` |
| `ikear-backend/supabase/seed.sql` | profiles 的 `on conflict do nothing` → `do update set`（配合新增的建档触发器，否则种子数据被吞） |
| `ikear-backend/README.md` | 目录树补 0002/0003；RLS 策略表更新为三个 migration 合并后的最终态；补充「过期结算」「注册即建档」「前端对接约定」「视图与 RLS 的关系」「会话不开放物理删除」等节 |

未改动任何前端文件、`CODING_STANDARDS.md`、`ARCHITECTURE.md`、`USAGE.md`、CI 配置。未 commit / push。

## 五、合入前的验证清单

```bash
cd ikear-backend
supabase db reset          # 跑 0001 + 0002 + seed，确认全绿
supabase db lint           # 确认没有新增 warning
deno check supabase/functions/refresh-listing/index.ts
```

重点回归：

1. `seed.sql` 执行后 `select nickname, city, rating, sold_count from profiles` 必须是 `宜家小能手 / 上海 / 4.8 / 12`（验证 B4 的 `do update` 生效）；
2. 用 `buyer@ikear.dev` 登录，`select * from listings where id='lst_seed_0003'` 能查到（未过期）；手动把 `expires_at` 改成过去时间后应当查不到（验证 A5 的策略收紧）；
3. 用 `buyer@ikear.dev` 尝试 `update conversations set seller_id = <第三方>` → 应当被触发器拒绝（验证 B2）；
4. 用 `buyer@ikear.dev` 尝试 `update messages set content='改过了' where id='msg_seed_0002'` → 应当被拒绝（既非 receiver，也触发不可变约束）（验证 B3）；
5. 新注册一个账号，确认 `profiles` 里自动出现对应行（验证 B4）；
6. 用 `buyer@ikear.dev` 登录，`select email from profiles` → 应当只看到自己那一行；`select * from public_profiles` → 能看到两个用户但**没有 email 列**（验证 B8）；
7. 用 `demo@ikear.dev` 登录，`update listings set expires_at = now() + interval '30 days' where id='lst_seed_0001'` → 应当报 `42501`；改 `title` 则正常成功（验证 B9）；
8. 用 `demo@ikear.dev` 登录，`update profiles set rating = 5.0, sold_count = 999 where id = auth.uid()` → 语句成功但值不变（静默钉回，验证 B10）；
9. `select increment_listing_views('lst_seed_0001')` → `views` 从 143 变 144（验证 B11）；
10. 用 `demo@ikear.dev` 登录，`insert into listings (..., expires_at, boosted_until, views) values (..., now() + interval '10 years', now() + interval '1 year', 9999)` → 插入成功，但 `expires_at` 被钉到 `now()+30d`、`boosted_until` 为 `null`、`views` 为 `0`（验证 B9 的 INSERT 分支）；
11. 确认 seed 里 `lst_seed_0003` 的 `boosted_until`（3 天后）与 `views`（301）**没有**被清掉 —— seed 以 `postgres` 身份执行，应当走服务端角色的放行分支。这条是上面那些触发器最容易踩的回归点。

## 六、第二轮补充（响应 platform-dev 交叉评审）

platform-dev 提出的 3 个 MAJOR 与我的第一轮结论对照：

| platform-dev 提出 | 我的处理 |
|---|---|
| `profiles_select_public` 泄露邮箱 | **我漏了，已修**（B8，升级为 BLOCKER） |
| `listings_update_own` 不限列 | **我漏了，已修**（B9） |
| `conversations` 可单方 delete 级联删消息 | 第一轮已修（B2，0002 撤销 DELETE 策略） |
| 无人把 listing 置 expired / select 只看 status | 第一轮已修（B5→A5，0002 加结算函数 + 策略加 `expires_at > now()`） |
| 视图缺 `security_invoker`、0001:288 注释写反了 | 第一轮已修（B1，0002）。但 `public_profiles` 是例外，见 B8 的纠正说明 |
| conversations/messages insert 可伪造身份、message 事后可改 content | 第一轮已修（B2/B3，0002） |
| 两个函数缺 `set search_path` | 第一轮已修（0002 第 7 节），用的是 `public, pg_temp` 而非 `''`：`pg_temp` 放在最后即可避免临时表劫持，同时不必把 `public.` 前缀写满每一处。两种写法都能消掉 linter 的 `function_search_path_mutable` |
| CI 全量 `continue-on-error`、`**` 不递归 | 认同，但不属于我的改动范围，见上文 B5 节末尾 |

**这一轮暴露出我第一轮自查的一个方法论缺口**：我把「最小权限」等同于「RLS 策略写对」，而 RLS 只能表达行级约束。`profiles.email`（谁能读这一列）和 `listings.expires_at`（谁能写这一列）都是**列级**问题，RLS 结构上就表达不了，必须靠列白名单视图、列级 GRANT 或触发器补。以后审 Supabase schema 应当固定问两遍：**这一行谁能碰**（RLS），**这一行里的每一列谁能碰**（GRANT / 视图 / 触发器）。
