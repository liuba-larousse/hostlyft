"use client";

import { useState } from "react";
import { Mail, Loader2, Check, AlertCircle } from "lucide-react";

type State = "idle" | "sending" | "sent" | "error";

export default function SendTasksEmailButton() {
  const [state, setState] = useState<State>("idle");
  const [info, setInfo] = useState("");

  async function handleSend() {
    if (state === "sending") return;
    setState("sending");
    setInfo("");
    try {
      const res = await fetch("/api/email/daily-tasks", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setInfo(data.error ?? "Failed to send");
      } else {
        setState("sent");
        setInfo(`Sent to ${data.recipients} team member${data.recipients !== 1 ? "s" : ""}`);
      }
    } catch {
      setState("error");
      setInfo("Network error");
    } finally {
      setTimeout(() => {
        setState("idle");
        setInfo("");
      }, 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSend}
        disabled={state === "sending"}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors
          bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "sending" ? (
          <Loader2 size={14} className="animate-spin" strokeWidth={2} />
        ) : state === "sent" ? (
          <Check size={14} strokeWidth={2.5} />
        ) : (
          <Mail size={14} strokeWidth={2} />
        )}
        {state === "sending" ? "Sending…" : state === "sent" ? "Sent!" : "Send Task Digest"}
      </button>
      {info && (
        <span className={`text-xs flex items-center gap-1 ${state === "error" ? "text-red-500" : "text-gray-500"}`}>
          {state === "error" && <AlertCircle size={12} />}
          {info}
        </span>
      )}
    </div>
  );
}
