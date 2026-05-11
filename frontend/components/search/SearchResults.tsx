"use client";

import { motion } from "framer-motion";
import { FileText, Tag } from "lucide-react";
import type { SearchResult } from "@/types";

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
}

export function SearchResults({ results, query }: SearchResultsProps) {
  if (!results.length) {
    return (
      <div className="text-center py-12 text-obsidian-500">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>No results found for &ldquo;{query}&rdquo;</p>
        <p className="text-sm mt-1">Try different keywords or upload more documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-obsidian-500">
        {results.length} result{results.length > 1 ? "s" : ""} for &ldquo;{query}&rdquo;
      </p>

      {results.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="glass-card p-4 gold-border hover:bg-gold-500/[0.03] transition-all"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-gold-500 shrink-0" />
              <span className="text-sm font-medium text-obsidian-200 truncate">
                {r.document_name}
              </span>
              <span className="text-xs text-obsidian-500 shrink-0">Page {r.page}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div
                className="h-1.5 rounded-full bg-gold-500 opacity-60"
                style={{ width: `${Math.round(r.relevance_score * 60)}px` }}
              />
              <span className="text-xs text-gold-600 font-medium">
                {Math.round(r.relevance_score * 100)}%
              </span>
            </div>
          </div>

          {(r.section_title || r.section_type) && (
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="w-3 h-3 text-obsidian-500" />
              {r.section_title && (
                <span className="text-xs text-obsidian-400">{r.section_title}</span>
              )}
              {r.section_type && (
                <span className="text-xs text-obsidian-600 bg-obsidian-700/50 px-1.5 py-0.5 rounded">
                  {r.section_type}
                </span>
              )}
            </div>
          )}

          <p className="text-sm text-obsidian-400 leading-relaxed line-clamp-4">
            {r.chunk_text}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
