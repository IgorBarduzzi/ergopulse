import React, { useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Trash2,
  Download,
  Sliders,
  Check,
} from "lucide-react";

export interface AirCanvasProps {
  telemetry: any;
  cameraFrame?: string | null;
}

interface StrokePoint {
  x: number;
  y: number;
  color: string;
  size: number;
}

const COLOR_PALETTE = [
  { name: "Cyan Laser", value: "#06b6d4", glow: "#22d3ee" },
  { name: "Hot Magenta", value: "#ec4899", glow: "#f472b6" },
  { name: "Laser Lime", value: "#10b981", glow: "#34d399" },
  { name: "Cyber Amber", value: "#f59e0b", glow: "#fbbf24" },
  { name: "Hyper Purple", value: "#8b5cf6", glow: "#a78bfa" },
  { name: "Pure White", value: "#ffffff", glow: "#e2e8f0" },
];

export const AirCanvas: React.FC<AirCanvasProps> = ({ telemetry, cameraFrame }) => {
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeColor, setActiveColor] = useState<string>("#06b6d4");
  const [brushSize, setBrushSize] = useState<number>(10);
  const [isRainbow, setIsRainbow] = useState<boolean>(false);
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  const currentStrokeRef = useRef<StrokePoint[]>([]);

  const rainbowHueRef = useRef<number>(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const canvasMetrics = telemetry?.metrics;
  const isDrawing = canvasMetrics?.is_drawing;
  const indexX = canvasMetrics?.index_x ?? 0.5;
  const indexY = canvasMetrics?.index_y ?? 0.5;
  const handDetected = canvasMetrics?.hand_detected;

  // Handle incoming drawing coordinates
  useEffect(() => {
    if (!drawingCanvasRef.current || !handDetected) return;
    const canvas = drawingCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirrored screen coordinates
    const curX = (1 - indexX) * canvas.width;
    const curY = indexY * canvas.height;

    if (isDrawing) {
      rainbowHueRef.current = (rainbowHueRef.current + 3) % 360;
      const colorToUse = isRainbow
        ? `hsl(${rainbowHueRef.current}, 100%, 60%)`
        : activeColor;

      const newPoint: StrokePoint = {
        x: curX,
        y: curY,
        color: colorToUse,
        size: brushSize,
      };

      currentStrokeRef.current.push(newPoint);

      // Draw continuous line segment
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = colorToUse;
      ctx.shadowColor = colorToUse;
      ctx.shadowBlur = 18;
      ctx.lineWidth = brushSize;

      if (lastPosRef.current) {
        ctx.beginPath();
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(curX, curY);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(curX, curY, brushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = colorToUse;
        ctx.fill();
      }
      ctx.restore();

      lastPosRef.current = { x: curX, y: curY };
    } else {
      if (currentStrokeRef.current.length > 0) {
        setStrokes((prev) => [...prev, [...currentStrokeRef.current]]);
        currentStrokeRef.current = [];
      }
      lastPosRef.current = null;
    }
  }, [indexX, indexY, isDrawing, handDetected, activeColor, brushSize, isRainbow]);

  // Clear Canvas
  const handleClear = () => {
    if (drawingCanvasRef.current) {
      const ctx = drawingCanvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
      setStrokes([]);
      currentStrokeRef.current = [];
      lastPosRef.current = null;
    }
  };

  // Undo Last Stroke
  const handleUndo = () => {
    if (strokes.length === 0 || !drawingCanvasRef.current) return;
    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);

    const canvas = drawingCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    newStrokes.forEach((stroke) => {
      if (stroke.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < stroke.length; i++) {
        const p1 = stroke[i - 1];
        const p2 = stroke[i];
        ctx.strokeStyle = p2.color;
        ctx.shadowColor = p2.color;
        ctx.shadowBlur = 18;
        ctx.lineWidth = p2.size;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();
    });
  };

  // Export Artwork as PNG
  const handleExport = () => {
    if (!drawingCanvasRef.current) return;
    const link = document.createElement("a");
    link.download = `omnivision-aircanvas-${Date.now()}.png`;
    link.href = drawingCanvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Top Floating Glass Toolbar */}
      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
        {/* Color Palette */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Paleta Neon:</span>
          <div className="flex items-center gap-2">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  setActiveColor(c.value);
                  setIsRainbow(false);
                }}
                className={`w-7 h-7 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                  activeColor === c.value && !isRainbow
                    ? "scale-110 ring-2 ring-white shadow-lg"
                    : "opacity-80 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: c.value,
                  boxShadow: activeColor === c.value && !isRainbow ? `0 0 14px ${c.glow}` : "none",
                }}
                title={c.name}
              >
                {activeColor === c.value && !isRainbow && (
                  <Check className="w-4 h-4 text-slate-950" />
                )}
              </button>
            ))}

            <button
              onClick={() => setIsRainbow(true)}
              className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                isRainbow
                  ? "bg-gradient-to-r from-red-500 via-green-500 to-blue-500 text-white ring-2 ring-white shadow-lg"
                  : "bg-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              🌈 Arco-Íris
            </button>
          </div>
        </div>

        {/* Brush Size Slider */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <Sliders className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">Pincel:</span>
          <input
            type="range"
            min="4"
            max="32"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
            className="w-24 accent-cyan-400 cursor-pointer"
          />
          <span className="text-cyan-400 font-bold">{brushSize}px</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Desfazer Último Traço"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
            title="Limpar Tela"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-600/20 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Salvar Arte</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
        {/* Background Camera Layer (mirrored) */}
        {cameraFrame && (
          <img
            src={`data:image/jpeg;base64,${cameraFrame}`}
            alt="Webcam Feed"
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-70 pointer-events-none"
          />
        )}

        {/* Drawing Persistent Canvas */}
        <canvas
          ref={drawingCanvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
        />

        {/* Live Fingertip Aiming Cursor Layer */}
        {handDetected && (
          <div
            className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
            style={{
              left: `${(1 - indexX) * 100}%`,
              top: `${indexY * 100}%`,
            }}
          >
            {/* Glowing Laser Ring */}
            <div
              className={`rounded-full border-2 transition-all ${
                isDrawing
                  ? "w-8 h-8 border-cyan-400 animate-ping opacity-85 shadow-[0_0_20px_#22d3ee]"
                  : "w-6 h-6 border-pink-400 opacity-60"
              }`}
            />
            <div
              className={`w-3.5 h-3.5 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-lg ${
                isDrawing ? "bg-white shadow-[0_0_12px_#ffffff]" : "bg-pink-400"
              }`}
            />
          </div>
        )}

        {/* Bottom HUD Instructions */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none font-mono text-xs text-slate-300">
          <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isDrawing ? "bg-cyan-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span>
              {isDrawing
                ? "🖌️ DESENHANDO NO AR"
                : handDetected
                ? "☝️ FAÇA O GESTO DE PINÇA OU APONTE PARA PINTAR"
                : "👋 POSICIONE A MÃO EM FRENTE À TELA"}
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
            {strokes.length} traços salvos
          </div>
        </div>
      </div>
    </div>
  );
};

export default AirCanvas;
