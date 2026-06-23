"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, User, X } from "lucide-react";
import { sendChat } from "@/lib/api";

interface AIChatProps {
  cityKey: string;
  cityName: string;
}

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
}

export default function AIChat({ cityKey, cityName }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "ai",
      text: `Hello! I'm the UHM-IP AI Assistant for ${cityName}. Ask me about LST hotspots, SHAP drivers, ROI, or intervention scenarios.`,
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);

  /* scroll to latest message */
  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  /* reset conversation when city changes */
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "ai",
        text: `Hello! I'm the UHM-IP AI Assistant for ${cityName}. Ask me about LST hotspots, SHAP drivers, ROI, or intervention scenarios.`,
      },
    ]);
  }, [cityKey, cityName]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: "user", text },
    ]);
    setLoading(true);

    try {
      const { reply } = await sendChat(cityKey, text);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, sender: "ai", text: reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "ai",
          text: "Backend unavailable. Make sure the API is running: uvicorn backend.app.main:app --reload --port 8000",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /* ── Floating button ──────────────────────────────────────────────────── */
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open AI chat"
        className="fixed bottom-6 right-6 z-[9999] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/30 transition-transform hover:scale-105"
      >
        <Sparkles size={20} />
      </button>
    );
  }

  /* ── Chat window ──────────────────────────────────────────────────────── */
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex w-80 sm:w-96 h-[500px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#111827] shadow-2xl">

      {/* header */}
      <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-900/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-violet-400" />
          <div>
            <p className="text-sm font-semibold text-white">UHM-IP Contextual AI</p>
            <p className="text-[10px] text-slate-400">RAG-Powered Analytics Agent</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded p-1 text-slate-400 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow ${msg.sender === "user"
                  ? "rounded-tr-sm bg-violet-600/40 text-white border border-violet-500/30"
                  : "rounded-tl-sm bg-slate-800 text-slate-200 border border-slate-700"
                }`}
            >
              {/* sender label */}
              <div className="mb-1 flex items-center gap-1.5 opacity-60">
                {msg.sender === "user"
                  ? <User size={11} />
                  : <Bot size={11} className="text-violet-400" />}
                <span className="text-[10px] font-semibold uppercase">
                  {msg.sender === "user" ? "You" : "AI Assistant"}
                </span>
              </div>
              <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-tl-sm border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-400">
              <span className="inline-flex gap-1">
                <span className="animate-bounce [animation-delay:-0.3s]">·</span>
                <span className="animate-bounce [animation-delay:-0.15s]">·</span>
                <span className="animate-bounce">·</span>
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="border-t border-slate-700/60 bg-slate-900/60 p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about LST, ROI, interventions…"
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-violet-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="rounded-lg bg-violet-600 p-2 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
