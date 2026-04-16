import { useState, useEffect } from 'react';
import { Package, RotateCcw, Zap, Scale } from 'lucide-react';

// ─── Constantes automate ────────────────────────────────────────────────────
const MAX_CAPACITY     = 6;
const SCAN_RATE_MS     = 50;
const TRAVEL_TIME_S    = 7;
const POS_INCREMENT    = 100 / ((TRAVEL_TIME_S * 1000) / SCAN_RATE_MS);
const WEIGHT_LIGHT     = 200;
const WEIGHT_HEAVY     = 400;
const WEIGHT_THRESHOLD = 300;

// ─── Constantes SVG ─────────────────────────────────────────────────────────
const SVG_W          = 720;
const SVG_H          = 280;
const BELT_START_X   = 50;
const BELT_END_X     = 530;
const BELT_Y         = 160;
const BELT_H         = 34;                      // épaisseur tapis
const EXIT_R_END_X   = 700;                     // fin sortie droite (légères)
const EXIT_UP_TOP_Y  = 20;                      // sommet sortie haute (lourdes)
const BALANCE_X      = BELT_START_X + (75 / 85) * (BELT_END_X - BELT_START_X);

// ─── Calcul des coordonnées d'une caisse selon sa position (0→100) ──────────
function getBoxCoords(caisse) {
  const { position, direction } = caisse;
  const beltLen = BELT_END_X - BELT_START_X;

  if (position <= 85) {
    // Sur le convoyeur principal
    const x = BELT_START_X + (position / 85) * beltLen;
    return { x, y: BELT_Y };
  }

  const progress = (position - 85) / 15;

  if (direction === 'up') {
    // Monte sur le tapis vertical
    const y = BELT_Y - progress * (BELT_Y - EXIT_UP_TOP_Y);
    return { x: BELT_END_X, y };
  } else {
    // Continue tout droit
    const x = BELT_END_X + progress * (EXIT_R_END_X - BELT_END_X);
    return { x, y: BELT_Y };
  }
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function TrieuseCaisses() {
  const [caisses,     setCaisses]     = useState([]);
  const [sortedBoxes, setSortedBoxes] = useState({ light: [], heavy: [] });
  const [total,       setTotal]       = useState(0);
  const [deflector,   setDeflector]   = useState('straight'); // 'straight' | 'up'
  const [beltTick,    setBeltTick]    = useState(0);

  const activeCaisses = caisses.filter(c => !c.completed);
  const motorActive   = activeCaisses.length > 0;

  // ── Mise à jour de l'aiguillage selon la dernière caisse pesée ──────────────
  useEffect(() => {
    const weighed = caisses.filter(c => c.weighed && c.direction);
    if (weighed.length > 0) {
      setDeflector(weighed[weighed.length - 1].direction);
    }
  }, [caisses]);

  // ── Animation du tapis (offset des rayures SVG) ──────────────────────────
  useEffect(() => {
    if (!motorActive) return;
    const t = setInterval(() => setBeltTick(v => (v + 1) % 30), 60);
    return () => clearInterval(t);
  }, [motorActive]);

  // ── Cycle PLC principal ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setCaisses(prev => {
        if (!prev.some(c => !c.completed)) return prev;

        return prev.map(c => {
          if (c.completed) return c;

          const newPos   = Math.min(c.position + POS_INCREMENT, 100);
          let direction  = c.direction;
          let weighed    = c.weighed;

          // Détection du poids à 75 % (zone balance)
          if (!weighed && newPos >= 75) {
            direction = c.weight >= WEIGHT_THRESHOLD ? 'up' : 'straight';
            weighed   = true;
          }

          return { ...c, position: newPos, direction, weighed, completed: newPos >= 100 };
        });
      });
    }, SCAN_RATE_MS);

    return () => clearInterval(interval);
  }, []);

  // ── Traitement des caisses arrivées au bout ──────────────────────────────
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

    setCaisses(prev =>
      prev.map(c => (done.some(d => d.id === c.id) ? { ...c, sorted: true } : c))
    );
  }, [caisses]);

  // ── Ajout d'une caisse ────────────────────────────────────────────────────
  const addCaisse = () => {
    if (activeCaisses.length >= MAX_CAPACITY) return;
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

  // ── Réinitialisation ──────────────────────────────────────────────────────
  const reset = () => {
    setCaisses([]);
    setSortedBoxes({ light: [], heavy: [] });
    setTotal(0);
    setDeflector('straight');
  };

  // ── Offset animation tapis ────────────────────────────────────────────────
  const hOff = beltTick;                    // horizontal (tapis principal + droite)
  const vOff = beltTick;                    // vertical (tapis haut)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">

      {/* ─── HEADER ─── */}
      <header className="w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-purple-600 p-3 rounded-2xl shadow-lg shadow-purple-900/20">
            <Zap size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">
              Système Tri de Caisses
            </h1>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">
              Digital Twin · ESP32 WROOM / Modbus TCP
            </p>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 border transition-all ${
          motorActive
            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
            : 'bg-slate-800  border-slate-700     text-slate-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${motorActive ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
          {motorActive ? 'MOTEUR EN MARCHE' : 'MOTEUR ARRÊTÉ'}
        </div>
      </header>

      <main className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ─── COLONNE GAUCHE : stats ─── */}
        <div className="lg:col-span-1 space-y-6">

          {/* Diagnostic */}
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Diagnostic</h2>

            <div className={`flex items-center justify-between p-3 rounded-2xl border mb-3 transition-all ${
              motorActive
                ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                : 'bg-slate-800  border-slate-700     text-slate-500'
            }`}>
              <span className="text-sm font-bold">{motorActive ? 'RUNNING' : 'IDLE'}</span>
              <div className={`w-3 h-3 rounded-full ${motorActive ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
            </div>

            {/* État aiguillage */}
            <div className={`p-3 rounded-2xl border transition-all ${
              deflector === 'up'
                ? 'bg-red-500/10    border-red-500/30    text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <div className="text-[9px] text-slate-500 mb-1 font-mono">AIGUILLAGE</div>
              <div className="text-sm font-bold font-mono">
                {deflector === 'up' ? '↑  HAUT  — 400 g' : '→  DROIT — 200 g'}
              </div>
            </div>
          </section>

          {/* Compteurs */}
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Compteurs</h2>
            <div className="space-y-3">
              {[
                { label: 'Sur convoyeur',  value: activeCaisses.length,       color: 'text-cyan-400'    },
                { label: 'Légères (200g)', value: sortedBoxes.light.length,   color: 'text-emerald-400' },
                { label: 'Lourdes (400g)', value: sortedBoxes.heavy.length,   color: 'text-red-400'     },
                { label: 'Total traité',   value: total,                       color: 'text-purple-400'  },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-950 p-4 rounded-2xl flex items-center justify-between">
                  <div className="text-[9px] text-slate-500">{label}</div>
                  <div className={`text-2xl font-mono ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ─── COLONNE DROITE : moniteur + contrôles ─── */}
        <div className="lg:col-span-3 space-y-6">

          {/* Moniteur SVG */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">
              Moniteur Convoyeur
            </h2>

            <div className="bg-slate-950 rounded-2xl p-4 overflow-x-auto">
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                style={{ width: '100%', minWidth: 480, height: 'auto' }}
              >
                <defs>
                  {/* Rayures tapis horizontal */}
                  <pattern id="beltH" x={hOff} y="0" width="30" height={BELT_H} patternUnits="userSpaceOnUse">
                    <rect width="30" height={BELT_H} fill="#1e293b" />
                    <line x1="0" y1="0" x2="0" y2={BELT_H} stroke="#334155" strokeWidth="3" />
                  </pattern>
                  {/* Rayures tapis vertical */}
                  <pattern id="beltV" x="0" y={vOff} width={BELT_H} height="30" patternUnits="userSpaceOnUse">
                    <rect width={BELT_H} height="30" fill="#1e293b" />
                    <line x1="0" y1="0" x2={BELT_H} y2="0" stroke="#334155" strokeWidth="3" />
                  </pattern>
                </defs>

                {/* ══ TAPIS PRINCIPAL (horizontal) ══ */}
                <rect
                  x={BELT_START_X} y={BELT_Y - BELT_H / 2}
                  width={BELT_END_X - BELT_START_X} height={BELT_H}
                  fill={motorActive ? 'url(#beltH)' : '#0f172a'} rx="5"
                />
                <rect
                  x={BELT_START_X} y={BELT_Y - BELT_H / 2}
                  width={BELT_END_X - BELT_START_X} height={BELT_H}
                  fill="none" stroke="#334155" strokeWidth="2" rx="5"
                />
                {/* Rouleaux aux extrémités du tapis principal */}
                {[BELT_START_X, BELT_END_X].map((cx, i) => (
                  <circle key={i} cx={cx} cy={BELT_Y} r={BELT_H / 2}
                    fill="#1e293b" stroke="#475569" strokeWidth="2"
                  />
                ))}

                {/* ══ SORTIE DROITE — légères ══ */}
                <rect
                  x={BELT_END_X} y={BELT_Y - BELT_H / 2}
                  width={EXIT_R_END_X - BELT_END_X} height={BELT_H}
                  fill={motorActive && deflector === 'straight' ? 'url(#beltH)' : '#0f172a'} rx="5"
                />
                <rect
                  x={BELT_END_X} y={BELT_Y - BELT_H / 2}
                  width={EXIT_R_END_X - BELT_END_X} height={BELT_H}
                  fill="none"
                  stroke={deflector === 'straight' ? '#10b981' : '#1e3a2f'}
                  strokeWidth="2" rx="5"
                />
                <circle cx={EXIT_R_END_X} cy={BELT_Y} r={BELT_H / 2}
                  fill="#1e293b" stroke="#475569" strokeWidth="2"
                />
                <text x={EXIT_R_END_X - 60} y={BELT_Y + BELT_H / 2 + 16}
                  fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="middle">
                  LÉGER →
                </text>

                {/* ══ SORTIE HAUTE — lourdes ══ */}
                <rect
                  x={BELT_END_X - BELT_H / 2} y={EXIT_UP_TOP_Y}
                  width={BELT_H} height={BELT_Y - EXIT_UP_TOP_Y}
                  fill={motorActive && deflector === 'up' ? 'url(#beltV)' : '#0f172a'} rx="5"
                />
                <rect
                  x={BELT_END_X - BELT_H / 2} y={EXIT_UP_TOP_Y}
                  width={BELT_H} height={BELT_Y - EXIT_UP_TOP_Y}
                  fill="none"
                  stroke={deflector === 'up' ? '#ef4444' : '#3b1a1a'}
                  strokeWidth="2" rx="5"
                />
                <circle cx={BELT_END_X} cy={EXIT_UP_TOP_Y} r={BELT_H / 2}
                  fill="#1e293b" stroke="#475569" strokeWidth="2"
                />
                <text x={BELT_END_X + BELT_H / 2 + 8} y={EXIT_UP_TOP_Y + 6}
                  fill="#ef4444" fontSize="10" fontFamily="monospace">
                  ↑ LOURD
                </text>

                {/* ══ ZONE BALANCE ══ */}
                <rect
                  x={BALANCE_X - 22} y={BELT_Y - BELT_H / 2 - 8}
                  width={44} height={BELT_H + 16}
                  fill="none" stroke="#f59e0b" strokeWidth="1.2"
                  strokeDasharray="5,3" rx="4"
                />
                <text x={BALANCE_X} y={BELT_Y + BELT_H / 2 + 16}
                  fill="#f59e0b" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  ⚖ BALANCE
                </text>

                {/* ══ AIGUILLAGE (indicateur rotatif) ══ */}
                <g transform={`translate(${BELT_END_X}, ${BELT_Y})`}
                  style={{ transition: 'transform 0.3s' }}>
                  <circle r={BELT_H / 2 - 1}
                    fill={deflector === 'up' ? '#ef444420' : '#10b98120'}
                    stroke={deflector === 'up' ? '#ef4444' : '#10b981'}
                    strokeWidth="2"
                  />
                  {/* Flèche SVG selon direction */}
                  {deflector === 'up' ? (
                    <line x1="0" y1="8" x2="0" y2="-9" stroke="#ef4444" strokeWidth="3"
                      strokeLinecap="round"
                      markerEnd="url(#arrowUp)"
                    />
                  ) : (
                    <line x1="-9" y1="0" x2="8" y2="0" stroke="#10b981" strokeWidth="3"
                      strokeLinecap="round"
                    />
                  )}
                  <text x="0" y="4" textAnchor="middle"
                    fill={deflector === 'up' ? '#ef4444' : '#10b981'}
                    fontSize="15" fontWeight="bold">
                    {deflector === 'up' ? '↑' : '→'}
                  </text>
                </g>

                {/* ══ LABEL ENTRÉE ══ */}
                <text x={BELT_START_X} y={BELT_Y + BELT_H / 2 + 16}
                  fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  ENTRÉE
                </text>

                {/* ══ CAISSES ══ */}
                {activeCaisses.map(caisse => {
                  const { x, y }  = getBoxCoords(caisse);
                  const isLight   = caisse.weight < WEIGHT_THRESHOLD;
                  const isWeighed = caisse.weighed;

                  // Couleur selon état : en transit = violet, pesée légère = vert, pesée lourde = rouge
                  const fillCol   = !isWeighed ? '#7c3aed' : isLight ? '#059669' : '#b91c1c';
                  const bordCol   = !isWeighed ? '#a78bfa' : isLight ? '#34d399' : '#f87171';

                  return (
                    <g key={caisse.id} transform={`translate(${x - 18}, ${y - 20})`}>
                      {/* Ombre */}
                      <rect x="2" y="2" width="36" height="40" rx="4" fill="#00000060" />
                      {/* Corps */}
                      <rect width="36" height="40" rx="4" fill={fillCol + '55'} stroke={bordCol} strokeWidth="1.5" />
                      {/* Hachures dessus */}
                      <rect y="0" width="36" height="8" rx="2" fill={fillCol + '80'} />
                      {/* Poids */}
                      <text x="18" y="22" textAnchor="middle" fill={bordCol} fontSize="9" fontWeight="bold">
                        {caisse.weight}g
                      </text>
                      {/* Label */}
                      <text x="18" y="34" textAnchor="middle" fill="#94a3b8" fontSize="6.5">
                        {caisse.label.slice(-4)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Zones triées */}
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                <div className="text-xs font-bold text-emerald-400 mb-2">
                   LÉGÈRES (200 g) — {sortedBoxes.light.length}
                </div>
                <div className="text-[8px] text-slate-400 font-mono leading-5 max-h-14 overflow-y-auto">
                  {sortedBoxes.light.length > 0
                    ? sortedBoxes.light.map(b => b.label).join(' · ')
                    : '—'}
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                <div className="text-xs font-bold text-red-400 mb-2">
                   LOURDES (400 g) — {sortedBoxes.heavy.length}
                </div>
                <div className="text-[8px] text-slate-400 font-mono leading-5 max-h-14 overflow-y-auto">
                  {sortedBoxes.heavy.length > 0
                    ? sortedBoxes.heavy.map(b => b.label).join(' · ')
                    : '—'}
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
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed
                           p-4 rounded-2xl flex items-center gap-3 transition-all"
              >
                <Package size={20} />
                <div className="text-left">
                  <div className="font-bold text-sm">DÉMARRER</div>
                  <div className="text-[10px] opacity-70">
                    Ajouter caisse ({activeCaisses.length}/{MAX_CAPACITY})
                  </div>
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
      </main>
    </div>
  );
}