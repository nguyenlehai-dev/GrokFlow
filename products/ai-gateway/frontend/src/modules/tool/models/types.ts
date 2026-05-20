export type PromptCategory = "text" | "image" | "video" | "code" | "other";
export type PromptScope = "system" | "domain" | "user";

export interface PromptTemplate {
  id: string;
  user_id: string | null;
  domain_id: string | null;
  scope: PromptScope;
  title: string;
  content: string;
  category: PromptCategory;
  tags: string[];
  thumbnail_url: string | null;
  is_public: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string | null;
  total_tokens: number;
  total_cost_cents: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

// ─── Admin oversight ───────────────────────────────────────────────────────

export interface AdminPromptTemplate extends PromptTemplate {
  owner_email: string | null;
}

export interface AdminChatSession extends ChatSessionDetail {
  owner_email: string | null;
}

export interface ToolStats {
  customer_count_total: number;
  customer_count_active: number;
  prompt_count_total: number;
  prompt_count_system: number;
  prompt_count_domain: number;
  prompt_count_user: number;
  chat_session_count: number;
  chat_message_count: number;
  chat_tokens_total: number;
  chat_cost_cents_total: number;
  top_prompts: PromptTemplate[];
}

export interface ToolCustomer {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  domain_id: string | null;
  created_at: string;
  updated_at: string;
  chat_session_count: number;
  prompt_count: number;
}

export interface ToolCustomerCreate {
  email: string;
  password: string;
  full_name?: string | null;
  plan_id?: string | null;
  domain_id?: string | null;
}

export interface ToolCustomerUpdate {
  full_name?: string | null;
  status?: "active" | "inactive";
  plan_id?: string | null;
  password?: string;
}
