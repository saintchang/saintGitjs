<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { get_status, stage_all, commit, get_diff, type GitFileStatus } from './api/git';

const repoPath = ref<string>(localStorage.getItem('saintGit_repoPath') || '');
const fileStatuses = ref<GitFileStatus[]>([]);
const commitMessage = ref<string>('');
const isLoading = ref<boolean>(false);
const errorMsg = ref<string>('');
const successMsg = ref<string>('');
const hasLoaded = ref<boolean>(false);

// Diff 檢視狀態
const selectedFile = ref<GitFileStatus | null>(null);
const selectedDiffMode = ref<'unstaged' | 'staged'>('unstaged');
const currentDiff = ref<string>('');
const isDiffLoading = ref<boolean>(false);
const diffError = ref<string>('');

const saveRepoPath = () => {
  localStorage.setItem('saintGit_repoPath', repoPath.value);
};

const clearMessages = () => {
  errorMsg.value = '';
  successMsg.value = '';
};

// 判定是否已暫存
const isItemStaged = (code: string) => {
  const s0 = code[0];
  return s0 && s0 !== ' ' && s0 !== '?';
};

// 判定是否同時有已暫存與未暫存異動 (如 MM)
const hasBothDiffs = (code: string) => {
  const s0 = code[0];
  const s1 = code[1];
  return s0 && s0 !== ' ' && s0 !== '?' && s1 && s1 !== ' ';
};

// 已暫存與未暫存數量統計
const stagedCount = computed(() => {
  return fileStatuses.value.filter((item) => isItemStaged(item.statusCode)).length;
});

const unstagedCount = computed(() => {
  return fileStatuses.value.filter((item) => {
    const s0 = item.statusCode[0];
    const s1 = item.statusCode[1];
    return s0 === '?' || (s1 && s1 !== ' ');
  }).length;
});

const hasStagedChanges = computed(() => stagedCount.value > 0);

// 解析狀態徽章呈現資訊
const getStatusBadge = (code: string) => {
  const s0 = code[0] || ' ';
  const s1 = code[1] || ' ';

  if (code.startsWith('?')) {
    return { class: 'tag-untracked', label: '未追蹤 (Untracked)' };
  }
  if (s0 === 'M') {
    return { class: 'tag-staged', label: '已暫存修改 (Staged)' };
  }
  if (s0 === 'A') {
    return { class: 'tag-staged', label: '已暫存新增 (Staged)' };
  }
  if (s0 === 'D') {
    return { class: 'tag-staged', label: '已暫存刪除 (Staged)' };
  }
  if (s1 === 'M') {
    return { class: 'tag-unstaged', label: '未暫存修改 (Modified)' };
  }
  if (s1 === 'D') {
    return { class: 'tag-unstaged', label: '未暫存刪除 (Deleted)' };
  }
  return { class: 'tag-default', label: '異動' };
};

// 內部讀取狀態函式
const fetchStatusData = async () => {
  if (!repoPath.value.trim()) return;
  saveRepoPath();
  fileStatuses.value = await get_status(repoPath.value.trim());
  hasLoaded.value = true;

  // 若目前檢視中的檔案仍存在，自動更新 Diff；若已不在清單中則關閉
  if (selectedFile.value) {
    const matched = fileStatuses.value.find((f) => f.path === selectedFile.value!.path);
    if (matched) {
      selectedFile.value = matched;
      await loadDiffContent(matched, selectedDiffMode.value);
    } else {
      closeDiff();
    }
  }
};

// 點擊檔案列載入 Diff
const handleSelectFile = async (file: GitFileStatus) => {
  selectedFile.value = file;

  // 決定預設顯示模式：若只有暫存變更則預設看暫存，其餘預設看工作區
  if (file.statusCode.startsWith('?')) {
    selectedDiffMode.value = 'unstaged';
  } else if (isItemStaged(file.statusCode) && file.statusCode[1] === ' ') {
    selectedDiffMode.value = 'staged';
  } else {
    selectedDiffMode.value = 'unstaged';
  }

  await loadDiffContent(file, selectedDiffMode.value);
};

// 切換暫存/未暫存 Diff
const switchDiffMode = async (mode: 'unstaged' | 'staged') => {
  if (!selectedFile.value) return;
  selectedDiffMode.value = mode;
  await loadDiffContent(selectedFile.value, mode);
};

