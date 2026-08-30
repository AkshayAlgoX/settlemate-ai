"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Cpu,
  Check,
  CheckCircle2,
  Database,
  Loader2,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidenceCited?: string[];
}

const SUGGESTED_QUESTIONS = [
  "How much money is pending settlement in this batch?",
  "Which exceptions carry the most amount at risk, and what should I investigate first?",
  "How much Razorpay fee and GST was deducted in total?",
  "Are there any orphan bank credits with no matching payment?",
  "What is the reconciliation accuracy and how did each pass improve it?",
];

function createUniqueMsgId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 7)}`;
}

function FinanceChatContent() {
  const searchParams = useSearchParams();

  const [batchId, setBatchId] = useState<string | null>(
    searchParams.get("batchId"),
  );

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (batchId) return;

    let active = true;

    fetch("/api/batches")
      .then((res) => res.json())
      .then((data: { batches?: { id: string }[] }) => {
        if (!active) return;

        if (data.batches && data.batches.length > 0) {
          setBatchId(data.batches[0].id);
        }
      })
      .catch(() => {
        if (active) {
          setError("Unable to load an active reconciliation batch.");
        }
      });

    return () => {
      active = false;
    };
  }, [batchId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const handleSend = useCallback(
    async (queryText?: string) => {
      const text = (queryText ?? inputQuery).trim();

      if (!text || !batchId || sending) return;

      setError(null);

      const userMsg: ChatItem = {
        id: createUniqueMsgId("user"),
        role: "user",
        content: text,
      };

      setMessages((previous) => [...previous, userMsg]);

      if (!queryText) {
        setInputQuery("");
      }

      setSending(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batchId,
            message: text,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(
            apiErrorMessage(data, "The controller could not answer that question.")
          );
          return;
        }

        if (data.success && data.reply) {
          const botMsg: ChatItem = {
            id: createUniqueMsgId("assistant"),
            role: "assistant",
            content: data.reply,
            evidenceCited: data.evidenceCited || [],
          };

          setMessages((previous) => [...previous, botMsg]);
        } else {
          setError("No grounded answer was returned.");
        }
      } catch (requestError) {
        console.error(requestError);
        setError("Unable to reach the Finance Controller.");
      } finally {
        setSending(false);
      }
    },
    [batchId, inputQuery, sending],
  );

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Finance Intelligence"
        title="Finance controller terminal"
        description="Query natural-language metrics and root causes across the active reconciliation batch. Responses are strictly constrained to verified cryptographic evidence."
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="success">Grounded</Badge>
            {batchId ? <Badge variant="outline">{batchId.slice(0, 14)}...</Badge> : null}
          </div>
        }
      />

      {/* Controller Trust Strip */}
      <div className="grid gap-3 sm:grid-cols-3 text-xs">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span>Verified Source Context</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Answers cite deterministic database records and vouchers.</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span>Safety Boundary</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Zero hallucinated adjustments. Unsupported claims rejected.</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span>Advisory Invariant</span>
          </div>
          <p className="text-[11px] text-muted-foreground">AI provides analysis; mathematical ledger controls mutations.</p>
        </div>
      </div>

      {/* Suggested Questions */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-3">
        <SectionHeader
          title="Recommended queries"
          description="Click any prompt to run an instant grounded audit"
          className="border-b-0 pb-0"
        />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={sending || !batchId}
              onClick={() => handleSend(question)}
              className="group rounded-md border border-border bg-background p-3 text-left transition hover:border-[#444444] disabled:opacity-40"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground group-hover:text-foreground transition">
                  {question}
                </p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-foreground shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Conversation Thread */}
      <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <SectionHeader
            title="Investigation session"
            description="Cryptographically grounded exchange"
            className="border-b-0 pb-0"
          />

          <span className="text-xs font-mono text-muted-foreground/70">
            {messages.length} messages
          </span>
        </div>

        <div
          ref={scrollRef}
          className="h-[480px] overflow-y-auto bg-background p-5 space-y-4 text-xs"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center space-y-3 p-6">
              <Cpu className="h-8 w-8 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Ask the finance controller</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Query reconciliation metrics, fee breakdowns, orphan credits, or discrepancy root causes.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const assistant = message.role === "assistant";

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    assistant ? "max-w-2xl" : "ml-auto max-w-xl justify-end"
                  }`}
                >
                  {assistant && (
                    <div className="h-7 w-7 rounded border border-border bg-card flex items-center justify-center shrink-0">
                      <Cpu className="h-3.5 w-3.5 text-foreground" />
                    </div>
                  )}

                  <div
                    className={`rounded-lg border p-4 space-y-2 ${
                      assistant
                        ? "border-border bg-card text-foreground"
                        : "border-border bg-secondary text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground border-b border-border pb-1.5">
                      <span className="font-semibold text-foreground">
                        {assistant ? "SettleMate Controller" : "You"}
                      </span>
                      {assistant && <span className="text-[11px] text-muted-foreground/70">Grounded response</span>}
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>

                    {assistant && message.evidenceCited && message.evidenceCited.length > 0 && (
                      <div className="border-t border-border pt-2 space-y-1">
                        <span className="text-xs text-muted-foreground">Evidence cited:</span>
                        <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
                          {message.evidenceCited.map((ev, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <Check className="h-3 w-3 text-[#10b981] shrink-0" />
                              <span className="truncate">{ev}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {!assistant && (
                    <div className="h-7 w-7 rounded border border-border bg-secondary flex items-center justify-center shrink-0">
                      <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex gap-3 max-w-2xl">
              <div className="h-7 w-7 rounded border border-border bg-card flex items-center justify-center shrink-0">
                <Cpu className="h-3.5 w-3.5 text-foreground" />
              </div>
              <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                <span>Gathering verified batch evidence...</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-card p-4 space-y-2">
          {error && (
            <div className="flex items-center justify-between rounded border border-[#3b1818] bg-[#140a0a] px-3 py-1.5 text-xs text-[#ef4444]">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
                Dismiss
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
            <input
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSend();
                }
              }}
              disabled={sending || !batchId}
              placeholder="Ask about payments, settlements, exceptions, fees..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder-[#666666] focus:outline-none"
            />

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !inputQuery.trim() || !batchId}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-30 transition"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>Send</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-foreground" />
        </div>
      }
    >
      <FinanceChatContent />
    </Suspense>
  );
}