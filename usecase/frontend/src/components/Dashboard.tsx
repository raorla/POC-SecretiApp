'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Key, 
  History, 
  Settings, 
  LogOut,
  Plus,
  Shield,
  Sparkles
} from 'lucide-react';
import { SessionPanel } from './SessionPanel';
import { ChatPanel } from './ChatPanel';
import { HistoryPanel } from './HistoryPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Tab = 'chat' | 'sessions' | 'history' | 'settings';

export function Dashboard() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<{ key: string; iv: string } | null>(null);

  const tabs = [
    { id: 'chat' as Tab, icon: MessageSquare, label: 'Chat' },
    { id: 'sessions' as Tab, icon: Key, label: 'Sessions' },
    { id: 'history' as Tab, icon: History, label: 'History' },
    { id: 'settings' as Tab, icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card/50 backdrop-blur-xl border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                PrivateAI
              </h1>
              <p className="text-xs text-muted-foreground -mt-1">Gateway</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-violet-500/15 text-violet-400 font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
              <span className="text-sm font-bold text-white">
                {address?.slice(2, 4).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
              <p className="text-xs text-muted-foreground">Arbitrum Sepolia</p>
            </div>
          </div>
          <ConnectButton.Custom>
            {({ openAccountModal }) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={openAccountModal}
                className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </Button>
            )}
          </ConnectButton.Custom>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 bg-card/30 backdrop-blur-xl border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold capitalize">{activeTab}</h2>
            {activeSession && (
              <Badge variant="default" className="bg-green-500/15 text-green-400 border-green-500/30">
                <Shield className="w-3 h-3 mr-1" />
                Session Active
              </Badge>
            )}
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Session
          </Button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-gradient-to-br from-background via-background to-violet-950/10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'chat' && (
                <ChatPanel 
                  sessionId={activeSession} 
                  sessionKey={sessionKey || undefined}
                  onCreateSession={() => setActiveTab('sessions')} 
                />
              )}
              {activeTab === 'sessions' && (
                <SessionPanel 
                  onSelectSession={(id, key) => {
                    setActiveSession(id);
                    setSessionKey(key || null);
                    setActiveTab('chat');
                  }} 
                />
              )}
              {activeTab === 'history' && <HistoryPanel />}
              {activeTab === 'settings' && (
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle>Settings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Settings panel coming soon...</p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
