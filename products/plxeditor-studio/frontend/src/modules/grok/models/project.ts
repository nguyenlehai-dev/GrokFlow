export interface Project {
  id: string;
  profile_id: string;
  grok_project_id: string;
  name: string;
  description: string | null;
  domain_count: number;
  tool_install_count: number;
}

export interface UserRow {
  id: string;
  email: string;
  role: string;
  status: string;
}
