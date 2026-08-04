# IKEAR · 二手家具 C2C 集市

IKEAR 一套 **React Native + Expo** 代码库，**同时产出三个运行形态**：

| 形态 | 产物 | 仓库 | 部署目标 |
|------|------|------|----------|
| **手机 App** | iOS / Android 原生应用 | **`ikear`**（本仓库，公开） | App Store / Google Play（经 EAS Build） |
| **Web 应用** | 浏览器 SPA（同一套代码编译） | **`ikear`**（本仓库，公开） | Vercel / Cloudflare Pages |
| **后端** | Supabase（数据库 + 鉴权 + 存储 + 边缘函数） | **`ikear-backend`**（私有） | Supabase 托管（无需自建服务器） |

> 为什么手机和 Web 是**同一个仓库、同一个代码库**？
> 因为二者共用 ~90% 的代码：领域模型、业务逻辑（`src/lib`、`src/data`）、状态管理、设计系统、PM 定义的品类 taxonomy。
> 把它们拆成两个独立仓库只会复制这 90% 的代码、制造版本分叉。Expo 的设计就是「一码多端」——
> 一份 JS/TS，用 `expo start --ios` 跑手机、用 `expo start --web` 跑网页。
> **真正因平台而异的只有 3 处**，已用平台扩展名 / `Platform.OS` 干净隔离（见下文「手机 vs Web 的差异」）。

---

## 仓库关系图

```
┌─────────────────────────────────────────────────────────────┐
│  ikear  (PUBLIC · 前端单体仓库)                               │
│   React Native + Expo —— 编译出 iOS / Android / Web          │
│                                                               │
│   src/lib · src/data · src/store · src/theme  ← 平台无关      │
│   src/screens · src/components                  ← 两端共用    │
│   平台差异点：biometrics(.native).ts / webFrame / image-picker│
└───────────────┬───────────────────────────────┬─────────────┘
                │ 读/写                           │ 读/写
                ▼                                ▼
      ┌─────────────────────────┐     ┌─────────────────────────┐
      │  ikear-backend (PRIVATE) │     │   Supabase 项目          │
      │  supabase/migrations     │────▶│  Postgres + Auth + RLS   │
      │  supabase/functions      │     │  Storage + Realtime      │
      │  → 推送到 Supabase CLI   │     │  URL: izoxfohuvnrfvatsrpnz│
      └─────────────────────────┘     └─────────────────────────┘
```

- 前端通过 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 连接后端（构建期内联）。
- 后端仓库只存 **schema / RLS / 边缘函数**，不含前端代码。
- **安全边界 = 数据库 RLS 策略**。anon key 对客户端公开是预期行为，service_role key 绝不下发到客户端。

---

## 一、本地运行（三种形态）

### 前置
Node 18+、`npm`、`Expo CLI`（`npm i -g expo-cli`）。

### 手机（iOS / Android）
```bash
cd ikear
npm install
npx expo start          # 终端出现二维码，用 Expo Go / dev build 扫码
```
> 演示模式：登录页**任意邮箱 + 密码**即可进入（内置 mock 数据，无需联网 / 无需 Supabase）。

### Web（浏览器）
```bash
cd ikear
npm install
npx expo start --web    # 自动打开 http://localhost:19006
# 或产出静态产物：npx expo export --platform web  →  dist/
```
桌面浏览器下，Web 版会自动收进居中、最大宽度 480 的「手机列」布局（见 `src/App.tsx` 的 `frame()`）。

### 真机体验要点
登录注册、首页信息流、按宜家品类/地点筛选、商品详情、发布（调用相机/相册）、收藏、私信、个人中心、**Face ID 生物识别锁**（仅原生端；Web 端降级为邮箱密码 / WebAuthn）。

---

## 二、手机 vs Web 的差异（重点区分）

| 维度 | 手机 (iOS / Android) | Web (浏览器) |
|------|----------------------|--------------|
| 入口命令 | `expo start --ios/--android` | `expo start --web` |
| 导航形态 | 底部 Tab Bar（原生质感） | 同一套，桌面端居中「手机列」 |
| 生物识别 | Face ID / 指纹（`biometrics.native.ts`） | 不支持，降级为邮箱密码（`biometrics.ts`） |
| 相机/相册 | `expo-image-picker`（原生） | 同样支持（Web 走文件选择器） |
| 部署 | EAS Build → App Store / Play | Vercel / Cloudflare 静态托管 |
| 离线 | AsyncStorage 持久化 + mock 兜底 | 同左 |

