import { useState, useEffect } from 'react';
import { Package, RotateCcw, Zap } from 'lucide-react';

// ─── Constantes automate ────────────────────────────────────────────────────
const MAX_CAPACITY     = 6;
const SCAN_RATE_MS     = 50;
const TRAVEL_TIME_S    = 7;
const POS_INCREMENT    = 100 / ((TRAVEL_TIME_S * 1000) / SCAN_RATE_MS);
const WEIGHT_LIGHT     = 200;
const WEIGHT_HEAVY     = 400;
const WEIGHT_THRESHOLD = 300;
const MIN_GAP          = 10;  // distance minimale entre caisses (unités de position)

// ─── Constantes SVG ─────────────────────────────────────────────────────────
const SVG_W        = 720;
const SVG_H        = 280;
const BELT_START_X = 50;
const BELT_END_X   = 530;
const BELT_Y       = 160;
const BELT_H       = 34;
const EXIT_R_END_X = 700;
const EXIT_UP_TOP_Y = 20;
const BALANCE_X    = BELT_START_X + (75 / 85) * (BELT_END_X - BELT_START_X);

function getBoxCoords(caisse) {
  const { position, direction } = caisse;
  const beltLen = BELT_END_X - BELT_START_X;

  if (position <= 85) {
    const x = BELT_START_X + (position / 85) * beltLen;
    return { x, y: BELT_Y };
  }

  const progress = (position - 85) / 15;

  if (direction === 'up') {
    const y = BELT_Y - progress * (BELT_Y - EXIT_UP_TOP_Y);
    return { x: BELT_END_X, y };
  } else {
    const x = BELT_END_X + progress * (EXIT_R_END_X - BELT_END_X);
    return { x, y: BELT_Y };
  }
}

