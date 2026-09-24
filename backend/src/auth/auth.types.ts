import type { IncomingMessage } from 'node:http';

export interface SessionUser {
  id: string;
  email: string;
}

export interface AuthRequest extends IncomingMessage {
  user?: SessionUser;
}
