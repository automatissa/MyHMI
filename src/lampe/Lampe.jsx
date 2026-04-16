/**
 * Composant Lampe - Pilotage d'une lampe via Modbus TCP
 * 
 * États:
 * - Simulation MODE: la lampe bascule localement
 * - Mode Réel: requête via Socket.io → lampe physique ESP32
 */

export default function Lampe({ 
  lampState, 
  onToggleLamp, 
  isSimulationMode, 
  modbusConnected 
}) {
  return (
    <main className="w-full flex-1 flex flex-col items-center mt-12 gap-8">
      <div className="bg-slate-900 rounded-[3rem] p-12 border border-slate-800 flex flex-col items-center shadow-2xl">
        
        {/* VIZUALISATION LAMPE */}
        <div className={`w-40 h-40 rounded-full border-4 shadow-2xl mb-8 transition-all duration-500 flex items-center justify-center ${
          lampState 
            ? 'bg-amber-400 border-amber-300 shadow-amber-500/50' 
            : 'bg-slate-800 border-slate-700 shadow-none'
        }`}>
          <span className="text-6xl opacity-90">{lampState ? '💡' : '🌑'}</span>
        </div>

        {/* BOUTON CONTRÔLE */}
        <button
          onClick={onToggleLamp}
          disabled={!isSimulationMode && !modbusConnected}
          className={`px-8 py-4 rounded-2xl w-full font-black text-xl tracking-wider transition-all active:scale-95 ${
            lampState
              ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20'
              : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {lampState ? 'Éteindre' : 'Allumer'}
        </button>

        {/* INFO TECHNIQUE */}
        <p className="text-slate-500 mt-8 font-mono text-sm max-w-sm text-center bg-slate-950 p-4 rounded-xl border border-slate-800">
          Pilotage : <span className="text-blue-400">Coil 2</span><br/>
          État : <span className="text-blue-400">HR 15</span><br/>
          Sortie ESP32 : <span className="text-blue-400">GPIO 15</span>
        </p>
      </div>
    </main>
  );
}