// 請求 Diff 資料
const loadDiffContent = async (file: GitFileStatus, mode: 'unstaged' | 'staged') => {
  if (!repoPath.value.trim()) return;
  isDiffLoading.value = true;
  diffError.value = '';
  currentDiff.value = '';

  const isUntracked = file.statusCode.startsWith('?');
  const isStaged = mode === 'staged';

  try {
    const res = await get_diff(repoPath.value.trim(), file.path, isStaged, isUntracked);
    currentDiff.value = res.diff;
  } catch (err: any) {
    diffError.value = err.message || '讀取差異失敗';
  } finally {
    isDiffLoading.value = false;
  }
};

const closeDiff = () => {
  selectedFile.value = null;
  currentDiff.value = '';
  diffError.value = '';
};

// 解析 Unified Diff 每一行之型別與內容
interface DiffLine {
  type: 'diff-meta' | 'diff-hunk' | 'diff-add' | 'diff-del' | 'diff-context';
  prefix: string;
  text: string;
}

const parsedDiffLines = computed<DiffLine[]>(() => {
  if (!currentDiff.value) return [];
  const lines = currentDiff.value.split('\n');
  return lines.map((line) => {
    if (
      line.startsWith('+++') ||
      line.startsWith('---') ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode')
    ) {
      return { type: 'diff-meta', prefix: ' ', text: line };
    }
    if (line.startsWith('@@')) {
      return { type: 'diff-hunk', prefix: ' ', text: line };
    }
    if (line.startsWith('+')) {
      return { type: 'diff-add', prefix: '+', text: line.slice(1) };
    }
    if (line.startsWith('-')) {
      return { type: 'diff-del', prefix: '-', text: line.slice(1) };
    }
    return { type: 'diff-context', prefix: ' ', text: line.startsWith(' ') ? line.slice(1) : line };
  });
});

// 使用者點擊 Refresh 按鈕
const handleRefresh = async () => {
  if (!repoPath.value.trim()) {
    errorMsg.value = '請輸入本地 Git 專案路徑';
    return;
  }
  clearMessages();
  isLoading.value = true;

  try {
    await fetchStatusData();
  } catch (err: any) {
    errorMsg.value = err.message || '無法讀取狀態';
  } finally {
    isLoading.value = false;
  }
};

// 使用者點擊 Stage All 按鈕
const handleStageAll = async () => {
  if (!repoPath.value.trim()) return;
  errorMsg.value = '';
  isLoading.value = true;

  try {
    await stage_all(repoPath.value.trim());
    successMsg.value = '已完成全部暫存 (git add .)，所有異動已進入暫存區！';
    await fetchStatusData();
  } catch (err: any) {
    errorMsg.value = err.message || '暫存失敗';
  } finally {
    isLoading.value = false;
  }
};

