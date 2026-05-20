export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  date: string;
  message: string;
}

export interface GitContainerInfo {
  name: string;
  status: string;
  image_id: string | null;
  started_at: string | null;
}

export interface GitRepoRow {
  id: string;
  label: string;
  github_repo: string;
  branch: string;
  local_path: string;
  compose_file: string | null;
  env_file: string | null;
  services: string[];
  sort_order: number;
}

export interface GitStatus {
  repo: GitRepoRow;
  branch: string;
  current_commit: GitCommit | null;
  recent_commits: GitCommit[];
  remote_latest: GitCommit | null;
  commits_behind: number | null;
  is_dirty: boolean;
  containers: GitContainerInfo[];
}

export interface DeployResult {
  ok: boolean;
  duration_seconds: number;
  log: string;
}

export interface GitEnv {
  env: string;
  path: string;
}
