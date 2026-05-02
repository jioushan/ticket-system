# 繁體中文版本

# my-kumo-app (React + TypeScript + Vite)

[English](./README.md) | [繁體中文] | [日本語](./README_ja.md)

[![最新版本](https://img.shields.io/github/v/release/your-username/my-kumo-app?label=發佈&logo=github)](https://github.com/your-username/my-kumo-app/releases/latest)
[![許可證: MIT](https://img.shields.io/badge/許可證-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)

本項目是一個基於 **React + TypeScript + Vite** 的現代化 Web 應用，通過 **Cloudflare Kumo** 前端進行 AI 輔助開發。

這是一個真正意義上的「無後端開發」實踐，後端完全對接 Cloudflare 生態系統。

### 🚀 核心功能
*   **AI 輔助開發**: 深度集成 Cloudflare Kumo 前端工具。
*   **工單管理**: 實現最基礎的工單提交與處理流程。
*   **用戶系統**: 支持用戶註冊、登入及 **Cloudflare Turnstile** 人機驗證支援。
*   **郵件通知**: 自動化的系統郵件通知機制。
*   **雲端儲存**: 對接 **Cloudflare D1** 資料庫與 **R2** 對象存儲。

### 🛠 如何部署
*   **後端配置**: 請參考倉庫下的 `/workers_backup` 資料夾進行配置。
*   **容器化啟動**: 若希望透過 `Docker` 或 `Podman-compose` 啟動，請參考 `/deploy` 下的內容。
*   **詳細指南**: 請閱讀 [DEPLOYMENT.md](./DEPLOYMENT.md)。

