claude/kumo/my-kumo-app via  
❯ cat DEPLOYMENT.md 
# 部署指南

## 前置準備

- Node.js 18+ & pnpm
- Cloudflare 帳號
- GitHub 帳號

---

## 一、GitHub 倉庫設置

### 1. 初始化 Git（如尚未初始化）

```bash
cd my-kumo-app
git init
git add .
git commit -m "Initial commit"
```

### 2. 建立 GitHub 倉庫

到 GitHub 建立新倉庫（例如 `ticket-system`），然後：

```bash
git remote add origin https://github.com/你的用戶名/ticket-system.git
git branch -M main
git push -u origin main
```

### 3. 後續更新

每次修改後：

```bash
git rm -r --cached workers
git add .
git commit -m "描述你的改動"
git push
```

---

## 二、Cloudflare Workers 後端部署

### 1. 安裝 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登入 Cloudflare

```bash
wrangler login
```

### 3. 建立 D1 數據庫

```bash
cd workers
wrangler d1 create ticket-system
```

執行後會顯示類似：

```
[[d1_databases]]
binding = "DB"
database_name = "ticket-system"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

將 `database_id` 更新到 `workers/wrangler.toml` 中。

### 4. 初始化數據庫結構

```bash
wrangler d1 execute ticket-system --file=./schema.sql
```

### 5. 建立 R2 存儲桶（附件用）

```bash
wrangler r2 bucket create ticket-attachments
```

### 6. 設置敏感環境變量（Secrets）

```bash
# SendGrid API Key（用於發送郵件通知）
wrangler secret put SENDGRID_API_KEY

# JWT 簽發密鑰（用於 session token）
wrangler secret put JWT_SECRET

# Turnstile 秘密密鑰（可選，用於人機驗證）
wrangler secret put TURNSTILE_SECRET_KEY
```

每個命令會提示你輸入對應的值。

### 7. 部署 Worker

```bash
wrangler deploy
```

記下這個 URL，前端需要使用。

### 8. 設置 CORS（如需要）

如果前端和後端不同域名，需要在 Worker 代碼中配置 CORS headers。

---

## 三、Cloudflare Pages 前端部署

### 方式一：通過 Git 自動部署（推薦）

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 進入 **Workers & Pages** > **Create** > **Pages** > **Connect to Git**
3. 選擇你的 GitHub 倉庫
4. 設置構建配置：
   - **Framework preset**: Vite
   - **Build command**: `pnpm build`
   - **Build output directory**: `dist`
   - **Node.js version**: 在環境變量中設置 `NODE_VERSION=18`
5. 添加環境變量：
   - `VITE_API_BASE` = 你的 Worker URL（例如 `https://ticket-system-api.jsmsr.com`）
6. 點擊 **Save and Deploy**

每次 push 到 main 分支會自動觸發部署。

### 方式二：手動部署

```bash
# 構建
VITE_API_BASE=https://ticket-system-api.jsmsr.com pnpm build

# 部署到 Cloudflare Pages
npx wrangler pages deploy dist --project-name=ticket-system
```

---

## 四、環境變量說明

| 變量 | 設置位置 | 說明 |
|------|----------|------|
| `SENDGRID_API_KEY` | Worker Secret | SendGrid 郵件 API Key |
| `SENDGRID_SENDER` | wrangler.toml | 發件人地址 |
| `JWT_SECRET` | Worker Secret | Session Token 簽發密鑰 |
| `TURNSTILE_SECRET_KEY` | Worker Secret | Turnstile 驗證密鑰（可選） |
| `VITE_API_BASE` | Pages 環境變量 | 前端連接的 API 地址 |

---

## 五、更新部署流程

```bash
# 1. 修改代碼
# 2. 推送到 GitHub
git add .
git commit -m "你的改動描述"
git push

# Cloudflare Pages 會自動檢測並重新部署前端

# 3. 如果修改了 Worker 代碼
cd workers
wrangler deploy
cd ..
```

---

## 六、本地開發

```bash
# 前端
pnpm dev
# 訪問 http://localhost:5173

# 後端（另開終端）
cd workers
npx wrangler dev
# API 運行在 http://localhost:8787
```

本地開發時，創建 `.env` 文件：

```
VITE_API_BASE=http://localhost:8787
```

---

## 七、注意事項

- 確保 `workers/wrangler.toml` 中的 `database_id` 正確
- 敏感信息（API Key、JWT Secret）務必通過 `wrangler secret` 設置，不要寫在代碼裡
- 首次部署後，默認管理員帳號為 `admin` / `admin`，請及時修改密碼
- `pnpm build` 時會自動從 Git 獲取 commit hash 作為版本號

claude/kumo/my-kumo-app via  
❯ 

