"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
  Clock,
  Sparkles,
  AlertTriangle,
  Shield,
  BookOpen,
  List,
  X,
  Calendar,
  Scale,
  CircleDollarSign,
  Quote,
  Users,
  Gavel,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { DropZone } from "@/components/upload/DropZone";
import { listDocuments, deleteDocument, analyzeDocument } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AnalysisResponse, Document } from "@/types";

// ── Status badge ──────────────────────────────────────────────────────────────────

const statusBadge: Record<string, string> = {
  ready:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  processing: "bg-amber-500/10  text-amber-400  border-amber-500/20",
  error:      "bg-red-500/10    text-red-400    border-red-500/20",
};

// ── Risk / severity colour maps ───────────────────────────────────────────────────

const riskColour: Record<string, string> = {
  low:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium:   "bg-amber-500/10   text-amber-400   border-amber-500/30",
  high:     "bg-red-500/10     text-red-400     border-red-500/30",
  critical: "bg-rose-600/15    text-rose-400    border-rose-500/40",
};

const clauseRiskDot: Record<string, string> = {
  low:    "bg-emerald-500",
  medium: "bg-amber-500",
  high:   "bg-red-500",
};

// ── Confidence badge ──────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  const colour =
    pct >= 80 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
    pct >= 50 ? "text-amber-400   border-amber-500/30   bg-amber-500/10"   :
                "text-red-400     border-red-500/30     bg-red-500/10";
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-mono shrink-0", colour)}>
      {pct}%
    </span>
  );
}

// ── Analysis tab definition ───────────────────────────────────────────────────────

type Tab = "summary" | "clauses" | "risks" | "obligations" | "keyDates" | "penalties" | "keypoints";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "summary",     label: "Summary",     icon: BookOpen },
  { id: "clauses",     label: "Clauses",     icon: Shield },
  { id: "risks",       label: "Risks",       icon: AlertTriangle },
  { id: "obligations", label: "Obligations", icon: Scale },
  { id: "keyDates",    label: "Key Dates",   icon: Calendar },
  { id: "penalties",   label: "Penalties",   icon: CircleDollarSign },
  { id: "keypoints",   label: "Key Points",  icon: List },
];

