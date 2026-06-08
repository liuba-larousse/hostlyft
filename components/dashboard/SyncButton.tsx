"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { clsx } from "clsx";

type State = "idle" | "loading" | "success" | "error";

export default function SyncButton() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSync() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/pricelabs/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const results = data.results as
          | Array<{ status: string; clientName: string; reservations?: number; reason?: string }>
          | undefined;
        const synced = results?.filter(r => r.status === "synced") ?? [];
        const failed = results?.filter(r => r.status === "error") ?? [];
        const skipped = results?.filter(r => r.status === "skipped") ?? [];
        const total = results?.length ?? 0;
        const totalReservations = synced.reduce((sum, r) => sum + (r.reservations ?? 0), 0);
        if (failed.length === 0) {
          setState("success");
          const skipNote = skipped.length ? ` · ${skipped.length} no key` : "";
          setMessage(total ? `${synced.length}/${total} synced · ${totalReservations} reservations${skipNote}` : "Sync complete");
          router.refresh(); // re-fetch server component data
        } else {
          setState("error");
          setMessage(`${synced.length}/${total} synced — ${failed[0]?.clientName}: ${failed[0]?.reason ?? "error"}`);
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
