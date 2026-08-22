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
  Bot,
  Check,
  CheckCircle2,
  Database,
  Fingerprint,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";

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

        const data = (await response.json()) as {
          success?: boolean;
          reply?: string;
          evidenceCited?: string[];
          error?: string;
        };

        if (!response.ok) {
          setError(
            data.error || "The controller could not answer that question.",
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
    <div className="space-y-7">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#343a31] bg-[#10130f]">
                <MessageSquareText className="h-3.5 w-3.5 text-[#a2aa84]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#626960]">
                Intelligence / Finance Q&A
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
                Finance Controller
              </h1>

              <span className="inline-flex items-center gap-1.5 border border-[#3c4934] bg-[#10150f] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#a8b58c]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#98ac7d]" />
                Grounded
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#747a71]">
              Ask natural-language questions about the active reconciliation
              batch. Answers are constrained to verified batch evidence.
            </p>
          </div>

          {batchId ? (
            <div className="border border-[#30352f] bg-[#0e110e] px-3 py-2">
              <div className="text-[7px] font-medium uppercase tracking-[0.18em] text-[#62685f]">
                Active batch
              </div>

              <div className="mt-1 flex items-center gap-2">
                <Fingerprint className="h-3 w-3 text-[#6e7665]" />

                <span className="font-mono text-[9px] text-[#a5a99f]">
                  {batchId.slice(0, 18)}...
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Controller trust strip */}
      <section className="grid gap-px overflow-hidden border border-[#2a2e29] bg-[#2a2e29] md:grid-cols-3">
        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-[#9ca581]" />

            <span className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#666d63]">
              Source
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c5c4bc]">
            Verified batch records
          </div>

          <div className="mt-1 text-[9px] text-[#5e645b]">
            Answers cannot invent source data.
          </div>
        </div>

        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#9ca581]" />

            <span className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#666d63]">
              Safety boundary
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c5c4bc]">
            Evidence paths validated
          </div>

          <div className="mt-1 text-[9px] text-[#5e645b]">
            Unsupported claims are rejected.
          </div>
        </div>

        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#9ca581]" />

            <span className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#666d63]">
              Control principle
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c5c4bc]">
            AI explains. The engine decides.
          </div>

          <div className="mt-1 text-[9px] text-[#5e645b]">
            Financial truth remains deterministic.
          </div>
        </div>
      </section>

      {/* Suggested questions */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="border-b border-[#252a24] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                Controller shortcuts
              </div>

              <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                Start with a financial question
              </div>
            </div>

            <Search className="h-3.5 w-3.5 text-[#555c53]" />
          </div>
        </div>

        <div className="grid gap-px bg-[#252a24] md:grid-cols-2 xl:grid-cols-5">
          {SUGGESTED_QUESTIONS.map((question, index) => (
            <button
              key={question}
              type="button"
              disabled={sending || !batchId}
              onClick={() => handleSend(question)}
              className="group bg-[#0a0d0a] p-4 text-left transition hover:bg-[#10140f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[8px] text-[#50574e]">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <ArrowRight className="h-3.5 w-3.5 text-[#4e554c] transition-transform group-hover:translate-x-1 group-hover:text-[#949e7d]" />
              </div>

              <p className="mt-4 text-[10px] leading-5 text-[#9a9d95] transition group-hover:text-[#c9c8c1]">
                {question}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Conversation */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Controller session
            </div>

            <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
              Financial Q&A
            </div>
          </div>

          <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.14em] text-[#555c53]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8ea177]" />
            {messages.length} messages
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-[540px] overflow-y-auto bg-[#090c09]"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="max-w-lg text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center border border-[#343a31] bg-[#10130f]">
                  <Bot className="h-6 w-6 text-[#9ca681]" />
                </div>

                <div className="mt-5 text-[14px] font-semibold text-[#d8d6ce]">
                  Ask the controller about this batch
                </div>

                <p className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-[#656b62]">
                  The controller answers from validated reconciliation data,
                  cites the evidence it used, and falls back safely when a
                  grounded answer cannot be produced.
                </p>

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {[
                    "Grounded answers",
                    "Evidence cited",
                    "No financial writes",
                  ].map((item) => (
                    <span
                      key={item}
                      className="border border-[#2e352c] bg-[#0e120e] px-2.5 py-1.5 text-[7px] uppercase tracking-[0.14em] text-[#737a70]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-5">
              {messages.map((message) => {
                const assistant = message.role === "assistant";

                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      assistant
                        ? "max-w-[900px]"
                        : "ml-auto max-w-[760px] justify-end"
                    }`}
                  >
                    {assistant ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#414936] bg-[#11160f]">
                        <Bot className="h-3.5 w-3.5 text-[#a1ad87]" />
                      </div>
                    ) : null}

                    <div
                      className={`min-w-0 ${
                        assistant
                          ? "border border-[#292f28] bg-[#0e120e]"
                          : "border border-[#394132] bg-[#131811]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 border-b border-[#222720] px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {assistant ? (
                            <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#a8b28f]">
                              SettleMate Controller
                            </span>
                          ) : (
                            <>
                              <UserRound className="h-3 w-3 text-[#767d73]" />

                              <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#a5a89f]">
                                You
                              </span>
                            </>
                          )}
                        </div>

                        {assistant ? (
                          <span className="text-[7px] uppercase tracking-[0.13em] text-[#4f564d]">
                            Grounded response
                          </span>
                        ) : null}
                      </div>

                      <div className="px-4 py-4">
                        <p className="whitespace-pre-wrap text-[11px] leading-6 text-[#c3c3bb]">
                          {message.content}
                        </p>

                        {assistant &&
                        message.evidenceCited &&
                        message.evidenceCited.length > 0 ? (
                          <details className="mt-5 border-t border-[#222720] pt-3">
                            <summary className="flex cursor-pointer list-none items-center gap-2 text-[8px] font-medium uppercase tracking-[0.15em] text-[#8f9a79]">
                              <Database className="h-3 w-3" />
                              Evidence used
                            </summary>

                            <div className="mt-3 space-y-2">
                              {message.evidenceCited.map(
                                (evidence, index) => (
                                  <div
                                    key={`${evidence}-${index}`}
                                    className="flex items-start gap-2.5 border-b border-[#1d221d] pb-2 last:border-0"
                                  >
                                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#8ea077]" />

                                    <span className="break-all font-mono text-[8px] leading-5 text-[#737a71]">
                                      {evidence}
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>

                    {!assistant ? (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#363d31] bg-[#11150f]">
                        <UserRound className="h-3.5 w-3.5 text-[#8b9678]" />
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {sending ? (
                <div className="flex max-w-[900px] gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#414936] bg-[#11160f]">
                    <Bot className="h-3.5 w-3.5 text-[#a1ad87]" />
                  </div>

                  <div className="border border-[#292f28] bg-[#0e120e] px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9dab83]" />

                      <span className="text-[9px] uppercase tracking-[0.14em] text-[#737a70]">
                        Gathering verified evidence
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[#252a24] bg-[#0d100d] p-4">
          {error ? (
            <div className="mb-3 flex items-center justify-between gap-3 border border-[#513935] bg-[#160f0d] px-3 py-2.5">
              <span className="text-[9px] leading-5 text-[#b3786e]">
                {error}
              </span>

              <button
                type="button"
                onClick={() => setError(null)}
                className="text-[8px] uppercase tracking-[0.12em] text-[#74645e] hover:text-[#aaa19d]"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div
            className={`flex min-h-[50px] items-center border bg-[#090c09] transition ${
              inputQuery
                ? "border-[#697657]"
                : "border-[#30352f]"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <MessageSquareText className="h-4 w-4 text-[#626a5b]" />
            </div>

            <input
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSend();
                }
              }}
              disabled={sending || !batchId}
              placeholder="Ask about payments, settlements, exceptions..."
              className="min-w-0 flex-1 bg-transparent px-1 text-[11px] text-[#d2d1c9] outline-none placeholder:text-[#4f564d]"
            />

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !inputQuery.trim() || !batchId}
              className="mr-2 flex h-9 items-center gap-2 border border-[#4b533d] bg-[#151b11] px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#b3c08f] transition hover:bg-[#1a2115] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[8px] uppercase tracking-[0.14em] text-[#4e554c]">
            <span>Enter to send</span>

            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Grounded financial answers
            </span>
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
          <Loader2 className="h-5 w-5 animate-spin text-[#a5b47f]" />
        </div>
      }
    >
      <FinanceChatContent />
    </Suspense>
  );
}