import React, { useState } from "react";
import { Box, Eye, Sparkles, ShieldAlert, CheckCircle2, Sliders } from "lucide-react";

export interface HoloWindowSceneProps {
  telemetry: any;
  cameraFrame?: string | null;
}

type HoloScenario = "vault" | "showcase";

export const HoloWindowScene: React.FC<HoloWindowSceneProps> = ({
  telemetry,
  cameraFrame,
}) => {
  const [scenario, setScenario] = useState<HoloScenario>("vault");
  const [sensitivity, setSensitivity] = useState<number>(1.6);

  const metrics = telemetry?.metrics;
  const rawX = metrics?.head_x ?? 0.0;
  const rawY = metrics?.head_y ?? 0.0;
  const rawZ = metrics?.head_z ?? 1.0;
  const yaw = metrics?.yaw ?? 0.0;
  const pitch = metrics?.pitch ?? 0.0;
  const tracked = metrics?.tracked ?? false;
  const peekRevealed = metrics?.peek_revealed ?? (Math.abs(rawX) > 0.18 || Math.abs(yaw) > 14);
  const distCm = metrics?.head_distance_cm ?? 60.0;

  // Amplified Parallax Coordinates
  const parallaxX = rawX * sensitivity;
  const parallaxY = rawY * sensitivity;

  return (
    <div className="space-y-6">
      {/* Top Header & Scenario Selector */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Box className="w-5 h-5 text-indigo-400 animate-pulse" />
          <div>
            <h3 className="text-sm font-bold text-white">Janela Holográfica 3D (Fish Tank VR)</h3>
            <p className="text-xs text-slate-400">
              Mova a cabeça fisicamente no espaço real para olhar atrás de obstáculos virtuais
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Parallax Sensitivity Slider */}
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/60 px-3 py-1.5 rounded-2xl border border-white/5">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Profundidade:</span>
            <input
              type="range"
              min="1.0"
              max="2.8"
              step="0.2"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-20 accent-indigo-400 cursor-pointer"
            />
            <span className="text-indigo-400 font-bold">{sensitivity.toFixed(1)}x</span>
          </div>

          {/* Scenario Selector */}
          <div className="flex bg-slate-950/60 p-1 rounded-2xl border border-white/5 text-xs font-mono">
            <button
              onClick={() => setScenario("vault")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                scenario === "vault"
                  ? "bg-indigo-600 text-white font-bold shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🔐 Desafio do Cofre Secreto
            </button>
            <button
              onClick={() => setScenario("showcase")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                scenario === "showcase"
                  ? "bg-indigo-600 text-white font-bold shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              💎 Vitrine 3D de Produto
            </button>
          </div>
        </div>
      </div>

      {/* Main 3D Holographic Perspective Viewport */}
      <div
        className="relative aspect-video bg-[#030611] rounded-3xl overflow-hidden border border-indigo-500/30 shadow-2xl flex items-center justify-center"
        style={{
          perspective: "900px",
          perspectiveOrigin: `${50 - parallaxX * 38}% ${50 - parallaxY * 38}%`,
        }}
      >
        {/* The 3D Room Box with 5 Physical Depth Planes */}
        <div
          className="w-full h-full relative transition-transform duration-75"
          style={{
            transformStyle: "preserve-3d",
            transform: `translate3d(${parallaxX * 65}px, ${parallaxY * 55}px, ${(rawZ - 1.0) * 40}px) rotateY(${-parallaxX * 22}deg) rotateX(${parallaxY * 20 + pitch * 0.1}deg)`,
          }}
        >
          {/* Depth Plane 1: Back Wall (Z = -550px) */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ transform: "translateZ(-550px) scale(1.6)" }}
          >
            <div className="w-full h-full bg-[#05091a] border-2 border-indigo-500/20 bg-[linear-gradient(to_right,#1e1b4b_1.5px,transparent_1.5px),linear-gradient(to_bottom,#1e1b4b_1.5px,transparent_1.5px)] bg-[size:3.5rem_3.5rem] opacity-40 shadow-inner" />
          </div>

          {/* Depth Plane 2: Perspective Floor Grid */}
          <div
            className="absolute inset-x-0 bottom-0 h-96 pointer-events-none opacity-30 origin-bottom"
            style={{
              transform: "rotateX(90deg) translateY(120px) translateZ(-80px)",
              backgroundImage:
                "linear-gradient(to right, #6366f1 1.5px, transparent 1.5px), linear-gradient(to bottom, #6366f1 1.5px, transparent 1.5px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* SCENARIO 1: VAULT / OCCLUSION CHALLENGE */}
          {scenario === "vault" && (
            <>
              {/* Secret Treasure behind the pillar (Z = -420px) */}
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ transform: "translateZ(-420px)" }}
              >
                <div
                  className={`p-6 rounded-3xl border-2 transition-all duration-300 flex flex-col items-center space-y-3 ${
                    peekRevealed
                      ? "bg-emerald-950/80 border-emerald-400 shadow-[0_0_80px_rgba(52,211,153,0.6)] scale-110"
                      : "bg-slate-900/80 border-slate-700 opacity-20"
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-400 flex items-center justify-center shadow-lg animate-bounce">
                    <Sparkles className="w-8 h-8 text-slate-950" />
                  </div>
                  <div className="text-center font-mono">
                    <div className="text-[11px] text-emerald-400 uppercase font-bold tracking-widest">
                      CHAVE SECRETA DE ACESSO
                    </div>
                    <div className="text-2xl font-black text-white tracking-wider">#OMNI-7794</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {peekRevealed ? "✓ VISÃO DESBLOQUEADA POR PARALLAX" : "OCULTO ATRÁS DA PILASTRA"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Massive Foreground Obscuring Pillar (Z = -60px) */}
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ transform: "translateZ(-60px)" }}
              >
                <div className="w-48 h-80 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 border-2 border-indigo-500/50 shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col items-center justify-between p-5 text-center">
                  <div className="w-12 h-1 rounded bg-indigo-500/40" />
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-bold">
                      PILASTRA FRONTAL
                    </div>
                    <div className="text-xs font-bold text-white">Obstáculo de Bloqueio</div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Incline sua cabeça para a direita ou esquerda para espiar o que está atrás de mim!
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-dashed border-indigo-400/40 flex items-center justify-center">
                    <Eye className="w-5 h-5 text-indigo-400" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SCENARIO 2: 3D PRODUCT SHOWCASE */}
          {scenario === "showcase" && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ transform: "translateZ(-260px)" }}
            >
              {/* Gyroscopic 3D Rings & Sci-Fi Artifact */}
              <div className="relative w-64 h-64 flex items-center justify-center">
                {/* Orbital Ring 1 */}
                <div
                  className="absolute inset-0 rounded-full border-4 border-dashed border-cyan-400/60 shadow-[0_0_30px_rgba(6,182,212,0.4)] animate-spin"
                  style={{ animationDuration: "12s" }}
                />
                {/* Orbital Ring 2 */}
                <div
                  className="absolute inset-4 rounded-full border-4 border-fuchsia-500/60 shadow-[0_0_30px_rgba(236,72,153,0.4)] animate-spin"
                  style={{ animationDuration: "8s", animationDirection: "reverse" }}
                />
                {/* Core Crystal */}
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shadow-[0_0_50px_rgba(168,85,247,0.8)] rotate-45 flex items-center justify-center text-white font-mono font-black text-xs text-center p-2">
                  CYBER CORE
                </div>
              </div>
            </div>
          )}

          {/* Layer: Floating Front Glass Reticle (Z = +40px) */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ transform: "translateZ(40px)" }}
          >
            <div className="w-72 h-72 border border-white/5 rounded-full pointer-events-none" />
          </div>
        </div>

        {/* Top-Right Mini Webcam Picture-in-Picture Tracker */}
        {cameraFrame && (
          <div className="absolute top-4 right-4 z-20 w-40 aspect-video rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black/80 backdrop-blur-md">
            <img
              src={`data:image/jpeg;base64,${cameraFrame}`}
              alt="Live Head Tracker"
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Tracking Crosshair overlay */}
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 font-mono text-[9px] text-cyan-300">
              Dist: {distCm}cm
            </div>
            <div className="absolute bottom-1 right-2 font-mono text-[9px] text-emerald-400">
              {tracked ? "FACE LOCKED" : "CALIBRANDO"}
            </div>
          </div>
        )}

        {/* Bottom Interactive Challenge HUD */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none font-mono text-xs">
          <div
            className={`px-4 py-2 rounded-2xl border backdrop-blur-xl flex items-center gap-2.5 transition-all ${
              scenario === "vault"
                ? peekRevealed
                  ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-xl shadow-emerald-500/20"
                  : "bg-slate-900/80 border-amber-500/40 text-amber-300"
                : "bg-slate-900/80 border-white/10 text-cyan-300"
            }`}
          >
            {scenario === "vault" ? (
              peekRevealed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>✓ PERSPECTIVA DESBLOQUEADA: VOCÊ ESPIOU ATRÁS DA PILASTRA!</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>🔴 VISÃO BLOQUEADA: INCLINE A CABEÇA PARA A DIREITA OU ESQUERDA</span>
                </>
              )
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>EXAMINE O ARTEFATO 3D DE DIFERENTES ÂNGULOS FÍSICOS</span>
              </>
            )}
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-300">
            Head X: {((rawX || 0) * 100).toFixed(0)}% • Yaw: {yaw.toFixed(1)}° • Pitch: {pitch.toFixed(1)}°
          </div>
        </div>
      </div>
    </div>
  );
};

export default HoloWindowScene;