// ── Page component ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [docs, setDocs]             = useState<Document[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [analysisDocId, setAnalysisDocId]     = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysis, setAnalysis]               = useState<AnalysisResponse | null>(null);
  const [activeTab, setActiveTab]             = useState<Tab>("summary");

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────────

  async function fetchDocs() {
    setLoading(true);
    try {
      const data = await listDocuments();
      setDocs(data);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDocs(); }, []);

  // ── Auto-poll while processing ────────────────────────────────────────────────

  const hasProcessing = docs.some((d) => d.status === "processing");

  useEffect(() => {
    if (!hasProcessing) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    if (!pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        try {
          const fresh = await listDocuments();
          setDocs(fresh);
          if (!fresh.some((d) => d.status === "processing")) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            toast.success("Document processing complete — ready for AI analysis!");
          }
        } catch { /* ignore transient errors */ }
      }, 2500);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasProcessing]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (analysisDocId === id) closeAnalysis();
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAnalyze(doc: Document) {
    if (doc.status !== "ready") {
      toast.error("Document is still processing — please wait");
      return;
    }
    setAnalysisDocId(doc.id);
    setAnalysis(null);
    setAnalysisLoading(true);
    setActiveTab("summary");
    try {
      const result = await analyzeDocument(doc.id);
      setAnalysis(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate analysis";
      toast.error(msg);
      setAnalysisDocId(null);
    } finally {
      setAnalysisLoading(false);
    }
  }

  function closeAnalysis() {
    setAnalysisDocId(null);
    setAnalysis(null);
  }

  // ── Tab badge counts ──────────────────────────────────────────────────────────

  function tabCount(id: Tab): number | null {
    if (!analysis) return null;
    switch (id) {
      case "clauses":     return analysis.clauses.length;
      case "risks":       return analysis.risks.length;
      case "obligations": return analysis.obligations?.length ?? 0;
      case "keyDates":    return analysis.key_dates?.length ?? 0;
      case "penalties":   return analysis.penalties?.length ?? 0;
      case "keypoints":   return analysis.key_points.length;
      default:            return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Upload Documents"
        subtitle="Add legal PDFs — AI extracts clauses, risks, obligations, and insights"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Drop zone */}
          <DropZone onUploadComplete={fetchDocs} />

          {/* Document list */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-obsidian-400 uppercase tracking-wide">
                Your Documents ({docs.length})
                {hasProcessing && (
                  <span className="ml-2 text-amber-400 text-xs font-normal normal-case">
                    · processing…
                  </span>
                )}
              </h2>
              <button onClick={fetchDocs} className="btn-ghost flex items-center gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
              </div>
            ) : docs.length === 0 ? (
              <div className="glass-card p-10 text-center gold-border">
                <FileText className="w-10 h-10 text-obsidian-600 mx-auto mb-2" />
                <p className="text-obsidian-400 text-sm">No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      "glass-card px-4 py-3 gold-border transition-all",
                      analysisDocId === doc.id && "ring-1 ring-gold-500/40"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gold-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-obsidian-200 truncate">{doc.name}</p>
                        <p className="text-xs text-obsidian-500 flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDate(doc.created_at)} · {formatBytes(doc.file_size)}
                          {doc.page_count > 0 && ` · ${doc.page_count} pages`}
                          {doc.chunk_count > 0 && ` · ${doc.chunk_count} chunks`}
                        </p>
                      </div>

                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusBadge[doc.status]}`}>
                        {doc.status === "processing" ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            processing
                          </span>
                        ) : doc.status}
                      </span>

                      <button
                        onClick={() =>
                          analysisDocId === doc.id ? closeAnalysis() : handleAnalyze(doc)
                        }
                        disabled={doc.status !== "ready" || analysisLoading}
                        className={cn(
                          "btn-ghost text-xs px-2.5 py-1 shrink-0 flex items-center gap-1 disabled:opacity-40",
                          analysisDocId === doc.id && "text-gold-400"
                        )}
                      >
                        {analysisLoading && analysisDocId === doc.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {analysisDocId === doc.id ? "Analysing…" : "Analyse"}
                      </button>

                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* ── Analysis panel ──────────────────────────────────────────────────── */}
          <AnimatePresence>
            {analysisDocId && (
              <motion.div
                key="analysis-panel"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="glass-card gold-border overflow-hidden"
              >
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-obsidian-800/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-gold-500 shrink-0" />
                    <span className="text-sm font-semibold text-obsidian-100 truncate">
                      {analysis?.document_name ?? "Analysing…"}
                    </span>
                    {analysis?.document_type && (
                      <span className="text-xs px-2 py-0.5 bg-gold-500/10 text-gold-400 border border-gold-500/20 rounded-full shrink-0">
                        {analysis.document_type}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={closeAnalysis}
                    className="text-obsidian-500 hover:text-obsidian-300 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Loading skeleton */}
                {analysisLoading && (
                  <div className="p-6 space-y-3">
                    <div className="flex items-center gap-3 text-sm text-obsidian-400">
                      <Loader2 className="w-4 h-4 animate-spin text-gold-500" />
                      NVIDIA NIM is analysing — extracting clauses, obligations, risks, penalties…
                    </div>
                    {[80, 60, 72, 55, 68].map((w, i) => (
                      <div
                        key={i}
                        className="h-3 rounded bg-obsidian-800/70 animate-pulse"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                )}

                {/* Tabs */}
                {analysis && !analysisLoading && (
                  <>
                    <div className="flex border-b border-obsidian-800/60 overflow-x-auto">
                      {TABS.map(({ id, label, icon: Icon }) => {
                        const count = tabCount(id);
                        return (
                          <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={cn(
                              "flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap shrink-0",
                              activeTab === id
                                ? "border-gold-500 text-gold-400 bg-gold-500/5"
                                : "border-transparent text-obsidian-500 hover:text-obsidian-300"
                            )}
                          >
                            <Icon className="w-3 h-3" />
                            {label}
                            {count !== null && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-full",
                                activeTab === id
                                  ? "bg-gold-500/20 text-gold-400"
                                  : "bg-obsidian-800 text-obsidian-500"
                              )}>
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-5">

                      {/* ── Summary ───────────────────────────────────────────── */}
                      {activeTab === "summary" && (
                        <div className="space-y-4">
                          {/* Parties / governing law / effective date metadata row */}
                          {(analysis.parties?.length > 0 || analysis.governing_law || analysis.effective_date) && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {analysis.parties?.length > 0 && (
                                <div className="p-3 rounded-lg bg-obsidian-800/40 border border-obsidian-700/50">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Users className="w-3 h-3 text-gold-500" />
                                    <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                      Parties
                                    </span>
                                  </div>
                                  <ul className="space-y-0.5">
                                    {analysis.parties.map((p, i) => (
                                      <li key={i} className="text-xs text-obsidian-300 truncate">{p}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {analysis.governing_law && (
                                <div className="p-3 rounded-lg bg-obsidian-800/40 border border-obsidian-700/50">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Gavel className="w-3 h-3 text-gold-500" />
                                    <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                      Governing Law
                                    </span>
                                  </div>
                                  <p className="text-xs text-obsidian-300">{analysis.governing_law}</p>
                                </div>
                              )}
                              {analysis.effective_date && (
                                <div className="p-3 rounded-lg bg-obsidian-800/40 border border-obsidian-700/50">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Calendar className="w-3 h-3 text-gold-500" />
                                    <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                      Effective Date
                                    </span>
                                  </div>
                                  <p className="text-xs text-obsidian-300">{analysis.effective_date}</p>
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-sm text-obsidian-300 leading-relaxed whitespace-pre-wrap">
                            {analysis.summary}
                          </p>
                        </div>
                      )}

                      {/* ── Key Points ────────────────────────────────────────── */}
                      {activeTab === "keypoints" && (
                        <ul className="space-y-2">
                          {analysis.key_points.length === 0 ? (
                            <li className="text-sm text-obsidian-500">No key points extracted.</li>
                          ) : analysis.key_points.map((pt, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-obsidian-300">
                              <span className="w-5 h-5 rounded-full bg-gold-500/15 border border-gold-600/20 text-gold-400 text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">
                                {i + 1}
                              </span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* ── Clauses ───────────────────────────────────────────── */}
                      {activeTab === "clauses" && (
                        <div className="space-y-3">
                          {analysis.clauses.length === 0 ? (
                            <p className="text-sm text-obsidian-500">No clauses identified.</p>
                          ) : analysis.clauses.map((clause, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 p-3 rounded-lg bg-obsidian-800/40 border border-obsidian-700/50"
                            >
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full mt-1.5 shrink-0",
                                  clauseRiskDot[clause.risk_level] ?? "bg-obsidian-500"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-semibold text-obsidian-200">
                                    {clause.type}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded border capitalize",
                                    riskColour[clause.risk_level] ?? ""
                                  )}>
                                    {clause.risk_level} risk
                                  </span>
                                  {clause.confidence != null && (
                                    <ConfidenceBadge value={clause.confidence} />
                                  )}
                                  <span className="text-[10px] text-obsidian-500 ml-auto">
                                    Page {clause.page}
                                  </span>
                                </div>
                                <p className="text-xs text-obsidian-400 leading-relaxed">
                                  {clause.description}
                                </p>
                                {clause.verbatim && (
                                  <div className="mt-2 flex items-start gap-1.5">
                                    <Quote className="w-3 h-3 text-obsidian-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-obsidian-500 italic leading-relaxed">
                                      {clause.verbatim}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Risks ─────────────────────────────────────────────── */}
                      {activeTab === "risks" && (
                        <div className="space-y-3">
                          {analysis.risks.length === 0 ? (
                            <p className="text-sm text-obsidian-500">No risks identified.</p>
                          ) : analysis.risks.map((risk, i) => (
                            <div
                              key={i}
                              className={cn(
                                "p-4 rounded-lg border",
                                riskColour[risk.severity] ?? "border-obsidian-700/50"
                              )}
                            >
                              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-obsidian-200 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3 h-3" />
                                  {risk.title}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {risk.confidence != null && (
                                    <ConfidenceBadge value={risk.confidence} />
                                  )}
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded border capitalize font-medium",
                                    riskColour[risk.severity] ?? ""
                                  )}>
                                    {risk.severity}
                                  </span>
                                </div>
                              </div>
                              {risk.affected_party && (
                                <p className="text-[10px] text-obsidian-500 mb-1.5">
                                  <span className="font-semibold uppercase tracking-wide">Affects: </span>
                                  {risk.affected_party}
                                </p>
                              )}
                              <p className="text-xs text-obsidian-400 leading-relaxed mb-2">
                                {risk.description}
                              </p>
                              {risk.recommendation && (
                                <div className="mt-2 pt-2 border-t border-current/10">
                                  <p className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide mb-0.5">
                                    Recommendation
                                  </p>
                                  <p className="text-xs text-obsidian-400 leading-relaxed">
                                    {risk.recommendation}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Obligations ───────────────────────────────────────── */}
                      {activeTab === "obligations" && (
                        <div className="space-y-3">
                          {!analysis.obligations?.length ? (
                            <p className="text-sm text-obsidian-500">No obligations extracted.</p>
                          ) : analysis.obligations.map((ob, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg bg-obsidian-800/40 border border-obsidian-700/50"
                            >
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-xs font-semibold text-obsidian-200 flex items-center gap-1">
                                  <Scale className="w-3 h-3 text-gold-500" />
                                  {ob.party}
                                </span>
                                {ob.confidence != null && (
                                  <ConfidenceBadge value={ob.confidence} />
                                )}
                                <span className="text-[10px] text-obsidian-500 ml-auto">
                                  Page {ob.page}
                                </span>
                              </div>
                              <p className="text-xs text-obsidian-300 leading-relaxed mb-2">
                                {ob.obligation}
                              </p>
                              <div className="flex gap-4 flex-wrap">
                                {ob.deadline && (
                                  <div>
                                    <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                      Deadline
                                    </span>
                                    <p className="text-xs text-amber-400">{ob.deadline}</p>
                                  </div>
                                )}
                                {ob.consequence && (
                                  <div>
                                    <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                      Consequence
                                    </span>
                                    <p className="text-xs text-red-400">{ob.consequence}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Key Dates ─────────────────────────────────────────── */}
                      {activeTab === "keyDates" && (
                        <div className="space-y-3">
                          {!analysis.key_dates?.length ? (
                            <p className="text-sm text-obsidian-500">No key dates extracted.</p>
                          ) : analysis.key_dates.map((kd, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-4 p-3 rounded-lg bg-obsidian-800/40 border border-obsidian-700/50"
                            >
                              <div className="shrink-0 text-center">
                                <Calendar className="w-5 h-5 text-gold-500 mx-auto mb-0.5" />
                                <span className="text-[10px] text-obsidian-500">p.{kd.page}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-semibold text-obsidian-200">{kd.label}</span>
                                  <span className="text-xs text-gold-400 font-mono">{kd.date_value}</span>
                                </div>
                                {kd.significance && (
                                  <p className="text-xs text-obsidian-400 leading-relaxed">
                                    {kd.significance}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Penalties ─────────────────────────────────────────── */}
                      {activeTab === "penalties" && (
                        <div className="space-y-3">
                          {!analysis.penalties?.length ? (
                            <p className="text-sm text-obsidian-500">No penalties extracted.</p>
                          ) : analysis.penalties.map((pen, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg bg-red-500/5 border border-red-500/20"
                            >
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-xs font-semibold text-obsidian-200 flex items-center gap-1">
                                  <CircleDollarSign className="w-3 h-3 text-red-400" />
                                  {pen.party_liable}
                                </span>
                                {pen.confidence != null && (
                                  <ConfidenceBadge value={pen.confidence} />
                                )}
                                <span className="text-[10px] text-obsidian-500 ml-auto">
                                  Page {pen.page}
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                <div>
                                  <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                    Trigger
                                  </span>
                                  <p className="text-xs text-obsidian-300 leading-relaxed">{pen.trigger}</p>
                                </div>
                                {pen.amount_or_remedy && (
                                  <div>
                                    <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wide">
                                      Amount / Remedy
                                    </span>
                                    <p className="text-xs text-red-400 font-medium">{pen.amount_or_remedy}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
