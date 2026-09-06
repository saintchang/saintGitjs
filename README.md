# saintGit - 極簡 Git Web GUI 工具

一個專注於提供極簡、高效操作閉環的本地 Git 視覺化工具。

---

## 📌 現況說明與架構演進

本專案原初期規劃採用 **Tauri v2 + Rust** 的桌面應用方案，後續經架構評估與調整，**全面改採 Node.js 本地 Web 服務替代原有的 Tauri + Rust 架構**：

- **技術棧統一**：前後端統一採用 TypeScript / JavaScript 生態系（Vue 3 + Node.js），大幅降低開發與跨平台建置門檻，無須額外安裝 Rust 工具鏈與本地編譯器。
- **純原生指令調用**：後端直接採用 Node.js 內建的 `child_process.execFile` 調用系統原生的 `git` CLI，並嚴格遵循參數陣列傳遞以防範命令注入；**不依賴任何第三方 Git 套件**（如 `simple-git` 或 `nodegit`），保持極致輕量與透明。
- **Web 瀏覽器直接操作**：透過本地 HTTP API（Express）與 Vite 前端代理，即可在現代瀏覽器中流暢操作本地任意 Git 專案。

---

## 🚀 核心功能與 MVP 閉環

本階段為最小可行性產品（MVP），以最短且穩定的操作閉環為核心目標：

1. **Repo 本地路徑載入**：直接輸入本機 Git 專案路徑，支援路徑自動記憶（localStorage）。
2. **異動清單讀取 (`git status --porcelain -u`)**：
   - 即時讀取工作區與暫存區狀態。
   - 提供直觀的彩色標籤區分：`已暫存 (Staged)`、`未暫存 (Modified)`、`未追蹤 (Untracked)`。
   - 頂部即時統計已暫存與未暫存檔案數量。
3. **檔案差異檢視 (Diff Viewer)**：
   - 點擊清單中的任意檔案即可即時展開 Unified Diff 檢視面板。
   - 輕量 GitHub 風格渲染：新增行綠色高亮（`+`）、刪除行紅色高亮（`-`）、區塊標頭淡藍色。
   - 支援未追蹤檔案（全量綠色呈現）與雙重異動（如 `MM`）切換檢視已暫存/未暫存差異。
4. **單鍵全部暫存 (`git add .`)**：一鍵將所有異動加入暫存區，並自動更新狀態、同步刷新 Diff 與操作回饋。
5. **提交變更 (`git commit -m`)**：
   - 支援快速鍵（`Ctrl + Enter`）直接送出。
   - **防呆安全機制**：當暫存區無檔案時自動禁用 Commit 按鈕並顯示引導提示，避免觸發 Git CLI 的 `no changes added to commit` 錯誤。
6. **自動刷新與驗證**：提交成功後自動刷新清單並呈現 **Working Tree Clean** 狀態。

---

## 🛠️ 技術棧

| 領域 | 技術選型 | 說明 |
| :--- | :--- | :--- |
| **前端 (Client)** | Vue 3 + TypeScript + Vite | Composition API (`<script setup lang="ts">`)，簡潔無多餘依賴 |
| **後端 (Server)** | Node.js + Express | 本地 HTTP 服務（Port: 3001），提供 REST API 端點 |
| **底層執行層** | Node.js `child_process.execFile` | 原生調用本機 `git` CLI，以參數陣列防範命令注入 |
| **通訊協定** | RESTful HTTP (JSON) | 前端 Vite 代理 `/api` 至後端服務 |

---

## 💻 快速開始

### 1. 前置需求
- 已安裝 **Node.js** (建議 v18 以上)
- 系統環境變數中已具備原生 **Git** CLI (`git --version`)

### 2. 安裝相依套件
在專案根目錄執行：
```powershell
npm install
```

### 3. 啟動開發伺服器
一鍵同時啟動後端 Express API 與前端 Vite：
```powershell
npm run dev
```

### 4. 開啟應用
啟動完成後，開啟瀏覽器前往：
👉 **`http://localhost:5173`**

輸入本機任意 Git 倉庫的路徑（例如：`C:\my\project`），即可開始操作。

---

## 📁 專案架構與文件導覽

```text
saintGit2/
├── README.md              # 專案介紹與現況說明（本文件）
├── SPEC.md                # 產品需求與介面規格書
├── Agents.md              # AI Agent 與協同開發規範指南
├── package.json           # 根目錄 Monorepo Workspaces 配置
├── server/                # Node.js 本地後端服務
│   ├── src/
│   │   ├── gitService.ts  # 原生 child_process 封裝與 Git 命令執行
│   │   └── index.ts       # Express API 端點路由
│   └── package.json
└── client/                # Vue 3 前端專案 (Vite)
    ├── src/
    │   ├── api/git.ts     # 前端 HTTP API 用戶端封裝
    │   ├── App.vue        # 核心 GUI 介面與防呆邏輯
    │   └── main.ts
    └── package.json
```

---

## 📄 相關規格文件

- 完整產品與 API 規範：請參閱 [SPEC.md](file:///C:/my/saintGit2/SPEC.md)
- AI Agent 開發指引與驗收標準：請參閱 [Agents.md](file:///C:/my/saintGit2/Agents.md)
