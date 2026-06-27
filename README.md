# 臺北市第 11 次大露營 AI 助理

臺北市第 11 次大露營的內部 AI 工具：與 AI 對話（逐字串流）、生成圖片，每個對話 session 有獨立的上下文記憶，內容全部記錄到 PostgreSQL。介面同時支援電腦版與手機版，視覺走「營地步道」童軍風格。

## 功能

- 🔥 **多 session 對話**：建立／重新命名／刪除對話，每個 session 各自獨立記憶。
- 💬 **串流回覆**：SSE 逐字顯示，像 ChatGPT。
- 🖼️ **圖片生成**：在對話中以「生圖」模式產生圖片，存於 PostgreSQL（BYTEA）。生成後直接說「卡通版的」「換背景」即可接續編修（image-to-image）。
- 📎 **加入素材**：輸入框按「＋」上傳圖片，可請 AI 看圖回答（vision），或把圖改造成新風格／新圖（image-to-image，走 gateway 的 `/images/edits`）。每檔上限 8MB、最多 4 張。
- 🔐 **簡易登入**：單一管理者 `admin`，密碼隨機產生、bcrypt 雜湊儲存、明文僅於 seed 時顯示一次。
- 🌗 淺／深色主題、桌機／手機 RWD。

## 技術棧

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · Drizzle ORM + postgres.js · jose（JWT cookie）· bcryptjs · TanStack Query。套件管理用 **pnpm**，Lint/Format 用 **Biome**。

## 快速開始

```bash
pnpm install

cp .env.example .env          # 填入 AI_API_KEY、DATABASE_URL、SESSION_SECRET
openssl rand -base64 48       # 產生 SESSION_SECRET 貼到 .env

pnpm db:generate              # 由 schema 產生 SQL（schema 有變動時才需要）
pnpm db:migrate               # 套用到資料庫
pnpm db:seed                  # 建立 admin，終端機會印出密碼「一次」，請立即保存

pnpm dev                      # http://localhost:3000 → 會導向 /login
```

### 登入帳號

- 帳號：`admin`
- 密碼：執行 `pnpm db:seed` 時印出的隨機密碼（**只顯示一次**）。
- 遺失密碼：`pnpm db:seed -- --reset` 會重新產生並重印（密碼是雜湊儲存、不可回復）。

## 環境變數

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串（含 `?sslmode=disable`，見下方安全說明）。 |
| `AI_API_BASE_URL` | AI 閘道 base URL（不含 `/chat/completions` 後綴）。 |
| `AI_API_KEY` | AI 服務金鑰，**僅在 server 端使用，絕不可加 `NEXT_PUBLIC_` 前綴**。 |
| `AI_TEXT_MODEL` / `AI_IMAGE_MODEL` | 文字／圖片模型名稱。 |
| `SESSION_SECRET` | JWT 簽章密鑰，至少 32 字元（`openssl rand -base64 48`）。 |

啟動時會以 zod 驗證環境變數，缺值或不合法會直接啟動失敗並印出原因。

## ⚠ 安全注意：資料庫明文連線

目前的遠端 PostgreSQL **未啟用 TLS**（實測 `SHOW ssl = off`），經公網連線時帳密與對話／圖片內容會以**明文**傳輸。本專案以 `sslmode=disable` / `ssl:false` 連線以符合現況。

**強化路徑**：請 DB 管理者於伺服器啟用 TLS，之後將 `DATABASE_URL` 改為 `?sslmode=require`，並把 `db/index.ts` 的 `ssl: false` 改為 `ssl: "require"`。

其他安全設計：API 金鑰僅存在於 server（`server-only` 保護、無 `NEXT_PUBLIC_`）；session 為 httpOnly + SameSite=Lax cookie；所有變更端點做 same-origin 檢查；登入有全域限流（5 次／15 分鐘）。

## Docker 部署

資料庫為遠端，compose 只跑 app：

```bash
# 先在本機對遠端 DB 跑一次 migration 與 seed
pnpm db:migrate && pnpm db:seed

docker compose up --build      # 以 .env 注入機密；健康檢查打 /api/health
```

## 部署到 Zeabur

專案根目錄有 `Dockerfile`，Zeabur 會自動以它建置（standalone、pnpm、`node server.js`，監聽 `$PORT`）。

1. 將 repo 推到 GitHub，在 Zeabur 建立服務並選擇此 repo。
2. 在 Zeabur 服務的 **Variables** 設定環境變數：`DATABASE_URL`、`AI_API_BASE_URL`、`AI_API_KEY`、`AI_TEXT_MODEL`、`AI_IMAGE_MODEL`、`SESSION_SECRET`。（`NODE_ENV=production` 由 Dockerfile 設定；Zeabur 提供 HTTPS，因此 Secure cookie 會正常運作。）
3. **資料庫已在本機 migrate + seed 過**（與部署共用同一個遠端 DB），因此部署時**不需**再跑 migration。若改用全新資料庫，請先在本機對它執行 `pnpm db:migrate && pnpm db:seed`。
4. 部署後開啟 Zeabur 提供的網址即可登入。

> build 階段不需要環境變數：env 驗證與 DB 連線都是惰性的（第一個請求才觸發），所以 Zeabur 在沒有 runtime secret 的 build 階段也能成功建置。
>
> 若想改用 Zeabur 的 Next.js buildpack（不走 Docker），移除 `Dockerfile` 即可，Zeabur 會依 `pnpm-lock.yaml` 與 `engines.node` 自行建置。

## 常用指令

| 指令 | 作用 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 開發 / 建置 / 正式啟動 |
| `pnpm lint` / `pnpm lint:fix` / `pnpm format` | Biome 檢查 / 自動修 / 格式化 |
| `pnpm typecheck` | TypeScript 型別檢查 |
| `pnpm db:generate` / `db:migrate` / `db:studio` / `db:seed` | Drizzle 遷移與管理 |
