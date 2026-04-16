import { useState, useEffect, useRef } from 'react';
import {
  Droplets, Plus, Minus, Radio, Wifi, WifiOff, AlertCircle, Gauge,
  MonitorSpeaker, X, Loader, Beaker, Coffee
} from 'lucide-react';

const MAX_JUICES = 3;
const BOTTLE_CAPACITY_ML = 500;
const JUICE_NAMES = ['Café', 'Chocolat', 'Lait'];
const JUICE_COLORS = ['#8B4513', '#6B3410', '#F5F5F5'];
const JUICE_COLORS_BG = ['bg-amber-900', 'bg-amber-900', 'bg-slate-100'];

const WS_URL = `ws://${window.location.hostname}:3001`;

export default function DistributeurJus() {
  const [isSimulationMode, setIsSimulationMode] = useState(true);
  const [showIpModal, setShowIpModal] = useState(false);
  const [espIpInput, setEspIpInput] = useState('192.168.4.1');

  const [juiceCount, setJuiceCount] = useState(MAX_JUICES);
  const [stock, setStock] = useState(Array(MAX_JUICES).fill(1000));
  const [bottle, setBottle] = useState(Array(MAX_JUICES).fill(0));
  const [bottleTotal, setBottleTotal] = useState(0);
  const [bottleCapacity, setBottleCapacity] = useState(BOTTLE_CAPACITY_ML);
  const [isPourAnimation, setIsPourAnimation] = useState(false);

  const [modbusConnected, setModbusConnected] = useState(false);
  const [connectedIp, setConnectedIp] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const wsRef = useRef(null);

  useEffect(() => {
    if (!isSimulationMode) return;
    setJuiceCount(MAX_JUICES);
    setStock(Array(MAX_JUICES).fill(1000));
    setBottle(Array(MAX_JUICES).fill(0));
    setBottleTotal(0);
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
        setBottle(s.juice.glass ?? []);
        setBottleTotal(s.juice.totalMl ?? 0);
        setBottleCapacity(s.juice.capacityMl ?? BOTTLE_CAPACITY_ML);
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
    // Toujours exactement 3 jus, pas d'ajout possible
    return;
  };

  const removeJuice = () => {
    // Toujours exactement 3 jus, pas de suppression possible
    return;
  };

  const pourJuice = (index) => {
    if (isSimulationMode) {
      if (index < 0 || index >= juiceCount || stock[index] <= 0 || bottleTotal >= bottleCapacity) return;
      setIsPourAnimation(true);
      const pourAmount = Math.min(50, stock[index], bottleCapacity - bottleTotal);
      const newStock = [...stock];
      newStock[index] -= pourAmount;
      const newBottle = [...bottle];
      newBottle[index] = (newBottle[index] || 0) + pourAmount;
      setStock(newStock);
      setBottle(newBottle);
      setBottleTotal(prev => prev + pourAmount);
      setTimeout(() => setIsPourAnimation(false), 800);
    } else {
      wsRef.current?.send(JSON.stringify({ type: 'juicePour', index }));
      setIsPourAnimation(true);
      setTimeout(() => setIsPourAnimation(false), 800);
    }
  };

  const resetGlass = () => {
    if (isSimulationMode) {
      setBottle(Array(juiceCount).fill(0));
      setBottleTotal(0);
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

  const bottlePercentage = (bottleCapacity > 0) ? (bottleTotal / bottleCapacity) * 100 : 0;
  const canPour = bottleTotal < bottleCapacity;

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
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">Machine à Café - 3 Jus</h1>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">Café, Chocolat, Lait — Modbus TCP Distributeur</p>
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
                  <span className="text-xs text-slate-400">Configuration fixe</span>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 text-center py-3 bg-slate-950 rounded-2xl border border-slate-700 text-2xl font-mono font-bold text-amber-400">
                      {MAX_JUICES} jus
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 text-center">Café • Chocolat • Lait</p>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">Capacité bouteille</div>
                  <div className="text-xl font-mono text-cyan-400 font-bold">{bottleCapacity} mL</div>
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
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Machine à café - Bouteille</h2>
              
              <div className="flex flex-col items-center gap-6">
                {/* MACHINE À CAFÉ */}
                <div className="relative w-44 h-56 mx-auto">
                  {/* Corps machine */}
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-700 to-slate-800 rounded-t-3xl rounded-b-lg border-2 border-slate-600 shadow-lg">
                    {/* Écran/Panneau */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-32 h-8 bg-slate-900 rounded-lg border border-slate-500 flex items-center justify-center">
                      <Coffee size={16} className="text-amber-500" />
                    </div>
                    
                    {/* Tuyau de sortie */}
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 w-2 h-12 bg-gray-400 rounded-full border border-gray-500" />
                    
                    {/* Bec verseur avec animation */}
                    <div className="absolute top-36 left-1/2 -translate-x-1/2 flex flex-col items-center">
                      <div className="w-3 h-2 bg-gray-400 rounded-full" />
                      {isPourAnimation && (
                        <style>{`
                          @keyframes dropFall {
                            0% { 
                              transform: translateY(0);
                              opacity: 1;
                            }
                            100% { 
                              transform: translateY(24px);
                              opacity: 0.3;
                            }
                          }
                          .juice-drop {
                            animation: dropFall 0.8s ease-in infinite;
                            display: inline-block;
                          }
                        `}</style>
                      )}
                      {isPourAnimation && (
                        <div className="juice-drop w-2 h-2 rounded-full mt-1" style={{ backgroundColor: '#8B4513' }} />
                      )}
                    </div>

                    {/* Boutons */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
                      <div className="w-3 h-3 rounded-full bg-slate-600 border border-slate-500" />
                      <div className="w-3 h-3 rounded-full bg-slate-600 border border-slate-500" />
                    </div>
                  </div>
                </div>

                {/* GOUTTE D'EAU / TUYAU VERS BOUTEILLE */}
                <div className="flex justify-center mb-2">
                  <div className="w-1 h-8 bg-gradient-to-b from-slate-400 to-transparent" />
                </div>

                {/* BOUTEILLE */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-20 h-40">
                    {/* Goulot bouteille */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-3 bg-gradient-to-b from-amber-700 to-amber-800 rounded-t-full border border-amber-900" />
                    
                    {/* Corps bouteille */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-32 bg-gradient-to-r from-amber-100 to-amber-50 rounded-b-2xl border-2 border-amber-800 shadow-inner relative overflow-hidden">
                      {/* Liquide dans bouteille */}
                      <div
                        className="absolute bottom-0 left-0 right-0 transition-all duration-300 opacity-80"
                        style={{
                          height: `${bottlePercentage}%`,
                          background: `linear-gradient(135deg, #8B4513 0%, #A0522D 100%)`,
                          boxShadow: '0 4px 12px rgba(139, 69, 19, 0.4)',
                          borderRadius: '0 0 16px 16px'
                        }}
                      />
                      
                      {/* Reflet bouteille */}
                      <div className="absolute top-2 left-2 w-2 h-12 bg-white/20 rounded-full pointer-events-none" />
                    </div>

                    {/* Étiquette */}
                    <div className="absolute top-12 left-1/2 -translate-x-1/2 w-12 h-6 bg-amber-700 rounded text-[9px] font-bold text-white flex items-center justify-center border border-amber-900">
                      {Math.round(bottleTotal)} mL
                    </div>
                  </div>

                  {/* Informations liquide */}
                  <div className="w-full text-center">
                    <div className="text-xs text-slate-400 mb-1">Volume total</div>
                    <div className="text-lg font-mono text-amber-400 font-bold">{Math.round(bottleTotal)}/{bottleCapacity} mL</div>
                  </div>

                  <button
                    onClick={resetGlass}
                    disabled={bottleTotal === 0}
                    className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-bold transition-colors"
                  >
                    Vider la bouteille
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8">Machine à café - 3 Jus</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: MAX_JUICES }).map((_, index) => {
                  const juiceColor = JUICE_COLORS[index];
                  const juiceName = JUICE_NAMES[index];
                  const juiceStock = stock[index] ?? 0;
                  const juiceInBottle = bottle[index] ?? 0;
                  const juiceEmpty = juiceStock <= 0;

                  return (
                    <button
                      key={index}
                      onClick={() => pourJuice(index)}
                      disabled={juiceEmpty || !canPour}
                      className={`p-6 rounded-2xl transition-all transform hover:scale-105 active:scale-95 border-2 relative overflow-hidden group flex flex-col items-center gap-3 ${
                        juiceEmpty
                          ? 'bg-slate-900 border-slate-700 opacity-50 cursor-not-allowed'
                          : !canPour
                            ? 'bg-slate-900 border-slate-700 opacity-50 cursor-not-allowed'
                            : `bg-opacity-20 border-white/30 hover:border-white/60 shadow-lg hover:shadow-xl`
                      }`}
                      style={{
                        backgroundColor: juiceEmpty || !canPour ? undefined : `${juiceColor}20`,
                        borderColor: juiceEmpty || !canPour ? undefined : `${juiceColor}80`
                      }}
                    >
                      {/* Icon café */}
                      <Coffee size={32} style={{ color: juiceColor }} className={juiceEmpty ? 'opacity-30' : ''} />

                      <div className="text-center">
                        <div className="text-sm font-bold uppercase tracking-tight mb-1" style={{ color: juiceColor }}>
                          {juiceName}
                        </div>

                        <div className="text-xs text-slate-300 mb-2">
                          Stock: <span className="font-mono font-bold">{juiceStock}</span> mL
                        </div>

                        {juiceInBottle > 0 && (
                          <div className="text-xs text-slate-400">
                            Dans bouteille: <span className="font-mono font-bold">{juiceInBottle}</span> mL
                          </div>
                        )}

                        {juiceEmpty && (
                          <div className="text-xs font-bold text-slate-400 mt-2">VIDE</div>
                        )}
                        {!canPour && !juiceEmpty && (
                          <div className="text-xs font-bold text-slate-400 mt-2">PLEIN</div>
                        )}
                      </div>

                      {!juiceEmpty && canPour && (
                        <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div><span className="text-slate-400">• Clic bouton</span> = Verser 50 mL</div>
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
                    ? 'Mode Simulation — Logique de la machine exécutée localement dans le navigateur'
                    : `Mode Réel — Données Modbus depuis ESP32 @ ${connectedIp ?? '…'} · Poll 40ms`
                  }
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR15</span> = N jus (3)
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR16-18</span> = Bouteille
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR20-22</span> = Stock [Café, Chocolat, Lait]
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-700">
                  <span className="font-mono">HR40-42</span> = Bouteille [Café, Chocolat, Lait]
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
