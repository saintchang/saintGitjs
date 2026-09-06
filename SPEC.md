# Git Web GUI MVP 規格書

## 1. 專案定位與目標

使用 Vue 3 + TypeScript + Node.js (本地 Web 服務) 打造極簡 Git GUI 工具。

本階段為 **最小可行性產品（MVP）**，目標不是打造完整 Git 客戶端，而是以最短操作閉環驗證：
`Vue UI` → `HTTP API (REST)` → `Node.js (child_process)` → `Git CLI` → `本地 Repo` 的資料流與操作可行性。

## 2. MVP 範圍與取捨原則

為追求快速落地與驗證核心技術鏈，第一階段嚴格限制功能邊界：

| 模組 | MVP 範圍（保留） | 暫緩項目（第 2 階段後） | 簡化原因 |
| :--- | :--- | :--- | :--- |
| **Repo 載入** | 文字框手動輸入路徑（或寫死預設路徑） | 系統原生檔案選擇器 (File Dialog) | 瀏覽器安全限制與避免初期引入複雜外殼 |
| **檔案變更** | 取得異動清單（狀態代碼 + 相對路徑） | 檔案分類標籤、樹狀結構、圖示 | 簡化前端狀態管理與視覺渲染 |
| **暫存操作** | 單鍵全部暫存 (`git add .`) | 單檔 Stage / Unstage、行級暫存 | 降低 UI 互動複雜度 |
| **檢視差異** | 點擊單檔查看 Unified Diff（新增綠/刪除紅） | 雙欄 (Side-by-Side) Diff、語法著色庫 | 維持輕量零相依設計，使用原生 git diff |
| **提交變更** | 輸入文字並提交 (`git commit -m`) | Commit 模板、Amend、GPG 簽章 | 專注驗證命令執行與結果回傳 |
| **環境驗證** | 開發者本地單一 OS | 跨平台 (Windows/macOS/Linux) 適配 | 避免初期卡在環境變數與跨平台路徑差異 |

## 3. 核心驗證閉環（最短流程）

```text
[輸入 Repo 本地路徑]
       ↓
[按下 Refresh / 讀取狀態]
       ↓
[Node.js 執行 git status --porcelain -u]
       ↓
[GUI 顯示異動檔案清單]
       ↓
[點擊 Stage All (git add .)]
       ↓
[輸入 Commit Message 並點擊 Commit]
       ↓
[Node.js 執行 git commit -m "..."]
       ↓
[自動觸發 Refresh，清單清空驗證完成]
```

## 4. 技術架構與介面設計

### 技術棧
- **UI Layer**: Vue 3 + TypeScript (透過 Vite 構建)
- **Backend Runtime**: Node.js 本地 HTTP 服務 (如 Express / Fastify 或原生 http 模組)
- **Execution Layer**: Node.js `child_process`（使用 `execFile` 或 `spawn`，不依賴外部 Git npm 套件）
- **Engine**: 本地系統原生 `git` CLI

### HTTP API 介面定義
實作 3 個無狀態核心 API，前端發送 POST 請求並在 Request Body 傳入 `repoPath` 作為執行命令的工作目錄（`cwd: repoPath`）。

#### 資料結構 (TypeScript)

```typescript
interface GitFileStatus {
  statusCode: string; // 例如: "M ", "??", " D"
  path: string;       // 檔案相對路徑
}
```

#### API 端點與規格

##### 1. 取得異動狀態
- **Method / Path**: `POST /api/git/status`
- **Request Body**:
  ```json
  { "repoPath": "C:/path/to/repo" }
  ```
- **Response**: `GitFileStatus[]`
- **底層對應**: `git status --porcelain -u`

##### 2. 全部暫存
- **Method / Path**: `POST /api/git/stage-all`
- **Request Body**:
  ```json
  { "repoPath": "C:/path/to/repo" }
  ```
- **Response**: `{ "success": true }`
- **底層對應**: `git add .`

