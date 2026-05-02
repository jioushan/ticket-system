# 日本語バージョン

# ticket-system (React + TypeScript + Vite)

[English](./README.md) | [繁體中文](./README_zh-TW.md) | [日本語]

[![Latest release](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/jioushan/ticket-system)
[![ライセンス: MIT](https://img.shields.io/badge/ライセンス-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)

**Cloudflare Kumo** を活用した、AI 駆動型の React + TypeScript プロジェクトです。

Cloudflare の D1 と R2 をフル活用することで、真の意味での「バックエンドレス開発」を実現しています。

### 🚀 主な機能
*   **AI 開発**: Cloudflare Kumo フロントエンドによる AI 支援開発。
*   **チケット管理**: 基本的なワークフロー管理。
*   **ユーザー認証**: 登録機能と **Cloudflare Turnstile** による認証サポート。
*   **自動通知**: メールによる通知システム。
*   **クラウドストレージ**: Cloudflare D1（DB）と R2（ストレージ）への接続。

### 🛠 デプロイ方法
*   **バックエンド設定**: `/workers_backup` ディレクトリ内の設定ファイルを参考にしてください。
*   **Docker/Podman**: `docker-compose` を使用する場合は `/deploy` ディレクトリを確認してください。
*   **詳細手順**: [DEPLOYMENT.md](./DEPLOYMENT.md) を参照してください。
