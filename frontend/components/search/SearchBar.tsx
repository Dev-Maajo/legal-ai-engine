"use client";

import { useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  loading = false,
  placeholder = "Search your legal documents semantically…",
}: SearchBarProps) {
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  }

  function clear() {
    setQuery("");
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-obsidian-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="input-dark w-full pl-11 pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-obsidian-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={!query.trim() || loading}
        className={cn(
          "btn-primary px-5 py-3 flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Search className="w-4 h-4" />
        )}
        Search
      </button>
    </form>
  );
}
