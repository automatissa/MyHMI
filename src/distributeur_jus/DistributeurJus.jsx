import { useState } from 'react';
import { Droplets, Gauge, MonitorSpeaker, Coffee } from 'lucide-react';

const MAX_JUICES          = 3;
const BOTTLE_CAPACITY_ML  = 500;
const POUR_ML             = 50;
const JUICE_NAMES         = ['Café', 'Chocolat', 'Lait'];
const JUICE_COLORS        = ['#8B4513', '#6B3410', '#F5F5F5'];

export default function DistributeurJus() {
  const [stock,            setStock]            = useState(Array(MAX_JUICES).fill(1000));
  const [bottle,           setBottle]           = useState(Array(MAX_JUICES).fill(0));
  const [bottleTotal,      setBottleTotal]       = useState(0);
  const [isPourAnimation,  setIsPourAnimation]   = useState(false);

  const bottleCapacity  = BOTTLE_CAPACITY_ML;
  const bottlePercentage = (bottleTotal / bottleCapacity) * 100;
  const canPour = bottleTotal < bottleCapacity;

  const pourJuice = (index) => {
    if (index < 0 || index >= MAX_JUICES || stock[index] <= 0 || !canPour) return;
    const pourAmount = Math.min(POUR_ML, stock[index], bottleCapacity - bottleTotal);
    setIsPourAnimation(true);
    const newStock  = [...stock];  newStock[index]  -= pourAmount;
    const newBottle = [...bottle]; newBottle[index] += pourAmount;
    setStock(newStock);
    setBottle(newBottle);
    setBottleTotal(prev => prev + pourAmount);
    setTimeout(() => setIsPourAnimation(false), 800);
  };

  const resetGlass = () => {
    setBottle(Array(MAX_JUICES).fill(0));
    setBottleTotal(0);
  };

  return (
    <div className="text-slate-100 font-sans">

      {/* BADGE SIMULATION */}
      <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-bold w-fit">
        <MonitorSpeaker size={13} />
        ÉMULATION LOCALE — Simulation uniquement
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* COLONNE GAUCHE */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Gauge size={14} /> Configuration
            </h2>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Configuration fixe</span>
                <div className="text-center py-3 bg-slate-950 rounded-2xl border border-slate-700 text-2xl font-mono font-bold text-amber-400">
                  {MAX_JUICES} jus
                </div>
                <p className="text-[10px] text-slate-500 text-center">Café • Chocolat • Lait</p>
              </div>
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Capacité bouteille</div>
                <div className="text-xl font-mono text-cyan-400 font-bold">{bottleCapacity} mL</div>
              </div>
            </div>
          </section>

          {/* MACHINE + BOUTEILLE */}
          <section className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Bouteille</h2>
            <div className="flex flex-col items-center gap-4">

              {/* Machine à café SVG simplifié */}
              <div className="relative w-36 h-44">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-700 to-slate-800 rounded-t-3xl rounded-b-lg border-2 border-slate-600 shadow-lg">
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-7 bg-slate-900 rounded-lg border border-slate-500 flex items-center justify-center">
                    <Coffee size={14} className="text-amber-500" />
                  </div>
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 w-1.5 h-10 bg-gray-400 rounded-full border border-gray-500" />
                  <div className="absolute top-32 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <div className="w-3 h-1.5 bg-gray-400 rounded-full" />
                    {isPourAnimation && (
                      <div className="w-2 h-2 rounded-full mt-1 animate-bounce" style={{ backgroundColor: '#8B4513' }} />
                    )}
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500" />
                  </div>
                </div>
              </div>

              <div className="w-1 h-6 bg-gradient-to-b from-slate-400 to-transparent" />

              {/* Bouteille */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-20 h-40">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-3 bg-gradient-to-b from-amber-700 to-amber-800 rounded-t-full border border-amber-900" />
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-32 bg-gradient-to-r from-amber-100 to-amber-50 rounded-b-2xl border-2 border-amber-800 shadow-inner relative overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 transition-all duration-300 opacity-80"
                      style={{
                        height: `${bottlePercentage}%`,
                        background: 'linear-gradient(135deg, #8B4513 0%, #A0522D 100%)',
                        borderRadius: '0 0 16px 16px',
                      }}
                    />
                    <div className="absolute top-2 left-2 w-1.5 h-10 bg-white/20 rounded-full pointer-events-none" />
                  </div>
                  <div className="absolute top-12 left-1/2 -translate-x-1/2 w-12 h-6 bg-amber-700 rounded text-[9px] font-bold text-white flex items-center justify-center border border-amber-900">
                    {Math.round(bottleTotal)} mL
                  </div>
                </div>

                <div className="text-center">
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

        {/* COLONNE DROITE */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-8 flex items-center gap-2">
              <Droplets size={14} /> Machine à café — 3 Jus
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Array.from({ length: MAX_JUICES }).map((_, index) => {
                const color     = JUICE_COLORS[index];
                const name      = JUICE_NAMES[index];
                const jStock    = stock[index]  ?? 0;
                const jInBottle = bottle[index] ?? 0;
                const isEmpty   = jStock <= 0;

                return (
                  <button
                    key={index}
                    onClick={() => pourJuice(index)}
                    disabled={isEmpty || !canPour}
                    className="p-6 rounded-2xl transition-all transform hover:scale-105 active:scale-95 border-2 relative overflow-hidden flex flex-col items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                    style={{
                      backgroundColor: isEmpty || !canPour ? undefined : `${color}20`,
                      borderColor:     isEmpty || !canPour ? '#334155' : `${color}80`,
                    }}
                  >
                    <Coffee size={32} style={{ color }} className={isEmpty ? 'opacity-30' : ''} />
                    <div className="text-center">
                      <div className="text-sm font-bold uppercase tracking-tight mb-1" style={{ color }}>
                        {name}
                      </div>
                      <div className="text-xs text-slate-300 mb-1">
                        Stock : <span className="font-mono font-bold">{jStock}</span> mL
                      </div>
                      {jInBottle > 0 && (
                        <div className="text-xs text-slate-400">
                          Bouteille : <span className="font-mono font-bold">{jInBottle}</span> mL
                        </div>
                      )}
                      {isEmpty   && <div className="text-xs font-bold text-slate-400 mt-2">VIDE</div>}
                      {!canPour && !isEmpty && <div className="text-xs font-bold text-slate-400 mt-2">PLEIN</div>}
                    </div>
                    {!isEmpty && canPour && (
                      <div className="absolute inset-0 bg-white/5 animate-pulse pointer-events-none" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
                <div><span className="text-slate-300">• Clic bouton</span> = Verser {POUR_ML} mL</div>
                <div><span className="text-slate-300">• Stock</span> = Volume disponible</div>
                <div><span className="text-slate-300">• VIDE</span> = Stock épuisé</div>
              </div>
            </div>
          </div>

          {/* INFO MODBUS (référence) */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Carte Modbus (référence firmware)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-400">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-700"><span className="font-mono text-slate-300">HR15</span> = N jus</div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-700"><span className="font-mono text-slate-300">HR16–18</span> = Bouteille</div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-700"><span className="font-mono text-slate-300">HR20–22</span> = Stock</div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-700"><span className="font-mono text-slate-300">HR40–42</span> = ml verre</div>
            </div>
            <p className="text-[10px] text-slate-600 mt-3">Ce module fonctionne en simulation uniquement. La logique Modbus est documentée à titre de référence.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
