// ============================================================
// NEON ROYALE — сетевой клиент (socket.io)
// События: register, queue, match, play, snapshot, result,
// leaderboard, promo, nick-check
// ============================================================
'use client';

import { io, Socket } from 'socket.io-client';

export const DEFAULT_SERVER = process.env.NEXT_PUBLIC_DEFAULT_SERVER || 'https://app-75f85dd2607fb481.up.railway.app';

export type NetState = 'offline' | 'connecting' | 'online';

export interface LeaderRow { nick: string; trophies: number; wins: number; arena: string }

export interface MatchStart {
  roomId: string;
  seed: number;
  side: 0 | 1;
  host: boolean;
  oppNick: string;
  oppDeck: string[];
  oppLevels: Record<string, number>;
  bot: boolean;
  yourDeck: string[];
  yourLevels: Record<string, number>;
}

export class Net {
  private socket: Socket | null = null;
  private url: string;
  onState: (s: NetState) => void = () => {};
  onMatch: (m: MatchStart) => void = () => {};
  onSnapshot: (s: unknown) => void = () => {};
  onOpponentPlay: (ev: { seq: number; side: 0 | 1; card: string; x: number; y: number }) => void = () => {};
  onPlayRejected: (seq: number) => void = () => {};
  onResult: (r: { winner: number; gold: number; trophies: number; oppNick: string; bot: boolean }) => void = () => {};
  onQueueStatus: (s: { searching: boolean; elapsed: number }) => void = () => {};
  onOppLeft: () => void = () => {};

  constructor(url: string = DEFAULT_SERVER) { this.url = url; }

  get connected(): boolean { return !!this.socket?.connected; }

  connect() {
    if (this.socket) return;
    this.onState('connecting');
    try {
      this.socket = io(this.url, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        timeout: 6000,
      });
      this.socket.on('connect', () => this.onState('online'));
      this.socket.on('disconnect', () => this.onState('offline'));
      this.socket.on('connect_error', () => this.onState('offline'));
      this.socket.on('match', (m: MatchStart) => this.onMatch(m));
      this.socket.on('snapshot', (s: unknown) => this.onSnapshot(s));
      this.socket.on('play', (ev: { seq: number; side: 0 | 1; card: string; x: number; y: number }) => this.onOpponentPlay(ev));
      this.socket.on('play_rejected', (d: { seq: number }) => this.onPlayRejected(d.seq));
      this.socket.on('result', (r: { winner: number; gold: number; trophies: number; oppNick: string; bot: boolean }) => this.onResult(r));
      this.socket.on('queue', (s: { searching: boolean; elapsed: number }) => this.onQueueStatus(s));
      this.socket.on('opp_left', () => this.onOppLeft());
    } catch {
      this.onState('offline');
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.onState('offline');
  }

  register(playerId: string, nick: string) {
    this.socket?.emit('register', { playerId, nick });
  }

  joinQueue(playerId: string, nick: string, deck: string[], levels: Record<string, number>, trophies: number) {
    this.socket?.emit('queue', { playerId, nick, deck, levels, trophies });
  }

  leaveQueue() {
    this.socket?.emit('leave_queue');
  }

  // гость -> хост: моё действие
  sendPlay(ev: { seq: number; card: string; x: number; y: number }) {
    this.socket?.emit('play', ev);
  }

  // хост -> гостю: снапшот и завершение
  sendSnapshot(roomId: string, snap: unknown) {
    this.socket?.emit('snapshot', roomId, snap);
  }

  sendResult(roomId: string, winner: number, stats: { gold: number; trophies: number }) {
    this.socket?.emit('result', { roomId, winner, ...stats });
  }

  sendOpponentPlayToHost(ev: { seq: number; card: string; x: number; y: number }) {
    this.sendPlay(ev);
  }
}

// ---------- REST ----------
export async function checkNick(nick: string, playerId: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    const res = await fetch(`${DEFAULT_SERVER}/api/nick-check?nick=${encodeURIComponent(nick)}&playerId=${encodeURIComponent(playerId)}`, { method: 'GET' });
    if (!res.ok) return { ok: true }; // сервер недоступен — разрешаем офлайн
    return await res.json();
  } catch {
    return { ok: true };
  }
}

export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  try {
    const res = await fetch(`${DEFAULT_SERVER}/api/leaderboard`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function submitResult(playerId: string, nick: string, trophies: number, wins: number): Promise<boolean> {
  try {
    const res = await fetch(`${DEFAULT_SERVER}/api/submit-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, nick, trophies, wins }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function redeemPromo(playerId: string, code: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const res = await fetch(`${DEFAULT_SERVER}/api/promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, code }),
    });
    const data = await res.json();
    return data;
  } catch {
    return { ok: false, msg: 'Сервер недоступен' };
  }
}
