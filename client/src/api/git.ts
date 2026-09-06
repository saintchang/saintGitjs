export interface GitFileStatus {
  statusCode: string; // 例如: "M ", "??", " D"
  path: string;       // 檔案相對路徑
}

/**
 * 取得異動狀態
 */
export async function get_status(repoPath: string): Promise<GitFileStatus[]> {
  const res = await fetch('/api/git/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoPath }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed to get status`);
  }

  return data as GitFileStatus[];
}

/**
 * 全部暫存
 */
export async function stage_all(repoPath: string): Promise<void> {
  const res = await fetch('/api/git/stage-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoPath }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed to stage all changes`);
  }
}

/**
 * 提交變更
 */
export async function commit(repoPath: string, message: string): Promise<string> {
  const res = await fetch('/api/git/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoPath, message }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed to commit`);
  }

  return data.output || 'Commit successful';
}

export interface DiffResponse {
  diff: string;
  filePath: string;
  staged: boolean;
  isUntracked: boolean;
  commitHash?: string | null;
}

export interface FileCommitInfo {
  hash: string;
  message: string;
  relativeTime: string;
  author: string;
}

/**
 * 取得檔案差異 (Diff)
 */
export async function get_diff(
  repoPath: string,
  filePath: string,
  staged: boolean = false,
  isUntracked: boolean = false,
  commitHash?: string
): Promise<DiffResponse> {
  const res = await fetch('/api/git/diff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoPath, filePath, staged, isUntracked, commitHash }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed to get diff`);
  }

  return data as DiffResponse;
}

/**
 * 取得 Repo 內所有已追蹤檔案清單
 */
export async function get_all_files(repoPath: string): Promise<string[]> {
  const res = await fetch('/api/git/all-files', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoPath }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed to get all files`);
  }

  return data as string[];
}

/**
 * 取得特定檔案的歷史 Commit 記錄
 */
export async function get_file_commits(
  repoPath: string,
  filePath: string,
  limit: number = 15
): Promise<FileCommitInfo[]> {
  const res = await fetch('/api/git/file-commits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repoPath, filePath, limit }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Failed to get file commits`);
  }

  return data as FileCommitInfo[];
}


