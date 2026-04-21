import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Eye, Cpu, Package, MonitorSpeaker } from 'lucide-react';

// ── Constantes simulation ────────────────────────────────────────────────────
const TICK_MS       = 50;
const TRAVEL_MS     = 5000;
const POS_INC       = 100 / (TRAVEL_MS / TICK_MS);
const INJECT_DELAY  = 1800;   // ms entre chaque injection auto
const ROBOT_MOVE_MS = 1300;
const GRIP_MS       = 500;
const PLACE_MS      = 600;
const PACK_EXIT_MS  = 2200;
const SCAN_MS       = 2600;
const PACK_COLS     = 3;
const MAX_CONV      = 8;

// ── Layout SVG ───────────────────────────────────────────────────────────────
const SW = 860, SH = 420;
const BELT_Y  = 210, BELT_H  = 36, BELT_X0 = 30,  BELT_X1 = 450;
const CAN_W = 28, CAN_SPACING = CAN_W + 4;              // 32 px centre à centre
const ROBOT_HOME_X = 510, ROBOT_HOME_Y = 55;
const PICKUP_X = BELT_X1 - CAN_SPACING, PICKUP_Y = BELT_Y - BELT_H / 2 - 12;
const PACK_CENTER_X = 680, PACK_Y0 = 80;
const SLOT_W = 32, SLOT_H = 46, SLOT_GAP = 7, PACK_ROW_H = SLOT_H + SLOT_GAP;
const EXIT_Y = 345, EXIT_X0 = 580, EXIT_X1 = 840;

// ── Helpers ──────────────────────────────────────────────────────────────────
const lerp  = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function packSlotPos(type, idx) {
  const rows = type === 12 ? 4 : 2;
  const r    = Math.floor(idx / PACK_COLS);
  const c    = idx % PACK_COLS;
  const totalW = PACK_COLS * SLOT_W + (PACK_COLS - 1) * SLOT_GAP;
  const x = PACK_CENTER_X - totalW / 2 + c * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
  const y = PACK_Y0 + r * PACK_ROW_H + SLOT_H / 2;
  return { x, y, rows };
}

function makeState() {
  return {
    phase: 'idle',         // idle | scanning | conveying | pickup | gripping | to_pack | placing | to_home | pack_exit
    cans: [],              // {id, pos, done}
    nextId: 0,
    phaseTimer: 0,
    injectTimer: 0,
    packType: 6,           // 6 | 12
    packFilled: 0,
    packSlots: [],         // [{filled, color}]
    packsCompleted: 0,
    gripped: [],           // 3 cans attached to robot
    packExitT: 0,          // 0→1 pack sliding right
    beltTick: 0,
    visionLabel: null,
    targetPackRow: 0,      // which row robot is placing into
  };
}

// ── Couleurs canettes (aléatoire pour diversité) ──────────────────────────────
const CAN_COLORS = ['#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2'];

