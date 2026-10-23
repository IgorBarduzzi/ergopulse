import { useEffect, useState, useRef, useMemo } from "react";
import {
  Activity,
  Box,
  Camera,
  Clock,
  Dumbbell,
  Eye,
  EyeOff,
  Gauge,
  Maximize2,
  Minimize2,
  Music,
  Settings,
  Shield,
  Sliders,
  Smartphone,
  Sparkles,
  Target,
  Terminal,
  Volume2,
  VolumeX,
  X,
  Zap,
  Paintbrush,
  Smile,
  Layers,
} from "lucide-react";
import SoundGoSynth from "./components/SoundGoSynth";
import AirCanvas from "./components/AirCanvas";
import VirtualStudio from "./components/VirtualStudio";
import MirrorAvatar from "./components/MirrorAvatar";
import HoloWindowScene from "./components/HoloWindowScene";

type ToolType =
  | "ergonomics"
  | "fitness"
  | "focus"
  | "theremin"
  | "holowindow"
  | "ascii"
  | "canvas"
  | "segmentation"
  | "avatar";

type ExerciseType = "SQUAT" | "PUSHUP" | "BICEP_CURL";
type SoundProfile = "chime" | "pulse" | "radar";
type AsciiTheme = "matrix" | "amber" | "synthwave";

