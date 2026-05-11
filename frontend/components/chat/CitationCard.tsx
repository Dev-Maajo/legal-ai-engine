"use client";

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { Citation } from "@/types";

interface CitationCardProps {
  citations: Citation[];
}

export function CitationCard({ citations }: CitationCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!citations.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-obsidian-400 hover:text-gold-400 transition-colors"
      >
        <FileText className="w-3 h-3" />
        <span>{citations.length} citation{citations.length > 1 ? "s" : ""}</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="space-y-2">
          {citations.map((c, i) => (
            <div
              key={i}
              className="bg-obsidian-800/50 border border-obsidian-700/50 rounded-lg p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-gold-500/15 border border-gold-600/20 text-gold-400 text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-obsidian-300 truncate flex-1">
                  {c.document_name}
                </span>
                <span className="text-xs text-obsidian-500 shrink-0">
                  Page {c.page}
                </span>
                <span className="text-xs text-gold-600 shrink-0">
                  {Math.round(c.relevance_score * 100)}% match
                </span>
              </div>
              <p className="text-xs text-obsidian-400 leading-relaxed line-clamp-4">
                {c.chunk_text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
