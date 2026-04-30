# mineard

mineo パケットシェア自動化ツール。ゆずるね。宣言の自動実行とパケットギフトの期限リセットを行います。

参考: https://blog.3irun.moe/2025/11/29/mineo_api_document/

## アーキテクチャ

| レイヤー | 技術 |
|-------|-----------|
| フロントエンド | Cloudflare Pages + React (Vite) + Mantine UI |
| バックエンド API | Cloudflare Workers + Hono (TypeScript) |
| データベース | Cloudflare D1 (SQLite) |
| スケジューラ | Workers Cron Triggers |
| 認証 | Cloudflare Zero Trust + TOTP |

## 機能

- **ゆずるね。自動宣言**: 毎日13:00 JST に自動実行（失敗時は23:00まで毎時リトライ）
- **パケットギフト自動交換**: 毎月26日に繰越パケットをペア間でギフト交換し有効期限をリセット
- **ダッシュボード**: パケット残量、ゆずるね。状態、実行ログをリアルタイム表示
- **TOTP認証**: Google Authenticator 等による簡易認証

## 開発環境

### 動作要件

- Node.js 20+
- Wrangler CLI (`npm install -g wrangler`)

### セットアップ

```bash
# Worker (API)
cd api
npm install
npx wrangler d1 execute mineard --local --file=src/db/schema.sql
npx wrangler dev

# フロントエンド
cd web
npm install
npm run dev
```

### 環境変数設定

API ディレクトリに `.dev.vars` ファイルを作成し、シークレット等のローカル開発用環境変数を設定します。本番環境（デプロイ時）は `npx wrangler secret put` で設定します。

**必要なシークレット (`.dev.vars` または設定必須)**
- `ENCRYPTION_KEY`: 保存するトークンの暗号化キー (32バイト以上のランダムな文字列推奨)
- `AUTH_SECRET`: JWT署名用シークレット (十分な長さのランダムな文字列推奨)

**任意のシークレット**
- `DISCORD_WEBHOOK_URL`: Discord通知用 Incoming Webhook URL（設定するとCronジョブの実行結果をDiscordに通知）

**その他の環境変数 (`wrangler.toml` 経由)**
- `FRONTEND_URL`: CORSのためのフロントエンドURL（例: `https://mineard-web.pages.dev`）
- `MINEO_APP_ID`: MineoアプリのID（例: `jp.mineo.app`）
- `MINEO_APP_VERSION`: Mineoアプリのバージョン（例: `8.0.0`）
- `MINEO_BASE_URL`: APIのベースURL（例: `https://api.eonet.jp/mineo/v1`）
- `MINEO_OIDC_TOKEN_URL`: トークンエンドポイント（例: `https://login.eonet.jp/oidc/v1/token`）
- `MINEO_OIDC_CLIENT_ID`: クライアントID（例: `100064798`）

### デプロイ

```bash
# D1 データベース
npx wrangler d1 create mineard
npx wrangler d1 execute mineard --file=api/src/db/schema.sql

# シークレットの環境変数設定
cd api
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put AUTH_SECRET
npx wrangler secret put DISCORD_WEBHOOK_URL  # 任意

# Worker のデプロイ
cd api
npx wrangler deploy

# フロントエンドのデプロイ
cd web
npm run build
npx wrangler pages deploy dist --project-name=mineard-web
```

## リフレッシュトークンの取得手順

mineo リフレッシュトークンを取得する最も簡単な方法は [HTTP Toolkit](https://httptoolkit.com/) を使用することです。

1. パソコンに HTTP Toolkit をインストールします。
2. ガイドに従って CA証明書を設定し、iOS または Android 端末上で完全に信頼させます (例: [HTTP Toolkit iOS ガイド](https://httptoolkit.com/docs/guides/ios/))。
3. 端末で公式の mineo アプリを開き、ログインします。
4. HTTP Toolkit で傍受した通信を確認し、`https://login.eonet.jp/oidc/v1/token` へのリクエストを見つけます。
5. JSONのレスポンスボディから `refresh_token` を抽出してコピーします。

## API ドキュメント

mineo API の仕様については [docs/api-specification.md](docs/api-specification.md) を参照してください。
