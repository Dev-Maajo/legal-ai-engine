"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadDocument } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FileState {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  documentId?: string;
}

interface DropZoneProps {
  onUploadComplete?: () => void;
}

export function DropZone({ onUploadComplete }: DropZoneProps) {
  const [files, setFiles] = useState<FileState[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: FileState[] = accepted.map((f) => ({
      file: f,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 50 * 1024 * 1024,
    onDropRejected: (rejections) => {
      rejections.forEach((r) => {
        const msg = r.errors[0]?.message || "File rejected";
        toast.error(`${r.file.name}: ${msg}`);
      });
    },
  });

  async function uploadAll() {
    const pending = files.filter((f) => f.status === "pending");
    if (!pending.length) return;

    for (const item of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.file === item.file ? { ...f, status: "uploading" } : f))
      );

      try {
        const res = await uploadDocument(item.file);
        setFiles((prev) =>
          prev.map((f) =>
            f.file === item.file
              ? { ...f, status: "success", documentId: res.document_id }
              : f
          )
        );
        toast.success(`${item.file.name} uploaded successfully`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setFiles((prev) =>
          prev.map((f) =>
            f.file === item.file ? { ...f, status: "error", error: msg } : f
          )
        );
        toast.error(`Failed to upload ${item.file.name}`);
      }
    }

    onUploadComplete?.();
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const hasPending = files.some((f) => f.status === "pending");

  return (
    <div className="space-y-4">
      {/* Drop area */}
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300",
          isDragActive
            ? "border-gold-500 bg-gold-500/5 scale-[1.01]"
            : "border-obsidian-700 hover:border-gold-600/50 hover:bg-obsidian-800/30"
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all",
              isDragActive ? "bg-gold-500/20" : "bg-obsidian-800"
            )}
          >
            <Upload
              className={cn(
                "w-7 h-7 transition-colors",
                isDragActive ? "text-gold-400" : "text-obsidian-500"
              )}
            />
          </div>

          {isDragActive ? (
            <p className="text-gold-400 font-medium">Drop your PDFs here</p>
          ) : (
            <>
              <p className="text-obsidian-200 font-medium">
                Drag & drop legal PDFs here
              </p>
              <p className="text-obsidian-500 text-sm">
                or <span className="text-gold-400 underline">click to browse</span>
              </p>
              <p className="text-obsidian-600 text-xs">PDF files only · Max 50 MB each</p>
            </>
          )}
        </div>
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card px-4 py-3 flex items-center gap-3"
          >
            <FileText className="w-5 h-5 text-gold-500 shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-obsidian-200 truncate">{item.file.name}</p>
              <p className="text-xs text-obsidian-500">{formatBytes(item.file.size)}</p>
              {item.error && (
                <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
              )}
            </div>

            {/* Status icon */}
            {item.status === "uploading" && (
              <Loader2 className="w-4 h-4 text-gold-400 animate-spin shrink-0" />
            )}
            {item.status === "success" && (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            {item.status === "error" && (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            {item.status === "pending" && (
              <button
                onClick={() => removeFile(i)}
                className="w-6 h-6 rounded-md hover:bg-obsidian-700 flex items-center justify-center text-obsidian-500 hover:text-obsidian-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Upload button */}
      {hasPending && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={uploadAll}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload {files.filter((f) => f.status === "pending").length} file
          {files.filter((f) => f.status === "pending").length > 1 ? "s" : ""}
        </motion.button>
      )}
    </div>
  );
}
