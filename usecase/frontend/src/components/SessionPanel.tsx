'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { 
  Key, 
  Plus, 
  Clock, 
  Shield, 
  Trash2, 
  CheckCircle,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { sessionApi, Session as ApiSession } from '@/lib/api';

interface Session extends ApiSession {}

interface SessionPanelProps {
  onSelectSession: (id: string, sessionKey?: { key: string; iv: string }) => void;
}

export function SessionPanel({ onSelectSession }: SessionPanelProps) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSession, setNewSession] = useState({
    aiProvider: 'openai' as 'openai' | 'anthropic' | 'huggingface' | 'custom',
    apiKey: '',
    duration: 3600,
  });

  // Fetch sessions from API
  const { data: sessions = [], isLoading, refetch } = useQuery<Session[]>({
    queryKey: ['sessions', address],
    queryFn: async () => {
      if (!address) return [];
      try {
        return await sessionApi.getByUser(address);
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
        return [];
      }
    },
    enabled: !!address,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Create session mutation
  const createSession = useMutation({
    mutationFn: async (data: typeof newSession) => {
      if (!address) throw new Error('Wallet not connected');
      
      const response = await sessionApi.create({
        userAddress: address,
        aiProvider: data.aiProvider,
        encryptedApiKey: data.apiKey,
        sessionDuration: data.duration,
      });
      
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setShowCreateModal(false);
      setNewSession({ aiProvider: 'openai', apiKey: '', duration: 3600 });
      
      // Auto-select the new session if it's active
      if (data.status === 'active') {
        onSelectSession(data.sessionId, data.sessionKey);
      }
    },
  });

  // Revoke session mutation
  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      return await sessionApi.revoke(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const getStatusBadge = (status: Session['status']) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1">
            <CheckCircle className="w-3 h-3" />
            Active
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Pending
          </Badge>
        );
      case 'expired':
      case 'revoked':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="w-3 h-3" />
            {status}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            Failed
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Active Sessions</h3>
          <p className="text-sm text-muted-foreground">Manage your secure AI sessions</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Session
        </Button>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : sessions.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Key className="w-7 h-7 text-muted-foreground" />
            </div>
            <h4 className="text-lg font-medium mb-2">No Active Sessions</h4>
            <p className="text-muted-foreground mb-6">
              Create a session to start using the private AI gateway.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              Create Your First Session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card
                className={`bg-card/50 backdrop-blur-sm border-border/50 hover:border-violet-500/30 transition-colors ${
                  session.status === 'active' ? 'cursor-pointer' : ''
                }`}
                onClick={() => session.status === 'active' && onSelectSession(session.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 flex items-center justify-center">
                        <Key className="w-5 h-5 text-violet-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium capitalize">{session.aiProvider}</span>
                          {getStatusBadge(session.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Expires: {new Date(session.expiresAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {session.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSession(session.id);
                          }}
                        >
                          <Shield className="w-4 h-4 text-violet-400" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-red-500/10 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Handle revoke
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="bg-card border-border max-w-md w-full mx-4">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold">Create New Session</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowCreateModal(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">AI Provider</label>
                    <select
                      value={newSession.aiProvider}
                      onChange={(e) => setNewSession({ ...newSession, aiProvider: e.target.value as any })}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="huggingface">Hugging Face</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">API Key</label>
                    <Input
                      type="password"
                      value={newSession.apiKey}
                      onChange={(e) => setNewSession({ ...newSession, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Your API key will be encrypted and stored securely in the TEE.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Session Duration</label>
                    <select
                      value={newSession.duration}
                      onChange={(e) => setNewSession({ ...newSession, duration: parseInt(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                    >
                      <option value={1800}>30 minutes</option>
                      <option value={3600}>1 hour</option>
                      <option value={7200}>2 hours</option>
                      <option value={14400}>4 hours</option>
                      <option value={86400}>24 hours</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => createSession.mutate(newSession)}
                    disabled={!newSession.apiKey || createSession.isPending}
                  >
                    {createSession.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Session'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
