"use client";

import { Scale, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationCard } from "./CitationCard";
import type { ChatMessage } from "@/types";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 animate-slide-up", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
          isUser
            ? "bg-obsidian-700 border border-obsidian-600"
            : "bg-gold-500/15 border border-gold-600/30"
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-obsidian-300" />
        ) : (
          <Scale className="w-4 h-4 text-gold-400" />
        )}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-obsidian-700 border border-obsidian-600 rounded-tr-sm"
              : "bg-obsidian-800/60 border border-obsidian-700/50 rounded-tl-sm"
          )}
        >
          {isUser ? (
            <p className="text-sm text-obsidian-100 whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="prose-legal text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-gold-400 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          )}
        </div>

        {/* Citations */}
        {!isUser && message.citations.length > 0 && (
          <CitationCard citations={message.citations} />
        )}
      </div>
    </div>
  );
}
