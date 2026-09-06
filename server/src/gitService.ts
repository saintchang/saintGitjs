import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitFileStatus {
  statusCode: string;
  path: string;
}

/**
 * 執行 Git 指令工具函式
 * 嚴格使用參數陣列傳遞，防止命令注入
 * 強制 core.quotepath=false 避免中文或特殊檔名被八進位轉義
 */
async function runGit(
  args: string[],
  cwd: string,
  allowDiffExit1: boolean = false
): Promise<{ stdout: string; stderr: string }> {
  try {
    const finalArgs = ['-c', 'core.quotepath=false', ...args];
    const result = await execFileAsync('git', finalArgs, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (error: any) {
    // git diff (--no-index) 在發現差異時 exit code 為 1，stdout 仍為有效差異輸出
    if (allowDiffExit1 && error.code === 1 && error.stdout !== undefined) {
      return {
        stdout: error.stdout.toString(),
        stderr: error.stderr?.toString() || '',
      };
    }
    const stderr = error.stderr?.toString() || error.stdout?.toString() || error.message || 'Unknown git execution error';
    throw new Error(stderr.trim());
  }
}

/**
 * 取得 Git Repo 的根目錄絕對路徑（確保即便使用者傳入子資料夾亦能正確取得全庫檔案）
 */
export async function getRepoRoot(repoPath: string): Promise<string> {
  const { stdout } = await runGit(['rev-parse', '--show-toplevel'], repoPath);
  return stdout.trim() || repoPath;
}

/**
 * 取得異動清單
 * 底層對應: git status --porcelain -uall
 */
export async function getStatus(repoPath: string): Promise<GitFileStatus[]> {
  const root = await getRepoRoot(repoPath);
  const { stdout } = await runGit(['status', '--porcelain', '-uall'], root);
  const lines = stdout.split('\n');
  const fileStatuses: GitFileStatus[] = [];

  for (const line of lines) {
    if (!line || line.trim().length === 0) {
      continue;
    }
    // 前兩字元為狀態代碼 (XY)，第 4 字元起（索引 3）為檔案相對路徑
    const statusCode = line.slice(0, 2);
    let path = line.slice(3).trim();

    // 處理更名格式: oldPath -> newPath
    if (path.includes(' -> ')) {
      const parts = path.split(' -> ');
      path = parts[parts.length - 1].trim();
    }

    // 移除前後可能存在的引號 (若檔名包含空白或特殊字元)
    if (path.startsWith('"') && path.endsWith('"')) {
      path = path.slice(1, -1);
    }

    fileStatuses.push({ statusCode, path });
  }

  return fileStatuses;
}

/**
 * 全部暫存
 * 底層對應: git add .
 */
export async function stageAll(repoPath: string): Promise<void> {
  const root = await getRepoRoot(repoPath);
  await runGit(['add', '.'], root);
}

/**
 * 提交變更
 * 底層對應: git commit -m <message>
 */
export async function commit(repoPath: string, message: string): Promise<string> {
  if (!message || message.trim().length === 0) {
    throw new Error('Commit message cannot be empty');
  }
  const root = await getRepoRoot(repoPath);
  try {
    const { stdout } = await runGit(['commit', '-m', message], root);
    return stdout.trim();
  } catch (err: any) {
    const rawMsg = err.message || '';
    if (rawMsg.includes('no changes added to commit') || rawMsg.includes('nothing to commit')) {
      throw new Error('暫存區內沒有已暫存的檔案。請先點擊「Stage All (全部暫存)」後再進行提交。');
    }
    throw err;
  }
}

export interface FileCommitInfo {
  hash: string;
  message: string;
  relativeTime: string;
  author: string;
}

/**
 * 取得 Repo 內所有檔案清單（包含已追蹤與未被 .gitignore 忽略的未追蹤檔案）
 * 底層對應: git ls-files --cached --others --exclude-standard
 */
export async function getAllFiles(repoPath: string): Promise<string[]> {
  const root = await getRepoRoot(repoPath);
  const { stdout } = await runGit(['ls-files', '--cached', '--others', '--exclude-standard'], root);
  const lines = stdout.split('\n');
  const fileSet = new Set<string>();

  for (const line of lines) {
    let p = line.trim();
    if (!p) continue;
    if (p.startsWith('"') && p.endsWith('"')) {
      p = p.slice(1, -1);
    }
    fileSet.add(p);
  }

  return Array.from(fileSet).sort((a, b) => a.localeCompare(b));
}

/**
 * 取得特定檔案的歷史 Commit 記錄
 * 底層對應: git log -n <limit> --pretty=format:%h|%s|%cr|%an -- <filePath>
 */
export async function getFileCommits(
  repoPath: string,
  filePath: string,
  limit: number = 15
): Promise<FileCommitInfo[]> {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('filePath is required');
  }

  const root = await getRepoRoot(repoPath);
  const normalizedPath = filePath.replace(/\\/g, '/');

  try {
    const { stdout } = await runGit(
      ['log', `-n`, String(limit), '--pretty=format:%h|%s|%cr|%an', '--', normalizedPath],
      root
    );

    const lines = stdout.split('\n');
    const commits: FileCommitInfo[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        commits.push({
          hash: parts[0],
          message: parts[1],
          relativeTime: parts[2],
          author: parts.slice(3).join('|'),
        });
      }
    }

    return commits;
  } catch (err: any) {
    return [];
  }
}

/**
 * 取得檔案差異 (Diff)
 * @param repoPath 本地專案絕對路徑
 * @param filePath 檔案相對路徑
 * @param staged 是否查看已暫存差異 (--cached)
 * @param isUntracked 是否為未追蹤檔案 (--no-index)
 * @param commitHash 是否查看特定歷史 Commit 改動 (git show <commitHash> -- <filePath>)
 */
export async function getDiff(
  repoPath: string,
  filePath: string,
  staged: boolean = false,
  isUntracked: boolean = false,
  commitHash?: string
): Promise<string> {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('filePath is required');
  }

  const root = await getRepoRoot(repoPath);
  const normalizedPath = filePath.replace(/\\/g, '/');

  let args: string[];
  if (commitHash && commitHash.trim().length > 0) {
    // 檢視特定歷史 Commit 對此檔案之改動
    args = ['show', commitHash.trim(), '--', normalizedPath];
  } else if (isUntracked) {
    // 未追蹤檔案與 /dev/null 比較以取得全量新增內容
    args = ['diff', '--no-index', '--', '/dev/null', normalizedPath];
  } else if (staged) {
    args = ['diff', '--cached', '--', normalizedPath];
  } else {
    args = ['diff', '--', normalizedPath];
  }

  const { stdout } = await runGit(args, root, true);
  return stdout.trim();
}