**隔离方式（不复制代码）：**
- `src/lib/biometrics.ts`（Web 安全版）与 `src/lib/biometrics.native.ts`（原生版）——Metro 按平台自动解析。
- `src/App.tsx` 的 `frame()` 用 `Platform.OS === 'web'` 判断，仅桌面 Web 加居中容器。
- 图片选择、Supabase 客户端等其余逻辑两端完全一致。

---

## 三、连接真实后端（Supabase）

默认走内置 `mockDataSource`，零配置可跑。要切到 Supabase：

1. 在 `ikear-backend` 仓库按 README 推送 migrations（`supabase db push`），生成数据库表 + RLS。
2. 复制 `.env.example` 为 `.env.local`，填入：
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://izoxfohuvnrfvatsrpnz.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<你的 anon key>
   ```
3. 安装依赖：`npm install`（已加入 `@supabase/supabase-js`）。
4. 重启 `expo start` —— `src/data/dataSource.ts` 检测到环境变量后自动切换到 `supabaseDataSource`，**调用方零改动**。

> 契约已经对齐：前端 `DataSource` 接口与 `ikear-backend` 的表结构一一对应，camelCase↔snake_case 由 `src/data/supabaseDataSource.ts` 的映射层负责。

---

## 四、部署（前端 → 公开 URL，源码可私有）

- **Web（Vercel，推荐）**：`.github/workflows/deploy-web.yml` 在 push 到 `main` 时自动
  `expo export --platform web` 并部署；从 GitHub Secrets 注入两个 `EXPO_PUBLIC_` 变量。
  Cloudflare Pages 备选见 `CLOUDFLARE_DEPLOY.md`。
- **手机**：`eas build --platform ios/android` 出原生包，再提交商店。
- **后端**：`ikear-backend` 仓库的 Supabase CLI 推送；edge function `supabase functions deploy refresh-listing`。

---

## 五、项目结构

```
ikear/
├─ app.config.js           # 构建期内联 EXPO_PUBLIC_ 环境变量
├─ app.json                # Expo 配置（bundleId、权限、splash）
├─ vercel.json             # Web 静态部署（SPA 回退）
├─ .env.example            # Supabase 环境变量模板（复制为 .env.local）
├─ .github/workflows/
│  ├─ ci.yml               # typecheck + 单元测试（门禁）
│  └─ deploy-web.yml       # Web 自动部署到 Vercel / Cloudflare
├─ CLOUDFLARE_DEPLOY.md    # Cloudflare Pages 备选说明
└─ src/
   ├─ App.tsx              # 根导航 + 生物识别锁 + Web 响应式 frame()
   ├─ theme/tokens.ts       # 设计令牌（IKEA 蓝 #0058A3 等）
   ├─ data/
   │  ├─ types.ts          # 领域模型（canonical 契约，与后端对齐）
   │  ├─ dataSource.ts     # 数据源切换：env 决定 mock / supabase
   │  ├─ supabaseDataSource.ts  # Supabase 实现（snake_case 映射）
   │  └─ mockData.ts       # 离线 mock（默认）
   ├─ lib/
   │  ├─ supabase.ts       # 懒加载 Supabase 客户端
   │  ├─ biometrics.ts     # Web 安全版（无 Face ID）
   │  └─ biometrics.native.ts  # 原生版（Face ID / 指纹）
   ├─ store/useStore.ts     # Zustand 全局状态
   ├─ components/ · screens/  # UI 与页面（两端共用）
```

---

## 六、质量门禁

| 门禁 | 命令 | 状态 |
|------|------|------|
| 类型检查 | `npm run typecheck`（`tsc --noEmit`） | 须 0 错误 |
| 单元 + 集成测试 | `npm test` | 225 用例 |
| 独立 E2E 验收 | `node --experimental-strip-types --experimental-loader ./test/loader.mjs e2e/independent-e2e.ts` | 10/10 旅程 |

详见 `E2E_SIGN_OFF.md`、`ENGINEERING_PLAN.md`、`PRODUCT_SPEC.md`。

---

## 七、相关仓库

- **前端（本仓库）**：`https://github.com/HairuoLiu/ikear`（公开）
- **后端（私有）**：`https://github.com/HairuoLiu/ikear-backend`（私有 · Supabase migrations / RLS / 边缘函数）
- Supabase 项目：`https://izoxfohuvnrfvatsrpnz.supabase.co`
