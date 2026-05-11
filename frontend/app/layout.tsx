import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LegalAI Engine — AI-Powered Legal Research",
    template: "%s | LegalAI Engine",
  },
  description:
    "Upload legal PDFs, ask questions in plain English, and get citation-backed answers powered by Llama 3 AI. Research law 10× faster.",
  keywords: ["legal research", "AI", "document analysis", "legal tech", "RAG", "contract analysis"],
  openGraph: {
    title: "LegalAI Engine",
    description: "AI-powered legal research with citation-backed answers",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07070e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-obsidian-950`}>
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          gap={8}
          toastOptions={{
            duration: 4000,
            style: {
              background:  "#13131f",
              border:      "1px solid rgba(201,146,26,0.2)",
              color:       "#e8e8ed",
              borderRadius: "12px",
              fontSize:    "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
