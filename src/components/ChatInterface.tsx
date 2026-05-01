import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Monitor, Loader2, ThumbsUp, ThumbsDown, Info, HelpCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { streamChat, type ChatMessage } from "@/lib/chat";
import { createConversation as createConversationRequest, listMessages, saveMessage as saveMessageRequest, submitFeedback, removeFeedback } from "@/lib/api";
import { toast } from "sonner";

const SUGGESTIONS = [
  "My Wi-Fi keeps disconnecting",
  "I forgot my password",
  "My printer won't print",
  "Computer is running slow",
  "I think I have a virus",
  "Can't open email attachments",
];

const EXPLANATIONS: { keyword: RegExp; label: string; explanation: string }[] = [
  { keyword: /\bIP address\b/i, label: "Why am I asking for your IP address?", explanation: "Your IP address helps identify your network and rule out connectivity issues. It is not used to track you personally." },
  { keyword: /\bMAC address\b/i, label: "Why am I asking for your MAC address?", explanation: "A MAC address uniquely identifies your network adapter. It helps diagnose hardware-level network problems." },
  { keyword: /\bDNS\b/i, label: "Why is DNS important?", explanation: "DNS translates website names into addresses your computer can reach. A bad DNS setting often causes 'page not loading' errors." },
  { keyword: /\bsafe mode\b/i, label: "Why use Safe Mode?", explanation: "Safe Mode starts your device with only essential drivers, helping isolate whether software is causing the issue." },
  { keyword: /\bevent viewer\b/i, label: "Why check Event Viewer?", explanation: "Event Viewer shows system logs that reveal hidden errors behind crashes, freezes, or boot issues." },
  { keyword: /\b(antivirus|defender|malware)\b/i, label: "Why run a security scan?", explanation: "Security scans detect malicious software that may be slowing your device, stealing data, or causing instability." },
  { keyword: /\bipconfig\b/i, label: "What does ipconfig do?", explanation: "The ipconfig command displays and refreshes your network settings to help fix connection problems." },
  { keyword: /\bflush DNS\b/i, label: "Why flush DNS?", explanation: "Flushing DNS clears outdated address records, which often resolves websites failing to load correctly." },
];

interface Props {
  conversationId: string | null;
  sessionId: string;
  onConversationCreated: (id: string) => void;
  onTitleUpdate: (id: string, title: string) => void;
}

type FeedbackState = Record<string, "up" | "down" | undefined>;

