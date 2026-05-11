"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bell, User } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || "");
    });
  }, []);

  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : "U";

  return (
    <header className="h-16 border-b border-obsidian-800/50 px-6 flex items-center justify-between bg-obsidian-950/60 backdrop-blur-sm">
      <div>
        <h1 className="text-lg font-semibold text-obsidian-100">{title}</h1>
        {subtitle && <p className="text-xs text-obsidian-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-lg bg-obsidian-800/50 border border-obsidian-700/50 flex items-center justify-center hover:border-gold-600/30 transition-colors">
          <Bell className="w-4 h-4 text-obsidian-400" />
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-obsidian-800/50 border border-obsidian-700/50">
          <div className="w-6 h-6 rounded-full bg-gold-500/20 border border-gold-600/30 flex items-center justify-center">
            <span className="text-xs font-bold text-gold-400">{initials}</span>
          </div>
          <span className="text-xs text-obsidian-400 hidden sm:block max-w-[140px] truncate">
            {userEmail}
          </span>
        </div>
      </div>
    </header>
  );
}
