"use client";

import { useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { sendChat } from "@/lib/api";

interface AIChatProps {
  cityKey: string;
  cityName: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
}

export default function AIChat({ cityKey, cityName }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: `Hello! I'm the UrbanCool RAG-powered analytics agent for ${cityName}. Ask about LST hotspots, SHAP drivers, ROI, or intervention scenarios.`,
    },
  ]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const { reply } = await sendChat(cityKey, text);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Backend unavailable. Start API: uvicorn backend.app.main:app --reload" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[2000] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/30 hover:scale-105"
        aria-label="Open AI chat"
      >
        <Sparkles size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex w-80 flex-col overflow-hidden rounded-xl border border-slate-600 bg-[#1a2030] shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <MessageCircle size={16} className="text-cyan-400" />
          UHM-IP Contextual AI
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 px-3 pt-1">RAG-Powered Analytics Agent</div>

      <div className="flex max-h-64 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-2.5 py-2 text-xs leading-relaxed ${
              m.role === "user" ? "ml-6 bg-cyan-500/20 text-cyan-100" : "mr-4 bg-slate-700/60 text-slate-200"
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && <div className="text-xs text-slate-500">Thinking…</div>}
      </div>

      <div className="flex gap-2 border-t border-slate-700 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ask about LST, ROI, interventions…"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="rounded-lg bg-cyan-500 p-2 text-slate-900 hover:bg-cyan-400 disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
