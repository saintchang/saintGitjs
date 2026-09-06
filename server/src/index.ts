import express, { Request, Response } from 'express';
import cors from 'cors';
import { getStatus, stageAll, commit } from './gitService.js';

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

app.listen(PORT, () => {
  console.log(`Git backend server listening on http://localhost:${PORT}`);
});
