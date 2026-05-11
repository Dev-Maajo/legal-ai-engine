"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { semanticSearch, listDocuments } from "@/lib/api";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";
import type { SearchResult, Document } from "@/types";
import { cn } from "@/lib/utils";

export default function SearchPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [docs, setDocs] = useState<Document[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    listDocuments()
      .then((d) => setDocs(d.filter((doc) => doc.status === "ready")))
      .catch(() => {});
  }, []);

  function toggleDoc(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSearch(query: string) {
    setLoading(true);
    setLastQuery(query);
    try {
      const res = await semanticSearch({
        query,
        top_k: 15,
        document_ids: selectedIds.length > 0 ? selectedIds : undefined,
      });
      setResults(res.results);
      setSearched(true);
    } catch {
      toast.error("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Semantic Search"
        subtitle="Search across your legal documents using natural language"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <SearchBar onSearch={handleSearch} loading={loading} />

          {/* Document filter */}
          {docs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-obsidian-500">
                  Filter by document{" "}
                  {selectedIds.length > 0 && (
                    <span className="text-gold-500">({selectedIds.length} selected)</span>
                  )}
                </span>
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-xs text-obsidian-500 hover:text-gold-400 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear filter
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {docs.map((doc) => {
                  const active = selectedIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      onClick={() => toggleDoc(doc.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all",
                        active
                          ? "bg-gold-500/15 border-gold-600/40 text-gold-300"
                          : "bg-obsidian-800/60 border-obsidian-700/50 text-obsidian-400 hover:border-obsidian-600 hover:text-obsidian-300"
                      )}
                    >
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="max-w-[180px] truncate">{doc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {searched && (
            <SearchResults results={results} query={lastQuery} />
          )}

          {!searched && (
            <div className="text-center py-16 text-obsidian-500">
              <p className="text-sm">
                Search across all your indexed legal documents semantically.
              </p>
              <p className="text-xs mt-1">
                Try: &ldquo;indemnification clauses&rdquo; or &ldquo;governing law jurisdiction&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
