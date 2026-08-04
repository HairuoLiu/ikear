# Cloudflare Pages 部署（Vercel 备选方案）

如果用户选择用 **Cloudflare Pages** 而不是 Vercel 来托管 IKEAR 的 Web 构建产物，
按以下步骤操作即可。它与 Vercel 方案共用同一份 `dist` 静态产物。

## 1. 连接仓库

在 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git**，选择本仓库（私有仓库同样支持，生成的站点为公开 URL，
Cloudflare Pages 免费额度即包含此能力）。

## 2. 构建设置

- **Build command:** `npx expo export --platform web`
- **Build output directory:** `dist`

（与 `vercel.json` 中的 `buildCommand` / `outputDirectory` 保持一致。）

## 3. 配置环境变量

在 Pages 项目的 **Settings → Environment variables** 中添加以下两个变量
（与 Vercel 方案相同，构建时由 Expo 内联进前端 bundle）：

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

> 说明：这两个变量是公开可读的（anon key 本就设计给浏览器使用），
> 真实安全边界是 Supabase 的 Row Level Security (RLS)，请勿在此暴露
> `service_role` 密钥。

## 4. 通过 GitHub Actions 部署（可选）

仓库内 `.github/workflows/deploy-web.yml` 已包含一段**注释掉的**
Cloudflare Pages 部署块（使用 `cloudflare/pages-action`）。
将 Vercel 步骤替换为该块，并配置以下 Secrets 即可切换：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`directory` 固定为 `dist`，`projectName` 为 `ikear-web`。

## 5. SPA 回退

Cloudflare Pages 对 `dist` 中的 `index.html` 默认提供 SPA 回退，
无需额外配置（等价于 `vercel.json` 中的 `rewrites` 规则）。