export default function ChatInterface({ conversationId, sessionId, onConversationCreated, onTitleUpdate }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const [openExplanation, setOpenExplanation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(conversationId);

  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); setFeedback({}); return; }
    (async () => {
      try {
        const data = await listMessages(conversationId, sessionId);
        setMessages(data);
        setFeedback({});
      } catch {
        toast.error("Failed to load messages");
      }
    })();
  }, [conversationId, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ensureConversation = useCallback(async (firstMessage: string): Promise<string> => {
    if (convIdRef.current) return convIdRef.current;
    const title = firstMessage.length > 40 ? firstMessage.slice(0, 40) + "…" : firstMessage;
    const data = await createConversationRequest(sessionId, title);
    convIdRef.current = data.id;
    onConversationCreated(data.id);
    onTitleUpdate(data.id, title);
    return data.id;
  }, [sessionId, onConversationCreated, onTitleUpdate]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userText = text.trim();
    const userMsg: ChatMessage = { role: "user", content: userText };
    const priorMessages = [...messages];

    setMessages((p) => [...p, userMsg, { role: "assistant", content: "Thinking…" }]);
    setInput("");
    setIsLoading(true);

    const dbPromise = (async () => {
      const convId = await ensureConversation(userText);
      await saveMessageRequest(convId, sessionId, "user", userText);
      return convId;
    })();

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const lastIndex = prev.length - 1;
        if (lastIndex >= 0 && prev[lastIndex]?.role === "assistant") {
          return prev.map((m, i) => (i === lastIndex ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...priorMessages, userMsg],
        onDelta: upsert,
        onDone: async () => {
          setIsLoading(false);
          try {
            const convId = await dbPromise;
            if (convId && assistantSoFar) {
              const saved = await saveMessageRequest(convId, sessionId, "assistant", assistantSoFar);
              if (saved && saved.id) {
                setMessages((prev) => {
                  const lastIndex = prev.length - 1;
                  if (lastIndex >= 0 && prev[lastIndex]?.role === "assistant") {
                    return prev.map((m, i) => (i === lastIndex ? { ...m, id: saved.id } : m));
                  }
                  return prev;
                });
              }
            }
          } catch {
          }
        },
        onError: (msg) => {
          toast.error(msg);
          setIsLoading(false);
          dbPromise.catch(() => {});
        },
      });
    } catch {
      toast.error("Something went wrong. Please try again.");
      setIsLoading(false);
      dbPromise.catch(() => {});
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const setMessageFeedback = async (messageId: string | undefined, kind: "up" | "down") => {
    if (!messageId) {
      toast.error("Please wait for the message to finish saving.");
      return;
    }
    const current = feedback[messageId];
    const isToggleOff = current === kind;
    setFeedback((prev) => {
      const next = { ...prev };
      if (isToggleOff) delete next[messageId];
      else next[messageId] = kind;
      return next;
    });
    try {
      if (isToggleOff) {
        await removeFeedback(messageId, sessionId);
        toast("Feedback removed");
      } else {
        await submitFeedback(messageId, sessionId, kind);
        toast.success(kind === "up" ? "Thanks for the positive feedback!" : "Thanks — we'll use this to improve.");
      }
    } catch {
      setFeedback((prev) => {
        const next = { ...prev };
        if (current === undefined) delete next[messageId];
        else next[messageId] = current;
        return next;
      });
      toast.error("Could not save your feedback. Please try again.");
    }
  };

  const detectExplanations = (content: string) => {
    return EXPLANATIONS.filter((e) => e.keyword.test(content));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Chat conversation"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-full space-y-8 text-center px-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center" aria-hidden="true">
                <Monitor className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-card-foreground">IT Help Desk</h2>
                <p className="text-sm text-muted-foreground">How can I help you today?</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  aria-label={`Start a chat about: ${s}`}
                  className="text-left text-sm px-4 py-3 rounded-lg border border-border bg-card text-card-foreground hover:bg-secondary transition-colors duration-200 break-words focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          const isThinking = isAssistant && (msg.content === "Thinking…" || msg.content === "");
          const explanations = isAssistant && !isThinking ? detectExplanations(msg.content) : [];
          const fb = msg.id ? feedback[msg.id] : undefined;
          return (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[85%] sm:max-w-[80%] gap-1.5`}>
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border text-card-foreground rounded-bl-md meta-shadow-sm"
                  }`}
                  role={isAssistant ? "article" : undefined}
                  aria-label={isAssistant ? "Assistant response" : undefined}
                >
                  {isAssistant ? (
                    <div className="prose prose-sm max-w-none prose-headings:text-card-foreground prose-p:text-card-foreground prose-li:text-card-foreground prose-strong:text-card-foreground">
                      {isThinking ? (
                        <div className="flex items-center gap-2 py-1" aria-label="Assistant is typing">
                          <span className="flex gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
                            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
                          </span>
                          <span className="text-xs text-muted-foreground">Searching knowledge base…</span>
                        </div>
                      ) : (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {/* Explainability + Feedback row (assistant only, after streaming) */}
                {isAssistant && !isThinking && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    {explanations.map((exp) => {
                      const key = `${i}-${exp.label}`;
                      const isOpen = openExplanation === key;
                      return (
                        <div key={key} className="relative">
                          <button
                            onClick={() => setOpenExplanation(isOpen ? null : key)}
                            aria-expanded={isOpen}
                            aria-label={exp.label}
                            className="flex items-center gap-1 text-xs text-primary hover:text-[hsl(var(--meta-blue-hover))] px-2 py-1 rounded-md hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{exp.label}</span>
                            <span className="sm:hidden">Why?</span>
                          </button>
                          {isOpen && (
                            <div
                              role="dialog"
                              aria-label={exp.label}
                              className="absolute left-0 mt-1 z-30 w-64 sm:w-72 p-3 rounded-lg bg-popover text-popover-foreground border border-border shadow-lg text-xs leading-relaxed"
                            >
                              <p className="font-semibold mb-1 text-card-foreground">{exp.label}</p>
                              <p className="text-muted-foreground">{exp.explanation}</p>
                              <button
                                onClick={() => setOpenExplanation(null)}
                                className="mt-2 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
                              >
                                Close
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => setMessageFeedback(msg.id, "up")}
                        disabled={!msg.id}
                        aria-label={fb === "up" ? "Remove positive feedback" : "Mark this response as helpful"}
                        aria-pressed={fb === "up"}
                        className={`p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
                          fb === "up"
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-primary hover:bg-secondary"
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setMessageFeedback(msg.id, "down")}
                        disabled={!msg.id}
                        aria-label={fb === "down" ? "Remove negative feedback" : "Mark this response as not helpful"}
                        aria-pressed={fb === "down"}
                        className={`p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
                          fb === "down"
                            ? "bg-destructive/10 text-destructive"
                            : "text-muted-foreground hover:text-destructive hover:bg-secondary"
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-3 sm:px-4 py-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 max-w-3xl mx-auto">
          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your IT issue..."
              rows={1}
              aria-label="Chat message input"
              className="w-full resize-none rounded-xl border border-border bg-card pl-4 pr-10 py-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow min-h-12"
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary cursor-help"
              title="Tip: Be specific about your device, software, and any error messages you see."
              aria-label="Tip: Be specific about your device, software, and any error messages you see."
            >
              <HelpCircle className="w-4 h-4" />
            </span>
          </div>
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="meta-pill bg-primary text-primary-foreground hover:bg-[hsl(var(--meta-blue-hover))] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
