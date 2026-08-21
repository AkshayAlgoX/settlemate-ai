"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Bot,
  User,
  Send,
  Loader2,
  Sparkles,
  HelpCircle,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: string | null;
  latencyMs?: number;
}

const SUGGESTED_QUESTIONS = [
  "How much money is pending settlement in this batch?",
  "What are the top exceptions by amount at risk?",
  "How much Razorpay fee and GST was deducted?",
  "What is the overall reconciliation accuracy and throughput?",
];

// Pure ID generator placed outside component scope to satisfy React purity linter
function createUniqueMsgId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function FinanceChatContent() {
  const searchParams = useSearchParams();
  const [batchId, setBatchId] = useState<string | null>(searchParams.get("batchId"));
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!batchId) {
      fetch("/api/batches")
        .then((res) => res.json())
        .then((data: { batches?: { id: string }[] }) => {
          if (data.batches && data.batches.length > 0) {
            setBatchId(data.batches[0].id);
          }
        })
        .catch(console.error);
    }
  }, [batchId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSend = async (queryText?: string) => {
    const text = queryText || inputQuery;
    if (!text.trim() || !batchId || sending) return;

    const userMsg: ChatItem = {
      id: createUniqueMsgId("user"),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInputQuery("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, message: text }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        reply?: string;
        evidence?: unknown;
        latencyMs?: number;
      };

      if (data.success && data.reply) {
        const botMsg: ChatItem = {
          id: createUniqueMsgId("bot"),
          role: "assistant",
          content: data.reply,
          evidence: data.evidence ? JSON.stringify(data.evidence) : null,
          latencyMs: data.latencyMs,
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-400" />
            Finance Q&A Assistant
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Ask natural language questions grounded in batch data. Always cites specific record evidence.
          </p>
        </div>
        {batchId && (
          <Badge variant="outline" className="border-gray-700 text-gray-400">
            Batch: {batchId.slice(0, 14)}...
          </Badge>
        )}
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-blue-400" /> Suggested Queries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                onClick={() => handleSend(q)}
                disabled={sending || !batchId}
                className="border-gray-800 bg-gray-950 text-xs text-gray-300 hover:text-white hover:bg-gray-800 h-7"
              >
                <Sparkles className="w-3 h-3 text-purple-400 mr-1.5" />
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800 flex flex-col h-[520px]">
        <CardContent className="p-4 flex-1 overflow-y-auto space-y-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
              <Bot className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-sm font-medium text-gray-300">Ask a question about this batch</p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                The Q&A assistant queries the database directly to provide accurate, grounded financial answers.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 text-xs ${
                  m.role === "assistant" ? "bg-gray-950/80 p-3 rounded-lg border border-gray-800" : "pl-8"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {m.role === "assistant" ? (
                    <div className="w-6 h-6 rounded bg-purple-600/20 flex items-center justify-center border border-purple-500/30">
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                      <User className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-300 capitalize">
                      {m.role === "assistant" ? "SettleMate Assistant" : "You"}
                    </span>
                    {m.latencyMs ? (
                      <span className="text-[10px] text-gray-500">{m.latencyMs}ms</span>
                    ) : null}
                  </div>
                  <p className="text-gray-200 leading-relaxed font-sans">{m.content}</p>

                  {m.evidence && (
                    <details className="mt-2 pt-1 border-t border-gray-800 text-[11px] text-gray-400">
                      <summary className="cursor-pointer text-blue-400 hover:underline flex items-center gap-1">
                        <Database className="w-3 h-3" /> View Grounded Context Data
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-900 rounded font-mono text-[10px] text-gray-300 overflow-x-auto">
                        {m.evidence}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-purple-400 bg-gray-950 p-3 rounded-lg border border-gray-800">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Querying database & generating grounded answer...</span>
            </div>
          )}
        </CardContent>

        <div className="p-3 border-t border-gray-800 bg-gray-950/50 flex gap-2">
          <Input
            placeholder="Ask a question about payments, settlements, or exceptions..."
            value={inputQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputQuery(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleSend()}
            disabled={sending || !batchId}
            className="bg-gray-800 border-gray-700 text-xs text-gray-200 h-9"
          />
          <Button
            onClick={() => handleSend()}
            disabled={sending || !inputQuery.trim() || !batchId}
            className="bg-blue-600 hover:bg-blue-700 text-xs h-9 px-4"
          >
            <Send className="w-3.5 h-3.5 mr-1" /> Send
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading chat...</div>}>
      <FinanceChatContent />
    </Suspense>
  );
}