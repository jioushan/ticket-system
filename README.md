# English Version

# my-kumo-app (React + TypeScript + Vite)

[English] | [繁體中文](./README_zh-TW.md) | [日本語](./README_ja.md)

[![Latest release](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/jioushan/ticket-system)
[![License: MIT](https://img.shields.io/badge/repo-TypeScript-blue?logo=TypeScript)](https://opensource.org/licenses/MIT)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)

An AI-driven development project utilizing **Cloudflare Kumo**. This is a true "Backend-less" architecture that implements ticket management, user registration, and email notifications.

### 🚀 Key Features
*   **AI Development**: Built with Cloudflare Kumo for rapid iteration.
*   **Ticket System**: Basic ticket management workflow.
*   **User Auth**: Full registration flow with **Cloudflare Turnstile** support.
*   **Serverless Infrastructure**: Powered by Cloudflare D1 (Database) and R2 (Storage).
*   **Email Services**: Automated notification system.

### 🛠 Deployment
*   **Backend Config**: Please refer to the `/workers_backup` directory for Cloudflare Workers configuration.
*   **Docker/Podman**: See the `/deploy` directory for `docker-compose` files.
*   **Full Guide**: Detailed instructions can be found in [DEPLOYMENT.md](./DEPLOYMENT.md).
