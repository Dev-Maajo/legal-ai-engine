"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Scale, FileText, MessageSquare, Search, Shield,
  Zap, ArrowRight, CheckCircle, Star, ChevronRight,
  BookOpen, Gavel, Building2,
} from "lucide-react";
import { useRef } from "react";

/* ── Data ──────────────────────────────────────────────────────────────────────── */

const stats = [
  { value: "10×",   label: "Faster Research"     },
  { value: "99%",   label: "Citation Accuracy"   },
  { value: "< 3s",  label: "Average Response"    },
  { value: "50MB",  label: "Max Document Size"   },
];

const features = [
  {
    icon: FileText,
    title: "Semantic PDF Ingestion",
    description: "Section-aware chunking preserves clause context. No more split contracts.",
    tag: "Ingestion",
  },
  {
    icon: MessageSquare,
    title: "Citation-Backed Chat",
    description: "Every factual claim is grounded to a source page. Hallucinations are structurally prevented.",
    tag: "RAG",
  },
  {
    icon: Search,
    title: "Multi-Query Semantic Search",
    description: "Groq auto-expands your query into legal synonyms to maximise recall across documents.",
    tag: "Search",
  },
  {
    icon: Zap,
    title: "Streaming Responses",
    description: "Tokens stream to your browser in real-time via SSE. No waiting for full generation.",
    tag: "Performance",
  },
  {
    icon: Shield,
    title: "Row-Level Security",
    description: "Your documents are isolated at the database level. Other users cannot access your data.",
    tag: "Security",
  },
  {
    icon: BookOpen,
    title: "AI Document Summaries",
    description: "Generate structured executive summaries with key points extracted in seconds.",
    tag: "Analysis",
  },
];

const steps = [
  {
    number: "01",
    title: "Upload your PDFs",
    description: "Drag and drop contracts, case files, or statutes. Supported up to 50 MB.",
  },
  {
    number: "02",
    title: "AI indexes everything",
    description: "Section-aware chunking + embeddings stored in ChromaDB. Ready in seconds.",
  },
  {
    number: "03",
    title: "Ask in plain English",
    description: "Ask anything. The RAG pipeline retrieves the most relevant clauses first.",
  },
  {
    number: "04",
    title: "Get cited answers",
    description: "Every sentence is backed by a source citation with page reference.",
  },
];

const useCases = [
  { icon: Gavel,     title: "Litigation",      desc: "Find precedents and case references instantly." },
  { icon: Building2, title: "Corporate Law",    desc: "Analyse contracts and due diligence documents." },
  { icon: Scale,     title: "Compliance",       desc: "Cross-reference regulations against internal policies." },
];

