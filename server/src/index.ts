import express, { Request, Response } from 'express';
import cors from 'cors';
import { getStatus, stageAll, commit, getDiff, getAllFiles, getFileCommits } from './gitService.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 1. 取得異動清單
app.post('/api/git/status', async (req: Request, res: Response) => {
  const { repoPath } = req.body;
  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'repoPath is required' });
  }

  try {
    const statuses = await getStatus(repoPath);
    return res.json(statuses);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 2. 全部暫存
app.post('/api/git/stage-all', async (req: Request, res: Response) => {
  const { repoPath } = req.body;
  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'repoPath is required' });
  }

  try {
    await stageAll(repoPath);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 3. 提交變更
app.post('/api/git/commit', async (req: Request, res: Response) => {
  const { repoPath, message } = req.body;
  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'repoPath is required' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const output = await commit(repoPath, message);
    return res.json({ success: true, output });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 4. 取得檔案差異 (Diff)
app.post('/api/git/diff', async (req: Request, res: Response) => {
  const { repoPath, filePath, staged, isUntracked, commitHash } = req.body;
  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'repoPath is required' });
  }
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath is required' });
  }

  try {
    const diff = await getDiff(
      repoPath,
      filePath,
      Boolean(staged),
      Boolean(isUntracked),
      typeof commitHash === 'string' ? commitHash : undefined
    );
    return res.json({
      diff,
      filePath,
      staged: Boolean(staged),
      isUntracked: Boolean(isUntracked),
      commitHash: commitHash || null,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 5. 取得 Repo 內所有已追蹤檔案清單
app.post('/api/git/all-files', async (req: Request, res: Response) => {
  const { repoPath } = req.body;
  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'repoPath is required' });
  }

  try {
    const files = await getAllFiles(repoPath);
    return res.json(files);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 6. 取得特定檔案歷史 Commit 記錄
app.post('/api/git/file-commits', async (req: Request, res: Response) => {
  const { repoPath, filePath, limit } = req.body;
  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'repoPath is required' });
  }
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath is required' });
  }

  try {
    const commits = await getFileCommits(repoPath, filePath, limit ? Number(limit) : 15);
    return res.json(commits);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Git backend server listening on http://localhost:${PORT}`);
});

