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
 */
async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (error: any) {
    const stderr = error.stderr?.toString() || error.stdout?.toString() || error.message || 'Unknown git execution error';
    throw new Error(stderr.trim());
  }
}

/**
 * 取得異動清單
 * 底層對應: git status --porcelain -u
 */
export async function getStatus(repoPath: string): Promise<GitFileStatus[]> {
  const { stdout } = await runGit(['status', '--porcelain', '-u'], repoPath);
  const lines = stdout.split('\n');
  const fileStatuses: GitFileStatus[] = [];

  for (const line of lines) {
    if (!line || line.trim().length === 0) {
      continue;
    }
    // 前兩字元為狀態代碼 (XY)，第 4 字元起（索引 3）為檔案相對路徑
    const statusCode = line.slice(0, 2);
    const path = line.slice(3).trim();
    fileStatuses.push({ statusCode, path });
  }

  return fileStatuses;
}

/**
 * 全部暫存
 * 底層對應: git add .
 */
export async function stageAll(repoPath: string): Promise<void> {
  await runGit(['add', '.'], repoPath);
}

/**
 * 提交變更
 * 底層對應: git commit -m <message>
 */
export async function commit(repoPath: string, message: string): Promise<string> {
  if (!message || message.trim().length === 0) {
    throw new Error('Commit message cannot be empty');
  }
  try {
    const { stdout } = await runGit(['commit', '-m', message], repoPath);
    return stdout.trim();
  } catch (err: any) {
    const rawMsg = err.message || '';
    if (rawMsg.includes('no changes added to commit') || rawMsg.includes('nothing to commit')) {
      throw new Error('暫存區內沒有已暫存的檔案。請先點擊「Stage All (全部暫存)」後再進行提交。');
    }
    throw err;
  }
}

/**
 * 取得檔案差異 (Diff)
 * @param repoPath 本地專案絕對路徑
 * @param filePath 檔案相對路徑
 * @param staged 是否查看已暫存差異 (--cached)
 * @param isUntracked 是否為未追蹤檔案 (--no-index)
 */
export async function getDiff(
  repoPath: string,
  filePath: string,
  staged: boolean = false,
  isUntracked: boolean = false
): Promise<string> {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('filePath is required');
  }

  let args: string[];
  if (isUntracked) {
    // 未追蹤檔案與 /dev/null 比較以取得全量新增內容
    args = ['diff', '--no-index', '--', '/dev/null', filePath];
  } else if (staged) {
    args = ['diff', '--cached', '--', filePath];
  } else {
    args = ['diff', '--', filePath];
  }

  try {
    const result = await execFileAsync('git', args, {
      cwd: repoPath,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout.toString().trim();
  } catch (error: any) {
    // git diff --no-index 在發現差異時 exit code 為 1，stdout 仍為正常 diff 內容
    if (error.code === 1 && error.stdout) {
      return error.stdout.toString().trim();
    }
    const stderr = error.stderr?.toString() || error.stdout?.toString() || error.message || 'Failed to get diff';
    throw new Error(stderr.trim());
  }
}
