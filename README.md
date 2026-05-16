# mineard

mineo パケットシェア自動化ツール。ゆずるね。宣言の自動実行とパケットギフトの期限リセットを行います。

参考: https://blog.3irun.moe/2025/11/29/mineo_api_document/

## アーキテクチャ

| レイヤー           | 技術                                          |
| ------------------ | --------------------------------------------- |
| フロントエンド     | Cloudflare Pages + React (Vite) + Mantine UI  |
| バックエンド API   | Cloudflare Workers + Hono (TypeScript)        |
| データベース       | Cloudflare D1 (SQLite)                        |
| スケジューラ       | Workers Cron Triggers                         |
| 認証               | Cloudflare Zero Trust + TOTP                  |

## 機能

### 自動ジョブ

| ジョブ                   | スケジュール (JST)         | 説明                                                                 |
| ------------------------ | -------------------------- | -------------------------------------------------------------------- |
| トークン事前リフレッシュ | 毎時 :50                   | ゆずるね。有効アカウントのトークンを事前更新                         |
| ゆずるね。自動宣言       | 13:00〜23:00 毎時          | 宣言成功後はその日スキップ。金曜成功済みなら土日もスキップ           |
| パケットギフト自動交換   | 毎月 26 日 09:00           | 繰越パケットをペア間でギフト交換し有効期限をリセット                 |
| パケット残量アラート     | 10 分ごと                  | 残量が閾値を下回ると Discord へ通知（当日 1 回まで）                 |

### 設定・管理

- **アカウント登録**: refresh_token を入力して mineo 回線一覧を取得し、登録する回線を選択
- **ゆずるね。設定**: アカウントごとに自動宣言・Discord 通知・メンションレベル（なし / 失敗時のみ / 常に）を設定
- **パケット残量アラート**: アカウントごとに閾値 (MB)・通知 ON/OFF・メンション ON/OFF を設定
- **Discord メンション**: ユーザー設定で Discord ユーザー ID を登録するとメンション付き通知が届く
- **ダッシュボード**: パケット残量・ゆずるね。状態・実行ログをリアルタイム表示、手動実行も可能
- **TOTP 認証**: Google Authenticator 等による二要素認証

## 開発環境

### 動作要件

- Node.js 26+
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

### 環境変数・シークレット

`api/.dev.vars` ファイルにローカル開発用の値を設定します。本番環境は `npx wrangler secret put` で設定します。

#### 必須シークレット

| 変数名                 | 説明                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `ENCRYPTION_KEY`       | 保存トークンの暗号化キー（32 バイト以上のランダム文字列）   |
| `AUTH_SECRET`          | JWT 署名用シークレット（十分な長さのランダム文字列）        |
| `MINEO_OIDC_CLIENT_ID` | mineo アプリの OIDC クライアント ID                         |
| `MINEO_APP_VERSION`    | mineo アプリのバージョン（アプリ更新時に合わせて変更）      |

#### 任意のシークレット

| 変数名                | 説明                                                    |
| --------------------- | ------------------------------------------------------- |
| `DISCORD_WEBHOOK_URL` | Discord Incoming Webhook URL（未設定時は通知なし）      |

#### `wrangler.toml` で管理する変数

| 変数名                | 説明                                      |
| --------------------- | ----------------------------------------- |
| `APP_ENV`             | 実行環境（`production` 等）               |
| `FRONTEND_URL`        | CORS 許可先のフロントエンド URL           |
| `MINEO_APP_ID`        | mineo アプリのバンドル ID                 |
| `MINEO_BASE_URL`      | mineo API のベース URL                    |
| `MINEO_OIDC_TOKEN_URL`| OIDC トークンエンドポイント               |

## デプロイ

### 初回セットアップ

```bash
# D1 データベース作成・スキーマ適用
npx wrangler d1 create mineard
npx wrangler d1 execute mineard --remote --file=api/src/db/schema.sql

# シークレット設定
cd api
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put AUTH_SECRET
npx wrangler secret put MINEO_OIDC_CLIENT_ID
npx wrangler secret put MINEO_APP_VERSION
npx wrangler secret put DISCORD_WEBHOOK_URL   # 任意

# Worker デプロイ
npx wrangler deploy

# フロントエンド デプロイ
cd ../web
npm run deploy
```


### GitHub Actions による自動デプロイ

`main` ブランチへの push で API・Web が自動デプロイされます（`.github/workflows/deploy.yml`）。

以下を GitHub リポジトリの **Settings > Secrets > Actions** に設定してください。

| Secret 名 | 説明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts / Pages / D1 Edit + User Details Read 権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID |

## リフレッシュトークンの取得手順

mineo リフレッシュトークンを取得する最も簡単な方法は [HTTP Toolkit](https://httptoolkit.com/) を使用することです。

1. パソコンに HTTP Toolkit をインストールします。
2. ガイドに従って CA 証明書を設定し、iOS または Android 端末上で完全に信頼させます（例: [HTTP Toolkit iOS ガイド](https://httptoolkit.com/docs/guides/ios/)）。
3. 端末で公式の mineo アプリを開き、ログインします。
4. HTTP Toolkit で傍受した通信を確認し、`https://login.eonet.jp/oidc/v1/token` へのリクエストを見つけます。
5. JSON のレスポンスボディから `refresh_token` を抽出してコピーします。

## API ドキュメント

mineo API の仕様については [docs/api-specification.md](docs/api-specification.md) を参照してください。
