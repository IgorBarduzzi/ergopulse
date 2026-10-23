import React from "react";
import { Camera, Layers } from "lucide-react";

export interface VirtualStudioProps {
  telemetry: any;
  onSelectMode: (mode: string) => void;
  currentMode: string;
}

const STUDIO_PRESETS = [
  {
    id: "bokeh_heavy",
    name: "Bokeh Cinematográfico",
    desc: "Desfoque cremoso estilo lente 85mm f/1.4",
    badge: "DSLR",
    color: "from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-300",
  },
  {
    id: "bokeh_light",
    name: "Desfoque Suave",
    desc: "Suavização natural de fundo para reuniões",
    badge: "Portrait",
    color: "from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-300",
  },
  {
    id: "cyberpunk",
    name: "Skyline Cyberpunk",
    desc: "Cenário noturno neon com grade de horizonte",
    badge: "Sci-Fi",
    color: "from-fuchsia-500/20 to-purple-500/20 border-fuchsia-500/40 text-fuchsia-300",
  },
  {
    id: "matrix",
    name: "Matrix Digital Rain",
    desc: "Chuva de código binário verde fosfórico",
    badge: "Hacker",
    color: "from-emerald-500/20 to-green-500/20 border-emerald-500/40 text-emerald-300",
  },
  {
    id: "greenscreen",
    name: "Chroma Key (Verde)",
    desc: "Fundo verde sólido puro para OBS Studio & Streaming",
    badge: "Streaming",
    color: "from-lime-500/20 to-emerald-500/20 border-lime-500/40 text-lime-300",
  },
];

export const VirtualStudio: React.FC<VirtualStudioProps> = ({
  telemetry,
  onSelectMode,
  currentMode,
}) => {
  const segMetrics = telemetry?.metrics;
  const coverage = segMetrics?.person_coverage_pct ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Presets Selector */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Smart Studio & Fundos Virtuais</h3>
              <p className="text-xs text-slate-400">
                Segmentação semântica neural em tempo real com 0 delay (Edge AI)
              </p>
            </div>
          </div>
          <div className="px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
            Cobertura: {coverage}% da cena
          </div>
        </div>

        {/* Preset Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          {STUDIO_PRESETS.map((p) => {
            const isSelected = currentMode === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelectMode(p.id)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  isSelected
                    ? `bg-gradient-to-br ${p.color} ring-2 ring-white/80 shadow-xl scale-[1.02]`
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/10 uppercase">
                    {p.badge}
                  </span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
                </div>
                <div>
                  <div className="font-bold text-xs text-white">{p.name}</div>
                  <div className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{p.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Video Viewport with Segmented Output */}
      <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
        {telemetry?.frame ? (
          <img
            src={`data:image/jpeg;base64,${telemetry.frame}`}
            alt="Segmented Video Feed"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-8 space-y-2">
            <Camera className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
            <p className="text-xs text-slate-400">Processando segmentação com IA...</p>
          </div>
        )}

        {/* HUD Overlay */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono text-cyan-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>FUNDO ATIVO: {currentMode.toUpperCase()}</span>
        </div>

        <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono text-slate-300">
          MediaPipe SelfieSegmentation (100% On-Device)
        </div>
      </div>
    </div>
  );
};

export default VirtualStudio;
