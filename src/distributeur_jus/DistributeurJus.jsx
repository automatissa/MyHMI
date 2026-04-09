import { useState, useEffect, useRef } from 'react';
import {
  Droplets, Plus, Minus, Radio, Wifi, WifiOff, AlertCircle, Gauge,
  MonitorSpeaker, X, Loader, Beaker
} from 'lucide-react';

const MAX_JUICES = 12;
const GLASS_CAPACITY_ML = 250;
const JUICE_COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500',
  'bg-cyan-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500',
  'bg-amber-500', 'bg-lime-500', 'bg-indigo-500', 'bg-fuchsia-500'
];

const WS_URL = `ws://${window.location.hostname}:3001`;

export default function DistributeurJus() {
  const [isSimulationMode, setIsSimulationMode] = useState(true);
  const [showIpModal, setShowIpModal] = useState(false);
  const [espIpInput, setEspIpInput] = useState('192.168.4.1');

  const [juiceCount, setJuiceCount] = useState(0);
  const [stock, setStock] = useState([]);
  const [glass, setGlass] = useState([]);
  const [glassTotal, setGlassTotal] = useState(0);
  const [glassCapacity, setGlassCapacity] = useState(GLASS_CAPACITY_ML);

  const [modbusConnected, setModbusConnected] = useState(false);
  const [connectedIp, setConnectedIp] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const wsRef = useRef(null);

  useEffect(() => {
    if (!isSimulationMode) return;
    setJuiceCount(6);
    setStock(Array(6).fill(1000));
    setGlass(Array(6).fill(0));
    setGlassTotal(0);
  }, [isSimulationMode]);

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

      if (msg.type === 'state' && msg.data?.juice) {
        const s = msg.data;
        setJuiceCount(s.juice.n);
        setStock(s.juice.stock ?? []);
        setGlass(s.juice.glass ?? []);
        setGlassTotal(s.juice.totalMl ?? 0);
        setGlassCapacity(s.juice.capacityMl ?? GLASS_CAPACITY_ML);
        setModbusConnected(s.connected);
        setConnectedIp(s.espIp);
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
    ws.onerror = () => {
      setConnectionError('Serveur backend inaccessible. Lancez : npm run server');
    };

    return () => {
      ws.onclose = null;
      ws.close();
    };
  }, [isSimulationMode, connecting]);

  const addJuice = () => {
    if (isSimulationMode) {
      if (juiceCount >= MAX_JUICES) return;
      setJuiceCount(prev => prev + 1);
      setStock(prev => [...prev, 1000]);
      setGlass(prev => [...prev, 0]);
    } else {
      wsRef.current?.send(JSON.stringify({ type: 'juiceStockAdd', index: juiceCount }));
    }
  };

  const removeJuice = () => {
    if (isSimulationMode) {
      if (juiceCount <= 1) return;
      setJuiceCount(prev => prev - 1);
      setStock(prev => prev.slice(0, -1));
      setGlass(prev => prev.slice(0, -1));
    } else {
      wsRef.current?.send(JSON.stringify({ type: 'juiceStockSub', index: juiceCount - 1 }));
    }
  };

  const pourJuice = (index) => {
    if (isSimulationMode) {
      if (index < 0 || index >= juiceCount || stock[index] <= 0 || glassTotal >= glassCapacity) return;
      const pourAmount = Math.min(50, stock[index], glassCapacity - glassTotal);
      const newStock = [...stock];
      newStock[index] -= pourAmount;
      const newGlass = [...glass];
      newGlass[index] = (newGlass[index] || 0) + pourAmount;
      setStock(newStock);
      setGlass(newGlass);
      setGlassTotal(prev => prev + pourAmount);
    } else {
      wsRef.current?.send(JSON.stringify({ type: 'juicePour', index }));
    }
  };

  const resetGlass = () => {
    if (isSimulationMode) {
      setGlass(Array(juiceCount).fill(0));
      setGlassTotal(0);
    } else {
      wsRef.current?.send(JSON.stringify({ type: 'juiceResetGlass' }));
    }
  };

  const switchToSimulation = () => {
    setIsSimulationMode(true);
    setConnectionError(null);
    setConnecting(false);
  };

  const openIpModal = () => {
    setConnectionError(null);
    setShowIpModal(true);
  };

  const confirmConnect = () => {
    const ip = espIpInput.trim();
    if (!ip) return;
    setShowIpModal(false);
    setConnecting(true);
    setConnectionError(null);
    setIsSimulationMode(false);
    wsRef.current?.send(JSON.stringify({ type: 'connect', ip }));
  };

  const glassPercentage = (glassCapacity > 0) ? (glassTotal / glassCapacity) * 100 : 0;
  const canPour = glassTotal < glassCapacity;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {showIpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-amber-600 p-2 rounded-xl">
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
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-amber-500 transition-colors mb-2"
              autoFocus
            />
            <p className="text-[10px] text-slate-600 mb-6">Port Modbus TCP : 502 — ID esclave : 1 — Holding Registers</p>

            <div className="flex gap-3">
              <button onClick={() => setShowIpModal(false)} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
                Annuler
              </button>
              <button onClick={confirmConnect} className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-colors">
                Connecter
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 p-4 md:p-8 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-amber-600 p-3 rounded-2xl shadow-lg shadow-amber-900/20">
            <Droplets size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">Distributeur de Jus</h1>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Digital Twin : ESP32 WROOM / Modbus TCP — N jus configurables</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </header>

      {connectionError && !isSimulationMode && (
        <div className="mx-4 md:mx-8 mb-6 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl text-rose-400">
          <AlertCircle size={18} />
          <div className="flex-1">
            <p className="text-xs font-bold">Erreur de connexion</p>
            <p className="text-[11px] opacity-80">{connectionError}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          <div className="lg:col-span-1 space-y-6">
            <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Gauge size={14} /> Configuration
              </h2>

              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-slate-400">Nombre de jus</span>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={removeJuice}
                      disabled={juiceCount <= 1}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-950 disabled:text-slate-600 transition-colors"
                    >
                      <Minus size={18} />
                    </button>
                    <div className="flex-1 text-center py-3 bg-slate-950 rounded-2xl border border-slate-700 text-2xl font-mono font-bold text-amber-400">
                      {juiceCount} / {MAX_JUICES}
                    </div>
                    <button
                      onClick={addJuice}
                      disabled={juiceCount >= MAX_JUICES}
                      className="p-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">Capacité verre</div>
                  <div className="text-xl font-mono text-cyan-400 font-bold">{glassCapacity} mL</div>
                </div>

                <div className={`text-[9px] flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
                  isSimulationMode
                    ? 'text-amber-500 border-amber-500/20 bg-amber-500/5'
                    : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isSimulationMode ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'}`}></div>
                  {isSimulationMode ? 'Source : Simulation locale' : 'Source : ESP32 Modbus TCP'}
                </div>
              </div>
            </section>

            <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Verre Cocktail</h2>
              
              <div className="flex flex-col items-center gap-4">
                <div className="w-24 h-32 border-8 border-slate-400 rounded-b-3xl rounded-t-md relative bg-gradient-to-b from-slate-900 to-slate-800 shadow-inner">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-2xl transition-all duration-300 opacity-70"
                    style={{
                      height: `${glassPercentage}%`,
                      background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                      boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4)'
                    }}
                  />
                </div>

                <div className="w-full">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-slate-400">Volume</span>
                    <span className="text-xs font-mono text-amber-400 font-bold">{Math.round(glassTotal)} mL</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                      style={{ width: `${glassPercentage}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 text-center mt-1">
                    {Math.round(glassPercentage)}%
                  </div>
                </div>

                <button
                  onClick={resetGlass}
                  disabled={glassTotal === 0}
                  className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-bold transition-colors"
                >
                  Vider le verre
                </button>
              </div>
            </section>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Sélection des jus (N={juiceCount})</h2>

              {juiceCount === 0 ? (
                <div className="h-40 flex items-center justify-center rounded-2xl bg-slate-950 border-2 border-dashed border-slate-700">
                  <div className="text-center text-slate-600">
                    <Beaker size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-mono">Aucun jus configuré</p>
                    <p className="text-xs opacity-50">Cliquez sur + pour ajouter</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Array.from({ length: juiceCount }).map((_, index) => {
                    const juiceColor = JUICE_COLORS[index % JUICE_COLORS.length];
                    const juiceStock = stock[index] ?? 0;
                    const juiceInGlass = glass[index] ?? 0;
                    const juiceEmpty = juiceStock <= 0;

                    return (
                      <button
                        key={index}
                        onClick={() => pourJuice(index)}
                        disabled={juiceEmpty || !canPour}
                        className={`p-4 rounded-2xl transition-all transform hover:scale-105 active:scale-95 border-2 relative overflow-hidden group ${
                          juiceEmpty
                            ? 'bg-slate-900 border-slate-700 opacity-50 cursor-not-allowed'
                            : !canPour
                              ? 'bg-slate-900 border-slate-700 opacity-50 cursor-not-allowed'
                              : `${juiceColor} border-white/30 hover:border-white/60 shadow-lg`
                        }`}
                      >
                        <div className="flex justify-center mb-3">
                          <Droplets size={24} className={juiceEmpty ? 'text-slate-600' : 'text-white'} />
                        </div>

                        <div className="text-xs font-bold uppercase tracking-tight mb-2 text-white">
                          JUS {index + 1}
                        </div>

                        <div className="text-[10px] text-white/80 mb-2">
                          Stock: <span className="font-mono font-bold">{juiceStock}</span>ml
                        </div>

                        {juiceInGlass > 0 && (
                          <div className="text-[10px] text-white/60">
                            Dans le verre: <span className="font-mono font-bold text-white">{juiceInGlass}</span>ml
                          </div>
                        )}

                        {juiceEmpty && (
                          <div className="text-[10px] font-bold text-white/60 mt-2">VIDE</div>
                        )}
                        {!canPour && !juiceEmpty && (
                          <div className="text-[10px] font-bold text-white/60 mt-2">PLEIN</div>
                        )}

                        {!juiceEmpty && canPour && (
                          <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div><span className="text-slate-400">• Bouton</span> = Verser le jus (50 mL)</div>
                  <div><span className="text-slate-400">• Stock</span> = Volume disponible</div>
                  <div><span className="text-slate-400">• VIDE</span> = Stock épuisé</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl">
              <div className="flex items-center gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div className={`w-1.5 h-1.5 rounded-full ${isSimulationMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium flex-1">
                  {isSimulationMode
                    ? 'Mode Simulation — Logique du distributeur exécutée localement dans le navigateur'
                    : `Mode Réel — Données Modbus Holding Registers depuis ESP32 @ ${connectedIp ?? '…'} · Poll 40ms`
                  }
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR15</span> = Nombre jus (N)
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR16-18</span> = Verre (capacité, volume)
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR20-31</span> = Stock jus [0..11]
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR40-51</span> = Verre jus [0..11]
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
