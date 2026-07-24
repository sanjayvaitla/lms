import axios from 'axios';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

export interface LatestCommit {
  sha: string;
  message: string;
  ref: string;
  defaultBranch: string;
}

export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

export function hasGithubToken(): boolean {
  return !!GITHUB_TOKEN;
}

/**
 * Fetch the latest commit SHA on the default branch of a repo.
 * Requires read access via GITHUB_TOKEN (staff PAT on student forks).
 */
export async function fetchLatestCommit(
  owner: string,
  repo: string,
  logTag = '[github-poller]',
): Promise<LatestCommit | null> {
  let defaultBranch = 'main';
  try {
    let commitRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits/main`,
      { headers: githubHeaders(), timeout: 10000 },
    ).catch(async (err) => {
      if (err?.response?.status >= 400 && err?.response?.status < 500 && err?.response?.status !== 403 && err?.response?.status !== 429) {
        const repoRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}`,
          { headers: githubHeaders(), timeout: 10000 },
        );
        defaultBranch = repoRes.data?.default_branch ?? 'main';
        if (defaultBranch !== 'main') {
          return axios.get(
            `https://api.github.com/repos/${owner}/${repo}/commits/${defaultBranch}`,
            { headers: githubHeaders(), timeout: 10000 },
          );
        }
      }
      throw err;
    });

    const sha: string = commitRes.data?.sha ?? '';
    if (!sha) return null;

    const ref = `refs/heads/${defaultBranch}`;
    const message: string = commitRes.data?.commit?.message?.split('\n')[0] ?? 'Commit detected by poller';
    return { sha, message, ref, defaultBranch };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401) {
      console.error(`${logTag} GITHUB_TOKEN invalid or expired (401) — generate new PAT with repo scope in .env`);
    } else if (status === 404) {
      console.warn(`${logTag} Repo not found or no read access: ${owner}/${repo}`);
    } else if (status === 403 || status === 429) {
      console.warn(`${logTag} Rate limited on ${owner}/${repo} — will retry next tick`);
    } else {
      console.warn(`${logTag} fetchLatestCommit failed for ${owner}/${repo}:`, err?.message);
    }
    return null;
  }
}

export async function fetchCommitDelta(
  owner: string,
  repo: string,
  base: string | null,
  head: string,
  defaultBranch: string,
): Promise<number> {
  try {
    if (base) {
      const res = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
        { headers: githubHeaders(), timeout: 10000 },
      );
      const ahead = Number(res.data?.ahead_by ?? 1);
      return ahead > 0 ? ahead : 1;
    }

    const res = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        headers: githubHeaders(),
        timeout: 10000,
        params: { sha: defaultBranch, per_page: 1 },
      },
    );
    const linkHeader: string = res.headers['link'] ?? '';
    const lastPageMatch = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
    if (lastPageMatch) return parseInt(lastPageMatch[1], 10);

    return Array.isArray(res.data) ? res.data.length : 1;
  } catch {
    return 1;
  }
}

export function semaphore(max: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return {
    acquire(): Promise<void> {
      return new Promise(resolve => {
        if (running < max) { running++; resolve(); }
        else queue.push(resolve);
      });
    },
    release() {
      const next = queue.shift();
      if (next) next();
      else running--;
    },
  };
}
