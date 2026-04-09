import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Droplet, Minus, Plus, RotateCcw, Radio, Wifi, WifiOff, MonitorSpeaker, X, Loader, AlertCircle } from 'lucide-react';

const DEFAULT_CAPACITY_ML = 300;
const DEFAULT_POUR_ML = 25;
const DEFAULT_N_SIM = 4;

const WS_URL = `ws://${window.location.hostname}:3001`;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const palette = [
  { name: 'Orange', color: '#f97316' },
  { name: 'Ananas', color: '#facc15' },
  { name: 'Fraise', color: '#fb7185' },
  { name: 'Menthe', color: '#34d399' },
  { name: 'Myrtille', color: '#60a5fa' },
  { name: 'Grenadine', color: '#fb7185' },
  { name: 'Citron', color: '#fde047' },
  { name: 'Kiwi', color: '#22c55e' },
  { name: 'Framboise', color: '#f43f5e' },
  { name: 'Coco', color: '#e2e8f0' },
  { name: 'Pêche', color: '#fdba74' },
  { name: 'Cassis', color: '#a78bfa' },
];

function buildJuices(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = palette[i % palette.length];
    out.push({
      index: i,
      id: `jus_${i}`,
      name: `Jus ${i + 1} — ${p.name}`,
      color: p.color,
    });
  }
  return out;
}