export default function TrieuseCaisses() {
  const [caisses,     setCaisses]     = useState([]);
  const [sortedBoxes, setSortedBoxes] = useState({ light: [], heavy: [] });
  const [total,       setTotal]       = useState(0);
  const [deflector,   setDeflector]   = useState('straight');
  const [beltTick,    setBeltTick]    = useState(0);

  const activeCaisses = caisses.filter(c => !c.completed);
  const motorActive   = activeCaisses.length > 0;

  useEffect(() => {
    const weighed = caisses.filter(c => c.weighed && c.direction);
    if (weighed.length > 0) {
      setDeflector(weighed[weighed.length - 1].direction);
    }
  }, [caisses]);

  useEffect(() => {
    if (!motorActive) return;
    const t = setInterval(() => setBeltTick(v => (v + 1) % 30), 60);
    return () => clearInterval(t);
  }, [motorActive]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCaisses(prev => {
        const active = prev.filter(c => !c.completed);
        if (active.length === 0) return prev;

        // Trier par position décroissante (leader en tête)
        const sorted = [...active].sort((a, b) => b.position - a.position);

        // Calculer les nouvelles positions avec contrainte de gap
        // Piste : 'main' (pos ≤ 85) ou direction ('up'/'straight') après l'aiguillage
        const trackOf = (c, pos) => (pos > 85 ? c.direction : 'main');
        const newPos  = new Map();

        for (const c of sorted) {
          const myTrack = trackOf(c, c.position);
          let limit = 100;

          // Chercher la caisse la plus proche devant sur la même piste (position déjà mise à jour)
          for (const [oid, opos] of newPos) {
            const other = active.find(x => x.id === oid);
            if (!other) continue;
            if (trackOf(other, opos) === myTrack && opos > c.position) {
              const cap = opos - MIN_GAP;
              if (cap < limit) limit = cap;
            }
          }

          const next = limit <= c.position
            ? c.position  // bloqué — ne pas reculer
            : Math.min(c.position + POS_INCREMENT, limit);
          newPos.set(c.id, next);
        }

        return prev.map(c => {
          if (c.completed) return c;
          const pos = newPos.get(c.id) ?? c.position;
          let { direction, weighed } = c;
          if (!weighed && pos >= 75) {
            direction = c.weight >= WEIGHT_THRESHOLD ? 'up' : 'straight';
            weighed   = true;
          }
          return { ...c, position: pos, direction, weighed, completed: pos >= 100 };
        });
      });
    }, SCAN_RATE_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const done = caisses.filter(c => c.completed && !c.sorted);
    if (done.length === 0) return;
    done.forEach(box => {
      setSortedBoxes(prev => ({
        light: box.weight < WEIGHT_THRESHOLD ? [...prev.light, box] : prev.light,
        heavy: box.weight >= WEIGHT_THRESHOLD ? [...prev.heavy, box] : prev.heavy,
      }));
      setTotal(t => t + 1);
    });
    setCaisses(prev => prev.map(c => (done.some(d => d.id === c.id) ? { ...c, sorted: true } : c)));
  }, [caisses]);

  const addCaisse = () => {
    if (activeCaisses.length >= MAX_CAPACITY) return;
    // Bloquer l'injection si une caisse est encore dans la zone d'entrée
    if (activeCaisses.some(c => c.position < MIN_GAP)) return;
    const weight = Math.random() > 0.5 ? WEIGHT_HEAVY : WEIGHT_LIGHT;
    setCaisses(prev => [
      ...prev,
      {
        id:        Date.now() + Math.random(),
        position:  0,
        weight,
        label:     `BOX-${Math.floor(Math.random() * 9000) + 1000}`,
        direction: null,
        weighed:   false,
        completed: false,
        sorted:    false,
      },
    ]);
  };

  const reset = () => {
    setCaisses([]);
    setSortedBoxes({ light: [], heavy: [] });
    setTotal(0);
    setDeflector('straight');
  };

  const hOff = beltTick;
  const vOff = beltTick;

  return (
    <div className="text-slate-100 font-sans">

      {/* BADGE SIMULATION */}
      <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-bold w-fit">
        <Zap size={13} />
        ÉMULATION LOCALE — Simulation uniquement
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* COLONNE GAUCHE : stats */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Diagnostic</h2>

            <div className={`flex items-center justify-between p-3 rounded-2xl border mb-3 transition-all ${
              motorActive
                ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <span className="text-sm font-bold">{motorActive ? 'RUNNING' : 'IDLE'}</span>
              <div className={`w-3 h-3 rounded-full ${motorActive ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
            </div>

            <div className={`p-3 rounded-2xl border transition-all ${
              deflector === 'up'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <div className="text-[9px] text-slate-500 mb-1 font-mono">AIGUILLAGE</div>
              <div className="text-sm font-bold font-mono">
                {deflector === 'up' ? '↑  HAUT  — 400 g' : '→  DROIT — 200 g'}
              </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Compteurs</h2>
            <div className="space-y-3">
              {[
                { label: 'Sur convoyeur',  value: activeCaisses.length,      color: 'text-cyan-400'    },
                { label: 'Légères (200g)', value: sortedBoxes.light.length,  color: 'text-emerald-400' },
                { label: 'Lourdes (400g)', value: sortedBoxes.heavy.length,  color: 'text-red-400'     },
                { label: 'Total traité',   value: total,                      color: 'text-purple-400'  },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-950 p-4 rounded-2xl flex items-center justify-between">
                  <div className="text-[9px] text-slate-500">{label}</div>
                  <div className={`text-2xl font-mono ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* COLONNE DROITE : moniteur + contrôles */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Moniteur Convoyeur</h2>

            <div className="bg-slate-950 rounded-2xl p-4 overflow-x-auto">
              <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', minWidth: 480, height: 'auto' }}>
                <defs>
                  <pattern id="beltH" x={hOff} y="0" width="30" height={BELT_H} patternUnits="userSpaceOnUse">
                    <rect width="30" height={BELT_H} fill="#1e293b" />
                    <line x1="0" y1="0" x2="0" y2={BELT_H} stroke="#334155" strokeWidth="3" />
                  </pattern>
                  <pattern id="beltV" x="0" y={vOff} width={BELT_H} height="30" patternUnits="userSpaceOnUse">
                    <rect width={BELT_H} height="30" fill="#1e293b" />
                    <line x1="0" y1="0" x2={BELT_H} y2="0" stroke="#334155" strokeWidth="3" />
                  </pattern>
                </defs>

                {/* Tapis principal */}
                <rect x={BELT_START_X} y={BELT_Y - BELT_H / 2} width={BELT_END_X - BELT_START_X} height={BELT_H}
                  fill={motorActive ? 'url(#beltH)' : '#0f172a'} rx="5" />
                <rect x={BELT_START_X} y={BELT_Y - BELT_H / 2} width={BELT_END_X - BELT_START_X} height={BELT_H}
                  fill="none" stroke="#334155" strokeWidth="2" rx="5" />
                {[BELT_START_X, BELT_END_X].map((cx, i) => (
                  <circle key={i} cx={cx} cy={BELT_Y} r={BELT_H / 2} fill="#1e293b" stroke="#475569" strokeWidth="2" />
                ))}

                {/* Sortie droite — légères */}
                <rect x={BELT_END_X} y={BELT_Y - BELT_H / 2} width={EXIT_R_END_X - BELT_END_X} height={BELT_H}
                  fill={motorActive && deflector === 'straight' ? 'url(#beltH)' : '#0f172a'} rx="5" />
                <rect x={BELT_END_X} y={BELT_Y - BELT_H / 2} width={EXIT_R_END_X - BELT_END_X} height={BELT_H}
                  fill="none" stroke={deflector === 'straight' ? '#10b981' : '#1e3a2f'} strokeWidth="2" rx="5" />
                <circle cx={EXIT_R_END_X} cy={BELT_Y} r={BELT_H / 2} fill="#1e293b" stroke="#475569" strokeWidth="2" />
                <text x={EXIT_R_END_X - 60} y={BELT_Y + BELT_H / 2 + 16} fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="middle">LÉGER →</text>

                {/* Sortie haute — lourdes */}
                <rect x={BELT_END_X - BELT_H / 2} y={EXIT_UP_TOP_Y} width={BELT_H} height={BELT_Y - EXIT_UP_TOP_Y}
                  fill={motorActive && deflector === 'up' ? 'url(#beltV)' : '#0f172a'} rx="5" />
                <rect x={BELT_END_X - BELT_H / 2} y={EXIT_UP_TOP_Y} width={BELT_H} height={BELT_Y - EXIT_UP_TOP_Y}
                  fill="none" stroke={deflector === 'up' ? '#ef4444' : '#3b1a1a'} strokeWidth="2" rx="5" />
                <circle cx={BELT_END_X} cy={EXIT_UP_TOP_Y} r={BELT_H / 2} fill="#1e293b" stroke="#475569" strokeWidth="2" />
                <text x={BELT_END_X + BELT_H / 2 + 8} y={EXIT_UP_TOP_Y + 6} fill="#ef4444" fontSize="10" fontFamily="monospace">↑ LOURD</text>

                {/* Zone balance */}
                <rect x={BALANCE_X - 22} y={BELT_Y - BELT_H / 2 - 8} width={44} height={BELT_H + 16}
                  fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="5,3" rx="4" />
                <text x={BALANCE_X} y={BELT_Y + BELT_H / 2 + 16} fill="#f59e0b" fontSize="9" fontFamily="monospace" textAnchor="middle">⚖ BALANCE</text>

                {/* Aiguillage */}
                <g transform={`translate(${BELT_END_X}, ${BELT_Y})`}>
                  <circle r={BELT_H / 2 - 1}
                    fill={deflector === 'up' ? '#ef444420' : '#10b98120'}
                    stroke={deflector === 'up' ? '#ef4444' : '#10b981'} strokeWidth="2" />
                  <text x="0" y="4" textAnchor="middle"
                    fill={deflector === 'up' ? '#ef4444' : '#10b981'} fontSize="15" fontWeight="bold">
                    {deflector === 'up' ? '↑' : '→'}
                  </text>
                </g>

                <text x={BELT_START_X} y={BELT_Y + BELT_H / 2 + 16} fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="middle">ENTRÉE</text>

                {/* Caisses */}
                {activeCaisses.map(caisse => {
                  const { x, y } = getBoxCoords(caisse);
                  const isLight  = caisse.weight < WEIGHT_THRESHOLD;
                  const isWeighed = caisse.weighed;
                  const fillCol  = !isWeighed ? '#7c3aed' : isLight ? '#059669' : '#b91c1c';
                  const bordCol  = !isWeighed ? '#a78bfa' : isLight ? '#34d399' : '#f87171';

                  return (
                    <g key={caisse.id} transform={`translate(${x - 18}, ${y - 20})`}>
                      <rect x="2" y="2" width="36" height="40" rx="4" fill="#00000060" />
                      <rect width="36" height="40" rx="4" fill={fillCol + '55'} stroke={bordCol} strokeWidth="1.5" />
                      <rect y="0" width="36" height="8" rx="2" fill={fillCol + '80'} />
                      <text x="18" y="22" textAnchor="middle" fill={bordCol} fontSize="9" fontWeight="bold">{caisse.weight}g</text>
                      <text x="18" y="34" textAnchor="middle" fill="#94a3b8" fontSize="6.5">{caisse.label.slice(-4)}</text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Zones triées */}
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                <div className="text-xs font-bold text-emerald-400 mb-2">LÉGÈRES (200 g) — {sortedBoxes.light.length}</div>
                <div className="text-[8px] text-slate-400 font-mono leading-5 max-h-14 overflow-y-auto">
                  {sortedBoxes.light.length > 0 ? sortedBoxes.light.map(b => b.label).join(' · ') : '—'}
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                <div className="text-xs font-bold text-red-400 mb-2">LOURDES (400 g) — {sortedBoxes.heavy.length}</div>
                <div className="text-[8px] text-slate-400 font-mono leading-5 max-h-14 overflow-y-auto">
                  {sortedBoxes.heavy.length > 0 ? sortedBoxes.heavy.map(b => b.label).join(' · ') : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Contrôles */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={addCaisse}
                disabled={activeCaisses.length >= MAX_CAPACITY}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed p-4 rounded-2xl flex items-center gap-3 transition-all"
              >
                <Package size={20} />
                <div className="text-left">
                  <div className="font-bold text-sm">DÉMARRER</div>
                  <div className="text-[10px] opacity-70">Ajouter caisse ({activeCaisses.length}/{MAX_CAPACITY})</div>
                </div>
              </button>

              <button
                onClick={reset}
                className="bg-cyan-700 hover:bg-cyan-600 p-4 rounded-2xl flex items-center gap-3 transition-all"
              >
                <RotateCcw size={20} />
                <div className="text-left">
                  <div className="font-bold text-sm">RÉINITIAL.</div>
                  <div className="text-[10px] opacity-70">Vider tout</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
