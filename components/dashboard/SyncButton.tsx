"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { clsx } from "clsx";

type State = "idle" | "loading" | "success" | "error";

export default function SyncButton() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/pricelabs/daily-report");
      const data = await res.json();
      if (res.ok || res.status === 207) {
        const results = data.results as Array<{ status: string; clientName: string; error?: string }> | undefined;
        const ok = results?.filter(r => r.status === "ok").length ?? 0;
        const total = results?.length ?? 0;
        const failed = results?.filter(r => r.status === "error") ?? [];
        if (ok === total) {
          setState("success");
          setMessage(total ? `${ok}/${total} clients synced` : "Sync complete");
        } else {
          setState("error");
          const firstError = failed[0]?.error ?? "Unknown error";
          setMessage(`${ok}/${total} synced — ${failed[0]?.clientName}: ${firstError}`);
        }
      } else {
        setState("error");
        setMessage(data.error ?? "Sync failed");
      }
    } catch {
      setState("error");
      setMessage("Network error");
    }
    setTimeout(() => setState("idle"), 15000);
  }

  return (
    <div className="flex items-center gap-3">
      {state === "success" && (
        <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
          <CheckCircle size={14} strokeWidth={2} />
          {message}
        </div>
      )}
      {state === "error" && (
        <div className="flex items-center gap-1.5 text-red-500 text-sm font-medium">
          <XCircle size={14} strokeWidth={2} />
          {message}
        </div>
      )}
      <button
        onClick={handleSync}
        disabled={state === "loading"}
        className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
          state === "loading"
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-yellow-400 text-gray-900 hover:bg-yellow-300"
        )}
      >
        <RefreshCw
          size={14}
          strokeWidth={2}
          className={clsx(state === "loading" && "animate-spin")}
        />
        {state === "loading" ? "Syncing…" : "Sync Now"}
      </button>
    </div>
  );
}