// 使用者點擊 Commit 按鈕
const handleCommit = async () => {
  if (!repoPath.value.trim()) {
    errorMsg.value = '請輸入本地 Git 專案路徑';
    return;
  }
  if (!hasStagedChanges.value) {
    errorMsg.value = '暫存區內沒有已暫存的檔案。請先點擊「Stage All (全部暫存)」後再進行提交。';
    return;
  }
  if (!commitMessage.value.trim()) {
    errorMsg.value = '請輸入 Commit Message';
    return;
  }

  errorMsg.value = '';
  isLoading.value = true;

  try {
    const output = await commit(repoPath.value.trim(), commitMessage.value.trim());
    commitMessage.value = '';
    successMsg.value = output || 'Commit 提交成功！';
    await fetchStatusData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Commit 失敗';
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  if (repoPath.value.trim()) {
    handleRefresh();
  }
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="title-group">
        <h1>saintGit</h1>
        <span class="badge">MVP</span>
      </div>
      <p class="subtitle">極簡 Git Web GUI 工具 (Node.js + Vue 3)</p>
    </header>

    <!-- Repo 路徑輸入列 -->
    <section class="card path-section">
      <label for="repo-path">本地 Repo 路徑：</label>
      <div class="input-row">
        <input
          id="repo-path"
          v-model="repoPath"
          type="text"
          placeholder="例如：C:\my\project 或 /Users/name/repo"
          :disabled="isLoading"
          @keyup.enter="handleRefresh"
        />
        <button class="btn btn-primary" :disabled="isLoading || !repoPath.trim()" @click="handleRefresh">
          {{ isLoading ? '讀取中...' : 'Refresh 整理狀態' }}
        </button>
      </div>
    </section>

    <!-- 訊息提示區 -->
    <div v-if="errorMsg" class="alert alert-error">
      <span class="icon">⚠️</span>
      <div class="msg-content">{{ errorMsg }}</div>
      <button class="close-btn" @click="errorMsg = ''">×</button>
    </div>

    <div v-if="successMsg" class="alert alert-success">
      <span class="icon">✓</span>
      <div class="msg-content">{{ successMsg }}</div>
      <button class="close-btn" @click="successMsg = ''">×</button>
    </div>

    <!-- 異動清單與暫存操作 -->
    <section v-if="hasLoaded" class="card list-section">
      <div class="section-header">
        <div class="section-title">
          <h2>異動檔案清單</h2>
          <div class="summary-pills" v-if="fileStatuses.length > 0">
            <span class="pill pill-staged">已暫存: {{ stagedCount }}</span>
            <span class="pill pill-unstaged">未暫存: {{ unstagedCount }}</span>
          </div>
        </div>
        <button
          class="btn btn-secondary"
          :disabled="isLoading || fileStatuses.length === 0"
          @click="handleStageAll"
        >
          Stage All (全部暫存)
        </button>
      </div>

      <!-- 清單內容 -->
      <div v-if="fileStatuses.length > 0" class="file-table-wrapper">
        <table class="file-table">
          <thead>
            <tr>
              <th style="width: 170px;">狀態標籤</th>
              <th style="width: 80px;">代碼</th>
              <th>檔案相對路徑（點擊查看 Diff）</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in fileStatuses"
              :key="index"
              class="clickable-row"
              :class="{ 'active-row': selectedFile?.path === item.path }"
              @click="handleSelectFile(item)"
            >
              <td>
                <span class="tag" :class="getStatusBadge(item.statusCode).class">
                  {{ getStatusBadge(item.statusCode).label }}
                </span>
              </td>
              <td>
                <code class="raw-code">{{ item.statusCode }}</code>
              </td>
              <td class="file-path-cell">
                <span class="file-path">{{ item.path }}</span>
                <span class="view-diff-hint">點擊查看 ➔</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Working Tree Clean 狀態 -->
      <div v-else class="empty-state">
        <div class="empty-icon">🎉</div>
        <p class="empty-text">Working Tree Clean</p>
        <p class="empty-sub">目前沒有未提交的異動檔案</p>
      </div>
    </section>

    <!-- 檔案差異檢視區塊 (Diff Viewer) -->
    <section v-if="selectedFile" class="card diff-section">
      <div class="diff-header">
        <div class="diff-title-group">
          <h3>差異檢視</h3>
          <code class="diff-file-pill">{{ selectedFile.path }}</code>

          <!-- 若同時具有暫存與未暫存差異，提供分頁切換按鈕 -->
          <div v-if="hasBothDiffs(selectedFile.statusCode)" class="diff-mode-tabs">
            <button
              class="tab-btn"
              :class="{ active: selectedDiffMode === 'unstaged' }"
              @click="switchDiffMode('unstaged')"
            >
              未暫存差異
            </button>
            <button
              class="tab-btn"
              :class="{ active: selectedDiffMode === 'staged' }"
              @click="switchDiffMode('staged')"
            >
              已暫存差異
            </button>
          </div>
          <span v-else class="diff-mode-indicator">
            {{ selectedDiffMode === 'staged' ? '（已暫存差異）' : '（工作區差異）' }}
          </span>
        </div>
        <button class="close-diff-btn" title="關閉檢視" @click="closeDiff">✕</button>
      </div>

      <div v-if="isDiffLoading" class="diff-status-box">
        <span class="spinner">⏳</span> 讀取檔案差異中...
      </div>
      <div v-else-if="diffError" class="diff-status-box diff-status-error">
        ⚠️ {{ diffError }}
      </div>
      <div v-else-if="!currentDiff" class="diff-status-box">
        目前無文字差異內容（可能是空白檔案、二進位檔案或內容與比較版本相同）
      </div>
      <div v-else class="diff-viewer-wrapper">
        <div class="diff-table">
          <div
            v-for="(line, idx) in parsedDiffLines"
            :key="idx"
            class="diff-line-row"
            :class="line.type"
          >
            <span class="diff-prefix">{{ line.prefix }}</span>
            <span class="diff-text">{{ line.text }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Commit 提交區塊 -->
    <section v-if="hasLoaded" class="card commit-section">
      <h2>提交變更 (Commit)</h2>

      <!-- 提示尚未 Stage All -->
      <div v-if="!hasStagedChanges && fileStatuses.length > 0" class="notice-box">
        💡 提示：目前暫存區中尚無已暫存的檔案。若要提交異動，請先點擊上方的 <strong>Stage All (全部暫存)</strong>。
      </div>

      <div class="commit-form">
        <textarea
          v-model="commitMessage"
          placeholder="輸入 Commit Message..."
          rows="3"
          :disabled="isLoading"
          @keydown.ctrl.enter="handleCommit"
        ></textarea>
        <div class="commit-actions">
          <span class="hint">按 Ctrl + Enter 或點擊按鈕送出</span>
          <button
            class="btn btn-success"
            :disabled="isLoading || !commitMessage.trim() || !hasStagedChanges"
            @click="handleCommit"
          >
            {{ isLoading ? '提交中...' : 'Commit 提交變更' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style>
/* 全局重置與基底樣式 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: #f4f6f9;
  color: #24292f;
  line-height: 1.5;
}
</style>

<style scoped>
.app-container {
  max-width: 960px;
  margin: 2rem auto;
  padding: 0 1.5rem;
}

.app-header {
  margin-bottom: 1.5rem;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

h1 {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1f2328;
}

.badge {
  background: #0969da;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.subtitle {
  color: #656d76;
  font-size: 0.95rem;
  margin-top: 0.25rem;
}

.card {
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.card h2 {
  font-size: 1.15rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.path-section label {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  color: #24292f;
}

.input-row {
  display: flex;
  gap: 0.75rem;
}

input[type="text"] {
  flex: 1;
  padding: 0.55rem 0.75rem;
  font-size: 0.95rem;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  outline: none;
  background-color: #f6f8fa;
  transition: border-color 0.2s, background-color 0.2s;
}

input[type="text"]:focus {
  border-color: #0969da;
  background-color: #fff;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease-in-out;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #0969da;
  color: #ffffff;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0858b9;
}

.btn-secondary {
  background-color: #f6f8fa;
  color: #24292f;
  border-color: #d0d7de;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #f3f4f6;
  border-color: #b1bac4;
}

.btn-success {
  background-color: #1f883d;
  color: #ffffff;
}
.btn-success:hover:not(:disabled) {
  background-color: #1a7f37;
}

/* 提示訊息 Alert */
.alert {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  font-size: 0.9rem;
  position: relative;
  white-space: pre-wrap;
}

.alert-error {
  background-color: #ffebe9;
  border: 1px solid #ff8182;
  color: #cf222e;
}

.alert-success {
  background-color: #dafbe1;
  border: 1px solid #4ac26b;
  color: #1a7f37;
}

.msg-content {
  flex: 1;
  word-break: break-all;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: inherit;
  line-height: 1;
  padding: 0 0.25rem;
}

/* 異動檔案清單 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.summary-pills {
  display: flex;
  gap: 0.5rem;
}

.pill {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.pill-staged {
  background-color: #dafbe1;
  color: #1a7f37;
  border: 1px solid #4ac26b40;
}

.pill-unstaged {
  background-color: #fff8c5;
  color: #9a6700;
  border: 1px solid #d4a72c40;
}

.file-table-wrapper {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow: hidden;
}

.file-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  text-align: left;
}

.file-table th {
  background-color: #f6f8fa;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #d0d7de;
  color: #57606a;
  font-weight: 600;
}

.file-table td {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #eaeef2;
}

.file-table tr:last-child td {
  border-bottom: none;
}

.clickable-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.clickable-row:hover {
  background-color: #f3f4f6;
}

.active-row {
  background-color: #ebf5ff !important;
  box-shadow: inset 3px 0 0 #0969da;
}

.tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.tag-staged {
  background-color: #dafbe1;
  color: #1a7f37;
  border: 1px solid #4ac26b40;
}

.tag-unstaged {
  background-color: #fff8c5;
  color: #9a6700;
  border: 1px solid #d4a72c40;
}

.tag-untracked {
  background-color: #f2e7fe;
  color: #8250df;
  border: 1px solid #d2a8ff40;
}

.tag-default {
  background-color: #eaeef2;
  color: #57606a;
}

.raw-code {
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.85rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background-color: #f6f8fa;
  border: 1px solid #d0d7de;
  white-space: pre;
  color: #24292f;
}

.file-path-cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-path {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  color: #1f2328;
}

.view-diff-hint {
  font-size: 0.75rem;
  color: #0969da;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.clickable-row:hover .view-diff-hint {
  opacity: 1;
}

/* Diff 檢視區塊 */
.diff-section {
  border: 1px solid #0969da40;
  background-color: #ffffff;
  margin-bottom: 1.25rem;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid #d0d7de;
}

.diff-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.diff-title-group h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1f2328;
}

.diff-file-pill {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.85rem;
  background-color: #f6f8fa;
  border: 1px solid #d0d7de;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  color: #0969da;
  font-weight: 600;
}

.diff-mode-tabs {
  display: flex;
  gap: 0.25rem;
  background-color: #f6f8fa;
  padding: 0.15rem;
  border-radius: 6px;
  border: 1px solid #d0d7de;
}

.tab-btn {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #656d76;
  font-weight: 500;
  transition: all 0.15s;
}

.tab-btn.active {
  background-color: #ffffff;
  color: #0969da;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.diff-mode-indicator {
  font-size: 0.8rem;
  color: #656d76;
}

.close-diff-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #57606a;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}

.close-diff-btn:hover {
  background-color: #f3f4f6;
  color: #cf222e;
}

.diff-status-box {
  padding: 2rem;
  text-align: center;
  color: #57606a;
  font-size: 0.9rem;
  background-color: #f6f8fa;
  border-radius: 6px;
}

.diff-status-error {
  color: #cf222e;
  background-color: #ffebe9;
}

.diff-viewer-wrapper {
  max-height: 480px;
  overflow: auto;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background-color: #ffffff;
}

.diff-table {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.825rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-line-row {
  display: flex;
  padding: 0.1rem 0;
  border-left: 3px solid transparent;
}

.diff-prefix {
  width: 2rem;
  text-align: center;
  color: #8c959f;
  user-select: none;
  flex-shrink: 0;
}

.diff-text {
  flex: 1;
  padding-right: 0.5rem;
}

/* 新增行 */
.diff-add {
  background-color: #e6ffec;
  color: #1a7f37;
  border-left-color: #2da44e;
}
.diff-add .diff-prefix {
  color: #1a7f37;
  font-weight: 700;
}

/* 刪除行 */
.diff-del {
  background-color: #ffebe9;
  color: #cf222e;
  border-left-color: #cf222e;
}
.diff-del .diff-prefix {
  color: #cf222e;
  font-weight: 700;
}

/* 區塊標頭 @@ */
.diff-hunk {
  background-color: #f0f7ff;
  color: #0969da;
  font-weight: 600;
  border-top: 1px solid #d0d7de80;
  border-bottom: 1px solid #d0d7de80;
}

/* 檔案元資訊 */
.diff-meta {
  background-color: #f6f8fa;
  color: #656d76;
  font-weight: 500;
}

/* 一般上下文行 */
.diff-context {
  background-color: #ffffff;
  color: #1f2328;
}

/* Empty State */
.empty-state {
  padding: 2.5rem 1rem;
  text-align: center;
  background-color: #f6f8fa;
  border-radius: 6px;
  border: 1px dashed #d0d7de;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.empty-text {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a7f37;
}

.empty-sub {
  font-size: 0.85rem;
  color: #57606a;
  margin-top: 0.25rem;
}

/* Commit 區塊 */
.commit-section h2 {
  margin-bottom: 0.85rem;
}

.notice-box {
  background-color: #ddf4ff;
  border: 1px solid #54aeff60;
  color: #0969da;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  font-size: 0.875rem;
  margin-bottom: 0.85rem;
}

.commit-form textarea {
  width: 100%;
  padding: 0.65rem 0.75rem;
  font-size: 0.95rem;
  font-family: inherit;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  outline: none;
  resize: vertical;
  background-color: #f6f8fa;
  transition: border-color 0.2s, background-color 0.2s;
}

.commit-form textarea:focus {
  border-color: #0969da;
  background-color: #fff;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}

.commit-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.65rem;
}

.hint {
  font-size: 0.8rem;
  color: #656d76;
}
</style>
