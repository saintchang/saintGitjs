# Agents.md - AI Agent 開發指南

本文件為 AI Agent（以及協同開發者）提供在 `saintGit2` 專案中的開發規範、架構指引與驗證標準。所有修改與擴充均需嚴格對齊 [SPEC.md](file:///C:/my/saintGit2/SPEC.md)。

---

## 1. 專案定位與核心原則

- **目標**：極簡 Git Web GUI 工具（MVP 階段）。
- **核心驗證閉環**：
  `Vue UI` → `HTTP API (REST)` → `Node.js (child_process)` → `Git CLI` → `本地 Repo`
- **原則（Karpathy Guidelines）**：
  1. **Simplicity First（簡單至上）**：使用最少、最直接的程式碼解決問題。嚴禁引入非必要抽象層或投機性功能。
  2. **Strict MVP Boundaries（邊界控制）**：嚴格遵守 [SPEC.md](file:///C:/my/saintGit2/SPEC.md) 的範圍與取捨，不自行擴展（例如：不做單檔 stage、不做 diff 檢視、不做原生檔案選擇器）。
  3. **Surgical Changes（精準修改）**：只修改必要邏輯，保持乾淨。
  4. **Goal-Driven（目標導向）**：以能否順利跑通 4 步驟驗收標準作為唯一成功依據。

---

## 2. 技術棧規範

| 領域 | 技術選型 | 規範與限制 |
| :--- | :--- | :--- |
| **前端 (Client)** | Vue 3 + TypeScript + Vite | 使用 `<script setup lang="ts">` + Composition API，保持無狀態或輕量響應式狀態。 |
| **後端 (Server)** | Node.js 本地 HTTP 服務 | 推薦使用輕量 Web 框架（如 Express 或 Fastify），監聽本地 port（例如 `3001`）。 |
| **執行層** | Node.js `child_process` | **嚴格禁止使用第三方 Git 套件**（如 simple-git、nodegit）。一律使用原生 `execFile` 或 `spawn` 調用系統 `git` CLI。 |
| **安全要求** | 參數陣列傳遞 | 執行 Git 命令時一律傳遞參數陣列（例如 `['status', '--porcelain', '-u']`），禁止使用字串拼接以防止命令注入。 |

---

## 3. 專案建議目錄結構

```text
saintGit2/
├── SPEC.md                # 產品需求與介面規格書
├── Agents.md              # AI Agent 開發指引（本文件）
├── package.json           # 專案根目錄或 Monorepo 配置
├── server/                # Node.js 本地後端服務
│   ├── src/
│   │   ├── gitService.ts  # 封裝 child_process 執行 git 指令
│   │   └── index.ts       # HTTP API 路由 (Express / Fastify)
│   └── package.json
└── client/                # Vue 3 前端專案 (Vite)
    ├── src/
    │   ├── api/git.ts     # HTTP API client (fetch / axios)
    │   ├── App.vue        # 主介面
    │   └── main.ts
    └── package.json
```

---

## 4. API 與資料結構規範

後端提供 4 個核心 POST 端點，皆以 JSON 通訊。

### 資料結構 (TypeScript)
```typescript
interface GitFileStatus {
  statusCode: string; // 前 2 字元狀態代碼，如 "M ", "??", " D"
  path: string;       // 檔案相對路徑
}
```

### 端點契約
1. `POST /api/git/status`
   - Request Body: `{ "repoPath": string }`
   - Response: `GitFileStatus[]`
   - 指令：`git status --porcelain -u`（工作目錄設為 `repoPath`）
   - 解析：解析 stdout 每行，取 `line.slice(0, 2)` 為 `statusCode`，`line.slice(3).trim()` 為 `path`。
2. `POST /api/git/stage-all`
   - Request Body: `{ "repoPath": string }`
   - Response: `{ "success": true }`
   - 指令：`git add .`
3. `POST /api/git/commit`
   - Request Body: `{ "repoPath": string, "message": string }`
   - Response: `{ "success": true, "output": string }`
   - 指令：`git commit -m <message>`
4. `POST /api/git/diff`
   - Request Body: `{ "repoPath": string, "filePath": string, "staged"?: boolean, "isUntracked"?: boolean, "commitHash"?: string }`
   - Response: `{ "diff": string, "filePath": string, "staged": boolean, "isUntracked": boolean, "commitHash"?: string }`
   - 指令：
     - 指定 `commitHash`: `git show <commitHash> -- <filePath>`
     - `staged = true`: `git diff --cached -- <filePath>`
     - `isUntracked = true`: `git diff --no-index -- /dev/null <filePath>`
     - 一般未暫存: `git diff -- <filePath>`
5. `POST /api/git/all-files`
   - Request Body: `{ "repoPath": string }`
   - Response: `string[]`
   - 指令：`git ls-files`
6. `POST /api/git/file-commits`
   - Request Body: `{ "repoPath": string, "filePath": string, "limit"?: number }`
   - Response: `FileCommitInfo[]`
   - 指令：`git log -n <limit> --pretty=format:%h|%s|%cr|%an -- <filePath>`

### 錯誤邊界處理
- 當子行程 exit code 非 0 或拋出異常（例如無效路徑、非 Git 倉庫）：
  - 後端以 HTTP 400 或 500 回傳 `{ "error": stderr }`。
  - 前端捕捉錯誤並透過 UI（Toast / Alert）友善顯示錯誤訊息。

---

## 5. 前端 UI 行為規範

MVP 介面需維持極簡，包含以下元件與狀態流：
1. **Repo 路徑輸入框**：手動輸入本地 Repo 絕對路徑（提供預設或記錄於 localStorage）。
2. **Refresh 按鈕**：呼叫 `POST /api/git/status` 與 `POST /api/git/all-files`，更新異動清單與全庫檔案。
3. **分頁導覽與檔案清單**：
   - 「目前異動」頁籤：顯示未提交之異動清單、彩色標籤與數量統計；清單為空時呈現 Working Tree Clean 提示。
   - 「全庫檔案」頁籤：列出 Repo 內所有已追蹤檔案，提供搜尋輸入框可即時過濾任意檔案。
4. **檔案差異檢視 (Diff Viewer)**：
   - 點擊任一檔案後展開，顯示該檔案之 Unified Diff（新增綠/刪除紅）。
   - 支援「歷史版本」下拉選單：點選任一歷史 Commit 即時顯示該次提交的具體改動內容（`git show`）。
   - 支援雙重異動（如 MM）切換已暫存/未暫存差異，並支援一鍵返回當前工作區。
5. **Stage All 按鈕**：單鍵呼叫 `POST /api/git/stage-all`，成功後自動刷新清單並同步更新 Diff。
6. **Commit 區塊**：Commit Message 輸入框 + Commit 按鈕，暫存區為空時自動防呆禁用，送出後自動清空輸入框並刷新清單。

---

## 6. Agent 驗證與驗收檢查清單

任何 Agent 在交付或完成代碼時，必須逐項驗證以下項目：

- [ ] **無第三方 Git 套件依賴**：檢查 `package.json`，不得有 `simple-git` 或 `nodegit` 等相依。
- [ ] **命令注入防範**：所有 `child_process` 調用均採用參數陣列（`execFile` / `spawn`）。
- [ ] **4 步驟閉環驗收**：
  1. 輸入本地已存在的 Git 專案路徑，可成功讀出異動檔案清單。
  2. 點擊 Stage All 後，異動狀態轉為暫存（如 `??` 轉為 `A `，或 ` M` 轉為 `M `）。
  3. 輸入 Commit Message 並送出後，本地 Git log 成功產生 commit。
  4. 畫面自動更新為 "Working Tree Clean"。
- [ ] **錯誤回饋驗證**：輸入非 Git 倉庫路徑或空路徑時，前端不會崩潰且有清楚錯誤提示。
