// Where admin edits get persisted.
//
// On Vercel the filesystem is read-only, so saving has to go back to git. When
// GITHUB_TOKEN is set we commit through the GitHub Git Data API (one commit for
// all changed files, which triggers a redeploy). Without it — i.e. `vercel dev`
// locally — we just write to disk so the whole loop is testable offline.
//
// Env for the GitHub mode:
//   GITHUB_TOKEN   fine-grained PAT with Contents: read & write on the repo
//   GITHUB_REPO    "owner/name"
//   GITHUB_BRANCH  defaults to "main"

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(process.cwd());
const API = 'https://api.github.com';

export const usingGitHub = () => Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
const branch = () => process.env.GITHUB_BRANCH || 'main';

function gh(path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message || `GitHub ${r.status} on ${path}`);
    return body;
  });
}

export async function readTextFile(path) {
  if (usingGitHub()) {
    const repo = process.env.GITHUB_REPO;
    const data = await gh(`/repos/${repo}/contents/${encodeURI(path)}?ref=${branch()}`);
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  return readFile(join(REPO_ROOT, path), 'utf8');
}

/**
 * Persist a set of files as one atomic change.
 * @param {{path: string, content: string}[]} files
 * @param {string} message commit message (GitHub mode only)
 */
export async function writeFiles(files, message) {
  if (!usingGitHub()) {
    for (const f of files) {
      const abs = join(REPO_ROOT, f.path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, f.content, 'utf8');
    }
    return { mode: 'filesystem', files: files.length };
  }

  const repo = process.env.GITHUB_REPO;
  const ref = await gh(`/repos/${repo}/git/ref/heads/${branch()}`);
  const headSha = ref.object.sha;
  const head = await gh(`/repos/${repo}/git/commits/${headSha}`);

  const blobs = [];
  for (const f of files) {
    const blob = await gh(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: Buffer.from(f.content, 'utf8').toString('base64'), encoding: 'base64' }),
    });
    blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await gh(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: head.tree.sha, tree: blobs }),
  });
  const commit = await gh(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
  });
  await gh(`/repos/${repo}/git/refs/heads/${branch()}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { mode: 'github', files: files.length, commit: commit.sha.slice(0, 7), branch: branch() };
}
