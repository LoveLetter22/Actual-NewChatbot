import { useState, useEffect, useCallback } from "react";
import { Menu, X } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import ChatSidebar, { type Conversation } from "@/components/ChatSidebar";
import { useSessionId } from "@/hooks/use-session-id";
import { deleteConversation, listConversations } from "@/lib/api";
import { toast } from "sonner";

export default function Index() {
  const sessionId = useSessionId();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await listConversations(sessionId);
        setConversations(data.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          created_at: conversation.created_at || conversation.createdAt || new Date().toISOString(),
          updated_at: conversation.updated_at || conversation.updatedAt || new Date().toISOString(),
        })));
      } catch {
        toast.error("Failed to load conversations");
      }
    })();
  }, [sessionId]);

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleNew = useCallback(() => {
    setActiveId(null);
    closeSidebarOnMobile();
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    closeSidebarOnMobile();
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteConversation(id, sessionId);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
      toast.success("Conversation deleted");
    } catch {
      toast.error("Failed to delete conversation");
    }
  }, [activeId, sessionId]);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleTitleUpdate = useCallback((id: string, title: string) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === id);
      if (exists) return prev;
      return [{ id, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev];
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] relative overflow-hidden">
      {/* Mobile/tablet toggle button */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle conversations sidebar"
        className="absolute top-3 left-3 z-40 lg:hidden p-2 rounded-lg bg-card border border-border hover:bg-secondary transition-colors shadow-sm"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Backdrop for mobile/tablet */}
      {sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          className="lg:hidden fixed inset-0 top-16 z-20 bg-black/40 backdrop-blur-[1px]"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:static top-16 lg:top-auto bottom-0 lg:bottom-auto left-0 z-30 lg:z-auto w-72 max-w-[85vw] lg:w-64 lg:max-w-none lg:h-full lg:shrink-0 transition-transform duration-200 ease-out`}
      >
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
        />
      </aside>

      {/* Chat area */}
      <main className="flex-1 min-w-0 w-full h-full lg:max-w-3xl lg:mx-auto">
        <ChatInterface
          conversationId={activeId}
          sessionId={sessionId}
          onConversationCreated={handleConversationCreated}
          onTitleUpdate={handleTitleUpdate}
        />
      </main>
    </div>
  );
}
