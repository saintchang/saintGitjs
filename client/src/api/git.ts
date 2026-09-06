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
