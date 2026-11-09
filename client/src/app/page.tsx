'use client';
// ============================================================
// NEON ROYALE — главный экран: сплеш студии, создание ника,
// нижние вкладки (Главная / Магазин / Колода / Топ / Настройки),
// промокод, правовые документы, бой.
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import BattleScreen, { BattleResult } from '@/components/game/Battle';
import { CARDS, CARD_BY_ID, arenaByTrophies, MAX_LEVEL, UPGRADE_COSTS } from '@/lib/game/cards';
import {
  Profile, loadProfile, saveProfile, createProfile, validateNick,
  buyCard, upgradeCard, upgradeCost, setDeck, applyFoxUnlock, levelsOf,
} from '@/lib/game/state';
import { Net, DEFAULT_SERVER, checkNick, fetchLeaderboard, redeemPromo, LeaderRow } from '@/lib/game/net';

type Screen = 'splash' | 'nick' | 'menu';
type Tab = 'home' | 'shop' | 'deck' | 'top' | 'settings';

export default function Page() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [inBattle, setInBattle] = useState(false);
  const [net] = useState(() => (typeof window !== 'undefined' ? new Net() : (null as unknown as Net)));
  const [promoOpen, setPromoOpen] = useState(false);
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null);
  const [toast, setToast] = useState('');

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2200);
  }, []);

  // профиль из localStorage
  useEffect(() => {
    const p = loadProfile();
    if (p) setProfile(p);
  }, []);

  // подключение к серверу после сплеша
  useEffect(() => {
    if (screen !== 'menu' && screen !== 'nick') return;
    if (!net) return;
    net.connect();
    const p = profile;
    if (p) net.register(p.playerId, p.nick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const update = useCallback((p: Profile) => {
    setProfile({ ...p });
    saveProfile(p);
  }, []);

  const onFinished = useCallback((r: BattleResult) => {
    if (!profile) return;
    const p = profile;
    p.gold += r.gold;
    p.trophies = Math.max(0, p.trophies + r.trophies);
    if (r.myWin) p.wins += 1; else if (!r.draw) p.losses += 1;
    update(p);
  }, [profile, update]);

  // ---------------- SPLASH ----------------
  if (screen === 'splash') {
    return <Splash onDone={() => setScreen(profile ? 'menu' : 'nick')} />;
  }

  // ---------------- NICK GATE ----------------
  if (screen === 'nick') {
    return (
      <>
        <NickGate
          onDone={(nick) => {
            const p = createProfile(nick);
            update(p);
            net?.register(p.playerId, nick);
            setScreen('menu');
          }}
        />
        <Toast text={toast} />
      </>
    );
  }

  if (!profile || !net) return <Splash onDone={() => {}} />;

  // ---------------- MENU ----------------
  const arena = arenaByTrophies(profile.trophies);
  const ownedList = Object.keys(profile.owned).filter(id => CARD_BY_ID[id] && (profile.foxUnlocked || !CARD_BY_ID[id].admin));

  const startBattle = () => setInBattle(true);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#07090d] text-white">
      {/* фон */}
      <div className="absolute inset-0 bg-[url('/art/bg-menu.jpg')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#07090d]/70 via-[#07090d]/40 to-[#07090d]/90" />

      {/* верхняя панель игрока */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 rounded-2xl bg-black/50 px-3 py-2 backdrop-blur">
          <span className="text-xl">🏆</span>
          <div className="leading-tight">
            <div className="text-sm font-bold">{profile.trophies}</div>
            <div className="text-[10px] text-white/50">{arena.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-2xl bg-black/50 px-3 py-2 backdrop-blur">
          <span className="text-lg">🪙</span>
          <span className="text-sm font-bold text-[#ffd34d]">{profile.gold}</span>
        </div>
      </div>

      {/* контент вкладок */}
      <div className="relative z-10 h-[calc(100%-64px-env(safe-area-inset-bottom)-env(safe-area-inset-top))] overflow-y-auto overscroll-contain px-3 pb-4 pt-3">
        {tab === 'home' && <HomeTab profile={profile} onBattle={startBattle} onPromo={() => setPromoOpen(true)} showToast={showToast} netOnline={net.connected} />}
        {tab === 'shop' && <ShopTab profile={profile} update={update} showToast={showToast} />}
        {tab === 'deck' && <DeckTab profile={profile} update={update} showToast={showToast} />}
        {tab === 'top' && <TopTab profile={profile} />}
        {tab === 'settings' && <SettingsTab profile={profile} update={update} onLegal={setLegal} onPromo={() => setPromoOpen(true)} showToast={showToast} serverUrl={DEFAULT_SERVER} />}
      </div>

      {/* нижние вкладки */}
      <nav className="absolute inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-[#0b0e14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {([
          ['home', '⚔️', 'Главная'],
          ['shop', '🛒', 'Магазин'],
          ['deck', '🃏', 'Колода'],
          ['top', '👑', 'Топ'],
          ['settings', '⚙️', 'Ещё'],
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${tab === id ? 'text-[#3fd4ff]' : 'text-white/45'}`}
          >
            <span className="text-xl leading-none">{icon}</span>
            {label}
            <span className={`mt-0.5 h-0.5 w-8 rounded-full ${tab === id ? 'bg-[#3fd4ff]' : 'bg-transparent'}`} />
          </button>
        ))}
      </nav>

      {/* промокод */}
      {promoOpen && (
        <PromoModal
          profile={profile}
          onClose={() => setPromoOpen(false)}
          onUnlocked={(msg) => { showToast(msg); setPromoOpen(false); }}
          showToast={showToast}
        />
      )}

      {/* правовые документы */}
      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}

      {/* бой */}
      {inBattle && (
        <BattleScreen net={net} profile={profile} onExit={() => setInBattle(false)} onFinished={onFinished} />
      )}

      <Toast text={toast} />
    </div>
  );
}

// ============================================================
function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-[95] -translate-x-1/2 rounded-xl bg-black/85 px-5 py-2.5 text-sm font-bold text-white shadow-xl">
      {text}
    </div>
  );
}

// ============================================================
function Splash({ onDone }: { onDone: () => void }) {
  const [dim, setDim] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setDim(true), 2600);
    const t2 = setTimeout(onDone, 3300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-700 ease-out"
      style={{ opacity: dim ? 0 : 1 }}
      onClick={onDone}
    >
      <div className="nr-splash-in flex flex-col items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/art/studio-logo.jpg"
          alt="Студия разработки Ивана Снегирёва"
          className="w-[54vmin] max-w-[310px] rounded-3xl"
          style={{ boxShadow: '0 0 60px rgba(226,60,60,0.35), 0 0 120px rgba(226,60,60,0.15)' }}
          draggable={false}
        />
        <div className="nr-splash-sub text-[11px] uppercase tracking-[0.42em] text-white/45">представляет</div>
      </div>
      <style>{`
        @keyframes nrSplashIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        .nr-splash-in { animation: nrSplashIn 1.2s ease-out both; }
        .nr-splash-sub { animation: nrSplashIn 1.4s 0.5s ease-out both; }
      `}</style>
    </div>
  );
}

// ============================================================
function NickGate({ onDone }: { onDone: (nick: string) => void }) {
  const [nick, setNick] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateNick(nick);
    if (!v.ok) { setErr(v.msg!); return; }
    setBusy(true);
    // проверка уникальности на сервере (оффлайн — пропускаем)
    const res = await checkNick(nick, loadProfile()?.playerId ?? 'tmp-' + Date.now());
    setBusy(false);
    if (!res.ok) { setErr(res.msg || 'Ник недоступен'); return; }
    onDone(nick.trim());
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#07090d]">
      <div className="absolute inset-0 bg-[url('/art/bg-menu.jpg')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#07090d]/80 via-[#07090d]/55 to-[#07090d]" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/logo-royale.png" alt="Neon Royale" className="w-[46vmin] max-w-[240px] drop-shadow-[0_0_30px_rgba(63,212,255,0.35)]" draggable={false} />
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-wide text-white">NEON ROYALE</h1>
          <p className="mt-1 text-sm text-white/60">Добро пожаловать! Придумай игровой ник — его увидят соперники в битвах и таблице топа.</p>
        </div>
        <div className="w-full max-w-sm">
          <input
            value={nick}
            onChange={(e) => { setNick(e.target.value); setErr(''); }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={16}
            placeholder="Твой ник"
            className="w-full rounded-2xl border-2 border-[#3fd4ff]/40 bg-black/60 px-5 py-4 text-center text-lg font-bold text-white placeholder-white/30 outline-none focus:border-[#3fd4ff]"
          />
          <div className="mt-2 text-center text-xs text-white/40">От 2 до 16 символов. Без мата и оскорблений.</div>
          {err && <div className="mt-2 text-center text-sm font-bold text-[#ff4fa0]">{err}</div>}
          <button
            onClick={submit}
            disabled={busy || nick.trim().length < 2}
            className="mt-5 w-full rounded-2xl bg-gradient-to-b from-[#3fd4ff] to-[#1a8fc0] py-4 text-lg font-black tracking-wide text-[#04222e] shadow-[0_0_25px_rgba(63,212,255,0.45)] transition active:scale-95 disabled:opacity-40"
          >
            {busy ? 'ПРОВЕРЯЕМ…' : '⚔ ИГРАТЬ'}
          </button>
          <div className="mt-4 text-center text-[11px] text-white/35">
            Продолжая, ты соглашаешься с Пользовательским соглашением и Политикой конфиденциальности (раздел «Ещё»).
          </div>
        </div>
      </div>
    </main>
  );
}

// ============================================================
function HomeTab({ profile, onBattle, onPromo, showToast, netOnline }: {
  profile: Profile; onBattle: () => void; onPromo: () => void; showToast: (m: string) => void; netOnline: boolean;
}) {
  const arena = arenaByTrophies(profile.trophies);
  return (
    <div className="flex h-full flex-col items-center gap-5">
      <div className="mt-2 text-center">
        <div className="text-xs uppercase tracking-[0.35em] text-white/40">{arena.name}</div>
        <div className="mt-1 text-2xl font-black text-white">{profile.nick}</div>
        <div className="mt-0.5 text-sm text-white/55">{profile.wins} побед · {profile.losses} поражений</div>
      </div>

      <button
        onClick={onBattle}
        className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#ffd34d] to-[#e08c1a] py-6 text-center shadow-[0_0_35px_rgba(255,211,77,0.4)] transition active:scale-95"
      >
        <div className="text-3xl font-black tracking-widest text-[#3a2200]">В БОЙ</div>
        <div className="mt-0.5 text-xs font-bold text-[#5a3a00]/70">
          {netOnline ? 'онлайн: поиск соперника · 15 сек' : 'оффлайн: битва с ботом'}
        </div>
      </button>

      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <button onClick={onPromo} className="rounded-2xl border border-[#ff9d3f]/40 bg-[#ff9d3f]/10 px-4 py-3 text-sm font-bold text-[#ffb35f] transition active:scale-95">
          🎟 Промокод
        </button>
        <a
          href="https://vk.com/neonroyale"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.preventDefault(); showToast('Сообщество ВКонтакте скоро откроется'); }}
          className="flex items-center justify-center gap-2 rounded-2xl border border-[#3fd4ff]/40 bg-[#3fd4ff]/10 px-4 py-3 text-sm font-bold text-[#7fe0ff] transition active:scale-95"
        >
          💬 Мы в ВКонтакте
        </a>
      </div>

      {/* мини-статистика коллекции */}
      <div className="w-full max-w-sm rounded-2xl bg-black/40 p-4 backdrop-blur">
        <div className="text-xs uppercase tracking-widest text-white/40">Коллекция</div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-white/70">Карт открыто</span>
          <span className="font-bold text-white">{Object.keys(profile.owned).length} / {CARDS.length}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-[#3fd4ff] to-[#b04dff]" style={{ width: `${(Object.keys(profile.owned).length / CARDS.length) * 100}%` }} />
        </div>
        {profile.foxUnlocked && (
          <div className="mt-3 rounded-xl bg-[#ff9d3f]/15 px-3 py-2 text-xs font-bold text-[#ffb35f]">🦊 Лисий клан разблокирован — карты в «Колода»</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
const RARITY_COLOR: Record<string, string> = {
  common: '#9fb4c8', rare: '#3fd4ff', epic: '#b04dff', legendary: '#ffd34d',
};
const RARITY_NAME: Record<string, string> = {
  common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная',
};

function ShopTab({ profile, update, showToast }: { profile: Profile; update: (p: Profile) => void; showToast: (m: string) => void }) {
  const list = useMemo(() => CARDS.filter(c => !c.admin), []);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-xs uppercase tracking-[0.35em] text-white/40">Магазин: герои и башни · золото: {profile.gold} 🪙</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((c) => {
          const lvl = profile.owned[c.id];
          const cost = upgradeCost(lvl ?? 0);
          const canU = lvl && cost !== null && profile.gold >= cost;
          const canB = !lvl && profile.gold >= c.shopPrice;
          return (
            <div key={c.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/45 backdrop-blur">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.art} alt={c.name} className="aspect-[3/4] w-full object-cover" draggable={false} />
                <div className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: 'rgba(0,0,0,0.65)', color: RARITY_COLOR[c.rarity] }}>
                  {RARITY_NAME[c.rarity]}
                </div>
                {lvl ? (
                  <div className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-black text-white">ур. {lvl}</div>
                ) : (
                  <div className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-black text-[#b04dff]">{c.cost}💧</div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[11px] font-bold leading-tight">{c.name}</div>
              </div>
              <div className="p-2">
                {lvl ? (
                  cost === null ? (
                    <div className="rounded-xl bg-white/10 py-2 text-center text-xs font-bold text-white/60">МАКС. УРОВЕНЬ</div>
                  ) : (
                    <button
                      onClick={() => { const r = upgradeCard(profile, c.id); showToast(r.msg); if (r.ok) update({ ...profile }); }}
                      disabled={!canU}
                      className={`w-full rounded-xl py-2 text-xs font-black transition active:scale-95 ${canU ? 'bg-gradient-to-b from-[#4dff88] to-[#2aa15a] text-[#062b15]' : 'bg-white/10 text-white/40'}`}
                    >
                      УЛУЧШИТЬ · {cost} 🪙
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => { const r = buyCard(profile, c.id); showToast(r.msg); if (r.ok) update({ ...profile }); }}
                    disabled={!canB}
                    className={`w-full rounded-xl py-2 text-xs font-black transition active:scale-95 ${canB ? 'bg-gradient-to-b from-[#ffd34d] to-[#e08c1a] text-[#3a2200]' : 'bg-white/10 text-white/40'}`}
                  >
                    КУПИТЬ · {c.shopPrice} 🪙
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl bg-black/40 p-3 text-center text-[11px] text-white/40">
        Победы в боях приносят золото: +160 за победу, +90 за ничью, +55 за поражение. Карты лисьего клана не продаются — их выдают только по промокоду.
      </div>
    </div>
  );
}

// ============================================================
function DeckTab({ profile, update, showToast }: { profile: Profile; update: (p: Profile) => void; showToast: (m: string) => void }) {
  const [swapFrom, setSwapFrom] = useState<number | null>(null);

  const tapSlot = (idx: number) => {
    if (swapFrom === null) { setSwapFrom(idx); return; }
    if (swapFrom === idx) { setSwapFrom(null); return; }
    const deck = [...profile.deck];
    [deck[swapFrom], deck[idx]] = [deck[idx], deck[swapFrom]];
    if (setDeck(profile, deck)) { update({ ...profile }); setSwapFrom(null); }
  };

  const tapCollection = (id: string) => {
    if (profile.deck.includes(id)) { showToast('Карта уже в колоде'); return; }
    if (swapFrom === null) { showToast('Выбери слот в колоде, чтобы заменить'); return; }
    const deck = [...profile.deck];
    deck[swapFrom] = id;
    if (setDeck(profile, deck)) { update({ ...profile }); setSwapFrom(null); }
  };

  const collection = Object.keys(profile.owned).filter(id => CARD_BY_ID[id] && (profile.foxUnlocked || !CARD_BY_ID[id].admin));

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center text-xs uppercase tracking-[0.35em] text-white/40">Боевая колода · 8 карт</div>
      <div className="grid grid-cols-4 gap-2">
        {profile.deck.map((id, i) => {
          const c = CARD_BY_ID[id];
          if (!c) return null;
          return (
            <button key={id + i} onClick={() => tapSlot(i)}
              className={`relative overflow-hidden rounded-xl border-2 transition ${swapFrom === i ? 'border-[#ffd34d] shadow-[0_0_14px_rgba(255,211,77,0.7)]' : 'border-white/20'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.art} alt={c.name} className="aspect-[3/4] w-full object-cover" draggable={false} />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-[9px] font-bold leading-tight">{c.name}</div>
              <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#b04dff] text-[11px] font-black">{c.cost}</div>
              <div className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px] font-black text-[#ffd34d]">ур.{profile.owned[id]}</div>
            </button>
          );
        })}
      </div>
      <div className="text-center text-[11px] text-white/45">
        {swapFrom === null ? 'Нажми на карту, затем на вторую — поменять местами' : 'Выбери слот замены или карту из коллекции ниже'}
      </div>

      <div className="text-center text-xs uppercase tracking-[0.35em] text-white/40">Коллекция</div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {collection.map((id) => {
          const c = CARD_BY_ID[id];
          const inDeck = profile.deck.includes(id);
          return (
            <button key={id} onClick={() => tapCollection(id)}
              className={`relative overflow-hidden rounded-xl border-2 transition active:scale-95 ${inDeck ? 'border-white/10 opacity-35' : 'border-white/20'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.art} alt={c.name} className="aspect-[3/4] w-full object-cover" draggable={false} />
              <div className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#b04dff] text-[9px] font-black">{c.cost}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
function TopTab({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchLeaderboard().then(r => { if (alive) setRows(r); });
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  const myIdx = rows?.findIndex(r => r.nick.toLowerCase() === profile.nick.toLowerCase()) ?? -1;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-xs uppercase tracking-[0.35em] text-white/40">Таблица лидеров</div>
      {rows === null && <div className="py-10 text-center text-sm text-white/40">Загрузка…</div>}
      {rows !== null && rows.length === 0 && (
        <div className="rounded-2xl bg-black/40 p-6 text-center text-sm text-white/50">
          Пока никто не сражался. Выигрывай бои и попади в топ первым!
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-black/45 backdrop-blur">
          {rows.map((r, i) => {
            const me = i === myIdx;
            return (
              <div key={r.nick + i} className={`flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0 ${me ? 'bg-[#3fd4ff]/10' : ''}`}>
                <span className={`w-7 text-center font-black ${i === 0 ? 'text-[#ffd34d]' : i === 1 ? 'text-[#c8d4e0]' : i === 2 ? 'text-[#e08c4d]' : 'text-white/40'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{r.nick}{me ? ' (ты)' : ''}</div>
                  <div className="text-[10px] text-white/40">{r.arena} · {r.wins} побед</div>
                </div>
                <span className="font-bold text-[#ffd34d]">🏆 {r.trophies}</span>
              </div>
            );
          })}
        </div>
      )}
      {myIdx === -1 && rows && rows.length > 0 && (
        <div className="rounded-2xl bg-black/40 p-3 text-center text-xs text-white/45">
          Тебя пока нет в топ-100 — побеждай и поднимайся!
        </div>
      )}
    </div>
  );
}

