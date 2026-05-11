export interface Document {
  id: string;
  user_id: string;
  name: string;
  file_size: number;
  page_count: number;
  chunk_count: number;
  status: "processing" | "ready" | "error";
  created_at: string;
}

export interface Citation {
  document_id: string;
  document_name: string;
  page: number;
  chunk_text: string;
  relevance_score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  conversation_id: string | null;
}

export interface SearchResult {
  chunk_text: string;
  document_id: string;
  document_name: string;
  page: number;
  relevance_score: number;
  section_title?: string;
  section_type?: string;
  clause_numbers?: string;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

export interface SummaryResponse {
  document_id: string;
  document_name: string;
  summary: string;
  key_points: string[];
  document_type: string;
}

export interface UploadResponse {
  document_id: string;
  message: string;
  status: string;
}

// ── Legal analysis ────────────────────────────────────────────────────────────────

export interface ClauseResult {
  type: string;
  description: string;
  verbatim: string;
  page: number;
  risk_level: "low" | "medium" | "high";
  confidence: number;
}

export interface RiskResult {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  recommendation: string;
  affected_party: string;
  confidence: number;
}

export interface ObligationResult {
  party: string;
  obligation: string;
  deadline: string;
  consequence: string;
  page: number;
  confidence: number;
}

export interface KeyDateResult {
  label: string;
  date_value: string;
  significance: string;
  page: number;
}

export interface PenaltyResult {
  trigger: string;
  amount_or_remedy: string;
  party_liable: string;
  page: number;
  confidence: number;
}

export interface AnalysisResponse {
  document_id: string;
  document_name: string;
  document_type: string;
  parties: string[];
  governing_law: string | null;
  effective_date: string | null;
  summary: string;
  key_points: string[];
  clauses: ClauseResult[];
  risks: RiskResult[];
  obligations: ObligationResult[];
  key_dates: KeyDateResult[];
  penalties: PenaltyResult[];
}