/* ── Animation variants ────────────────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};

/* ── Component ─────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <div className="min-h-screen bg-obsidian-950 text-obsidian-100 overflow-x-hidden">

      {/* ── Ambient blobs ──────────────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="glow-blob w-[600px] h-[600px] bg-gold-500/8 top-[-200px] left-[-100px]" />
        <div className="glow-blob w-[500px] h-[500px] bg-gold-600/6 bottom-[10%] right-[-150px]" />
        <div className="bg-grid absolute inset-0 opacity-100" />
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.05]"
        style={{ background: "rgba(7,7,14,0.85)", backdropFilter: "blur(16px)" }}>
        <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/20
                            flex items-center justify-center group-hover:bg-gold-500/25 transition-colors">
              <Scale className="w-4 h-4 text-gold-400" />
            </div>
            <span className="font-bold text-[15px] tracking-tight text-obsidian-100">
              Legal<span className="gradient-text-subtle">AI</span> Engine
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-1 text-sm text-obsidian-400">
            <a href="#features" className="btn-ghost py-1.5 text-xs">Features</a>
            <a href="#how" className="btn-ghost py-1.5 text-xs">How it works</a>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/login"  className="btn-ghost text-sm py-1.5 px-3 hidden sm:inline-flex">Sign in</Link>
            <Link href="/signup" className="btn-primary text-sm py-2 px-4">
              Get started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-36 pb-24 px-5 sm:px-8 overflow-hidden">
        <motion.div style={{ y: heroY }} className="max-w-5xl mx-auto text-center">

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 mb-7 px-3.5 py-1.5 rounded-full
                       border border-gold-500/25 bg-gold-500/8 text-xs font-medium text-gold-400
                       tracking-wide"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse-gold" />
            Powered by Llama 3.3 · LangChain RAG · ChromaDB
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.08] tracking-tight mb-6"
          >
            Legal research,{" "}
            <br className="hidden sm:block" />
            <span className="gradient-text">reimagined with AI</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-lg sm:text-xl text-obsidian-400 max-w-2xl mx-auto mb-10 leading-relaxed text-pretty"
          >
            Upload legal PDFs. Ask questions in plain English. Get citation-backed
            answers that reference the exact page and clause — in under 3 seconds.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link href="/signup" className="btn-primary px-7 py-3 text-[15px]">
              Start for free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login" className="btn-secondary px-7 py-3 text-[15px]">
              Sign in to dashboard
            </Link>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-10 flex items-center justify-center gap-2 text-xs text-obsidian-500"
          >
            <div className="flex -space-x-2">
              {["#fbbf24","#34d399","#60a5fa","#f472b6","#a78bfa"].map((c) => (
                <div key={c} className="w-6 h-6 rounded-full border-2 border-obsidian-950"
                     style={{ background: c }} />
              ))}
            </div>
            <span>Used by 500+ legal professionals</span>
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-gold-400 text-gold-400" />
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <section className="border-y border-white/[0.05] bg-white/[0.015] py-10 px-5 sm:px-8">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={fadeUp}>
              <div className="text-3xl font-bold gradient-text mb-1">{s.value}</div>
              <div className="text-xs text-obsidian-500 tracking-wide">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Features grid ──────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="section-label mb-3">Features</p>
            <h2 className="text-4xl font-bold mb-4">
              Everything for{" "}
              <span className="gradient-text">legal intelligence</span>
            </h2>
            <p className="text-obsidian-400 max-w-xl mx-auto text-pretty">
              Purpose-built for legal professionals — from ingestion to cited answers.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                className="glass-card-hover p-6 group cursor-default"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gold-500/10 border border-gold-500/15
                                  flex items-center justify-center shrink-0
                                  group-hover:bg-gold-500/20 transition-colors">
                    <f.icon className="w-5 h-5 text-gold-400" />
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-obsidian-800
                                   border border-obsidian-700 text-obsidian-500 tracking-wide">
                    {f.tag}
                  </span>
                </div>
                <h3 className="font-semibold text-obsidian-100 mb-2 text-[15px]">{f.title}</h3>
                <p className="text-sm text-obsidian-400 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how" className="py-24 px-5 sm:px-8 bg-white/[0.015] border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="section-label mb-3">How it works</p>
            <h2 className="text-4xl font-bold">
              From upload to answer{" "}
              <span className="gradient-text">in 4 steps</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-[calc(100%_-_12px)] w-[calc(100%_-_12px)] h-px
                                  bg-gradient-to-r from-gold-600/40 to-transparent z-10" />
                )}
                <div className="glass rounded-xl p-5 gold-border h-full">
                  <span className="text-2xl font-bold gradient-text block mb-3">{step.number}</span>
                  <h3 className="font-semibold text-obsidian-100 mb-2 text-[15px]">{step.title}</h3>
                  <p className="text-sm text-obsidian-400 leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ──────────────────────────────────────────────────────── */}
      <section className="py-24 px-5 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <p className="section-label mb-3">Use cases</p>
            <h2 className="text-4xl font-bold">Built for every{" "}
              <span className="gradient-text">legal practice</span>
            </h2>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {useCases.map((uc) => (
              <motion.div
                key={uc.title}
                variants={fadeUp}
                className="glass-card p-6 text-center gold-border group hover:bg-gold-500/[0.03] transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-gold-500/10 flex items-center justify-center mx-auto mb-4
                                group-hover:bg-gold-500/20 transition-colors">
                  <uc.icon className="w-6 h-6 text-gold-400" />
                </div>
                <h3 className="font-semibold text-obsidian-100 mb-1">{uc.title}</h3>
                <p className="text-sm text-obsidian-400">{uc.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="glass rounded-2xl p-10 sm:p-14 border border-gold-500/15 relative overflow-hidden">
            <div className="glow-blob w-[400px] h-[300px] bg-gold-500/10 top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            <p className="section-label mb-4">Get started</p>
            <h2 className="text-4xl font-bold mb-4 relative">
              Ready to research{" "}
              <span className="gradient-text">smarter?</span>
            </h2>
            <p className="text-obsidian-400 mb-8 relative">
              Join legal professionals who use AI to cut research time from hours to seconds.
            </p>
            <Link href="/signup" className="btn-primary px-9 py-3.5 text-base relative">
              Create your free account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="mt-6 flex items-center justify-center gap-5 text-xs text-obsidian-600 relative">
              {["No credit card required", "Free plan available", "Cancel anytime"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3 text-gold-600" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] py-8 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-obsidian-500">
            <Scale className="w-4 h-4 text-gold-500" />
            <span>LegalAI Engine</span>
            <span>·</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-obsidian-600">
            <span>Built with Llama 3.3 · LangChain · ChromaDB</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
