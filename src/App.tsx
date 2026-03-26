/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";

// Puter.js is loaded globally via <script> in index.html
declare const puter: any;
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Github,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Types
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// Types
export default function App() {
  // State
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("gemini_chat_sessions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
    const initialSession: ChatSession = {
      id: "default",
      title: "New Chat",
      messages: [],
      createdAt: new Date()
    };
    return [initialSession];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string>("default");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

  // Persistence
  useEffect(() => {
    localStorage.setItem("gemini_chat_sessions", JSON.stringify(sessions));
  }, [sessions]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSession.messages, isLoading, streamingContent]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    };

    const updatedSessions = sessions.map(s => {
      if (s.id === currentSessionId) {
        const newTitle = s.messages.length === 0 ? input.trim().slice(0, 30) + (input.length > 30 ? "..." : "") : s.title;
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, userMessage]
        };
      }
      return s;
    });

    setSessions(updatedSessions);
    setInput("");
    setIsLoading(true);

    const makeRequest = async (): Promise<string> => {
      const currentMessages = updatedSessions.find(s => s.id === currentSessionId)?.messages || [];

      // Build conversation history for Puter
      const systemPrompt = "You are Ashish's Assistant, a helpful, creative, and intelligent AI assistant. You provide clear, concise, and accurate information. You use markdown for formatting when appropriate.";

      const history = currentMessages.slice(0, -1).map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

      const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage.content },
      ];

      setStreamingContent("⏳ Thinking...");

      const response = await puter.ai.chat(messages, { model: "gpt-4o-mini" });

      setStreamingContent("");

      // Parse response — puter returns different shapes depending on model
      const text =
        typeof response === "string"
          ? response
          : response?.message?.content
          ?? response?.choices?.[0]?.message?.content
          ?? response?.text
          ?? "";

      return text || "No response received.";
    };

    try {
      let assistantContent = "";
      try {
        assistantContent = await makeRequest();
      } catch (err: any) {
        const is429 = err?.message?.includes("429") || err?.status === 429;
        const isDailyQuota = err?.message?.includes("PerDay") || err?.message?.includes("per day");
        // Only retry for per-minute limits, NOT daily quota exhaustion
        if (is429 && !isDailyQuota) {
          setStreamingContent("⏳ Rate limited — retrying in 15 seconds...");
          await new Promise(r => setTimeout(r, 15000));
          setStreamingContent("");
          assistantContent = await makeRequest();
        } else {
          throw err;
        }
      }

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date()
      };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: [...s.messages, assistantMessage] };
        }
        return s;
      }));

      setStreamingContent("");
      setIsLoading(false);
    } catch (error: any) {
      console.error("AI Error:", error);
      setStreamingContent("");
      setIsLoading(false);

      const is429 = error?.message?.includes("429") || error?.status === 429;
      const friendlyMsg = is429
        ? "⚠️ **API quota exceeded.** Your free-tier daily limit has been reached.\n\n**To fix this:**\n1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create a **new API key**\n2. Update the `.env` file with the new key\n3. Restart the dev server"
        : `❌ Error: ${error?.message || "Unknown error occurred."}`;

      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: friendlyMsg,
        timestamp: new Date()
      };
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: [...s.messages, errorMessage] };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: "New Chat",
      messages: [],
      createdAt: new Date()
    };
    setSessions([newSession, ...sessions]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    if (newSessions.length === 0) {
      const initialSession: ChatSession = {
        id: "default",
        title: "New Chat",
        messages: [],
        createdAt: new Date()
      };
      setSessions([initialSession]);
      setCurrentSessionId("default");
    } else {
      setSessions(newSessions);
      if (currentSessionId === id) {
        setCurrentSessionId(newSessions[0].id);
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 100 }}
            className="fixed md:relative z-40 w-72 h-full bg-[#111111] border-r border-zinc-800 flex flex-col"
          >
            <div className="p-4 flex flex-col h-full">
              <button
                onClick={createNewChat}
                className="flex items-center gap-3 w-full p-3 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-all group mb-6"
              >
                <Plus className="w-5 h-5 text-zinc-400 group-hover:text-zinc-100" />
                <span className="font-medium">New Chat</span>
              </button>

              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-2">Recent Chats</p>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      setCurrentSessionId(session.id);
                      if (window.innerWidth < 768) setIsSidebarOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all group relative ${
                      currentSessionId === session.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-sm text-left flex-1">{session.title}</span>
                    <Trash2 
                      className="w-4 h-4 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity" 
                      onClick={(e) => deleteChat(session.id, e)}
                    />
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-4 border-t border-zinc-800">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center gap-3 w-full p-3 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-all"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-8 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all"
            >
              {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h1 className="font-bold text-lg tracking-tight hidden sm:block">Ashish's Assistant</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hidden sm:block">
              GPT-4o Mini · Puter
            </div>
            <a href="https://github.com/ashishgoswami07" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-100 transition-colors">
              <Github className="w-5 h-5" />
            </a>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 custom-scrollbar"
        >
          {currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-500/20"
              >
                <Bot className="w-10 h-10 text-white" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">How can I help you today?</h2>
                <p className="text-zinc-500">I'm your AI assistant, powered by Gemini. Ask me anything from writing code to planning a trip.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-8">
                {[
                  "Write a React component for a toggle switch",
                  "Explain quantum entanglement simply",
                  "Plan a 3-day itinerary for Tokyo",
                  "Help me debug a JavaScript error"
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-left text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {currentSession.messages.map((message) => (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  key={message.id}
                  className={`flex gap-4 md:gap-6 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg ${
                    message.role === "assistant" 
                      ? "bg-gradient-to-br from-blue-600 to-purple-600" 
                      : "bg-zinc-800"
                  }`}>
                    {message.role === "assistant" ? <Bot className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-zinc-400" />}
                  </div>
                  <div className={`flex flex-col max-w-[85%] ${message.role === "user" ? "items-end" : ""}`}>
                    <div className={`p-4 md:p-5 rounded-2xl shadow-sm ${
                      message.role === "user" 
                        ? "bg-blue-600 text-white rounded-tr-none" 
                        : "bg-zinc-900 border border-zinc-800 rounded-tl-none"
                    }`}>
                      <div className="prose prose-invert prose-sm md:prose-base max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-600 mt-2 font-medium uppercase tracking-wider">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}

              {streamingContent && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="flex gap-4 md:gap-6"
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-lg">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col max-w-[85%]">
                    <div className="p-4 md:p-5 rounded-2xl shadow-sm bg-zinc-900 border border-zinc-800 rounded-tl-none">
                      <div className="prose prose-invert prose-sm md:prose-base max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streamingContent}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-600 mt-2 font-medium uppercase tracking-wider">
                      Assistant is typing...
                    </span>
                  </div>
                </motion.div>
              )}

              {isLoading && !streamingContent && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-4 md:gap-6"
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex-shrink-0 flex items-center justify-center animate-pulse">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    <span className="text-sm text-zinc-400 font-medium">Thinking...</span>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-8 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
          <div className="max-w-4xl mx-auto relative">
            <form 
              onSubmit={handleSendMessage}
              className="relative flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 focus-within:border-zinc-600 transition-all shadow-2xl"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Message Ashish's Assistant..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-4 text-sm md:text-base max-h-48 custom-scrollbar"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`p-3 rounded-xl transition-all ${
                  input.trim() && !isLoading 
                    ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20" 
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                }`}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
            <p className="text-[10px] text-zinc-600 text-center mt-3 font-medium uppercase tracking-widest">
              Gemini can make mistakes. Check important info.
            </p>
          </div>
        </div>

        {/* Settings Modal Overlay */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    <Settings className="w-6 h-6 text-zinc-400" />
                    Settings
                  </h2>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
                  >
                    <Plus className="w-6 h-6 rotate-45 text-zinc-500" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Model Information</label>
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-blue-400" />
                        <span className="font-medium">GPT-4o Mini (via Puter)</span>
                      </div>
                      <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Active</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">About</label>
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                      <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <Info className="w-4 h-4" />
                        <span>Version 1.0.0</span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Ashish's Assistant is a high-performance chat interface built with React, Tailwind, and the Google Gemini API.
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      localStorage.removeItem("gemini_chat_sessions");
                      window.location.reload();
                    }}
                    className="w-full p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-sm hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear All Data
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}</style>
    </div>
  );
}
