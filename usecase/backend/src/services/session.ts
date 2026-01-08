import { v4 as uuidv4 } from 'uuid';

// In-memory storage (replace with Redis/PostgreSQL in production)
const sessions = new Map<string, Session>();

export interface Session {
  id: string;
  userAddress: string;
  aiProvider: string;
  taskId?: string;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'failed';
  sessionKey?: string;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
  error?: string;
}

interface CreateSessionParams {
  userAddress: string;
  aiProvider: string;
  duration: number; // in seconds
}

export class SessionService {
  /**
   * Create a new session
   */
  static async create(params: CreateSessionParams): Promise<Session> {
    const { userAddress, aiProvider, duration } = params;
    
    const session: Session = {
      id: uuidv4(),
      userAddress,
      aiProvider,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 1000),
      updatedAt: new Date(),
    };
    
    sessions.set(session.id, session);
    
    return session;
  }
  
  /**
   * Get session by ID
   */
  static async getById(id: string): Promise<Session | null> {
    return sessions.get(id) || null;
  }
  
  /**
   * Get session by task ID
   */
  static async getByTaskId(taskId: string): Promise<Session | null> {
    for (const session of sessions.values()) {
      if (session.taskId === taskId) {
        return session;
      }
    }
    return null;
  }
  
  /**
   * Update session task ID
   */
  static async updateTaskId(sessionId: string, taskId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      session.taskId = taskId;
      session.updatedAt = new Date();
      sessions.set(sessionId, session);
    }
  }
  
  /**
   * Activate session with session key
   */
  static async activate(sessionId: string, result: any): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'active';
      session.sessionKey = result?.sessionKey;
      session.updatedAt = new Date();
      sessions.set(sessionId, session);
    }
  }
  
  /**
   * Mark session as failed
   */
  static async fail(sessionId: string, error: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'failed';
      session.error = error;
      session.updatedAt = new Date();
      sessions.set(sessionId, session);
    }
  }
  
  /**
   * Revoke session
   */
  static async revoke(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'revoked';
      session.updatedAt = new Date();
      sessions.set(sessionId, session);
    }
  }
  
  /**
   * Get all sessions for a user
   */
  static async getByUser(userAddress: string): Promise<Session[]> {
    const userSessions: Session[] = [];
    for (const session of sessions.values()) {
      if (session.userAddress.toLowerCase() === userAddress.toLowerCase()) {
        userSessions.push(session);
      }
    }
    return userSessions;
  }

  /**
   * Get all sessions for a user (alias)
   */
  static async getByUserAddress(userAddress: string): Promise<Session[]> {
    return this.getByUser(userAddress);
  }
  
  /**
   * Clean up expired sessions
   */
  static async cleanupExpired(): Promise<number> {
    const now = new Date();
    let cleaned = 0;
    
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt < now && session.status === 'active') {
        session.status = 'expired';
        session.updatedAt = now;
        sessions.set(id, session);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

// Run cleanup every minute
setInterval(() => {
  SessionService.cleanupExpired().then(count => {
    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} expired sessions`);
    }
  });
}, 60000);