// ============================================================
function SettingsTab({ profile, update, onLegal, onPromo, showToast, serverUrl }: {
  profile: Profile; update: (p: Profile) => void;
  onLegal: (k: 'privacy' | 'terms') => void; onPromo: () => void; showToast: (m: string) => void; serverUrl: string;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-xs uppercase tracking-[0.35em] text-white/40">Настройки</div>

      <button onClick={() => { const p = profile; p.sound = !p.sound; update({ ...p }); }}
        className="flex items-center justify-between rounded-2xl bg-black/45 px-4 py-3 backdrop-blur active:scale-[0.98]">
        <span className="text-sm font-bold">🔊 Звук</span>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${profile.sound ? 'bg-[#4dff88]/20 text-[#4dff88]' : 'bg-white/10 text-white/40'}`}>
          {profile.sound ? 'ВКЛ' : 'ВЫКЛ'}
        </span>
      </button>

      <button onClick={onPromo} className="flex items-center justify-between rounded-2xl bg-black/45 px-4 py-3 backdrop-blur active:scale-[0.98]">
        <span className="text-sm font-bold">🎟 Ввести промокод</span>
        <span className="text-white/30">›</span>
      </button>

      <button onClick={() => onLegal('privacy')} className="flex items-center justify-between rounded-2xl bg-black/45 px-4 py-3 backdrop-blur active:scale-[0.98]">
        <span className="text-sm font-bold">📜 Политика конфиденциальности</span>
        <span className="text-white/30">›</span>
      </button>
      <button onClick={() => onLegal('terms')} className="flex items-center justify-between rounded-2xl bg-black/45 px-4 py-3 backdrop-blur active:scale-[0.98]">
        <span className="text-sm font-bold">📄 Пользовательское соглашение</span>
        <span className="text-white/30">›</span>
      </button>

      {!confirmReset ? (
        <button onClick={() => setConfirmReset(true)}
          className="rounded-2xl border border-[#ff4fa0]/30 bg-[#ff4fa0]/10 px-4 py-3 text-sm font-bold text-[#ff8ec0] active:scale-[0.98]">
          Сбросить прогресс
        </button>
      ) : (
        <div className="rounded-2xl border border-[#ff4fa0]/40 bg-[#ff4fa0]/10 p-4">
          <div className="text-sm font-bold text-white">Точно сбросить всё?</div>
          <div className="mt-1 text-xs text-white/50">Ник, золото, трофеи и карты будут удалены безвозвратно.</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { localStorage.removeItem('neon-royale-profile-v1'); location.reload(); }}
              className="flex-1 rounded-xl bg-[#ff4fa0] py-2 text-sm font-black text-white active:scale-95">Сбросить</button>
            <button onClick={() => setConfirmReset(false)}
              className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-bold text-white/70 active:scale-95">Отмена</button>
          </div>
        </div>
      )}

      <div className="mt-2 rounded-2xl bg-black/35 p-4 text-[11px] leading-relaxed text-white/35">
        <div>Neon Royale · версия 4.0</div>
        <div>Студия разработки Ивана Снегирёва</div>
        <div className="mt-1">Сервер: {serverUrl.replace(/^https?:\/\//, '').slice(0, 34)}…</div>
      </div>
    </div>
  );
}

// ============================================================
function PromoModal({ profile, onClose, onUnlocked, showToast }: {
  profile: Profile; onClose: () => void; onUnlocked: (msg: string) => void; showToast: (m: string) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const res = await redeemPromo(profile.playerId, code.trim());
    setBusy(false);
    if (res.ok) {
      applyFoxUnlock(profile);
      onUnlocked(res.msg);
    } else {
      setErr(res.msg);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-[#ff9d3f]/30 bg-[#12100c] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-3xl">🦊</div>
        <h3 className="mt-2 text-center text-lg font-black text-[#ffb35f]">Промокод</h3>
        <p className="mt-1 text-center text-xs text-white/45">Секретный код открывает лисий клан: 4 карты героев и башню «Лисья берлога».</p>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Введи код"
          className="mt-4 w-full rounded-xl border-2 border-[#ff9d3f]/30 bg-black/50 px-4 py-3 text-center font-mono font-bold tracking-widest text-white placeholder-white/25 outline-none focus:border-[#ff9d3f]"
        />
        {err && <div className="mt-2 text-center text-sm font-bold text-[#ff4fa0]">{err}</div>}
        {profile.foxUnlocked && <div className="mt-2 text-center text-sm font-bold text-[#4dff88]">Лисы уже разблокированы</div>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-bold text-white/70 active:scale-95">Закрыть</button>
          <button onClick={submit} disabled={busy || !code.trim()}
            className="flex-1 rounded-xl bg-gradient-to-b from-[#ff9d3f] to-[#e0641a] py-3 text-sm font-black text-[#2d1200] active:scale-95 disabled:opacity-40">
            {busy ? '…' : 'АКТИВИРОВАТЬ'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
function LegalModal({ kind, onClose }: { kind: 'privacy' | 'terms'; onClose: () => void }) {
  const isPrivacy = kind === 'privacy';
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[82vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#0d1017] p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black text-white">{isPrivacy ? 'Политика конфиденциальности' : 'Пользовательское соглашение'}</h3>
        <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-white/65">
          {isPrivacy ? (
            <>
              <p><b className="text-white">1. Какие данные собираются.</b> Игра не запрашивает и не хранит персональные данные: имя, фамилию, телефон, e-mail, геолокацию. В игре используются только: (а) игровой ник, который ты придумываешь сам, и (б) случайно сгенерированный идентификатор устройства, а также игровые показатели (трофеи, победы).</p>
              <p><b className="text-white">2. Почему это не персональные данные.</b> Самодельный ник, не позволяющий идентифицировать личность, и игровые значения не относятся к персональным данным в смысле Федерального закона № 152-ФЗ «О персональных данных».</p>
              <p><b className="text-white">3. Локальное хранение.</b> Прогресс игры (золото, карты, колода) хранится на твоём устройстве. На сервере хранятся только ник, идентификатор и счётчики трофеев/побед для таблицы лидеров.</p>
              <p><b className="text-white">4. Третьи лица.</b> Данные не передаются третьим лицам и не используются для рекламы. Аналитики и трекеров в игре нет.</p>
              <p><b className="text-white">5. Удаление.</b> Ты можешь удалить весь игровой прогресс кнопкой «Сбросить прогресс» в настройках. Для удаления записи в таблице лидеров напиши в сообщество игры ВКонтакте.</p>
              <p className="text-white/40">Редакция от 9 ноября 2026 г. · Студия разработки Ивана Снегирёва</p>
            </>
          ) : (
            <>
              <p><b className="text-white">1. Предмет соглашения.</b> Neon Royale — бесплатная онлайн-игра. Устанавливая игру, ты соглашаешься играть по правилам, описанным ниже.</p>
              <p><b className="text-white">2. Никнейм.</b> Ник придумывается игроком самостоятельно и должен быть корректным: без мата, оскорблений и попыток выдавать себя за других. Ники с нарушениями могут быть сброшены.</p>
              <p><b className="text-white">3. Честная игра.</b> Запрещено использовать читы, автоматизацию и баги для получения преимущества. Аккаунты-нарушители могут быть исключены из таблицы лидеров.</p>
              <p><b className="text-white">4. Виртуальные ценности.</b> Золото, трофеи и карты — внутриигровые ценности. Они не являются денежными средствами и не подлежат обмену на реальные деньги.</p>
              <p><b className="text-white">5. Промокоды.</b> Промокоды выдаются разработчиком и активируются в игре. Один код действует один раз для одного игрока.</p>
              <p><b className="text-white">6. Изменения.</b> Разработчик может обновлять игру и баланс карт. Продолжая играть после обновления, ты принимаешь новые условия.</p>
              <p className="text-white/40">Редакция от 9 ноября 2026 г. · Студия разработки Ивана Снегирёва</p>
            </>
          )}
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-white/10 py-3 text-sm font-bold text-white active:scale-95">Понятно</button>
      </div>
    </div>
  );
}
