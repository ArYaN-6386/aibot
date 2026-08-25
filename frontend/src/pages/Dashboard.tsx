import { createClient } from "../lib/client";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import type { User } from "@supabase/supabase-js";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { Send, Menu, MessageSquare, LogOut, Loader2, Plus } from "lucide-react";

const supabase = createClient();

type Message = {
  id?: number;
  content: string;
  role: "user" | "assistant";
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
};

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeMessages = activeConversation?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    async function fetchConversations() {
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      try {
        const res = await axios.get(`${BACKEND_URL}/conversations`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        setConversations(res.data);
        if (res.data.length > 0) {
          setActiveConversationId(res.data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch conversations:", err);
      }
    }
    fetchConversations();
  }, [user]);

  const handleSendMessage = async () => {
    if (!input.trim() || !user) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const query = input;
    setInput("");
    setLoading(true);

    // Optimistic UI Update
    const userMessage: Message = { content: query, role: "user" };
    let tempConvoId = activeConversationId;
    
    if (!tempConvoId) {
      tempConvoId = "temp-" + Date.now();
      setConversations(prev => [{ id: tempConvoId!, title: query.substring(0, 30), messages: [userMessage] }, ...prev]);
      setActiveConversationId(tempConvoId);
    } else {
      setConversations(prev => prev.map(c => 
        c.id === tempConvoId ? { ...c, messages: [...c.messages, userMessage] } : c
      ));
    }

    try {
      const response = await fetch(`${BACKEND_URL}/conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query, conversationID: activeConversationId }),
      });

      if (!response.ok) {
        let errMsg = "Unknown error";
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || response.statusText;
        } catch {
          errMsg = response.statusText;
        }
        alert("Backend Error: " + errMsg);
        throw new Error("Server Error: " + errMsg);
      }
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = "";
      let actualConvoId = tempConvoId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const parts = chunk.split('\n\n').filter(Boolean);
        
        for (const part of parts) {
          try {
            const data = JSON.parse(part);
            if (data.type === "conversation_id") {
              actualConvoId = data.conversationID;
              if (tempConvoId.startsWith("temp-")) {
                setConversations(prev => prev.map(c => 
                  c.id === tempConvoId ? { ...c, id: actualConvoId } : c
                ));
                setActiveConversationId(actualConvoId);
              }
            } else if (data.type === "text") {
              assistantMsg += data.content;
              setConversations(prev => prev.map(c => {
                if (c.id === actualConvoId) {
                  const hasAssistantMsg = c.messages.some(m => m.role === "assistant" && m === c.messages[c.messages.length - 1]);
                  if (hasAssistantMsg) {
                    const newMsgs = [...c.messages];
                    newMsgs[newMsgs.length - 1] = { content: assistantMsg, role: "assistant" };
                    return { ...c, messages: newMsgs };
                  } else {
                    return { ...c, messages: [...c.messages, { content: assistantMsg, role: "assistant" }] };
                  }
                }
                return c;
              }));
            }
          } catch (e) {
            // Ignore parse errors from partial JSON
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white"><Loader2 className="animate-spin w-8 h-8"/></div>;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? "w-72" : "w-0"} transition-all duration-300 ease-in-out bg-neutral-900 flex flex-col border-r border-neutral-800`}>
        <div className="p-4 flex items-center justify-between border-b border-neutral-800">
          <h2 className="font-semibold text-lg bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">AIBot</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1 hover:bg-neutral-800 rounded-md">
            <Menu className="w-5 h-5 text-neutral-400" />
          </button>
        </div>
        
        <div className="p-3">
          <button 
            onClick={() => setActiveConversationId(null)}
            className="w-full flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md px-3 py-2.5 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider px-2">Recent</p>
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConversationId(conv.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                activeConversationId === conv.id ? "bg-neutral-800 text-indigo-300" : "hover:bg-neutral-800 text-neutral-400"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-sm">
            {user.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 truncate text-sm">
            <p className="font-medium truncate">{user.email}</p>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 transition-colors" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-neutral-950 relative">
        <header className="h-14 flex items-center gap-3 px-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="p-1.5 hover:bg-neutral-800 rounded-md transition-colors text-neutral-400">
              <Menu className="w-5 h-5" />
            </button>
          )}
          <h1 className="font-medium text-neutral-200">
            {activeConversation ? activeConversation.title : "New Chat"}
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center border border-neutral-800 shadow-xl">
                <MessageSquare className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-semibold text-neutral-200">How can I help you today?</h2>
              <p className="text-neutral-500 text-sm">Ask anything. I can search the web, analyze data, and assist you with your tasks.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {activeMessages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-neutral-800" : "bg-indigo-600"}`}>
                    {msg.role === "user" ? user.email?.charAt(0).toUpperCase() : "AI"}
                  </div>
                  <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                    msg.role === "user" 
                      ? "bg-neutral-800 text-neutral-100 rounded-tr-sm" 
                      : "bg-transparent border border-neutral-800 text-neutral-300 rounded-tl-sm shadow-sm"
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{msg.content}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gradient-to-t from-neutral-950 via-neutral-950 to-transparent pb-6">
          <div className="max-w-4xl mx-auto relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Message AIBot..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-4 pr-12 py-4 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none max-h-[200px] text-[15px] placeholder:text-neutral-500 transition-all shadow-md"
              rows={1}
              style={{ minHeight: "60px" }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || loading}
              className="absolute right-2 bottom-2.5 p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors shadow-sm"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <div className="text-center mt-3 flex items-center justify-center gap-4 text-xs text-neutral-500">
            <span>Press <kbd className="font-mono bg-neutral-800 px-1 py-0.5 rounded text-neutral-400">Enter</kbd> to send</span>
            <span>AI can make mistakes. Verify important info.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
