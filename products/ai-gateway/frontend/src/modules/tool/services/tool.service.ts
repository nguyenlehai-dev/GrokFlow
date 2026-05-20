import { api } from "@/core/api/axios";
import type {
  AdminChatSession,
  AdminPromptTemplate,
  ChatSession,
  ChatSessionDetail,
  PromptTemplate,
  ToolCustomer,
  ToolCustomerCreate,
  ToolCustomerUpdate,
  ToolStats,
} from "../models/types";

export const promptsService = {
  list: (params: { category?: string; scope?: string; q?: string } = {}) =>
    api.get<PromptTemplate[]>("/api/prompt-templates", { params }).then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post<PromptTemplate>("/api/prompt-templates", payload).then((r) => r.data),
  get: (id: string) =>
    api.get<PromptTemplate>(`/api/prompt-templates/${id}`).then((r) => r.data),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch<PromptTemplate>(`/api/prompt-templates/${id}`, payload).then((r) => r.data),
  remove: (id: string) =>
    api.delete(`/api/prompt-templates/${id}`),
  use: (id: string) =>
    api.post<PromptTemplate>(`/api/prompt-templates/${id}/use`).then((r) => r.data),
};

export const chatService = {
  listSessions: () =>
    api.get<ChatSession[]>("/api/chat-sessions").then((r) => r.data),
  createSession: (payload: { title?: string; model?: string } = {}) =>
    api.post<ChatSessionDetail>("/api/chat-sessions", payload).then((r) => r.data),
  getSession: (id: string) =>
    api.get<ChatSessionDetail>(`/api/chat-sessions/${id}`).then((r) => r.data),
  deleteSession: (id: string) =>
    api.delete(`/api/chat-sessions/${id}`),
  send: (id: string, content: string, model?: string) =>
    api
      .post<ChatSessionDetail>(`/api/chat-sessions/${id}/messages`, { content, model })
      .then((r) => r.data),
};

export const toolAdminService = {
  listPrompts: (params: {
    scope?: string; category?: string; q?: string; user_id?: string; limit?: number;
  } = {}) =>
    api
      .get<AdminPromptTemplate[]>("/api/admin/tool/prompts", { params })
      .then((r) => r.data),
  deletePrompt: (id: string) =>
    api.delete(`/api/admin/tool/prompts/${id}`),
  listChatSessions: (params: { user_id?: string; q?: string; limit?: number } = {}) =>
    api
      .get<AdminChatSession[]>("/api/admin/tool/chat-sessions", { params })
      .then((r) => r.data),
  getChatSession: (id: string) =>
    api.get<AdminChatSession>(`/api/admin/tool/chat-sessions/${id}`).then((r) => r.data),
  deleteChatSession: (id: string) =>
    api.delete(`/api/admin/tool/chat-sessions/${id}`),
  stats: () => api.get<ToolStats>("/api/admin/tool/stats").then((r) => r.data),

  listCustomers: (params: { q?: string; status?: string; limit?: number } = {}) =>
    api.get<ToolCustomer[]>("/api/admin/tool/customers", { params }).then((r) => r.data),
  createCustomer: (payload: ToolCustomerCreate) =>
    api.post<ToolCustomer>("/api/admin/tool/customers", payload).then((r) => r.data),
  updateCustomer: (id: string, payload: ToolCustomerUpdate) =>
    api.patch<ToolCustomer>(`/api/admin/tool/customers/${id}`, payload).then((r) => r.data),
  suspendCustomer: (id: string) =>
    api.delete(`/api/admin/tool/customers/${id}`),
};
