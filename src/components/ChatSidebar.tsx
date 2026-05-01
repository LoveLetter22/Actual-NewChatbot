import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function ChatSidebar({ conversations, activeId, onSelect, onNew, onDelete }: ChatSidebarProps) {
  return (
    <aside className="w-full h-full border-r border-border bg-sidebar-background flex flex-col shadow-lg lg:shadow-none">
      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full meta-pill bg-primary text-primary-foreground hover:bg-[hsl(var(--meta-blue-hover))] flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8 px-4">
            No conversations yet. Start a new chat!
          </p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-150 text-sm",
              activeId === conv.id
                ? "bg-secondary text-card-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-card-foreground"
            )}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1">{conv.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
