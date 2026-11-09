'use client';
// ============================================================
// NEON ROYALE — боевая сцена: канвас, рука карт, поиск матча,
// результаты. Хост симулирует, гость рендит снапшоты.
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { Battle, TICK, Snapshot, DEPLOY_Y_MIN, DEPLOY_Y_MAX, BATTLE_TIME, initialQueue } from '@/lib/game/engine';
import { ArenaRenderer } from '@/lib/game/render';
import { CARD_BY_ID, REWARD_WIN_GOLD, REWARD_LOSE_GOLD, REWARD_DRAW_GOLD, TROPHY_WIN, TROPHY_LOSE } from '@/lib/game/cards';
import { Profile, levelsOf } from '@/lib/game/state';
import { Net, MatchStart, submitResult } from '@/lib/game/net';
import { botDeck, createBrain, botThink } from '@/lib/game/ai';

export interface BattleResult {
  winner: number; myWin: boolean; draw: boolean;
  gold: number; trophies: number; crownsMe: number; crownsOpp: number;
  oppNick: string; bot: boolean;
}

type Phase = 'searching' | 'countdown' | 'battle' | 'result';

export default function BattleScreen({
  net, profile, onExit, onFinished,
}: {
  net: Net;
  profile: Profile;
  onExit: () => void;
  onFinished: (r: BattleResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>('searching');
  const [searchElapsed, setSearchElapsed] = useState(0);
  const [netOnline, setNetOnline] = useState(net.connected);
  const [countdown, setCountdown] = useState(3);
  const [match, setMatch] = useState<MatchStart | null>(null);
  const [hand, setHand] = useState<string[]>([]);
  const [nextCard, setNextCard] = useState<string>('');
  const [elixir, setElixir] = useState(5);
  const [crowns, setCrowns] = useState<[number, number]>([0, 0]);
  const [timeLeft, setTimeLeft] = useState(BATTLE_TIME);
  const [overtime, setOvertime] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [oppLeft, setOppLeft] = useState(false);
  const [toast, setToast] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const battleRef = useRef<Battle | null>(null);
  const matchRef = useRef<MatchStart | null>(null);
  const queueRef = useRef<string[]>([]);           // локальная очередь руки (для гостя и хоста)
  const seqRef = useRef({ n: 0 });
  const brainRef = useRef<ReturnType<typeof createBrain> | null>(null);
  const phaseRef = useRef<Phase>('searching');
  const lastSnapSent = useRef(0);
  const finishedRef = useRef(false);

  phaseRef.current = phase;

  // ---------- поиск матча ----------
  useEffect(() => {
    let cancelled = false;
    const offline = !net.connected;
    setNetOnline(net.connected);

    const startBot = () => {
      if (cancelled || matchRef.current) return;
      const deck = profile.deck;
      const oppDeck = botDeck(profile.trophies);
      const m: MatchStart = {
        roomId: 'bot-' + Date.now(), seed: Math.floor(Math.random() * 2 ** 31),
        side: 1, host: true, oppNick: 'Бот', oppDeck, oppLevels: {}, bot: true,
        yourDeck: deck, yourLevels: levelsOf(profile),
      };
      beginMatch(m);
    };

    if (offline) {
      const t = setTimeout(startBot, 800);
      return () => { cancelled = true; clearTimeout(t); };
    }
    // онлайн: встаём в очередь
    net.onMatch = (m: MatchStart) => { if (!cancelled) beginMatch(m); };
    net.onQueueStatus = (s) => { if (!cancelled) setSearchElapsed(s.elapsed); };
    net.onState = (s) => { if (!cancelled) setNetOnline(s === 'online'); };
    net.onOpponentPlay = (ev) => {
      const b = battleRef.current;
      if (b && matchRef.current && !matchRef.current.bot) {
        b.queuePlay({ seq: ev.seq, side: ev.side, card: ev.card, x: ev.x, y: ev.y });
      }
    };
    net.onSnapshot = (s: unknown) => {
      const r = rendererRef.current;
      if (r) r.setSnapshot(s as Snapshot);
      const snap = s as Snapshot;
      setElixir(snap.elixir[1]);
      setCrowns(snap.crowns);
      setTimeLeft(snap.time);
      setOvertime(snap.overtime);
      if (snap.phase === 'ended') endBattle(snap.winner, snap.crowns);
    };
    net.onPlayRejected = () => { showToast('Недостаточно эликсира'); };
    net.onResult = () => {};
    net.joinQueue(profile.playerId, profile.nick, profile.deck, levelsOf(profile), profile.trophies);
    // локальная страховка: если сервер молчит 17с — бот
    const failsafe = setTimeout(() => {
      if (!cancelled && !matchRef.current) startBot();
    }, 17000);
    return () => { cancelled = true; clearTimeout(failsafe); net.onOpponentPlay = () => {}; net.onSnapshot = () => {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- обработка выхода соперника ----------
  useEffect(() => {
    net.onOppLeft = () => {
      if (phaseRef.current === 'battle' || phaseRef.current === 'countdown') {
        setOppLeft(true);
        const mySide = matchRef.current?.side ?? 1;
        endBattle(mySide, [0, 0]);
      }
    };
    return () => { net.onOppLeft = () => {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1600);
  };

  // ---------- старт матча ----------
  const beginMatch = (m: MatchStart) => {
    if (matchRef.current) return;
    matchRef.current = m;
    setMatch(m);
    setPhase('countdown');
    // локальная очередь руки
    queueRef.current = initialQueue(m.yourDeck, m.seed, m.side);
    const h = queueRef.current.slice(0, 4);
    setHand(h);
    setNextCard(queueRef.current[4] ?? '');
    // рендерер
    const r = rendererRef.current;
    if (r) { r.mySide = m.side; }
    // отсчёт
    let c = 3;
    setCountdown(3);
    const iv = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(iv);
        startBattleSim(m);
      }
    }, 700);
  };

  const startBattleSim = (m: MatchStart) => {
    setPhase('battle');
    if (!m.host) return; // гость ждёт снапшоты
    const oppLv = m.bot ? botLevels() : (m.oppLevels && Object.keys(m.oppLevels).length ? m.oppLevels : {});
    const battle = new Battle({
      seed: m.seed,
      decks: [m.side === 0 ? m.yourDeck : m.oppDeck, m.side === 1 ? m.yourDeck : m.oppDeck],
      levels: [m.side === 0 ? m.yourLevels : oppLv, m.side === 1 ? m.yourLevels : oppLv],
      botLevels: m.bot ? [avgOf(m.yourLevels), botAvgLevel()] : undefined,
    });
    battleRef.current = battle;
    brainRef.current = createBrain(profile.trophies);
  };

  const botLevels = () => {
    const lvl = 1 + Math.min(8, Math.floor(profile.trophies / 500));
    const out: Record<string, number> = {};
    for (const id of matchRef.current?.oppDeck ?? []) out[id] = lvl;
    return out;
  };
  const botAvgLevel = () => 1 + Math.min(8, Math.floor(profile.trophies / 500));
  const avgOf = (l: Record<string, number>) => {
    const v = Object.values(l);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1;
  };

  // ---------- игровой цикл ----------
  useEffect(() => {
    if (phase !== 'battle') return;
    if (!rendererRef.current) rendererRef.current = new ArenaRenderer();
    const r = rendererRef.current;
    const canvas = canvasRef.current;
    if (r && canvas && !r.attached) r.attach(canvas);

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const m = matchRef.current;
      if (!m) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const battle = battleRef.current;
      if (m.host && battle) {
        acc += dt;
        let steps = 0;
        while (acc >= TICK && steps < 6) {
          acc -= TICK; steps++;
          if (m.bot) {
            botThink(battle, brainRef.current!, 0, TICK, seqRef.current);
          }
          battle.tick(TICK);
          if (battle.phase === 'ended') break;
        }
        // FX и рендер
        for (const f of battle.fx) r?.pushFx(f.kind, f.x ?? 9, f.y ?? 16, f.side);
        battle.fx.length = 0;
        const snap = battle.snapshot();
        r?.setSnapshot(snap);
        // гость в PvP получает снапшоты
        if (!m.bot) {
          if (now - lastSnapSent.current > 80) {
            lastSnapSent.current = now;
            net.sendSnapshot(m.roomId, snap);
          }
        }
        setElixir(battle.elixir[m.side]);
        setCrowns(battle.crowns);
        setTimeLeft(battle.time);
        setOvertime(battle.overtime);
        if (battle.phase === 'ended') endBattle(battle.winner, battle.crowns);
      }
      r?.render(dt);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => r?.resize();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- завершение ----------
  const endBattle = useCallback((winner: number, cr: [number, number]) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const m = matchRef.current;
    const mySide = m?.side ?? 1;
    const draw = winner === -1;
    const myWin = winner === mySide;
    const gold = myWin ? REWARD_WIN_GOLD : draw ? REWARD_DRAW_GOLD : REWARD_LOSE_GOLD;
    const dTrophy = myWin ? TROPHY_WIN : draw ? Math.round(TROPHY_WIN / 3) : -TROPHY_LOSE;
    const trophies = Math.max(0, (profile.trophies ?? 0) + dTrophy);
    const res: BattleResult = {
      winner, myWin, draw, gold, trophies: dTrophy,
      crownsMe: cr[mySide], crownsOpp: cr[mySide === 0 ? 1 : 0],
      oppNick: m?.oppNick ?? 'Соперник', bot: !!m?.bot,
    };
    setResult(res);
    setPhase('result');
    onFinished(res);
    // результат в лидерборд (не блокирует UI)
    submitResult(profile.playerId, profile.nick, trophies, (profile.wins ?? 0) + (myWin ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, onFinished]);

  // ---------- взаимодействие ----------
  const selectCard = (id: string) => setSelected(cur => (cur === id ? null : id));

  const onCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'battle' || !selected) return;
    const m = matchRef.current;
    const r = rendererRef.current;
    if (!m || !r) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tile = r.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (!tile) return;
    const c = CARD_BY_ID[selected];
    if (!c) return;
    if (m.side === 1 && tile.y < DEPLOY_Y_MIN) { showToast('Только на своей половине'); return; }
    if (m.side === 0 && tile.y > DEPLOY_Y_MAX) { showToast('Только на своей половине'); return; }
    // эликсир
    if (elixir < c.cost) { showToast('Недостаточно эликсира'); return; }
    playCard(selected, tile.x, tile.y);
    setSelected(null);
  };

  const playCard = (card: string, x: number, y: number) => {
    const m = matchRef.current;
    if (!m) return;
    seqRef.current.n++;
    const seq = seqRef.current.n;
    if (m.host) {
      battleRef.current?.applyPlay(m.side, { seq, side: m.side, card, x, y });
    } else {
      net.sendPlay({ seq, card, x, y });
    }
    // цикл руки (оптимистично)
    const q = queueRef.current;
    const i = q.indexOf(card);
    if (i >= 0) { q.splice(i, 1); q.push(card); }
    setHand(q.slice(0, 4));
    setNextCard(q[4] ?? '');
  };

  // обновление руки у хоста после валидации
  useEffect(() => {
    if (!match?.host) return;
    const iv = setInterval(() => {
      const b = battleRef.current;
      if (b) {
        const { hand, next } = b.hand(match.side);
        const cur = queueRef.current.slice(0, 4).join(',');
        const nw = hand.join(',');
        if (cur !== nw) {
          queueRef.current = [...hand, next];
          setHand(hand); setNextCard(next);
        }
      }
    }, 400);
    return () => clearInterval(iv);
  }, [match]);

  const handleExit = () => {
    net.leaveQueue();
    onExit();
  };

  // подсветка зоны высадки при выборе карты
  useEffect(() => {
    const r = rendererRef.current;
    if (r) { r.showZones = !!selected; r.selectedCard = selected; }
  }, [selected]);

  // ---------- render ----------
  const myCrown = crowns[match?.side ?? 1];
  const oppCrown = crowns[match?.side === 0 ? 1 : 0];
  const timeStr = `${Math.floor(Math.max(0, timeLeft) / 60)}:${String(Math.floor(Math.max(0, timeLeft) % 60)).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#08130b] select-none touch-none">
      {/* верхняя панель */}
      <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{oppCrown}</span>
          <span className="text-sm font-bold text-[#ff4fa0]">{match?.oppNick ?? '…'}</span>
        </div>
        <div className={`rounded-full px-4 py-1 font-mono text-lg font-bold tabular-nums ${overtime ? 'bg-[#ff4fa0]/20 text-[#ff9dc4]' : 'bg-white/10 text-white'}`}>
          {overtime ? 'ДОП. ВРЕМЯ ' : ''}{timeStr}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#3fd4ff]">{profile.nick}</span>
          <span className="text-2xl leading-none">{myCrown}</span>
        </div>
      </div>

      {/* арена */}
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          onPointerDown={onCanvasPointer}
        />
        {phase === 'searching' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#08130b]/95">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#3fd4ff]/30 border-t-[#3fd4ff]" />
            <div className="text-center">
              <div className="text-lg font-bold text-white">
                {netOnline ? 'Поиск игрока…' : 'Оффлайн-режим'}
              </div>
              <div className="mt-1 text-sm text-white/50">
                {netOnline ? `${searchElapsed} сек · соперник подключится автоматически` : 'Сервер недоступен, бот уже готов'}
              </div>
            </div>
            <button onClick={handleExit} className="mt-4 rounded-xl bg-white/10 px-6 py-2 text-sm font-bold text-white/80 active:scale-95">
              Отмена
            </button>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <div key={countdown} className="nr-countdown text-8xl font-black text-white drop-shadow-[0_0_25px_rgba(63,212,255,0.8)]">
              {countdown > 0 ? countdown : 'БОЙ!'}
            </div>
          </div>
        )}
        {toast && (
          <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm font-bold text-white">
            {toast}
          </div>
        )}
        {oppLeft && phase !== 'result' && (
          <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/85 px-6 py-3 text-center">
            <div className="font-bold text-[#4dff88]">Соперник покинул бой</div>
            <div className="text-sm text-white/60">Победа засчитана</div>
          </div>
        )}
      </div>

      {/* эликсир + рука */}
      <div className="border-t border-white/10 bg-[#0a0f14] pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto mb-2 flex h-4 w-[92%] overflow-hidden rounded-full bg-black/50">
          <div className="h-full bg-gradient-to-r from-[#b04dff] to-[#e9c7ff] transition-[width] duration-150" style={{ width: `${(elixir / 10) * 100}%` }} />
          <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold leading-4 text-white/90">{Math.floor(elixir)}/10</span>
        </div>
        <div className="flex items-end justify-center gap-2 px-2">
          {hand.map((id, i) => {
            const c = CARD_BY_ID[id];
            if (!c) return null;
            const afford = elixir >= c.cost;
            const isSel = selected === id;
            return (
              <button
                key={id + i}
                onPointerDown={(e) => { e.preventDefault(); selectCard(id); }}
                className={`relative overflow-hidden rounded-xl border-2 transition-all ${isSel ? '-translate-y-2 border-[#ffd34d] shadow-[0_0_18px_rgba(255,211,77,0.7)]' : afford ? 'border-white/25' : 'border-white/10 opacity-45 grayscale'} active:scale-95`}
                style={{ width: '22%', maxWidth: 96 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.art} alt={c.name} className="aspect-[3/4] w-full object-cover" draggable={false} />
                <div className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-[9px] font-bold leading-tight text-white">{c.name}</div>
                <div className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${afford ? 'bg-[#b04dff] text-white' : 'bg-black/70 text-white/60'}`}>{c.cost}</div>
              </button>
            );
          })}
          <div className="relative ml-1 shrink-0 opacity-80" style={{ width: '12%', maxWidth: 52 }}>
            {nextCard && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CARD_BY_ID[nextCard]?.art} alt="" className="aspect-[3/4] w-full rounded-lg object-cover opacity-70" draggable={false} />
                <div className="absolute inset-0 rounded-lg border border-dashed border-white/30" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* результат */}
      {phase === 'result' && result && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/80 p-6">
          <div className={`nr-pop text-5xl font-black tracking-wide ${result.draw ? 'text-white' : result.myWin ? 'text-[#4dff88]' : 'text-[#ff4fa0]'}`}>
            {result.draw ? 'НИЧЬЯ' : result.myWin ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}
          </div>
          <div className="text-lg text-white/80">{result.crownsMe} : {result.crownsOpp} · против {result.oppNick}{result.bot ? ' (бот)' : ''}</div>
          <div className="flex gap-6">
            <div className="flex flex-col items-center rounded-2xl bg-white/10 px-6 py-3">
              <span className="text-2xl">🪙</span>
              <span className="font-bold text-[#ffd34d]">+{result.gold}</span>
              <span className="text-xs text-white/50">золото</span>
            </div>
            <div className="flex flex-col items-center rounded-2xl bg-white/10 px-6 py-3">
              <span className="text-2xl">🏆</span>
              <span className={`font-bold ${result.trophies >= 0 ? 'text-[#4dff88]' : 'text-[#ff4fa0]'}`}>{result.trophies >= 0 ? '+' : ''}{result.trophies}</span>
              <span className="text-xs text-white/50">трофеи</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExit} className="rounded-2xl bg-white/15 px-8 py-3 font-bold text-white active:scale-95">В меню</button>
          </div>
        </div>
      )}
    </div>
  );
}
