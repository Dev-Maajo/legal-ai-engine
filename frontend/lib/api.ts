import axios, { AxiosInstance } from "axios";
import { supabase } from "./supabase";
import type {
  AnalysisResponse,
  Citation,
  Document,
  ChatResponse,
  SearchResponse,
  SummaryResponse,
  UploadResponse,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function buildClient(): Promise<AxiosInstance> {
  const token = await getAuthToken();
  return axios.create({
    baseURL: `${BASE_URL}/api/v1`,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────────

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const token = await getAuthToken();
  const form = new FormData();
  form.append("file", file);
  const res = await axios.post(`${BASE_URL}/api/v1/documents/upload`, form, {
    headers: {
      "Content-Type": "multipart/form-data",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.data;
}

export async function listDocuments(): Promise<Document[]> {
  const client = await buildClient();
  const res = await client.get("/documents/");
  return res.data;
}

export async function getDocument(documentId: string): Promise<Document> {
  const client = await buildClient();
  const res = await client.get(`/documents/${documentId}`);
  return res.data;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const client = await buildClient();
  await client.delete(`/documents/${documentId}`);
}

// ── Legal analysis ────────────────────────────────────────────────────────────────

/**
 * Full one-shot legal analysis via NVIDIA NIM.
 * Returns document type, executive summary, key points, important clauses
 * (with risk levels), and identified legal risks with recommendations.
 * Results are cached server-side — repeated calls are instant.
 */
export async function analyzeDocument(
  documentId: string,
): Promise<AnalysisResponse> {
  const client = await buildClient();
  const res = await client.post(`/documents/${documentId}/analyze`);
  return res.data;
}

// ── Chat (non-streaming) ──────────────────────────────────────────────────────────

export async function sendChatMessage(payload: {
  question: string;
  document_ids?: string[];
  conversation_history?: Array<{ role: string; content: string }>;
}): Promise<ChatResponse> {
  const client = await buildClient();
  const res = await client.post("/chat/", payload);
  return res.data;
}

// ── Chat (streaming SSE) ──────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onToken:    (token: string) => void;
  onCitation: (citation: Citation) => void;
  onDone:     (conversationId: string | null) => void;
  onError:    (message: string) => void;
}

/**
 * Opens a streaming SSE connection to /chat/stream.
 * Tokens stream in real-time; citations arrive after the full answer.
 * Returns an AbortController so the caller can cancel mid-stream (Escape key).
 */
export async function streamChatMessage(
  payload: {
    question: string;
    document_ids?: string[];
    conversation_history?: Array<{ role: string; content: string }>;
  },
  callbacks: StreamCallbacks,
): Promise<AbortController> {
  const token = await getAuthToken();
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/v1/chat/stream`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const conversationId = res.headers.get("X-Conversation-Id");
      if (!res.ok || !res.body) {
        // Try to extract a detail message from the error body
        try {
          const err = await res.json();
          callbacks.onError(err?.detail || `Server error: ${res.status}`);
        } catch {
          callbacks.onError(`Server error: ${res.status}`);
        }
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
          if (!jsonStr.trim()) continue;

          try {
            const event = JSON.parse(jsonStr) as {
              type: "token" | "citation" | "done" | "error";
              data: unknown;
            };

            if (event.type === "token") {
              callbacks.onToken(event.data as string);
            } else if (event.type === "citation") {
              callbacks.onCitation(event.data as Citation);
            } else if (event.type === "done") {
              callbacks.onDone(conversationId);
            } else if (event.type === "error") {
              callbacks.onError(event.data as string);
            }
          } catch {
            // Malformed SSE line — skip silently
          }
        }
      }
    })
    .catch((err: Error) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// ── Summary ───────────────────────────────────────────────────────────────────────

export async function summarizeDocument(
  documentId: string,
): Promise<SummaryResponse> {
  const client = await buildClient();
  const res = await client.post("/chat/summarize", { document_id: documentId });
  return res.data;
}

// ── Search ────────────────────────────────────────────────────────────────────────

export async function semanticSearch(payload: {
  query: string;
  document_ids?: string[];
  top_k?: number;
}): Promise<SearchResponse> {
  const client = await buildClient();
  const res = await client.post("/search/", payload);
  return res.data;
}
