"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FileText,
  MessageSquare,
  Search,
  Upload,
  TrendingUp,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { listDocuments } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/utils";
import type { Document } from "@/types";

const quickActions = [
  { href: "/upload", icon: Upload, label: "Upload Document", color: "text-gold-400" },
  { href: "/chat", icon: MessageSquare, label: "Start Chat", color: "text-blue-400" },
  { href: "/search", icon: Search, label: "Search Docs", color: "text-purple-400" },
];

const statusBadge: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  processing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function DashboardPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const readyDocs = docs.filter((d) => d.status === "ready");
  const totalChunks = readyDocs.reduce((s, d) => s + d.chunk_count, 0);
  const totalPages = readyDocs.reduce((s, d) => s + d.page_count, 0);

  const stats = [
    { label: "Documents", value: docs.length, icon: FileText, color: "text-gold-400" },
    { label: "Pages Indexed", value: totalPages, icon: TrendingUp, color: "text-blue-400" },
    { label: "Knowledge Chunks", value: totalChunks, icon: Search, color: "text-purple-400" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Dashboard" subtitle="Your legal research overview" />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-5 gold-border"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-obsidian-500 uppercase tracking-wide">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className={`text-3xl font-bold ${stat.color}`}>
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stat.value.toLocaleString()}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-obsidian-400 uppercase tracking-wide mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="glass-card p-4 gold-border flex items-center gap-3 hover:bg-gold-500/5 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-obsidian-800 flex items-center justify-center shrink-0">
                  <action.icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <span className="text-sm font-medium text-obsidian-200 group-hover:text-obsidian-100">
                  {action.label}
                </span>
                <ArrowRight className="w-4 h-4 text-obsidian-600 ml-auto group-hover:text-gold-500 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Documents */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-obsidian-400 uppercase tracking-wide">
              Recent Documents
            </h2>
            <Link href="/upload" className="text-xs text-gold-500 hover:text-gold-400 flex items-center gap-1">
              Upload new <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <div className="glass-card p-10 text-center gold-border">
              <FileText className="w-10 h-10 text-obsidian-600 mx-auto mb-3" />
              <p className="text-obsidian-400 text-sm">No documents yet.</p>
              <Link href="/upload" className="btn-primary mt-4 inline-block px-6 py-2 text-sm">
                Upload your first document
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.slice(0, 6).map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-card px-4 py-3 flex items-center gap-4 gold-border hover:bg-obsidian-800/30 transition-all"
                >
                  <FileText className="w-5 h-5 text-gold-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-obsidian-200 truncate">{doc.name}</p>
                    <p className="text-xs text-obsidian-500 flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDate(doc.created_at)} · {formatBytes(doc.file_size)} · {doc.page_count} pages
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusBadge[doc.status]}`}
                  >
                    {doc.status}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