export default function DistributeurJus({
  nJuicesSim = DEFAULT_N_SIM,
  capacityMlSim = DEFAULT_CAPACITY_ML,
  pourMlSim = DEFAULT_POUR_ML,
  maxStockPerJuice = 20,
} = {}) {
  // --- MODE ---
  const [isSimulationMode, setIsSimulationMode] = useState(true);
  const [showIpModal, setShowIpModal] = useState(false);
  const [espIpInput, setEspIpInput] = useState('192.168.4.1');

  // --- ÉTAT CONNEXION (Mode Réel) ---
  const [modbusConnected, setModbusConnected] = useState(false);
  const [connectedIp, setConnectedIp] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const wsRef = useRef(null);

  // --- CONFIG / ÉTAT DISTRIBUTEUR ---
  const [n, setN] = useState(clamp(nJuicesSim, 1, 12));
  const [capacityMl, setCapacityMl] = useState(capacityMlSim);
  const [pourMl, setPourMl] = useState(pourMlSim);
  const juices = useMemo(() => buildJuices(n), [n]);

  const initialStock = useMemo(() => Object.fromEntries(juices.map(j => [j.id, 0])), [juices]);
  const initialGlass = useMemo(() => Object.fromEntries(juices.map(j => [j.id, 0])), [juices]);

  const [stock, setStock] = useState(initialStock);
  const [glass, setGlass] = useState(initialGlass);

  // Reset maps when N changes (simulation only)
  useEffect(() => {
    if (!isSimulationMode) return;
    setStock(initialStock);
    setGlass(initialGlass);
  }, [isSimulationMode, initialStock, initialGlass]);

  const totalInGlass = useMemo(
    () => Object.values(glass).reduce((a, b) => a + b, 0),
    [glass]
  );

  const remainingCapacity = Math.max(0, capacityMl - totalInGlass);

  // ─── WEBSOCKET (Mode Réel — pont vers ESP32 Modbus TCP) ─────────────────
  const closeWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setModbusConnected(false);
    setConnectedIp(null);
  }, []);

  useEffect(() => {
    if (isSimulationMode) return;

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      setConnectionError(`Impossible d'ouvrir WebSocket : ${err.message}`);
      return;
    }

    wsRef.current = ws;
    ws.onopen = () => setConnectionError(null);
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'state') {
        const s = msg.data;
        setModbusConnected(!!s.connected);
        setConnectedIp(s.espIp);

        const js = s.juice;
        if (js && typeof js.n === 'number' && js.n > 0) {
          const nextN = clamp(js.n, 1, 12);
          setN(nextN);
          setCapacityMl(js.capacityMl || DEFAULT_CAPACITY_ML);
          setPourMl(js.pourMl || DEFAULT_POUR_ML);

          const nextJuices = buildJuices(nextN);
          const nextStock = {};
          const nextGlass = {};
          for (let i = 0; i < nextN; i++) {
            const id = nextJuices[i].id;
            nextStock[id] = js.stock?.[i] ?? 0;
            nextGlass[id] = js.glass?.[i] ?? 0;
          }
          setStock(nextStock);
          setGlass(nextGlass);
        }
        if (connecting && s.connected) setConnecting(false);
      }

      if (msg.type === 'connect_result') {
        setConnecting(false);
        if (!msg.success) setConnectionError(`Échec Modbus : ${msg.error}`);
      }
      if (msg.type === 'error') {
        setConnectionError(msg.message);
      }
    };

    ws.onclose = () => setModbusConnected(false);
    ws.onerror = () => setConnectionError('Serveur backend inaccessible. Lancez : npm run server');

    return () => {
      ws.onclose = null;
      ws.close();
    };
  }, [isSimulationMode, connecting]);

  const canPour = (juiceId) => {
    if ((stock[juiceId] ?? 0) <= 0) return false;
    if (remainingCapacity <= 0) return false;
    return true;
  };

  const addStock = (juiceId, index) => {
    if (!isSimulationMode) {
      wsRef.current?.send(JSON.stringify({ type: 'juiceStockAdd', index }));
      return;
    }
    setStock(prev => ({
      ...prev,
      [juiceId]: clamp((prev[juiceId] ?? 0) + 1, 0, maxStockPerJuice),
    }));
  };

  const removeStock = (juiceId, index) => {
    if (!isSimulationMode) {
      wsRef.current?.send(JSON.stringify({ type: 'juiceStockSub', index }));
      return;
    }
    setStock(prev => ({
      ...prev,
      [juiceId]: clamp((prev[juiceId] ?? 0) - 1, 0, maxStockPerJuice),
    }));
  };

  const pour = (juiceId, index) => {
    if (!canPour(juiceId)) return;
    if (!isSimulationMode) {
      wsRef.current?.send(JSON.stringify({ type: 'juicePour', index }));
      return;
    }
    const amount = Math.min(pourMl, remainingCapacity);
    setStock(prev => ({ ...prev, [juiceId]: Math.max(0, (prev[juiceId] ?? 0) - 1) }));
    setGlass(prev => ({ ...prev, [juiceId]: (prev[juiceId] ?? 0) + amount }));
  };

  const resetGlass = () => {
    if (!isSimulationMode) {
      wsRef.current?.send(JSON.stringify({ type: 'juiceResetGlass' }));
      return;
    }
    setGlass(initialGlass);
  };
  const resetAll = () => {
    if (!isSimulationMode) {
      wsRef.current?.send(JSON.stringify({ type: 'juiceResetGlass' }));
      return;
    }
    setGlass(initialGlass);
    setStock(initialStock);
  };

  // Calcul couches (empilement) dans le verre
  const layers = useMemo(() => {
    const total = Math.max(1, totalInGlass);
    return juices
      .map(j => ({
        id: j.id,
        name: j.name,
        color: j.color,
        ml: glass[j.id] ?? 0,
        percent: ((glass[j.id] ?? 0) / total) * 100,
      }))
      .filter(l => l.ml > 0);
  }, [juices, glass, totalInGlass]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* MODAL SAISIE IP ESP32 */}
      {showIpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 p-2 rounded-xl">
                  <Radio size={18} className="text-white" />
                </div>
                <h3 className="font-bold text-white">Connexion ESP32</h3>
              </div>
              <button onClick={() => setShowIpModal(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Adresse IP de l'ESP32</label>
            <input
              type="text"
              value={espIpInput}
              onChange={e => setEspIpInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmConnect()}
              placeholder="192.168.4.1"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors mb-2"
              autoFocus
            />
            <p className="text-[10px] text-slate-600 mb-6">
              Port Modbus TCP : 502 — ID esclave : 1 — Holding Registers
            </p>

            <div className="flex gap-3">
              <button onClick={() => setShowIpModal(false)} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
                Annuler
              </button>
              <button onClick={confirmConnect} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors">
                Connecter
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-fuchsia-600 p-3 rounded-2xl shadow-lg shadow-fuchsia-900/20">
            <Droplet size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">Distributeur de Jus</h1>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">
              N sources • Stock +/- • Versement par jus
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* ZONE MODE + STATUT */}
          <div className={`px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 border transition-all ${
            isSimulationMode
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
              : modbusConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : connecting
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            {isSimulationMode ? (
              <><MonitorSpeaker size={13} /> ÉMULATION LOCALE</>
            ) : modbusConnected ? (
              <><Wifi size={13} className="animate-pulse" /> MODBUS TCP — {connectedIp}</>
            ) : connecting ? (
              <><Loader size={13} className="animate-spin" /> CONNEXION…</>
            ) : (
              <><WifiOff size={13} /> DÉCONNECTÉ</>
            )}
          </div>

          {isSimulationMode ? (
            <button
              onClick={openIpModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all active:scale-95"
            >
              <Radio size={13} /> Mode Réel
            </button>
          ) : (
            <button
              onClick={switchToSimulation}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all active:scale-95"
            >
              <MonitorSpeaker size={13} /> Mode Simulation
            </button>
          )}

          <button
            onClick={resetGlass}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all active:scale-95 border border-slate-700"
          >
            <RotateCcw size={14} /> Vider le verre
          </button>
          <button
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all active:scale-95"
          >
            <RotateCcw size={14} /> Reset total
          </button>
        </div>
      </header>

      {/* BANNIÈRE ERREUR CONNEXION */}
      {connectionError && !isSimulationMode && (
        <div className="mb-6 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl text-rose-400">
          <AlertCircle size={18} />
          <div className="flex-1">
            <p className="text-xs font-bold">Erreur de connexion</p>
            <p className="text-[11px] opacity-80">{connectionError}</p>
          </div>
          <button
            onClick={() => {
              setConnectionError(null);
              setConnecting(true);
              wsRef.current?.send(JSON.stringify({ type: 'connect', ip: espIpInput }));
            }}
            className="text-[10px] underline opacity-70 hover:opacity-100"
          >
            Réessayer
          </button>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* VERRE */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">
              Verre à cocktail
            </h2>

            <div className="flex items-center justify-center">
              <div className="relative w-40 h-64">
                <div className="absolute inset-0 rounded-[36px] border-4 border-slate-700/70 bg-slate-950 shadow-inner overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]"></div>

                  {/* Niveau de remplissage */}
                  <div
                    className="absolute left-0 right-0 bottom-0 transition-[height] duration-300"
                    style={{ height: `${(totalInGlass / capacityMl) * 100}%` }}
                  >
                    {layers.length === 0 ? (
                      <div className="h-full w-full bg-slate-800/30" />
                    ) : (
                      <div className="h-full w-full flex flex-col-reverse">
                        {layers.map(l => (
                          <div
                            key={l.id}
                            className="w-full"
                            style={{
                              height: `${l.percent}%`,
                              background: `linear-gradient(180deg, ${l.color}cc, ${l.color}ff)`,
                            }}
                            title={`${l.name} — ${l.ml} ml`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reflet */}
                <div className="absolute inset-0 rounded-[36px] pointer-events-none">
                  <div className="absolute left-6 top-6 w-6 h-40 bg-white/5 blur-sm rounded-full" />
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div className="text-2xl font-mono text-cyan-400 font-bold">{totalInGlass}</div>
                <div className="text-[9px] text-slate-500 uppercase mt-1">ml versés</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div className="text-2xl font-mono text-emerald-400 font-bold">{remainingCapacity}</div>
                <div className="text-[9px] text-slate-500 uppercase mt-1">ml restants</div>
              </div>
            </div>

            <p className="mt-4 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Capacité {capacityMl} ml • Dose {pourMl} ml / versement
            </p>
          </section>
        </div>

        {/* COMMANDES */}
        <div className="lg:col-span-3 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">
              Sources de jus (N = {n})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {juices.map(j => {
                const s = stock[j.id] ?? 0;
                const poured = glass[j.id] ?? 0;
                const disabledPour = !canPour(j.id);

                return (
                  <div key={j.id} className="bg-slate-950 rounded-3xl border border-slate-800 p-5 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{
                      backgroundImage: `radial-gradient(circle at 20% 10%, ${j.color} 0, transparent 45%)`,
                    }} />

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: j.color }} />
                          <h3 className="text-sm font-black uppercase tracking-tight">{j.name}</h3>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-1">
                          Stock: {s} • Dans le verre: {poured} ml
                        </p>
                      </div>
                      <div className="text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/60">
                        {j.id}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-2">
                      <button
                        onClick={() => removeStock(j.id, j.index)}
                        disabled={s <= 0}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900/50 disabled:text-slate-600 disabled:cursor-not-allowed border border-slate-800 text-xs font-bold transition-all active:scale-95"
                        title="Retirer 1 jus du stock"
                      >
                        <Minus size={14} /> -
                      </button>
                      <button
                        onClick={() => addStock(j.id, j.index)}
                        disabled={s >= maxStockPerJuice}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900/50 disabled:text-slate-600 disabled:cursor-not-allowed border border-slate-800 text-xs font-bold transition-all active:scale-95"
                        title="Ajouter 1 jus au stock"
                      >
                        <Plus size={14} /> +
                      </button>

                      <div className="flex-1" />

                      <button
                        onClick={() => pour(j.id, j.index)}
                        disabled={disabledPour}
                        className="group relative flex items-center justify-between gap-3 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-[0.98] overflow-hidden border"
                        style={{
                          backgroundColor: disabledPour ? 'rgba(15, 23, 42, 0.5)' : `${j.color}22`,
                          borderColor: disabledPour ? 'rgba(51, 65, 85, 0.8)' : `${j.color}55`,
                          color: disabledPour ? 'rgb(100 116 139)' : 'rgb(226 232 240)',
                        }}
                        title={disabledPour ? (s <= 0 ? 'Stock vide' : 'Verre plein') : `Verser ${pourMl} ml`}
                      >
                        <span>Verser</span>
                        <Droplet size={16} className={disabledPour ? '' : 'group-hover:translate-y-[1px] transition-transform'} />
                        {!disabledPour && (
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{
                            background: `linear-gradient(90deg, transparent, ${j.color}22, transparent)`,
                          }} />
                        )}
                      </button>
                    </div>

                    <div className="mt-4 h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                      <div
                        className="h-full transition-[width] duration-300"
                        style={{
                          width: `${(s / maxStockPerJuice) * 100}%`,
                          background: `linear-gradient(90deg, ${j.color}aa, ${j.color}ff)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );

  function openIpModal() {
    setConnectionError(null);
    setShowIpModal(true);
  }

  function confirmConnect() {
    if (!espIpInput.trim()) return;
    setShowIpModal(false);
    setConnecting(true);
    setConnectionError(null);
    setIsSimulationMode(false);
    setTimeout(() => {
      wsRef.current?.send(JSON.stringify({ type: 'connect', ip: espIpInput.trim() }));
    }, 500);
  }

  function switchToSimulation() {
    wsRef.current?.send(JSON.stringify({ type: 'disconnect' }));
    closeWS();
    setIsSimulationMode(true);
    setConnectionError(null);
    setConnecting(false);
    setN(clamp(nJuicesSim, 1, 12));
    setCapacityMl(capacityMlSim);
    setPourMl(pourMlSim);
  }
}
