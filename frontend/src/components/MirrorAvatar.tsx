import React, { useState } from "react";
import { Smile, Zap, Activity } from "lucide-react";

export interface MirrorAvatarProps {
  telemetry: any;
  cameraFrame?: string | null;
}

type AvatarSkin = "cyberbot" | "neon" | "matrix";

export const MirrorAvatar: React.FC<MirrorAvatarProps> = ({ telemetry, cameraFrame }) => {
  const [skin, setSkin] = useState<AvatarSkin>("cyberbot");

  const avatarMetrics = telemetry?.metrics;
  const lOpen = avatarMetrics?.left_eye_open ?? 1.0;
  const rOpen = avatarMetrics?.right_eye_open ?? 1.0;
  const mouthOpen = avatarMetrics?.mouth_open ?? 0.0;
  const smile = avatarMetrics?.smile ?? 0.0;
  const browRaise = avatarMetrics?.eyebrow_raise ?? 0.0;
  const yaw = avatarMetrics?.head_yaw ?? 0.0;
  const pitch = avatarMetrics?.head_pitch ?? 0.0;
  const roll = avatarMetrics?.head_roll ?? 0.0;
  const faceDetected = avatarMetrics?.face_detected ?? false;

  // Skin theme parameters
  const skinStyles = {
    cyberbot: {
      chassis: "from-slate-800 to-slate-900 border-cyan-400/50 shadow-cyan-500/20",
      faceplate: "bg-slate-950 border-cyan-500/30",
      eyeGlow: "#06b6d4",
      accent: "#22d3ee",
      name: "CyberBot X-1",
    },
    neon: {
      chassis: "from-zinc-900 to-fuchsia-950 border-fuchsia-500/50 shadow-fuchsia-500/20",
      faceplate: "bg-black border-fuchsia-500/30",
      eyeGlow: "#ec4899",
      accent: "#f472b6",
      name: "Neon Android",
    },
    matrix: {
      chassis: "from-zinc-900 to-emerald-950 border-emerald-500/50 shadow-emerald-500/20",
      faceplate: "bg-black border-emerald-500/30",
      eyeGlow: "#10b981",
      accent: "#34d399",
      name: "Matrix Mecha",
    },
  }[skin];

  return (
    <div className="space-y-6">
      {/* Top Header & Skin Switcher */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Smile className="w-5 h-5 text-fuchsia-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Mirror Avatar 3D (Memoji Reativo)</h3>
            <p className="text-xs text-slate-400">
              Expressões faciais e rotação 3D espelhadas em tempo real via FaceMesh
            </p>
          </div>
        </div>

        {/* Skin Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Modelo:</span>
          {(["cyberbot", "neon", "matrix"] as AvatarSkin[]).map((s) => (
            <button
              key={s}
              onClick={() => setSkin(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono capitalize transition-all cursor-pointer ${
                skin === s
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-lg"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Main Avatar 3D Viewport Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 3D Avatar Rendering Canvas Container */}
        <div className="lg:col-span-8 relative aspect-video bg-gradient-to-b from-[#060814] to-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center p-8">
          {/* Ambient Perspective Grid Floor */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              transform: "perspective(400px) rotateX(60deg) translateY(120px)",
            }}
          />

          {/* 3D Head Container with Physical Rotation */}
          <div
            className="relative transition-transform duration-75 flex items-center justify-center"
            style={{
              perspective: "900px",
              transformStyle: "preserve-3d",
              transform: `rotateY(${yaw * 0.9}deg) rotateX(${-pitch * 0.9}deg) rotateZ(${roll * 0.8}deg)`,
            }}
          >
            {/* Robot Head Chassis Outer Shell */}
            <div
              className={`w-64 h-72 rounded-[48px] bg-gradient-to-b ${skinStyles.chassis} border-2 shadow-2xl flex flex-col items-center justify-between p-6 relative`}
            >
              {/* Antennae / Sensor Ears */}
              <div
                className="absolute -left-4 top-24 w-4 h-14 rounded-l-xl bg-slate-700 border border-white/20 transition-transform"
                style={{ transform: `scaleY(${1 + browRaise * 0.3})` }}
              />
              <div
                className="absolute -right-4 top-24 w-4 h-14 rounded-r-xl bg-slate-700 border border-white/20 transition-transform"
                style={{ transform: `scaleY(${1 + browRaise * 0.3})` }}
              />

              {/* Forehead Tech Crest */}
              <div className="w-16 h-2 rounded-full bg-cyan-400/40 animate-pulse" />

              {/* Eyebrows */}
              <div className="w-full flex justify-around px-2">
                <div
                  className="w-12 h-1.5 rounded-full bg-slate-400 transition-transform duration-75"
                  style={{
                    transform: `translateY(${-browRaise * 14}px) rotate(${-yaw * 0.2}deg)`,
                  }}
                />
                <div
                  className="w-12 h-1.5 rounded-full bg-slate-400 transition-transform duration-75"
                  style={{
                    transform: `translateY(${-browRaise * 14}px) rotate(${yaw * 0.2}deg)`,
                  }}
                />
              </div>

              {/* Digital Visor / Faceplate */}
              <div
                className={`w-full h-36 rounded-3xl ${skinStyles.faceplate} border flex flex-col items-center justify-around p-3 shadow-inner`}
              >
                {/* Eyes Row */}
                <div className="w-full flex justify-around items-center px-4">
                  {/* Left Eye */}
                  <div
                    className="w-10 rounded-2xl transition-all duration-75 flex items-center justify-center shadow-lg"
                    style={{
                      height: `${Math.max(4, lOpen * 28)}px`,
                      backgroundColor: skinStyles.eyeGlow,
                      boxShadow: `0 0 16px ${skinStyles.eyeGlow}`,
                    }}
                  >
                    {lOpen > 0.4 && <div className="w-3 h-3 rounded-full bg-white opacity-80" />}
                  </div>

                  {/* Right Eye */}
                  <div
                    className="w-10 rounded-2xl transition-all duration-75 flex items-center justify-center shadow-lg"
                    style={{
                      height: `${Math.max(4, rOpen * 28)}px`,
                      backgroundColor: skinStyles.eyeGlow,
                      boxShadow: `0 0 16px ${skinStyles.eyeGlow}`,
                    }}
                  >
                    {rOpen > 0.4 && <div className="w-3 h-3 rounded-full bg-white opacity-80" />}
                  </div>
                </div>

                {/* Mouth / Audio Waveform */}
                <div className="flex items-center justify-center transition-all duration-75">
                  <div
                    className="rounded-full transition-all duration-75"
                    style={{
                      width: `${Math.max(20, 36 + smile * 35)}px`,
                      height: `${Math.max(4, 6 + mouthOpen * 24)}px`,
                      backgroundColor: smile > 0.4 ? "#f43f5e" : skinStyles.accent,
                      boxShadow: `0 0 12px ${skinStyles.accent}`,
                      borderRadius: smile > 0.3 ? "6px 6px 20px 20px" : "12px",
                    }}
                  />
                </div>
              </div>

              {/* Chin / Vocal Speaker Grille */}
              <div className="flex gap-1.5 opacity-40">
                <div className="w-3 h-1 rounded bg-slate-400" />
                <div className="w-5 h-1 rounded bg-slate-400" />
                <div className="w-3 h-1 rounded bg-slate-400" />
              </div>
            </div>
          </div>

          {/* Mini Webcam PiP thumbnail at bottom-right */}
          {cameraFrame && (
            <div className="absolute bottom-4 right-4 w-32 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-xl bg-black">
              <img
                src={`data:image/jpeg;base64,${cameraFrame}`}
                alt="Face tracking feed"
                className="w-full h-full object-cover scale-x-[-1]"
              />
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono text-cyan-300 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                faceDetected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span>{faceDetected ? "AVATAR SINCRONIZADO" : "AGUARDANDO ROSTO"}</span>
          </div>
        </div>

        {/* Real-time Facial Blendshapes & Kinematics Telemetry Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold font-mono text-white uppercase">
                Biometria de Expressões
              </h4>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Abertura dos Olhos (L/R)</span>
                  <span className="text-cyan-400">
                    {Math.round(lOpen * 100)}% / {Math.round(rOpen * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full transition-all"
                    style={{ width: `${((lOpen + rOpen) / 2) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Abertura da Boca</span>
                  <span className="text-fuchsia-400">{Math.round(mouthOpen * 100)}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-fuchsia-400 h-full transition-all"
                    style={{ width: `${mouthOpen * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Índice de Sorriso</span>
                  <span className="text-rose-400">{Math.round(smile * 100)}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-400 h-full transition-all"
                    style={{ width: `${smile * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Elevação de Sobrancelhas</span>
                  <span className="text-amber-400">{Math.round(browRaise * 100)}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all"
                    style={{ width: `${browRaise * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase">Rotação Craniana 3D</h4>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Yaw (Giro)</div>
                <div className="text-base font-bold text-white mt-1">{yaw.toFixed(1)}°</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Pitch (Incl.)</div>
                <div className="text-base font-bold text-white mt-1">{pitch.toFixed(1)}°</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Roll (Tilt)</div>
                <div className="text-base font-bold text-white mt-1">{roll.toFixed(1)}°</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MirrorAvatar;