interface TelemetryData {
  timestamp: number;
  fps: number;
  tool: ToolType;
  calibrating: boolean;
  metrics: Record<string, any>;
  stats: {
    duration_seconds: number;
    good_posture_seconds: number;
    alert_count: number;
    microsleep_count: number;
  };
  frame?: string | null;
}

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolType>("ergonomics");
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>("SQUAT");
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundProfile, setSoundProfile] = useState<SoundProfile>("chime");
  const [volume, setVolume] = useState(0.08);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(false);

  // Creative Lab States
  const [asciiTheme, setAsciiTheme] = useState<AsciiTheme>("matrix");
  const [asciiDensity, setAsciiDensity] = useState(85);
  const [asciiInverted, setAsciiInverted] = useState(false);
  const [asciiText, setAsciiText] = useState("");
  const [studioMode, setStudioMode] = useState<string>("bokeh_heavy");

  // Ergonomics Sparkline rolling buffers
  const [earHistory, setEarHistory] = useState<number[]>([]);
  const [neckHistory, setNeckHistory] = useState<number[]>([]);
  const [earThreshold, setEarThreshold] = useState(0.21);
  const [neckAngleThreshold, setNeckAngleThreshold] = useState(72.0);

  const wsRef = useRef<WebSocket | null>(null);
  const lastAlertTimeRef = useRef<number>(0);
  const lastRepCountRef = useRef<number>(0);
  const offscreenImgRef = useRef<HTMLImageElement | null>(null);

  // General Notification Beeper
  const playFeedbackSound = (type: SoundProfile = soundProfile, freqOverride?: number) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (type === "chime") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(freqOverride || 659.25, now);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      } else if (type === "pulse") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freqOverride || 523.25, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(volume * 1.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      } else if (type === "radar") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freqOverride || 780, now);
        gain.gain.setValueAtTime(volume * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      }

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // Audio fallback
    }
  };

  // Tool Switching
  const handleSwitchTool = (tool: ToolType, param?: string) => {
    setActiveTool(tool);
    playFeedbackSound("pulse", 440);
    const subParam =
      param ||
      (tool === "fitness"
        ? selectedExercise
        : tool === "segmentation"
        ? studioMode
        : undefined);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: "switch_tool",
          tool,
          param: subParam,
        })
      );
    }
  };

  const handleSwitchExercise = (exercise: ExerciseType) => {
    setSelectedExercise(exercise);
    handleSwitchTool("fitness", exercise);
  };

  const handleCalibrate = () => {
    setIsCalibrating(true);
    playFeedbackSound("chime", 587);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "calibrate" }));
    }
  };

  // Real-time ASCII Converter
  useEffect(() => {
    if (activeTool !== "ascii" || !telemetry?.frame) return;

    if (!offscreenImgRef.current) {
      offscreenImgRef.current = new Image();
    }
    const img = offscreenImgRef.current;
    img.src = `data:image/jpeg;base64,${telemetry.frame}`;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cols = asciiDensity;
      const rows = Math.floor(cols * 0.42);
      canvas.width = cols;
      canvas.height = rows;

      ctx.drawImage(img, 0, 0, cols, rows);
      const imgData = ctx.getImageData(0, 0, cols, rows).data;

      const chars = asciiInverted
        ? "@%#*+=-:. "
        : " .:-=+*#%@";

      let result = "";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const idx = (y * cols + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const charIndex = Math.floor(luminance * (chars.length - 1));
          result += chars[charIndex];
        }
        result += "\n";
      }
      setAsciiText(result);
    };
  }, [telemetry?.frame, activeTool, asciiDensity, asciiInverted]);

  // WebSocket lifecycle
  useEffect(() => {
    let reconnectTimeout: any;

    const connectWs = () => {
      const ws = new WebSocket("ws://127.0.0.1:8000/ws/stream");
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(
          JSON.stringify({
            action: "switch_tool",
            tool: activeTool,
            param: selectedExercise,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data: TelemetryData = JSON.parse(event.data);
          setTelemetry(data);
          setIsCalibrating(data.calibrating);

          if (data.tool === "ergonomics" && data.metrics.ear_avg) {
            setEarHistory((prev) => [...prev.slice(-44), data.metrics.ear_avg]);
            setNeckHistory((prev) => [...prev.slice(-44), data.metrics.neck_angle]);

            if (data.metrics.alert_level === "CRITICAL") {
              const now = Date.now();
              if (now - lastAlertTimeRef.current > 3500) {
                playFeedbackSound("radar", 880);
                lastAlertTimeRef.current = now;
              }
            }
          }

          if (data.tool === "fitness" && data.metrics.reps_count > lastRepCountRef.current) {
            playFeedbackSound("chime", 784);
            lastRepCountRef.current = data.metrics.reps_count;
          }
        } catch {
          // JSON parse guard
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();
    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [soundEnabled, soundProfile, volume]);

  const metrics = telemetry?.metrics || {};
  const stats = telemetry?.stats;

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  // Ergonomics Avatar
  const avatarVisuals = useMemo(() => {
    const neckAngle = metrics?.neck_angle || 90;
    const tilt = metrics?.shoulder_tilt || 0;
    const forwardOffset = Math.max(-5, Math.min(30, (90 - neckAngle) * 1.4));
    const spineCurveX = 60 + forwardOffset * 0.7;
    const shoulderRotation = Math.max(-12, Math.min(12, tilt * 1.5));
    const isBadPosture = neckAngle < neckAngleThreshold;
    const statusColor = isBadPosture ? "#f59e0b" : "#10b981";
    return { forwardOffset, spineCurveX, shoulderRotation, isBadPosture, statusColor };
  }, [metrics?.neck_angle, metrics?.shoulder_tilt, neckAngleThreshold]);

  // Sparkline generator
  const createSparklinePath = (data: number[], minVal: number, maxVal: number, width = 120, height = 32) => {
    if (data.length < 2) return "";
    const range = maxVal - minVal || 1;
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const normalized = Math.max(0, Math.min(1, (val - minVal) / range));
      const y = height - normalized * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(" L ")}`;
  };

  const earSparkline = useMemo(() => createSparklinePath(earHistory, 0.12, 0.38), [earHistory]);
  const neckSparkline = useMemo(() => createSparklinePath(neckHistory, 60, 95), [neckHistory]);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans select-none">
      {/* Top Cockpit Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-xl sticky top-0 z-40 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Activity className="w-5 h-5 text-white animate-pulse" />
              </div>
              {isConnected && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#070b12] animate-ping" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-white font-mono">
                  Omni<span className="text-cyan-400">Vision</span> Studio
                </span>
                <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Creative & Spatial v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Suíte All-in-One: IA, Biometria, Áudio Espacial & Holografia
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="text-slate-300">
                {isConnected ? `${telemetry?.fps || 0} FPS` : "Offline"}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{stats ? formatSeconds(stats.duration_seconds) : "00:00"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {activeTool === "ergonomics" && (
              <button
                onClick={handleCalibrate}
                disabled={isCalibrating || !isConnected}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-md ${
                  isCalibrating
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                    : "bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-cyan-500/20"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isCalibrating ? "Calibrando..." : "Calibrar"}</span>
              </button>
            )}

            <button
              onClick={() => setPrivacyMode(!privacyMode)}
              className={`p-2 rounded-xl border transition-all ${
                privacyMode
                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                  : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
              }`}
              title={privacyMode ? "Modo Privacidade Ativo" : "Ocultar Câmera"}
            >
              {privacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition-all ${
                soundEnabled
                  ? "bg-slate-800/60 border-slate-700/60 text-cyan-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
              title={soundEnabled ? "Áudio Ativado" : "Mudo"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white transition-all"
              title="Ajustes da Suíte"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar + Dynamic Tool Viewport */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar Nav */}
        <aside className="w-full lg:w-64 flex flex-row lg:flex-col gap-2.5 shrink-0 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {/* Section 1: Productivity */}
          <div className="hidden lg:block text-[10px] font-mono uppercase tracking-wider text-slate-400 px-3 pt-1">
            Produtividade & Saúde
          </div>

          <button
            onClick={() => handleSwitchTool("ergonomics")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "ergonomics"
                ? "bg-cyan-500/15 border-cyan-500/60 text-white shadow-lg shadow-cyan-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "ergonomics"
                  ? "bg-cyan-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">ErgoPulse</div>
              <div className="text-[10px] text-slate-400">Postura & Fadiga</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("fitness")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "fitness"
                ? "bg-amber-500/15 border-amber-500/60 text-white shadow-lg shadow-amber-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "fitness"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Dumbbell className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">FitMotion</div>
              <div className="text-[10px] text-slate-400">Repetições & Treino</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("focus")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "focus"
                ? "bg-rose-500/15 border-rose-500/60 text-white shadow-lg shadow-rose-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "focus"
                  ? "bg-rose-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">FocusGuard</div>
              <div className="text-[10px] text-slate-400">Foco & Distração</div>
            </div>
          </button>

          {/* Section 2: Creative Lab */}
          <div className="hidden lg:block text-[10px] font-mono uppercase tracking-wider text-fuchsia-400 px-3 pt-3">
            ✨ Creative Lab & Spatial
          </div>

          <button
            onClick={() => handleSwitchTool("theremin")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "theremin"
                ? "bg-amber-500/15 border-amber-500/60 text-white shadow-lg shadow-amber-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "theremin"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Music className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">Gesture Synth</div>
              <div className="text-[10px] text-amber-300">make music with your hands</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("canvas")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "canvas"
                ? "bg-pink-500/15 border-pink-500/60 text-white shadow-lg shadow-pink-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "canvas"
                  ? "bg-pink-500 text-white font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Paintbrush className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">AirCanvas</div>
              <div className="text-[10px] text-pink-300">Pintura Neon no Ar</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("holowindow")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "holowindow"
                ? "bg-indigo-500/15 border-indigo-500/60 text-white shadow-lg shadow-indigo-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "holowindow"
                  ? "bg-indigo-500 text-white font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Box className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">HoloWindow 3D</div>
              <div className="text-[10px] text-indigo-300">Cofre & Vitrine 3D</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("ascii")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "ascii"
                ? "bg-emerald-500/15 border-emerald-500/60 text-white shadow-lg shadow-emerald-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "ascii"
                  ? "bg-emerald-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">CyberMatrix</div>
              <div className="text-[10px] text-emerald-300">Arte ASCII Generativa</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("segmentation")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "segmentation"
                ? "bg-blue-500/15 border-blue-500/60 text-white shadow-lg shadow-blue-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "segmentation"
                  ? "bg-blue-500 text-white font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">Virtual Studio</div>
              <div className="text-[10px] text-blue-300">Smart Bokeh & Fundos</div>
            </div>
          </button>

          <button
            onClick={() => handleSwitchTool("avatar")}
            className={`flex-1 lg:flex-initial flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all ${
              activeTool === "avatar"
                ? "bg-amber-500/15 border-amber-500/60 text-white shadow-lg shadow-amber-500/10"
                : "bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${
                activeTool === "avatar"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              <Smile className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-white">Mirror Avatar 3D</div>
              <div className="text-[10px] text-amber-300">Memoji Reativo</div>
            </div>
          </button>
        </aside>

        {/* Dynamic Tool Workspace */}
        <main className="flex-1 flex flex-col space-y-6 min-w-0">
          {/* Status Message */}
          <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <div className="text-sm font-semibold text-slate-200">
                {metrics?.message || "Motor de visão computacional pronto"}
              </div>
            </div>
            <div className="text-xs font-mono px-3 py-1 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
              {activeTool.toUpperCase()}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 1. ERGOPULSE */}
          {/* ======================================================== */}
          {activeTool === "ergonomics" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-4 space-y-2.5 backdrop-blur-md">
                  <div className="flex justify-between text-slate-400 text-xs font-semibold">
                    <span>Olhos (EAR)</span>
                    <Eye className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    {metrics?.ear_avg?.toFixed(3) || "0.000"}
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        (metrics?.ear_avg || 0) < earThreshold ? "bg-rose-500" : "bg-cyan-400"
                      }`}
                      style={{ width: `${Math.min(100, ((metrics?.ear_avg || 0) / 0.35) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <svg className="w-20 h-5 overflow-visible">
                      <path d={earSparkline} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
                    </svg>
                    <span>Limiar: {earThreshold.toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-4 space-y-2.5 backdrop-blur-md">
                  <div className="flex justify-between text-slate-400 text-xs font-semibold">
                    <span>Bocejo (MAR)</span>
                    <Activity className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    {metrics?.mar?.toFixed(3) || "0.000"}
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        (metrics?.mar || 0) > 0.6 ? "bg-rose-500" : "bg-indigo-400"
                      }`}
                      style={{ width: `${Math.min(100, ((metrics?.mar || 0) / 0.8) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Status: {metrics?.fatigue_status || "NORMAL"}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-4 space-y-2.5 backdrop-blur-md">
                  <div className="flex justify-between text-slate-400 text-xs font-semibold">
                    <span>Ângulo Cervical</span>
                    <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    {metrics?.neck_angle?.toFixed(1) || "90.0"}°
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        (metrics?.neck_angle || 90) < neckAngleThreshold
                          ? "bg-amber-500"
                          : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.min(100, ((metrics?.neck_angle || 90) / 90) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <svg className="w-20 h-5 overflow-visible">
                      <path d={neckSparkline} fill="none" stroke="#10b981" strokeWidth="1.5" />
                    </svg>
                    <span>Alvo: &gt; {neckAngleThreshold.toFixed(0)}°</span>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-4 space-y-2.5 backdrop-blur-md">
                  <div className="flex justify-between text-slate-400 text-xs font-semibold">
                    <span>Nível de Ombros</span>
                    <Gauge className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    {metrics?.shoulder_tilt?.toFixed(1) || "0.0"}°
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        (metrics?.shoulder_tilt || 0) > 6.5 ? "bg-rose-500" : "bg-amber-400"
                      }`}
                      style={{ width: `${Math.min(100, ((metrics?.shoulder_tilt || 0) / 15) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Simetria: {(metrics?.shoulder_tilt || 0) <= 6.5 ? "Equilibrada" : "Desnivelada"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Avatar Biomecânico</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                      Live Kinematics
                    </span>
                  </div>

                  <div className="py-6 flex flex-col items-center justify-center">
                    <svg viewBox="0 0 160 200" className="w-44 h-52 overflow-visible">
                      <line x1="60" y1="20" x2="60" y2="180" stroke="#1e293b" strokeDasharray="3 3" />
                      <path
                        d={`M 60 180 Q ${avatarVisuals.spineCurveX} 140, 60 110`}
                        fill="none"
                        stroke={avatarVisuals.statusColor}
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <line
                        x1="60"
                        y1="110"
                        x2={60 + avatarVisuals.forwardOffset}
                        y2="65"
                        stroke={avatarVisuals.statusColor}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={60 + avatarVisuals.forwardOffset}
                        cy="50"
                        r="18"
                        fill="#0b0f19"
                        stroke={avatarVisuals.statusColor}
                        strokeWidth="3.5"
                      />
                      <line
                        x1={60 + avatarVisuals.forwardOffset + 12}
                        y1="48"
                        x2={60 + avatarVisuals.forwardOffset + 38}
                        y2="48"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="2 2"
                      />
                      <g
                        transform={`rotate(${avatarVisuals.shoulderRotation}, 60, 110)`}
                        className="transition-transform duration-150"
                      >
                        <line x1="25" y1="110" x2="95" y2="110" stroke="#94a3b8" strokeWidth="4.5" strokeLinecap="round" />
                        <circle cx="25" cy="110" r="4.5" fill="#38bdf8" />
                        <circle cx="95" cy="110" r="4.5" fill="#38bdf8" />
                      </g>
                    </svg>

                    <span
                      className={`mt-2 text-xs font-mono font-bold px-3 py-1 rounded-full ${
                        avatarVisuals.isBadPosture
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      {avatarVisuals.isBadPosture ? "Cabeça Projetada à Frente" : "Coluna Alinhada"}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 text-center border-t border-slate-800/80 pt-3">
                    Desvio do eixo: {(90 - (metrics?.neck_angle || 90)).toFixed(1)}°
                  </p>
                </div>

                <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-semibold text-slate-300">Visão Edge: Postura & Rosto</span>
                    <span className="text-[10px] font-mono text-cyan-400">MediaPipe FaceMesh + Pose</span>
                  </div>
                  {renderCameraFrame()}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 2. FITMOTION */}
          {/* ======================================================== */}
          {activeTool === "fitness" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                {(["SQUAT", "PUSHUP", "BICEP_CURL"] as ExerciseType[]).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleSwitchExercise(ex)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-mono font-bold transition-all ${
                      selectedExercise === ex
                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    }`}
                  >
                    {ex === "SQUAT" ? "🏋️ Agachamento" : ex === "PUSHUP" ? "💪 Flexão" : "💥 Rosca Bíceps"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between backdrop-blur-md space-y-6">
                  <div>
                    <span className="text-xs font-mono uppercase tracking-wider text-amber-400 block mb-1">
                      Contador de Repetições
                    </span>
                    <h3 className="text-lg font-bold text-white">
                      {selectedExercise === "SQUAT" ? "Agachamentos" : selectedExercise === "PUSHUP" ? "Flexões" : "Roscas Bíceps"}
                    </h3>
                  </div>

                  <div className="text-center py-4">
                    <span className="text-7xl font-black font-mono text-white tracking-tight">
                      {metrics?.reps_count || 0}
                    </span>
                    <span className="text-xs uppercase font-mono tracking-widest text-slate-400 block mt-2">
                      Repetições Válidas
                    </span>
                  </div>

                  <div className="space-y-3 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ângulo Articular:</span>
                      <span className="text-amber-400 font-bold">{metrics?.joint_angle || 180}°</span>
                    </div>

                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all duration-75"
                        style={{ width: `${(metrics?.rep_progress || 0) * 100}%` }}
                      />
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Alvo de Inflexão:</span>
                      <span className="text-emerald-400 font-bold">&lt; {metrics?.target_angle || 90}°</span>
                    </div>

                    <div className="flex justify-between pt-1 border-t border-slate-700/40">
                      <span className="text-slate-400">Feedback:</span>
                      <span className="text-cyan-300 font-semibold">{metrics?.feedback || "Em movimento"}</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-semibold text-slate-300">Rastreamento Articular</span>
                    <span className="text-[10px] font-mono text-amber-400">MediaPipe Pose Kinematics</span>
                  </div>
                  {renderCameraFrame()}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 3. FOCUSGUARD */}
          {/* ======================================================== */}
          {activeTool === "focus" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between backdrop-blur-md space-y-6">
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-rose-400 block mb-1">
                    Produtividade & Foco
                  </span>
                  <h3 className="text-lg font-bold text-white">Monitor de Atenção</h3>
                </div>

                <div className="text-center py-5 bg-slate-800/40 rounded-2xl border border-slate-700/60 space-y-2">
                  <span className="text-6xl font-black font-mono text-white">
                    {metrics?.focus_percentage?.toFixed(0) || 100}%
                  </span>
                  <span className="text-xs uppercase font-mono tracking-wider text-slate-400 block">
                    Tempo Focado na Tela
                  </span>
                </div>

                <div className="space-y-3 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Desvio Horizontal (Yaw):</span>
                    <span className="text-rose-400 font-bold">{metrics?.gaze_yaw || 0.0}°</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Desvio Vertical (Pitch):</span>
                    <span className="text-rose-400 font-bold">{metrics?.gaze_pitch || 0.0}°</span>
                  </div>

                  <div className="flex justify-between border-t border-slate-700/40 pt-2">
                    <span className="text-slate-400">Distrações Registradas:</span>
                    <span className="text-white font-bold">{metrics?.distraction_count || 0} vezes</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Detecta desvio de olhar e postura de celular no colo.</span>
                </div>
              </div>

              <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-slate-300">Vetor Direcional de Olhar</span>
                  <span className="text-[10px] font-mono text-rose-400">Head Pose Orientation</span>
                </div>
                {renderCameraFrame()}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 4. SOUNDGO AIR SYNTH */}
          {/* ======================================================== */}
          {activeTool === "theremin" && (
            <div className="space-y-6">
              <SoundGoSynth
                leftHand={telemetry?.metrics?.left_hand ?? null}
                rightHand={telemetry?.metrics?.right_hand ?? null}
                cameraFrame={telemetry?.frame}
                soundEnabled={soundEnabled}
                masterVolume={volume}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* 5. AIRCANVAS (Air Drawing & Spatial Neon Brush)          */}
          {/* ======================================================== */}
          {activeTool === "canvas" && (
            <div className="space-y-6">
              <AirCanvas
                telemetry={telemetry}
                cameraFrame={telemetry?.frame}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* 6. HOLOWINDOW 3D (Holographic Parallax Window & Vault)   */}
          {/* ======================================================== */}
          {activeTool === "holowindow" && (
            <div className="space-y-6">
              <HoloWindowScene
                telemetry={telemetry}
                cameraFrame={telemetry?.frame}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* 6. CYBERMATRIX (Generative ASCII Art) */}
          {/* ======================================================== */}
          {activeTool === "ascii" && (
            <div className="space-y-6">
              {/* ASCII Theme Controls */}
              <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Terminal className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Matriz Tipográfica & Arte ASCII Generativa</h3>
                    <p className="text-xs text-slate-400">
                      Sua webcam convertida em matriz de caracteres por luminância em tempo real
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Theme buttons */}
                  <div className="flex gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setAsciiTheme("matrix")}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                        asciiTheme === "matrix"
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Matrix Green
                    </button>
                    <button
                      onClick={() => setAsciiTheme("amber")}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                        asciiTheme === "amber"
                          ? "bg-amber-500 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Amber CRT
                    </button>
                    <button
                      onClick={() => setAsciiTheme("synthwave")}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                        asciiTheme === "synthwave"
                          ? "bg-fuchsia-500 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Synthwave
                    </button>
                  </div>

                  {/* Invert */}
                  <button
                    onClick={() => setAsciiInverted(!asciiInverted)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-all ${
                      asciiInverted
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                        : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}
                  >
                    Inverter: {asciiInverted ? "ON" : "OFF"}
                  </button>
                </div>
              </div>

              {/* ASCII Output Display Terminal */}
              <div
                className={`relative aspect-video rounded-2xl overflow-hidden border p-4 flex items-center justify-center font-mono leading-none tracking-tight select-none shadow-2xl ${
                  asciiTheme === "matrix"
                    ? "bg-[#030804] border-emerald-500/40 text-emerald-400 shadow-emerald-500/10"
                    : asciiTheme === "amber"
                    ? "bg-[#080500] border-amber-500/40 text-amber-400 shadow-amber-500/10"
                    : "bg-[#0a0512] border-fuchsia-500/40 text-cyan-300 shadow-fuchsia-500/10"
                }`}
              >
                <pre className="text-[7.5px] sm:text-[9.5px] md:text-[11px] leading-[0.8] whitespace-pre overflow-hidden">
                  {asciiText || "Inicializando renderização ASCII..."}
                </pre>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 7. VIRTUAL STUDIO (Selfie Segmentation & Bokeh / FX)     */}
          {/* ======================================================== */}
          {activeTool === "segmentation" && (
            <div className="space-y-6">
              <VirtualStudio
                telemetry={telemetry}
                currentMode={studioMode}
                onSelectMode={(mode) => {
                  setStudioMode(mode);
                  handleSwitchTool("segmentation", mode);
                }}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* 8. MIRROR AVATAR 3D (Spatial Expression Tracking)        */}
          {/* ======================================================== */}
          {activeTool === "avatar" && (
            <div className="space-y-6">
              <MirrorAvatar
                telemetry={telemetry}
                cameraFrame={telemetry?.frame}
              />
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Ajustes da Suíte OmniVision</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-slate-300">Sensibilidade Olhos (EAR)</span>
                  <span className="text-cyan-400 font-bold">{earThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.16"
                  max="0.26"
                  step="0.01"
                  value={earThreshold}
                  onChange={(e) => setEarThreshold(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-slate-300">Alerta de Postura (Ângulo Cervical)</span>
                  <span className="text-amber-400 font-bold">&gt; {neckAngleThreshold.toFixed(0)}°</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="85"
                  step="1"
                  value={neckAngleThreshold}
                  onChange={(e) => setNeckAngleThreshold(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-slate-300">Densidade ASCII</span>
                  <span className="text-emerald-400 font-bold">{asciiDensity} colunas</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="120"
                  step="5"
                  value={asciiDensity}
                  onChange={(e) => setAsciiDensity(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-slate-300 block mb-2">Perfil de Som Geral</label>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  {(["chime", "pulse", "radar"] as SoundProfile[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setSoundProfile(p);
                        playFeedbackSound(p);
                      }}
                      className={`py-2 rounded-xl capitalize border transition-all ${
                        soundProfile === p
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                          : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-slate-300">Volume Master</span>
                  <span className="text-indigo-400 font-bold">{Math.round(volume * 1000)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.20"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md shadow-cyan-600/20"
              >
                Salvar & Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderCameraFrame() {
    return (
      <div
        className={`relative bg-black/80 rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center transition-all ${
          cameraZoomed ? "aspect-[4/3]" : "aspect-video"
        }`}
      >
        {privacyMode ? (
          <div className="text-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Modo Privacidade Ativado</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              O processamento em tempo real continua ativo, mas o frame foi ocultado da interface.
            </p>
          </div>
        ) : telemetry?.frame ? (
          <>
            <img
              src={`data:image/jpeg;base64,${telemetry.frame}`}
              alt="Live Camera Feed"
              className="w-full h-full object-contain"
            />
            {/* HUD Reticles */}
            <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-400/80" />
            <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-400/80" />
            <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-400/80" />
            <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-400/80" />

            <div className="absolute top-3 left-8 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>{activeTool.toUpperCase()} Pipeline Active</span>
            </div>

            <button
              onClick={() => setCameraZoomed(!cameraZoomed)}
              className="absolute top-3 right-8 p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white transition-all"
              title={cameraZoomed ? "Aspecto Padrão" : "Expandir Câmera"}
            >
              {cameraZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </>
        ) : (
          <div className="text-center p-8 space-y-2">
            <Camera className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
            <p className="text-xs text-slate-400">Aguardando feed da webcam local...</p>
          </div>
        )}
      </div>
    );
  }
}
