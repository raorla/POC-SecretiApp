'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Shield, User, Bot, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { promptApi } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'processing' | 'completed' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface ChatPanelProps {
  sessionId: string | null;
  sessionKey?: { key: string; iv: string };
  onCreateSession: () => void;
}

export function ChatPanel({ sessionId, sessionKey, onCreateSession }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clear messages when session changes
  useEffect(() => {
    setMessages([]);
  }, [sessionId]);

  const handleSend = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    // Add processing message
    const processingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'system',
      content: '🔐 Processing in TEE...',
      timestamp: new Date(),
      status: 'processing',
    };
    setMessages((prev) => [...prev, processingMessage]);

    try {
      // Call the real API
      const response = await promptApi.submit({
        sessionId,
        prompt: currentInput,
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        temperature: 0.7,
      });

      // Remove processing message and add response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== processingMessage.id);
        return [
          ...filtered.map((m) => 
            m.id === userMessage.id ? { ...m, status: 'completed' as const } : m
          ),
          {
            id: response.promptId || (Date.now() + 2).toString(),
            role: 'assistant' as const,
            content: response.response || response.message || 'No response received',
            timestamp: new Date(),
            status: 'completed' as const,
            usage: response.usage,
          },
        ];
      });
    } catch (error) {
      console.error('Prompt error:', error);
      
      // Remove processing message and show error
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== processingMessage.id);
        return [
          ...filtered.map((m) => 
            m.id === userMessage.id ? { ...m, status: 'error' as const } : m
          ),
          {
            id: (Date.now() + 2).toString(),
            role: 'system' as const,
            content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to process prompt'}`,
            timestamp: new Date(),
            status: 'error' as const,
          },
        ];
      });
    }

    setIsLoading(false);
  };

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 max-w-md">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Active Session</h3>
            <p className="text-muted-foreground mb-6">
              You need an active session to use the private AI gateway. Create a session to securely store your API key and start chatting.
            </p>
            <Button onClick={onCreateSession} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Create Session
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-7 h-7 text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Ready for Private AI</h3>
              <p className="text-muted-foreground text-sm">
                Your prompts are encrypted and processed inside a Trusted Execution Environment. Neither the platform nor compute providers can see your data.
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center shadow-lg ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-violet-500 to-violet-600'
                      : message.role === 'assistant'
                      ? 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600'
                      : 'bg-gradient-to-br from-amber-500 to-amber-600'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : message.role === 'assistant' ? (
                    <Bot className="w-4 h-4 text-white" />
                  ) : (
                    <Shield className="w-4 h-4 text-white" />
                  )}
                </div>

                {/* Message */}
                <div
                  className={`max-w-2xl ${
                    message.role === 'user' ? 'text-right' : ''
                  }`}
                >
                  <div
                    className={`inline-block px-4 py-3 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-violet-500/15 border border-violet-500/30 text-foreground'
                        : message.role === 'assistant'
                        ? 'bg-card border border-border'
                        : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    }`}
                  >
                    {message.status === 'processing' && (
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    )}
                    {message.content}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask anything privately..."
              className="flex-1 bg-background/50 border-border/50 focus-visible:ring-violet-500"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Shield className="w-3 h-3" />
            <span>End-to-end encrypted · Processed in TEE · Zero knowledge</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
