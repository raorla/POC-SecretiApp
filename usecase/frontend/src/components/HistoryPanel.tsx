'use client';

import { motion } from 'framer-motion';
import { History, MessageSquare, Clock, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HistoryItem {
  id: string;
  sessionId: string;
  promptPreview: string;
  status: 'completed' | 'failed';
  timestamp: Date;
  model: string;
  tokens?: number;
}

// Mock data
const mockHistory: HistoryItem[] = [
  {
    id: '1',
    sessionId: 'session-1',
    promptPreview: 'Explain quantum computing in simple terms...',
    status: 'completed',
    timestamp: new Date(Date.now() - 3600000),
    model: 'gpt-4',
    tokens: 1250,
  },
  {
    id: '2',
    sessionId: 'session-1',
    promptPreview: 'Write a Python function to sort a list...',
    status: 'completed',
    timestamp: new Date(Date.now() - 7200000),
    model: 'gpt-4',
    tokens: 890,
  },
  {
    id: '3',
    sessionId: 'session-2',
    promptPreview: 'Analyze the sentiment of this text...',
    status: 'failed',
    timestamp: new Date(Date.now() - 86400000),
    model: 'claude-3',
  },
];

export function HistoryPanel() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Prompt History</h3>
        <p className="text-sm text-muted-foreground">View your past AI interactions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm">Total Prompts</span>
            </div>
            <p className="text-2xl font-bold">{mockHistory.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-green-400">
              {mockHistory.filter((h) => h.status === 'completed').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-sm">Total Tokens</span>
            </div>
            <p className="text-2xl font-bold text-violet-400">
              {mockHistory.reduce((acc, h) => acc + (h.tokens || 0), 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* History list */}
      {mockHistory.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <History className="w-7 h-7 text-muted-foreground" />
            </div>
            <h4 className="text-lg font-medium mb-2">No History Yet</h4>
            <p className="text-muted-foreground">
              Your prompt history will appear here once you start using the gateway.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mockHistory.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-violet-500/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {item.status === 'completed' ? (
                          <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Completed
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {item.model}
                        </Badge>
                        {item.tokens && (
                          <span className="text-xs text-muted-foreground">
                            {item.tokens.toLocaleString()} tokens
                          </span>
                        )}
                      </div>
                      <p className="text-foreground truncate">{item.promptPreview}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm text-muted-foreground">
                        {item.timestamp.toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
