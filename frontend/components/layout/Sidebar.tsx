"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Scale,
  LayoutDashboard,
  Upload,
  MessageSquare,
  Search,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/upload", icon: Upload, label: "Upload Docs" },
  { href: "/chat", icon: MessageSquare, label: "AI Chat" },
  { href: "/search", icon: Search, label: "Search" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/login");
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-obsidian-900/90 border-r border-obsidian-800/50 backdrop-blur-sm transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-obsidian-800/50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center shrink-0">
          <Scale className="w-4 h-4 text-gold-500" />
        </div>
        {!collapsed && (
          <span className="font-bold text-gold-400 truncate">LegalAI Engine</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                active
                  ? "bg-gold-500/10 text-gold-400 border border-gold-600/20"
                  : "text-obsidian-400 hover:text-obsidian-200 hover:bg-obsidian-800/60"
              )}
            >
              <Icon className={cn("w-5 h-5 shrink-0", active ? "text-gold-500" : "")} />
              {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-obsidian-800/50">
        <button
          onClick={handleSignOut}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-obsidian-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          )}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-obsidian-800 border border-obsidian-700 flex items-center justify-center hover:border-gold-600/50 transition-colors z-10"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-obsidian-400" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-obsidian-400" />
        )}
      </button>
    </aside>
  );
}