// ────────────────────────────────────────────────────────────────────────────
export default function EmballageCanettes() {
  const simRef  = useRef(makeState());
  const [view,  setView]  = useState(makeState());
  const running = useRef(false);

  // ── Tick principal ────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const s = { ...simRef.current, cans: [...simRef.current.cans] };

    if (s.phase === 'idle') { simRef.current = s; setView({ ...s }); return; }

    // ── Animation tapis ────────────────────────────────────────────────────
    s.beltTick = (s.beltTick + 1) % 40;

    // ── Phase : scanning (vision) ──────────────────────────────────────────
    if (s.phase === 'scanning') {
      s.phaseTimer -= TICK_MS;
      if (s.phaseTimer <= 0) {
        s.packType   = Math.random() < 0.5 ? 6 : 12;
        s.visionLabel = `${s.packType}-pack`;
        s.packFilled = 0;
        s.packSlots  = Array(s.packType).fill(null).map(() => ({ filled: false, color: '#64748b' }));
        s.gripped    = [];
        s.phase      = 'conveying';
        s.injectTimer = 0;
      }
      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : conveying ─────────────────────────────────────────────────
    if (s.phase === 'conveying') {
      // Injection automatique
      s.injectTimer -= TICK_MS;
      if (s.injectTimer <= 0 && s.cans.filter(c => !c.done).length < MAX_CONV) {
        s.cans.push({
          id:    s.nextId++,
          pos:   0,
          done:  false,
          color: CAN_COLORS[s.nextId % CAN_COLORS.length],
        });
        s.injectTimer = INJECT_DELAY;
      }

      // Avance canettes (stop si une bloque à 100)
      const blocked = s.cans.filter(c => !c.done && c.pos >= 100).length >= 3;
      if (!blocked) {
        s.cans = s.cans.map(c =>
          c.done ? c : { ...c, pos: Math.min(100, c.pos + POS_INC) }
        );
      }

      // Déclenchement robot si 3 canettes à la sortie
      const atExit = s.cans.filter(c => !c.done && c.pos >= 100);
      if (atExit.length >= 3) {
        s.gripped    = atExit.slice(0, 3).map(c => c.id);
        s.phase      = 'pickup';
        s.phaseTimer = ROBOT_MOVE_MS;
      }

      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : pickup (robot descend vers convoyeur) ──────────────────────
    if (s.phase === 'pickup') {
      s.phaseTimer -= TICK_MS;
      if (s.phaseTimer <= 0) { s.phase = 'gripping'; s.phaseTimer = GRIP_MS; }
      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : gripping (aspiration active) ─────────────────────────────
    if (s.phase === 'gripping') {
      s.phaseTimer -= TICK_MS;
      if (s.phaseTimer <= 0) {
        // Retirer les 3 canettes saisies du convoyeur
        s.cans = s.cans.map(c =>
          s.gripped.includes(c.id) ? { ...c, done: true } : c
        );
        s.targetPackRow = Math.floor(s.packFilled / PACK_COLS);
        s.phase      = 'to_pack';
        s.phaseTimer = ROBOT_MOVE_MS;
      }
      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : to_pack (robot se déplace vers le pack) ───────────────────
    if (s.phase === 'to_pack') {
      s.phaseTimer -= TICK_MS;
      if (s.phaseTimer <= 0) { s.phase = 'placing'; s.phaseTimer = PLACE_MS; }
      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : placing (dépose canettes dans le pack) ────────────────────
    if (s.phase === 'placing') {
      s.phaseTimer -= TICK_MS;
      if (s.phaseTimer <= 0) {
        // Remplir 3 slots
        const grippedColors = s.gripped.map(gid => {
          const can = simRef.current.cans.find(c => c.id === gid);
          return can?.color ?? '#94a3b8';
        });
        for (let i = 0; i < 3; i++) {
          if (s.packFilled + i < s.packSlots.length) {
            s.packSlots[s.packFilled + i] = { filled: true, color: grippedColors[i] };
          }
        }
        s.packFilled += 3;
        s.gripped    = [];
        s.phase      = 'to_home';
        s.phaseTimer = ROBOT_MOVE_MS;
      }
      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : to_home (robot retourne en position repos) ────────────────
    if (s.phase === 'to_home') {
      s.phaseTimer -= TICK_MS;
      if (s.phaseTimer <= 0) {
        if (s.packFilled >= s.packType) {
          s.phase      = 'pack_exit';
          s.phaseTimer = PACK_EXIT_MS;
          s.packExitT  = 0;
        } else {
          s.phase      = 'conveying';
          s.injectTimer = 0;
        }
      }
      simRef.current = s; setView({ ...s }); return;
    }

    // ── Phase : pack_exit (pack part sur le convoyeur sortie) ─────────────
    if (s.phase === 'pack_exit') {
      s.phaseTimer -= TICK_MS;
      s.packExitT   = clamp(1 - s.phaseTimer / PACK_EXIT_MS, 0, 1);
      if (s.phaseTimer <= 0) {
        s.packsCompleted++;
        s.phase      = 'scanning';
        s.phaseTimer = SCAN_MS;
        s.packExitT  = 0;
        s.visionLabel = null;
      }
      simRef.current = s; setView({ ...s }); return;
    }

    simRef.current = s;
    setView({ ...s });
  }, []);

  const start = () => {
    const s = makeState();
    s.phase      = 'scanning';
    s.phaseTimer = SCAN_MS;
    simRef.current = s;
    setView({ ...s });
    running.current = true;
  };

  const stop = () => {
    running.current = false;
    const s = makeState();
    simRef.current = s;
    setView({ ...s });
  };

  // ── useEffect propre pour le tick ─────────────────────────────────────────
  useEffect(() => {
    if (view.phase === 'idle') return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick, view.phase === 'idle']);

  // ── Calcul position robot (interpolée) ────────────────────────────────────
  const getRobotPos = () => {
    const { phase, phaseTimer, targetPackRow } = view;
    const t      = clamp(1 - phaseTimer / ROBOT_MOVE_MS, 0, 1);
    const packY  = PACK_Y0 + targetPackRow * PACK_ROW_H + SLOT_H / 2;

    if (phase === 'idle' || phase === 'scanning' || phase === 'conveying')
      return { x: ROBOT_HOME_X, y: ROBOT_HOME_Y };
    if (phase === 'pickup')
      return { x: lerp(ROBOT_HOME_X, PICKUP_X, t), y: lerp(ROBOT_HOME_Y, PICKUP_Y, t) };
    if (phase === 'gripping')
      return { x: PICKUP_X, y: PICKUP_Y };
    if (phase === 'to_pack')
      return { x: lerp(PICKUP_X, PACK_CENTER_X, t), y: lerp(PICKUP_Y, packY, t) };
    if (phase === 'placing')
      return { x: PACK_CENTER_X, y: packY };
    if (phase === 'to_home')
      return { x: lerp(PACK_CENTER_X, ROBOT_HOME_X, t), y: lerp(packY, ROBOT_HOME_Y, t) };
    return { x: ROBOT_HOME_X, y: ROBOT_HOME_Y };
  };

  const robot = getRobotPos();
  const isGripping   = view.phase === 'gripping' || view.phase === 'to_pack' || view.phase === 'placing';
  const motorRunning = view.phase === 'conveying';

  // ── Statut texte ─────────────────────────────────────────────────────────
  const statusText = {
    idle:      'En attente — appuyer sur START',
    scanning:  'Vision : détection du format de pack...',
    conveying: 'Convoyeur actif — chargement automatique',
    pickup:    'Robot : déplacement vers la sortie convoyeur',
    gripping:  'Robot : aspiration des 3 canettes',
    to_pack:   'Robot : déplacement vers le pack',
    placing:   'Robot : dépôt des canettes',
    to_home:   'Robot : retour en position repos',
    pack_exit: 'Pack complet — évacuation sur convoyeur sortie',
  }[view.phase] ?? '';

  // ── Scan progress bar ────────────────────────────────────────────────────
  const scanFraction = view.phase === 'scanning'
    ? clamp(1 - view.phaseTimer / SCAN_MS, 0, 1)
    : view.visionLabel ? 1 : 0;

  const hOff = view.beltTick;

  return (
    <div className="text-slate-100 font-sans">

      {/* BADGE SIMULATION */}
      <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-bold w-fit">
        <MonitorSpeaker size={13} />
        ÉMULATION LOCALE — Simulation uniquement
      </div>

      {/* HEADER CONTRÔLES */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 p-4 bg-slate-900 rounded-2xl border border-slate-800">

        <div className="flex items-center gap-4">
          {view.phase === 'idle' ? (
            <button
              onClick={start}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-emerald-900/30"
            >
              <Play size={16} fill="currentColor" /> START
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm uppercase tracking-wider transition-all active:scale-95"
            >
              <Square size={16} fill="currentColor" /> STOP
            </button>
          )}

          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-300">{statusText}</span>
            <span className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">
              Phase : <span className="text-blue-400">{view.phase.toUpperCase()}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Badge pack type */}
          {view.visionLabel && (
            <div className={`px-3 py-2 rounded-xl text-xs font-black border flex items-center gap-2 ${
              view.packType === 12
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
            }`}>
              <Package size={14} />
              {view.visionLabel.toUpperCase()} DÉTECTÉ
            </div>
          )}
          {/* Packs complétés */}
          <div className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-center">
            <div className="text-2xl font-mono font-black text-emerald-400">{view.packsCompleted}</div>
            <div className="text-[8px] text-slate-500 uppercase">Packs envoyés</div>
          </div>
          {/* Progression pack actuel */}
          <div className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-center min-w-[80px]">
            <div className="text-2xl font-mono font-black text-amber-400">
              {view.packFilled}/{view.packType > 0 ? view.packType : '?'}
            </div>
            <div className="text-[8px] text-slate-500 uppercase">Canettes pack</div>
          </div>
        </div>
      </div>

      {/* VISUALISATION SVG */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${SW} ${SH}`}
          style={{ width: '100%', minWidth: 640, height: 'auto' }}
        >
          <defs>
            <pattern id="beltPat" x={hOff} y="0" width="32" height={BELT_H} patternUnits="userSpaceOnUse">
              <rect width="32" height={BELT_H} fill="#1e293b" />
              <line x1="0" y1="0" x2="0" y2={BELT_H} stroke="#334155" strokeWidth="3" />
            </pattern>
            <pattern id="exitPat" x={hOff * 1.5} y="0" width="28" height="22" patternUnits="userSpaceOnUse">
              <rect width="28" height="22" fill="#1e293b" />
              <line x1="0" y1="0" x2="0" y2="22" stroke="#334155" strokeWidth="2.5" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="suction-glow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* ══ ZONE VISION ══ */}
          <g>
            <rect x={PACK_CENTER_X - 85} y="8" width="170" height="44" rx="8"
              fill="#0f172a" stroke={view.phase === 'scanning' ? '#8b5cf6' : '#1e293b'}
              strokeWidth="1.5" />
            <Eye x={PACK_CENTER_X - 77} y="18" size={20}
              fill="none" stroke={view.phase === 'scanning' ? '#a78bfa' : '#475569'} strokeWidth="1.5" />
            <text x={PACK_CENTER_X - 50} y="28" fill={view.phase === 'scanning' ? '#c4b5fd' : '#64748b'}
              fontSize="9" fontFamily="monospace" fontWeight="bold">VISION SYSTEM</text>
            {/* Scan progress bar */}
            <rect x={PACK_CENTER_X - 77} y="36" width="154" height="5" rx="3" fill="#1e293b" />
            <rect x={PACK_CENTER_X - 77} y="36" width={154 * scanFraction} height="5" rx="3"
              fill={view.visionLabel ? '#8b5cf6' : '#6d28d9'} />
            {view.visionLabel && (
              <text x={PACK_CENTER_X} y="46" textAnchor="middle" fill="#a78bfa" fontSize="8" fontFamily="monospace">
                {view.visionLabel.toUpperCase()} DÉTECTÉ
              </text>
            )}
          </g>

          {/* ══ CONVOYEUR PRINCIPAL ══ */}
          {/* Rouleaux gauche/droite */}
          {[BELT_X0, BELT_X1].map((cx, i) => (
            <circle key={i} cx={cx} cy={BELT_Y} r={BELT_H / 2}
              fill="#1e293b" stroke="#475569" strokeWidth="2" />
          ))}
          {/* Tapis */}
          <rect x={BELT_X0} y={BELT_Y - BELT_H / 2} width={BELT_X1 - BELT_X0} height={BELT_H}
            fill={motorRunning ? 'url(#beltPat)' : '#0f172a'} rx="4" />
          <rect x={BELT_X0} y={BELT_Y - BELT_H / 2} width={BELT_X1 - BELT_X0} height={BELT_H}
            fill="none" stroke="#334155" strokeWidth="2" rx="4" />
          {/* Label entrée */}
          <text x={BELT_X0} y={BELT_Y + BELT_H / 2 + 14} textAnchor="middle"
            fill="#64748b" fontSize="9" fontFamily="monospace">ENTRÉE</text>
          {/* Label sortie / pickup zone */}
          <text x={BELT_X1} y={BELT_Y + BELT_H / 2 + 14} textAnchor="middle"
            fill="#f59e0b" fontSize="9" fontFamily="monospace">PICKUP</text>
          {/* Marqueur zone pickup — couvre les 3 canettes côte à côte */}
          <rect
            x={BELT_X1 - CAN_SPACING * 2 - 10}
            y={BELT_Y - BELT_H / 2 - 4}
            width={CAN_SPACING * 2 + CAN_W + 14}
            height={BELT_H + 8}
            fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,3" rx="4" />

          {/* ══ CANETTES SUR CONVOYEUR ══ */}
          {(() => {
            const grippedSet  = new Set(view.gripped);
            const lifting     = view.phase === 'gripping' || view.phase === 'to_pack' || view.phase === 'placing';
            const activeCans  = view.cans.filter(c => !c.done && !(lifting && grippedSet.has(c.id)));
            const exitCans    = activeCans.filter(c => c.pos >= 100);
            const movingCans  = activeCans.filter(c => c.pos <  100);
            const cy          = BELT_Y - BELT_H / 2 + 2;

            const renderCan = (can, cx, highlight) => (
              <g key={can.id} transform={`translate(${cx - CAN_W / 2}, ${cy})`}>
                <rect x="0" y="0" width={CAN_W} height="34" rx="5"
                  fill={highlight ? can.color : can.color + 'cc'}
                  stroke={highlight ? '#fff' : can.color}
                  strokeWidth={highlight ? '2' : '1'}
                  filter={highlight ? 'url(#glow)' : undefined} />
                <rect x="4" y="4"  width={CAN_W - 8} height="4" rx="2" fill="rgba(255,255,255,0.2)" />
                <rect x="4" y="26" width={CAN_W - 8} height="4" rx="2" fill="rgba(0,0,0,0.2)" />
              </g>
            );

            return [
              ...movingCans.map(c => renderCan(c, BELT_X0 + (c.pos / 100) * (BELT_X1 - BELT_X0), false)),
              // Exit cans spread backward: [0]=front at BELT_X1, [1] at BELT_X1-32, [2] at BELT_X1-64
              ...exitCans.map((c, idx) => renderCan(c, BELT_X1 - idx * CAN_SPACING, true)),
            ];
          })()}

          {/* ══ RAIL ROBOT ══ */}
          <rect x={ROBOT_HOME_X - 6} y={ROBOT_HOME_Y - 10} width={12} height={PICKUP_Y - ROBOT_HOME_Y + 50}
            fill="#1e293b" stroke="#334155" strokeWidth="1.5" rx="6" />
          {/* Base robot (plafond) */}
          <rect x={ROBOT_HOME_X - 30} y={ROBOT_HOME_Y - 18} width={60} height={18}
            fill="#1e293b" stroke="#475569" strokeWidth="1.5" rx="6" />
          <circle cx={ROBOT_HOME_X} cy={ROBOT_HOME_Y - 9} r={5} fill="#64748b" />

          {/* ══ BRAS ROBOT ══ */}
          {/* Ligne du bras (du home au tip) */}
          <line x1={ROBOT_HOME_X} y1={ROBOT_HOME_Y} x2={robot.x} y2={robot.y}
            stroke="#475569" strokeWidth="4" strokeLinecap="round" />
          {/* Corps du bras */}
          <circle cx={robot.x} cy={robot.y} r={10}
            fill={isGripping ? '#f59e0b' : '#1e293b'}
            stroke={isGripping ? '#fbbf24' : '#475569'}
            strokeWidth="2"
            filter={isGripping ? 'url(#suction-glow)' : undefined} />
          <Cpu x={robot.x - 7} y={robot.y - 7} size={14}
            fill="none" stroke={isGripping ? '#fbbf24' : '#64748b'} strokeWidth="1.5" />

          {/* Ventouses (3 cercles) — une par canette, espacées de CAN_SPACING */}
          {[-CAN_SPACING, 0, CAN_SPACING].map((dx, i) => (
            <g key={i}>
              <rect x={robot.x + dx - 8} y={robot.y + 10} width={16} height={6} rx="3"
                fill={isGripping ? '#f59e0b' : '#334155'}
                stroke={isGripping ? '#fbbf24' : '#475569'} strokeWidth="1" />
              <circle cx={robot.x + dx} cy={robot.y + 20} r={7}
                fill={isGripping ? '#fef08a30' : '#1e293b'}
                stroke={isGripping ? '#fde047' : '#475569'}
                strokeWidth={isGripping ? '2' : '1'}
                filter={isGripping ? 'url(#glow)' : undefined} />
              {isGripping && (
                <circle cx={robot.x + dx} cy={robot.y + 20} r={3} fill="#fbbf24" />
              )}
            </g>
          ))}

          {/* Canettes saisies — visibles dès l'aspiration, une sous chaque ventouse */}
          {(view.phase === 'gripping' || view.phase === 'to_pack' || view.phase === 'placing') &&
            view.gripped.map((gid, i) => {
              // gripped[0]=can le plus à droite (BELT_X1), gripped[2]=le plus à gauche
              const dxOffsets = [CAN_SPACING, 0, -CAN_SPACING];
              const dx    = dxOffsets[i] ?? 0;
              const color = view.cans.find(c => c.id === gid)?.color ?? CAN_COLORS[gid % CAN_COLORS.length];
              return (
                <g key={gid} transform={`translate(${robot.x + dx - CAN_W / 2}, ${robot.y + 28})`}>
                  <rect width={CAN_W} height="32" rx="4"
                    fill={color} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                  <rect x="3" y="3"  width={CAN_W - 6} height="3" rx="1" fill="rgba(255,255,255,0.25)" />
                  <rect x="3" y="25" width={CAN_W - 6} height="3" rx="1" fill="rgba(0,0,0,0.2)" />
                </g>
              );
            })
          }

          {/* ══ ZONE PACK ══ */}
          {view.packSlots.length > 0 && (() => {
            const rows = view.packType / PACK_COLS;
            const totalW = PACK_COLS * (SLOT_W + SLOT_GAP) - SLOT_GAP;
            const totalH = rows * (SLOT_H + SLOT_GAP) - SLOT_GAP;
            const padX = 14, padY = 12;
            const packBoxX = PACK_CENTER_X - totalW / 2 - padX;
            const packBoxY = PACK_Y0 - padY;
            const exitX    = view.phase === 'pack_exit'
              ? EXIT_X0 + (EXIT_X1 - EXIT_X0) * view.packExitT
              : packBoxX;
            const exitY    = view.phase === 'pack_exit'
              ? EXIT_Y - totalH / 2 - padY
              : packBoxY;

            return (
              <g transform={`translate(${exitX - packBoxX}, ${exitY - packBoxY})`}>
                {/* Boîte pack */}
                <rect x={packBoxX} y={packBoxY}
                  width={totalW + padX * 2} height={totalH + padY * 2}
                  rx="10" fill="#0f172a"
                  stroke={view.packFilled >= view.packType ? '#10b981' : '#334155'}
                  strokeWidth={view.packFilled >= view.packType ? '2' : '1.5'} />
                <text x={PACK_CENTER_X} y={packBoxY + 9}
                  textAnchor="middle" fill="#475569" fontSize="8" fontFamily="monospace">
                  {view.packType}-PACK
                </text>
                {/* Slots */}
                {view.packSlots.map((slot, idx) => {
                  const sp = packSlotPos(view.packType, idx);
                  return (
                    <g key={idx}>
                      <rect x={sp.x - SLOT_W / 2} y={sp.y - SLOT_H / 2}
                        width={SLOT_W} height={SLOT_H} rx="5"
                        fill={slot.filled ? slot.color : '#1e293b'}
                        stroke={slot.filled ? 'rgba(255,255,255,0.3)' : '#334155'}
                        strokeWidth="1" />
                      {slot.filled && (
                        <>
                          <rect x={sp.x - SLOT_W / 2 + 4} y={sp.y - SLOT_H / 2 + 4}
                            width={SLOT_W - 8} height={5} rx="2"
                            fill="rgba(255,255,255,0.2)" />
                          <rect x={sp.x - SLOT_W / 2 + 4} y={sp.y + SLOT_H / 2 - 9}
                            width={SLOT_W - 8} height={5} rx="2"
                            fill="rgba(0,0,0,0.2)" />
                        </>
                      )}
                      {/* Indicateur prochain slot */}
                      {!slot.filled && idx === view.packFilled && view.phase !== 'pack_exit' && (
                        <rect x={sp.x - SLOT_W / 2} y={sp.y - SLOT_H / 2}
                          width={SLOT_W} height={SLOT_H} rx="5"
                          fill="none" stroke="#f59e0b"
                          strokeWidth="1.5" strokeDasharray="4,2" />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* ══ CONVOYEUR SORTIE ══ */}
          <rect x={EXIT_X0} y={EXIT_Y - 11} width={EXIT_X1 - EXIT_X0} height={22}
            fill={view.phase === 'pack_exit' ? 'url(#exitPat)' : '#0f172a'}
            rx="4" />
          <rect x={EXIT_X0} y={EXIT_Y - 11} width={EXIT_X1 - EXIT_X0} height={22}
            fill="none" stroke="#334155" strokeWidth="1.5" rx="4" />
          {[EXIT_X0, EXIT_X1].map((cx, i) => (
            <circle key={i} cx={cx} cy={EXIT_Y} r={11}
              fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          ))}
          <text x={EXIT_X1 + 8} y={EXIT_Y + 4} fill="#10b981" fontSize="10"
            fontFamily="monospace" fontWeight="bold">→</text>
          <text x={(EXIT_X0 + EXIT_X1) / 2} y={EXIT_Y + 22} textAnchor="middle"
            fill="#475569" fontSize="8" fontFamily="monospace">SORTIE</text>

          {/* ══ LÉGENDE PHASES ══ */}
          <g transform={`translate(32, ${SH - 50})`}>
            {[
              { color: '#f59e0b', label: 'Pickup zone' },
              { color: '#8b5cf6', label: 'Vision active' },
              { color: '#10b981', label: 'Pack complet' },
            ].map(({ color, label }, i) => (
              <g key={i} transform={`translate(${i * 130}, 0)`}>
                <rect width="12" height="12" rx="2" fill={color + '40'} stroke={color} strokeWidth="1.5" />
                <text x="16" y="10" fill="#64748b" fontSize="9" fontFamily="monospace">{label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* STATS BASSES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {[
          { label: 'Canettes convoyeur', value: view.cans.filter(c => !c.done).length, color: 'text-cyan-400' },
          { label: 'Pack en cours',      value: `${view.packFilled}/${view.packType || '?'}`, color: 'text-amber-400' },
          { label: 'Type détecté',        value: view.visionLabel ?? '—', color: 'text-purple-400' },
          { label: 'Packs complétés',    value: view.packsCompleted, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 rounded-2xl p-4 border border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-bold">{label}</span>
            <span className={`text-xl font-mono font-black ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
