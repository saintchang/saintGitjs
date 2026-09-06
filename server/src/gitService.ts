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
