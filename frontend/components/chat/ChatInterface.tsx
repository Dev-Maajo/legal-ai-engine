"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText, Loader2, Scale, Send } from "lucide-react";
import { v4 as uuid } from "uuid";
import { toast } from "sonner";

import { listDocuments, streamChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ChatMessage, Citation, Document } from "@/types";
import { MessageBubble } from "./MessageBubble";

const STARTERS = [
  "Summarize the key obligations in this contract",
  "What are the termination clauses?",
  "Identify any liability limitations",
  "What jurisdiction governs this agreement?",
];

export function ChatInterface() {
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [docs, setDocs]               = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [input, setInput]             = useState("");
  const [busy, setBusy]               = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // Load ready documents for the doc-filter picker
  useEffect(() => {
    listDocuments()
      .then((all) => setDocs(all.filter((d) => d.status === "ready")))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Conversation history for the RAG pipeline (last 8 turns)
  const history = messages
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content }));

  async function send(question: string) {
    if (!question.trim() || busy) return;

    const userMsg: ChatMessage = {
      id:        uuid(),
      role:      "user",
      content:   question.trim(),
      citations: [],
      created_at: new Date().toISOString(),
    };

    const assistantId = uuid();
    const assistantMsg: ChatMessage = {
      id:        assistantId,
      role:      "assistant",
      content:   "",            // filled token-by-token
      citations: [],
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setBusy(true);
    setStreamingId(assistantId);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const controller = await streamChatMessage(
        {
          question: question.trim(),
          document_ids: selectedDocs.length ? selectedDocs : undefined,
          conversation_history: history,
        },
        {
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + token }
                  : m
              )
            );
          },
          onCitation: (citation: Citation) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, citations: [...m.citations, citation] }
                  : m
              )
            );
          },
          onDone: () => {
            setBusy(false);
            setStreamingId(null);
          },
          onError: (msg) => {
            toast.error(msg || "Failed to get response");
            // Remove the empty assistant placeholder on error
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            setInput(question);
            setBusy(false);
            setStreamingId(null);
          },
        }
      );
      abortRef.current = controller;
    } catch {
      toast.error("Connection error — please try again");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setInput(question);
      setBusy(false);
      setStreamingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
    if (e.key === "Escape" && busy) {
      abortRef.current?.abort();
      setBusy(false);
      setStreamingId(null);
    }
  }

  function toggleDoc(id: string) {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-8 text-center">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-600/20 flex items-center justify-center mx-auto mb-4">
                <Scale className="w-8 h-8 text-gold-500" />
              </div>
              <h2 className="text-xl font-bold text-obsidian-100 mb-2">
                Legal AI Research Assistant
              </h2>
              <p className="text-obsidian-400 text-sm max-w-sm">
                Ask anything about your uploaded legal documents. Answers stream
                in real-time with source citations.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm text-obsidian-300 bg-obsidian-800/50 border border-obsidian-700/50 hover:border-gold-600/30 hover:text-obsidian-200 rounded-lg px-4 py-3 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={msg.id === streamingId}
            />
          ))
        )}

        {/* Streaming cursor indicator */}
        {streamingId && (
          <div className="flex gap-3 pl-11">
            <span className="text-xs text-obsidian-500 animate-pulse">
              Generating…  Press Esc to stop
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div className="border-t border-obsidian-800/50 p-4 space-y-2 bg-obsidian-950/80 backdrop-blur-sm">

        {/* Document filter */}
        {docs.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowDocPicker((v) => !v)}
              className="flex items-center gap-2 text-xs text-obsidian-400 hover:text-obsidian-200 transition-colors"
            >
              <FileText className="w-3 h-3" />
              {selectedDocs.length === 0
                ? "All documents"
                : `${selectedDocs.length} selected`}
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform",
                  showDocPicker && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence>
              {showDocPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full mb-2 left-0 glass-card border border-obsidian-700/50 rounded-lg p-2 min-w-[260px] max-h-48 overflow-y-auto z-10"
                >
                  {docs.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-obsidian-800/60 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="accent-gold-500"
                      />
                      <span className="text-xs text-obsidian-300 truncate">
                        {doc.name}
                      </span>
                    </label>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a legal question… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="input-dark flex-1 resize-none min-h-[44px] max-h-40 py-3 leading-5 overflow-y-auto"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
            }}
          />

          <button
            onClick={() => send(input)}
            disabled={!input.trim() || busy}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200",
              input.trim() && !busy
                ? "bg-gold-gradient shadow-gold hover:shadow-gold-lg active:scale-95"
                : "bg-obsidian-800 text-obsidian-600 cursor-not-allowed"
            )}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 text-obsidian-400 animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-obsidian-950" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
