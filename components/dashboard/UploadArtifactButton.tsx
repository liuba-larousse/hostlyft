"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import { clsx } from "clsx";

export default function UploadArtifactButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [modal, setModal] = useState<{ file: File; title: string } | null>(null);
  const [error, setError] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const title = file.name.replace(/\.(html|htm)$/i, "");
    setModal({ file, title });
    setError("");
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function handleUpload() {
    if (!modal) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", modal.file);
      fd.append("title", modal.title);
      const res = await fetch("/api/artifacts", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      setModal(null);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".html,.htm"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 px-5 py-2.5 bg-yellow-400 text-gray-900 rounded-xl text-base font-semibold hover:bg-yellow-300 transition-colors"
      >
        <Plus size={16} strokeWidth={2} />
        Upload
      </button>

      {/* Confirm modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900 text-base">Upload HTML Artifact</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={modal.title}
                  onChange={e => setModal(m => m ? { ...m, title: e.target.value } : m)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <span className="text-orange-500 text-xs font-bold">HTML</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{modal.file.name}</p>
                  <p className="text-xs text-gray-400">{(modal.file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleUpload}
                disabled={uploading || !modal.title.trim()}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors",
                  uploading || !modal.title.trim()
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
                )}
              >
                {uploading && <Loader2 size={14} className="animate-spin" strokeWidth={2} />}
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