##### 3. 提交變更
- **Method / Path**: `POST /api/git/commit`
- **Request Body**:
  ```json
  { "repoPath": "C:/path/to/repo", "message": "commit message" }
  ```
- **Response**: `{ "success": true, "output": string }`
- **底層對應**: `git commit -m <message>`

##### 4. 取得檔案差異 (Diff)
- **Method / Path**: `POST /api/git/diff`
- **Request Body**:
  ```json
  {
    "repoPath": "C:/path/to/repo",
    "filePath": "src/App.vue",
    "staged": false,
    "isUntracked": false,
    "commitHash": "28aa613"
  }
  ```
- **Response**:
  ```json
  {
    "diff": "diff --git a/... b/...",
    "filePath": "src/App.vue",
    "staged": false,
    "isUntracked": false,
    "commitHash": "28aa613"
  }
  ```
- **底層對應**:
  - 指定 `commitHash`: `git show <commitHash> -- <filePath>`
  - `staged = true`: `git diff --cached -- <filePath>`
  - `isUntracked = true`: `git diff --no-index -- /dev/null <filePath>`
  - 一般未暫存: `git diff -- <filePath>`

##### 5. 取得 Repo 內所有已追蹤檔案清單
- **Method / Path**: `POST /api/git/all-files`
- **Request Body**:
  ```json
  { "repoPath": "C:/path/to/repo" }
  ```
- **Response**: `string[]`（相對路徑陣列）
- **底層對應**: `git ls-files`

##### 6. 取得特定檔案歷史 Commit 記錄
- **Method / Path**: `POST /api/git/file-commits`
- **Request Body**:
  ```json
  { "repoPath": "C:/path/to/repo", "filePath": "src/App.vue", "limit": 15 }
  ```
- **Response**: `FileCommitInfo[]`（包含 hash, message, relativeTime, author）
- **底層對應**: `git log -n <limit> --pretty=format:%h|%s|%cr|%an -- <filePath>`

#### 前端 API 呼叫簽名 (TypeScript Client)

```typescript
// 前端封裝之服務介面
get_status(repoPath: string): Promise<GitFileStatus[]>;
stage_all(repoPath: string): Promise<void>;
commit(repoPath: string, message: string): Promise<string>;
get_diff(repoPath: string, filePath: string, staged?: boolean, isUntracked?: boolean, commitHash?: string): Promise<DiffResponse>;
get_all_files(repoPath: string): Promise<string[]>;
get_file_commits(repoPath: string, filePath: string, limit?: number): Promise<FileCommitInfo[]>;
```

## 5. 底層 CLI 實作細節規範

### 機讀格式解析 (`git status --porcelain -u`)
每行格式固定為 `XY PATH`：
- 前兩字元 `XY` 為 Staged / Unstaged 狀態代碼。
- 第 4 字元起為檔案相對路徑。
- Node.js 處理方式：將 stdout 字串以換行符 `\n` 切割，過濾空行後，取每行前兩字元為 `statusCode`，自第 4 字元起（索引 3）`.trim()` 作為 `path`。

### 錯誤邊界處理
- 若目錄不存在或非 Git Repo，CLI 會透過 `stderr` 輸出錯誤訊息（例如：`fatal: not a git repository`）。
- Node.js 端捕獲子行程錯誤或 exit code 非 0 時，回傳 HTTP 400/500 及 `{ "error": stderr.toString() }`。
- 前端統一攔截 HTTP 錯誤回應並以 Alert 或 Toast 呈現錯誤訊息。

## 6. MVP 驗收標準

完成以下驗證流程即代表 MVP 成功，可進入後續常用功能擴充：
1. 輸入本地已存在的 Git 專案路徑，可成功讀出目前的異動檔案清單。
2. 點擊 Stage All 後，異動狀態成功轉為暫存。
3. 輸入 Commit Message 並送出後，本地 Git log 成功新增一筆 Commit。
4. UI 清單自動刷新並呈現 Working Tree Clean 狀態。