import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as Tone from "tone";
import { Volume2, VolumeX, Sparkles, Music, X } from "lucide-react";

export interface HandData {
  label: string;
  x: number;
  y: number;
  pinch: boolean;
  pinch_dist: number;
  fingers_up: number;
  pinch_amount?: number;
  landmarks?: number[][]; // [[x, y], ...] normalized 0-1
  gesture_degree?: number; // 0=none, 1..5=fingers, 6=rock(VI), 7=ily(VII)
  non_thumb_fingers?: number; // 0..4
  thumb_up?: boolean;
  wrist_tilt?: number; // -1.0 (left/Minor) to +1.0 (right/Major)
}

export interface SoundGoSynthProps {
  leftHand: HandData | null;
  rightHand: HandData | null;
  cameraFrame?: string | null;
  soundEnabled: boolean;
  masterVolume?: number;
}

const CHROMATIC_NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const DEFAULT_DIATONIC_MAJOR = [true, false, false, true, true, false, false]; // I, ii, iii, IV, V, vi, vii
const ROMAN_UPPER = ["I", "II", "III", "IV", "V", "VI", "VII"];
const ROMAN_LOWER = ["i", "ii", "iii", "iv", "v", "vi", "vii"];

type SynthPresetId =
  | "retro"
  | "warm"
  | "dreamy"
  | "epiano"
  | "organ"
  | "chiptune";

interface SynthPresetConfig {
  id: SynthPresetId;
  label: string;
  oscType: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterBase: number;
  chorusWet: number;
  reverbWet: number;
}

const SYNTH_PRESETS: SynthPresetConfig[] = [
  {
    id: "retro",
    label: "Retro Synth",
    oscType: "fatsawtooth",
    attack: 0.04,
    decay: 0.3,
    sustain: 0.75,
    release: 0.65,
    filterBase: 2200,
    chorusWet: 0.45,
    reverbWet: 0.35,
  },
  {
    id: "warm",
    label: "Warm Synth",
    oscType: "fattriangle",
    attack: 0.08,
    decay: 0.4,
    sustain: 0.85,
    release: 0.9,
    filterBase: 1400,
    chorusWet: 0.35,
    reverbWet: 0.45,
  },
  {
    id: "dreamy",
    label: "Dreamy Pad",
    oscType: "fatsine",
    attack: 0.2,
    decay: 0.5,
    sustain: 0.9,
    release: 1.4,
    filterBase: 1800,
    chorusWet: 0.6,
    reverbWet: 0.65,
  },
  {
    id: "epiano",
    label: "Electric Piano",
    oscType: "fmsine",
    attack: 0.015,
    decay: 0.6,
    sustain: 0.45,
    release: 0.8,
    filterBase: 2800,
    chorusWet: 0.3,
    reverbWet: 0.3,
  },
  {
    id: "organ",
    label: "Glass Organ",
    oscType: "sine",
    attack: 0.03,
    decay: 0.2,
    sustain: 0.95,
    release: 0.4,
    filterBase: 2400,
    chorusWet: 0.5,
    reverbWet: 0.4,
  },
  {
    id: "chiptune",
    label: "8-Bit Synth",
    oscType: "square",
    attack: 0.01,
    decay: 0.15,
    sustain: 0.6,
    release: 0.25,
    filterBase: 3200,
    chorusWet: 0.15,
    reverbWet: 0.2,
  },
];

type VoicingId = 1 | 2 | 3 | 4; // 1=Root, 2=1st Inv, 3=Maj 7, 4=Dom 7

interface SongLoop {
  id: string;
  title: string;
  key: string;
  lines: { lyric: string; hint: string }[];
}

const SONG_PROMPTS: SongLoop[] = [
  {
    id: "free",
    title: "Free Play (Livre)",
    key: "C",
    lines: [],
  },
  {
    id: "wonderwall",
    title: "Wonderwall Progression",
    key: "G",
    lines: [
      { lyric: "TODAY IS GONNA BE THE DAY", hint: "Em [6 🤘]  →  G [5]  →  D [2]  →  A [6 🤘]" },
      { lyric: "THAT THEY'RE GONNA THROW IT BACK TO YOU", hint: "C [4]  →  D [5]  →  Em [6 🤘]" },
      { lyric: "AND ALL THE ROADS WE HAVE TO WALK ARE WINDING", hint: "C [4]  →  D [5]  →  G [1]  →  Em [6 🤘]" },
      { lyric: "YOU'RE GONNA SAY...", hint: "C [4]  →  D [5]  →  G [1]" },
    ],
  },
  {
    id: "letitbe",
    title: "Let It Be (Classic Pop I-V-vi-IV)",
    key: "C",
    lines: [
      { lyric: "WHEN I FIND MYSELF IN TIMES OF TROUBLE", hint: "C [1]  →  G [5]  →  Am [6 🤘]  →  F [4]" },
      { lyric: "MOTHER MARY COMES TO ME", hint: "C [1]  →  G [5]  →  F [4]  →  C [1]" },
    ],
  },
  {
    id: "flyme",
    title: "Fly Me To The Moon (Jazz vi-ii-V-I)",
    key: "C",
    lines: [
      { lyric: "FLY ME TO THE MOON", hint: "Am [6 🤘]  →  Dm [2]  →  G7 [5 + RH 4]  →  Cmaj7 [1 + RH 3]" },
      { lyric: "LET ME PLAY AMONG THE STARS", hint: "Fmaj7 [4 + RH 3]  →  Bm [7 🤟]  →  E7 [3 + RH 4]  →  Am [6 🤘]" },
    ],
  },
];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export const SoundGoSynth: React.FC<SoundGoSynthProps> = ({
  leftHand,
  rightHand,
  cameraFrame,
  soundEnabled,
  masterVolume = 0.6,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core UI & Musical State
  const [selectedKey, setSelectedKey] = useState<string>("C");
  const [presetId, setPresetId] = useState<SynthPresetId>("retro");
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [showIntroModal, setShowIntroModal] = useState<boolean>(true);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [audioStarted, setAudioStarted] = useState<boolean>(false);
  const [localMuted, setLocalMuted] = useState<boolean>(false);
  const [songId, setSongId] = useState<string>("free");
  const [lyricIdx, setLyricIdx] = useState<number>(0);

  // Harmonic Control State (driven by Hands OR Manual click/keyboard)
  const [activeDegree, setActiveDegree] = useState<number>(0); // 0=idle, 1..7=scale degree
  const [isMajor, setIsMajor] = useState<boolean>(true);
  const [qualityMode] = useState<"wrist" | "diatonic">("diatonic");
  const [manualQualityOverride, setManualQualityOverride] = useState<boolean | null>(null);
  const [activeVoicing, setActiveVoicing] = useState<VoicingId>(1); // 1=Root, 2=1st, 3=Maj7, 4=Dom7
  const [octaveHigh, setOctaveHigh] = useState<boolean>(false); // false=Low, true=High
  const [expressionLevel, setExpressionLevel] = useState<number>(3); // 1..9 vertical bars

  // Hysteresis / Debounce Refs for rock-solid gesture transitions
  const degreeDwellRef = useRef<{ committed: number; cand: number; count: number }>({
    committed: 0,
    cand: 0,
    count: 0,
  });
  const voicingDwellRef = useRef<{ committed: VoicingId; cand: VoicingId; count: number }>({
    committed: 1,
    cand: 1,
    count: 0,
  });
  const manualDegreeLockRef = useRef<number | null>(null);

  // Tone.js Audio Engine Refs
  const audioInitRef = useRef<boolean>(false);
  const polySynthRef = useRef<Tone.PolySynth | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const waveformAnalyserRef = useRef<Tone.Waveform | null>(null);
  const activeMidiNotesRef = useRef<number[]>([]);

  // Scale notes for the selected Key (I to VII)
  const scaleNotes = useMemo(() => {
    const keyIndex = CHROMATIC_NOTES.indexOf(selectedKey);
    const baseIdx = keyIndex >= 0 ? keyIndex : 0;
    return MAJOR_SCALE_OFFSETS.map((offset, idx) => {
      const noteIdx = (baseIdx + offset) % 12;
      return {
        degree: idx + 1, // 1..7
        name: CHROMATIC_NOTES[noteIdx],
        semitoneOffset: offset,
        defaultMajor: DEFAULT_DIATONIC_MAJOR[idx],
      };
    });
  }, [selectedKey]);

  // Initialize Tone.js Synth Pipeline
  const startAudioEngine = useCallback(async () => {
    try {
      await Tone.start();
      if (!audioInitRef.current) {
        const preset = SYNTH_PRESETS.find((p) => p.id === presetId) || SYNTH_PRESETS[0];

        const analyser = new Tone.Waveform(256);
        const masterGain = new Tone.Gain(0.75).connect(analyser).toDestination();
        const reverb = new Tone.Reverb({ decay: 2.6, wet: preset.reverbWet }).connect(masterGain);
        const chorus = new Tone.Chorus(3.5, 2.5, 0.5).connect(reverb).start();
        const filter = new Tone.Filter(preset.filterBase, "lowpass", -12).connect(chorus);

        const poly = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: preset.oscType as any },
          envelope: {
            attack: preset.attack,
            decay: preset.decay,
            sustain: preset.sustain,
            release: preset.release,
          },
        }).connect(filter);
        poly.maxPolyphony = 8;

        polySynthRef.current = poly;
        filterRef.current = filter;
        chorusRef.current = chorus;
        reverbRef.current = reverb;
        masterGainRef.current = masterGain;
        waveformAnalyserRef.current = analyser;
        audioInitRef.current = true;
      }
      setAudioStarted(true);
      setShowIntroModal(false);
    } catch (err) {
      console.error("Failed to start Gesture Synth audio:", err);
    }
  }, [presetId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (polySynthRef.current) {
        polySynthRef.current.releaseAll();
        polySynthRef.current.dispose();
      }
      filterRef.current?.dispose();
      chorusRef.current?.dispose();
      reverbRef.current?.dispose();
      masterGainRef.current?.dispose();
      waveformAnalyserRef.current?.dispose();
      audioInitRef.current = false;
    };
  }, []);

  // Update Synth Preset parameters when presetId changes
  useEffect(() => {
    if (!audioInitRef.current || !polySynthRef.current) return;
    const preset = SYNTH_PRESETS.find((p) => p.id === presetId) || SYNTH_PRESETS[0];
    polySynthRef.current.set({
      oscillator: { type: preset.oscType as any },
      envelope: {
        attack: preset.attack,
        decay: preset.decay,
        sustain: preset.sustain,
        release: preset.release,
      },
    });
    if (filterRef.current) {
      filterRef.current.frequency.rampTo(preset.filterBase, 0.1);
    }
    if (chorusRef.current) {
      chorusRef.current.wet.rampTo(preset.chorusWet, 0.1);
    }
    if (reverbRef.current) {
      reverbRef.current.wet.rampTo(preset.reverbWet, 0.1);
    }
  }, [presetId]);

  // Sync Master Volume & Mute
  useEffect(() => {
    if (!masterGainRef.current) return;
    const effectiveGain = soundEnabled && !localMuted ? Math.max(0.05, masterVolume * 3.5) : 0;
    masterGainRef.current.gain.rampTo(Math.min(1.0, effectiveGain), 0.06);
  }, [soundEnabled, localMuted, masterVolume]);

  // Cycle lyrics every 5 seconds when a song prompt is active
  useEffect(() => {
    const song = SONG_PROMPTS.find((s) => s.id === songId);
    if (!song || song.lines.length === 0) return;
    const timer = setInterval(() => {
      setLyricIdx((prev) => (prev + 1) % song.lines.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [songId]);

  // Compute Left Hand & Right Hand Gesture State from Camera Telemetry
  useEffect(() => {
    // 1. LEFT HAND -> Scale Degree (1..7) & Minor/Major
    if (leftHand) {
      // Determine raw degree from backend gesture_degree or fallback to fingers_up
      let rawDeg = leftHand.gesture_degree ?? 0;
      if (rawDeg === 0 && leftHand.fingers_up > 0) {
        rawDeg = Math.min(5, leftHand.fingers_up);
      }

      // 3-frame dwell filter to prevent flicker between finger gestures
      const st = degreeDwellRef.current;
      if (rawDeg === st.committed) {
        st.cand = rawDeg;
        st.count = 0;
      } else if (rawDeg === st.cand) {
        st.count += 1;
        if (st.count >= 2) {
          st.committed = rawDeg;
          st.count = 0;
        }
      } else {
        st.cand = rawDeg;
        st.count = 1;
      }

      if (manualDegreeLockRef.current === null) {
        setActiveDegree(st.committed);
      }

      // Major vs Minor calculation
      if (manualQualityOverride !== null) {
        setIsMajor(manualQualityOverride);
      } else if (st.committed >= 1 && st.committed <= 7) {
        const diatonicMaj = DEFAULT_DIATONIC_MAJOR[st.committed - 1];
        const tilt = leftHand.wrist_tilt ?? 0;
        if (qualityMode === "wrist") {
          // Wrist tilted left (↙) = Minor, tilted right/upright (↗) = Major
          setIsMajor(tilt >= -0.06);
        } else {
          // Diatonic default + strong wrist tilt override
          if (tilt < -0.22) {
            setIsMajor(false);
          } else if (tilt > 0.25) {
            setIsMajor(true);
          } else {
            setIsMajor(diatonicMaj);
          }
        }
      }
    } else if (manualDegreeLockRef.current === null) {
      degreeDwellRef.current = { committed: 0, cand: 0, count: 0 };
      setActiveDegree(0);
    }

    // 2. RIGHT HAND -> Voicing (1=Root, 2=1st, 3=Maj7, 4=Dom7), Octave & Filter Expression
    if (rightHand) {
      const nonThumb = rightHand.non_thumb_fingers ?? Math.min(4, rightHand.fingers_up);
      if (nonThumb >= 1 && nonThumb <= 4) {
        const rawV = nonThumb as VoicingId;
        const vst = voicingDwellRef.current;
        if (rawV === vst.committed) {
          vst.cand = rawV;
          vst.count = 0;
        } else if (rawV === vst.cand) {
          vst.count += 1;
          if (vst.count >= 2) {
            vst.committed = rawV;
            vst.count = 0;
          }
        } else {
          vst.cand = rawV;
          vst.count = 1;
        }
        setActiveVoicing(vst.committed);
      }

      // Octave: Right thumb tucked OR hand raised in upper third -> High Octave
      const isHigh = rightHand.thumb_up === false ? rightHand.y < 0.62 : rightHand.y < 0.35;
      setOctaveHigh(isHigh);

      // Expression / Filter Bar Level (1..9) from vertical hand position
      const normY = Math.max(0, Math.min(1, 1.0 - rightHand.y));
      const bars = Math.max(1, Math.min(9, Math.round(1 + normY * 8)));
      setExpressionLevel(bars);
    } else if (leftHand) {
      // Modulate expression bars gently with left hand height when playing one-handed
      const normY = Math.max(0, Math.min(1, 1.0 - leftHand.y));
      const bars = Math.max(2, Math.min(9, Math.round(1 + normY * 7)));
      setExpressionLevel(bars);
    }
  }, [leftHand, rightHand, qualityMode, manualQualityOverride]);

  // Keyboard shortcuts for instant testing even without raising hands (1-7, Q/W/E/R, M, O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key >= "1" && e.key <= "7") {
        const deg = parseInt(e.key, 10);
        if (!audioInitRef.current) startAudioEngine();
        manualDegreeLockRef.current = deg;
        setActiveDegree(deg);
        if (manualQualityOverride === null) {
          setIsMajor(DEFAULT_DIATONIC_MAJOR[deg - 1]);
        }
      } else if (e.key === "0" || e.key === "Escape") {
        manualDegreeLockRef.current = null;
        setActiveDegree(0);
      } else if (e.key.toLowerCase() === "q") {
        setActiveVoicing(1);
      } else if (e.key.toLowerCase() === "w") {
        setActiveVoicing(2);
      } else if (e.key.toLowerCase() === "e") {
        setActiveVoicing(3);
      } else if (e.key.toLowerCase() === "r") {
        setActiveVoicing(4);
      } else if (e.key.toLowerCase() === "m") {
        setIsMajor((prev) => {
          const next = !prev;
          setManualQualityOverride(next);
          return next;
        });
      } else if (e.key.toLowerCase() === "o") {
        setOctaveHigh((prev) => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "7") {
        const deg = parseInt(e.key, 10);
        if (manualDegreeLockRef.current === deg) {
          manualDegreeLockRef.current = null;
          if (!leftHand) setActiveDegree(0);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [leftHand, manualQualityOverride, startAudioEngine]);

  // Build Active Chord MIDI Notes & Labels whenever harmonic state changes
  const activeChordInfo = useMemo(() => {
    if (activeDegree < 1 || activeDegree > 7) {
      return {
        symbol: "--",
        roman: "..",
        midiNotes: [] as number[],
      };
    }

    const keyIndex = Math.max(0, CHROMATIC_NOTES.indexOf(selectedKey));
    const scaleItem = scaleNotes[activeDegree - 1];
    const baseMidi = (octaveHigh ? 60 : 48) + keyIndex + scaleItem.semitoneOffset;

    const third = isMajor ? 4 : 3;
    const fifth = 7;

    let intervals: number[] = [0, third, fifth];
    let suffix = isMajor ? "" : "m";
    let romanSuffix = "";

    if (activeVoicing === 1) {
      // [1] Root Position Triad (+ warm bass root 1 octave below)
      intervals = [-12, 0, third, fifth];
    } else if (activeVoicing === 2) {
      // [2] 1st Inversion
      intervals = [third - 12, fifth - 12, 0, third];
    } else if (activeVoicing === 3) {
      // [3] Maj 7 (Major 7th interval = 11 semitones)
      intervals = [-12, 0, third, fifth, 11];
      suffix = isMajor ? "maj7" : "m(maj7)";
      romanSuffix = "M7";
    } else if (activeVoicing === 4) {
      // [4] Dom 7 / Min 7 (Minor 7th interval = 10 semitones)
      intervals = [-12, 0, third, fifth, 10];
      suffix = isMajor ? "7" : "m7";
      romanSuffix = "7";
    }

    const midiNotes = intervals.map((iv) => baseMidi + iv);
    const romanBase = isMajor ? ROMAN_UPPER[activeDegree - 1] : ROMAN_LOWER[activeDegree - 1];

    return {
      symbol: `${scaleItem.name}${suffix}`,
      roman: `${romanBase}${romanSuffix}`,
      midiNotes,
    };
  }, [activeDegree, selectedKey, scaleNotes, isMajor, activeVoicing, octaveHigh]);

  // Trigger / Update PolySynth Notes when activeChordInfo changes
  useEffect(() => {
    if (!audioInitRef.current || !polySynthRef.current) return;

    const synth = polySynthRef.current;
    const prevMidis = activeMidiNotesRef.current;
    const nextMidis = activeChordInfo.midiNotes;

    // Update filter cutoff based on expressionLevel (1..9)
    if (filterRef.current) {
      const preset = SYNTH_PRESETS.find((p) => p.id === presetId) || SYNTH_PRESETS[0];
      const targetCutoff = Math.min(7500, preset.filterBase * (0.45 + (expressionLevel / 9) * 1.45));
      filterRef.current.frequency.rampTo(targetCutoff, 0.08);
    }

    // Check if chord changed
    const sameNotes =
      prevMidis.length === nextMidis.length && prevMidis.every((n, idx) => n === nextMidis[idx]);

    if (!sameNotes) {
      const toRelease = prevMidis.filter((m) => !nextMidis.includes(m)).map(midiToFreq);
      const toTrigger = nextMidis.filter((m) => !prevMidis.includes(m)).map(midiToFreq);

      if (toRelease.length > 0) {
        synth.triggerRelease(toRelease);
      }
      if (toTrigger.length > 0 && soundEnabled && !localMuted) {
        synth.triggerAttack(toTrigger, Tone.now(), 0.7);
      }
      activeMidiNotesRef.current = nextMidis;
    }
  }, [activeChordInfo, expressionLevel, presetId, soundEnabled, localMuted]);

  // Auto-unlock audio if the user raises a hand and plays a chord
  useEffect(() => {
    if (activeDegree > 0 && !audioInitRef.current && !showIntroModal) {
      startAudioEngine();
    }
  }, [activeDegree, showIntroModal, startAudioEngine]);

  // Canvas Render Loop: 21 Glowing White Hand Dots + Warm Amber Glow + Bottom Golden Audio Waveform
  useEffect(() => {
    let animId: number;
    let phase = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const W = canvas.width;
          const H = canvas.height;
          ctx.clearRect(0, 0, W, H);
          phase += 0.07;

          const isPlaying = activeDegree >= 1 && activeDegree <= 7;

          // Brilho atmosférico ao tocar acorde
          if (isPlaying) {
            const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, W * 0.65);
            grad.addColorStop(0, "rgba(245, 158, 11, 0.22)");
            grad.addColorStop(0.55, "rgba(217, 119, 6, 0.12)");
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
          }

          // Renderiza os 21 pontos rastreados em cada mão
          const drawHandConstellation = (hand: HandData | null) => {
            if (!hand || !hand.landmarks || hand.landmarks.length === 0) return;

            ctx.save();
            for (let i = 0; i < hand.landmarks.length; i++) {
              const lm = hand.landmarks[i];
              // Mirrored X coordinate to match mirrored webcam video
              const x = (1.0 - lm[0]) * W;
              const y = lm[1] * H;

              // Outer warm amber/white halo
              ctx.beginPath();
              ctx.arc(x, y, 7, 0, Math.PI * 2);
              ctx.fillStyle = isPlaying
                ? "rgba(251, 191, 36, 0.28)"
                : "rgba(255, 255, 255, 0.2)";
              ctx.fill();

              // Crisp glowing white core dot
              ctx.beginPath();
              ctx.arc(x, y, 3.6, 0, Math.PI * 2);
              ctx.shadowColor = "#ffffff";
              ctx.shadowBlur = 10;
              ctx.fillStyle = "#ffffff";
              ctx.fill();
            }
            ctx.restore();
          };

          drawHandConstellation(leftHand);
          drawHandConstellation(rightHand);

          // 3. Bottom Golden Waveform (stretches left-to-center and center-to-right around the chord symbol)
          const waveY = H - 46;
          const gapHalf = 58; // Center gap for active chord & Roman numeral
          const centerX = W * 0.5;

          const waveValues =
            waveformAnalyserRef.current && isPlaying
              ? waveformAnalyserRef.current.getValue()
              : null;

          const drawWaveSegment = (startX: number, endX: number, invertPhase: boolean) => {
            if (endX <= startX) return;
            ctx.save();
            ctx.beginPath();
            const steps = 90;
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const x = startX + t * (endX - startX);

              // Envelope taper at both ends so wave smoothly fades into the center chord label & edges
              const edgeTaper = Math.sin(t * Math.PI);

              let dy = 0;
              if (isPlaying) {
                const sampleIdx = waveValues
                  ? Math.min(waveValues.length - 1, Math.floor(t * waveValues.length))
                  : 0;
                const audioSample = waveValues ? Number(waveValues[sampleIdx]) * 18 : 0;
                const sineWave =
                  Math.sin(t * Math.PI * 6 + (invertPhase ? -phase : phase)) *
                  (8 + expressionLevel * 1.4);
                dy = (sineWave + audioSample) * edgeTaper;
              } else {
                // Subtle breathing flat line when idle
                dy = Math.sin(t * Math.PI * 3 + phase * 0.4) * 1.5 * edgeTaper;
              }

              const y = waveY + dy;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }

            // Linear gradient for golden fade near center gap
            const lineGrad = ctx.createLinearGradient(startX, waveY, endX, waveY);
            if (!invertPhase) {
              lineGrad.addColorStop(0, "rgba(245, 158, 11, 0.25)");
              lineGrad.addColorStop(0.5, "rgba(251, 191, 36, 0.95)");
              lineGrad.addColorStop(1, "rgba(251, 191, 36, 0.15)");
            } else {
              lineGrad.addColorStop(0, "rgba(251, 191, 36, 0.15)");
              lineGrad.addColorStop(0.5, "rgba(251, 191, 36, 0.95)");
              lineGrad.addColorStop(1, "rgba(245, 158, 11, 0.25)");
            }

            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = isPlaying ? 2.6 : 1.5;
            ctx.shadowColor = "rgba(245, 158, 11, 0.85)";
            ctx.shadowBlur = isPlaying ? 14 : 4;
            ctx.stroke();
            ctx.restore();
          };

          drawWaveSegment(16, centerX - gapHalf, false);
          drawWaveSegment(centerX + gapHalf, W - 16, true);
        }
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [leftHand, rightHand, activeDegree, expressionLevel]);

  // Exibe linhas da escala de VII a I
  const leftHandRows = useMemo(() => {
    const gestureBadges: Record<number, { text: string; isEmoji?: boolean }> = {
      7: { text: "🤟", isEmoji: true },
      6: { text: "🤘", isEmoji: true },
      5: { text: "5" },
      4: { text: "4" },
      3: { text: "3" },
      2: { text: "2" },
      1: { text: "1" },
    };
    return [...scaleNotes].reverse().map((item) => ({
      ...item,
      badge: gestureBadges[item.degree],
    }));
  }, [scaleNotes]);

  const rightHandRows: { id: VoicingId; label: string }[] = [
    { id: 1, label: "Root" },
    { id: 2, label: "1st" },
    { id: 3, label: "Maj 7" },
    { id: 4, label: "Dom 7" },
  ];

  const activeSong = SONG_PROMPTS.find((s) => s.id === songId);
  const currentSongLine =
    activeSong && activeSong.lines.length > 0
      ? activeSong.lines[lyricIdx % activeSong.lines.length]
      : null;

  const isPlayingChord = activeDegree >= 1 && activeDegree <= 7;

  return (
    <div className="relative w-full aspect-video bg-[#080808] rounded-2xl overflow-hidden border border-amber-500/25 shadow-2xl select-none font-mono">
      {/* 1. Mirrored Webcam Background Feed with Dynamic Amber / Noir Grading */}
      {cameraFrame ? (
        <img
          src={`data:image/jpeg;base64,${cameraFrame}`}
          alt="Gesture Synth Camera"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-all duration-500"
          style={{
            transform: "scaleX(-1)",
            filter: isPlayingChord
              ? "sepia(42%) saturate(210%) hue-rotate(-12deg) brightness(0.92) contrast(1.08)"
              : "grayscale(80%) brightness(0.55) contrast(1.12)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#12100e] to-[#070605]" />
      )}

      {/* Subtle Warm Vignette Overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: isPlayingChord
            ? "radial-gradient(circle at center, rgba(245,158,11,0.12) 0%, rgba(10,8,6,0.55) 100%)"
            : "radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%)",
        }}
      />

      {/* 2. Interactive Canvas Layer (21 White Hand Dots + Golden Waveform) */}
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* =================================================================== */}
      {/* 3. TOP-LEFT CONTROLS (Key, Synth Preset, Open/Close Guide, Song)   */}
      {/* =================================================================== */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 items-start">
        <div className="flex items-center gap-2">
          {/* Key Selector */}
          <select
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value);
              setManualQualityOverride(null);
            }}
            className="bg-[#141210]/90 hover:bg-[#1f1c18] text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs font-bold tracking-wider outline-none cursor-pointer shadow-lg backdrop-blur-md transition-all"
            title="Tom Musical (Key)"
          >
            {CHROMATIC_NOTES.map((k) => (
              <option key={k} value={k} className="bg-[#141210] text-amber-300">
                {k}
              </option>
            ))}
          </select>

          {/* Mute / Unmute Button */}
          <button
            onClick={() => {
              if (!audioStarted) startAudioEngine();
              setLocalMuted((m) => !m);
            }}
            className={`p-1.5 rounded-lg border backdrop-blur-md transition-all cursor-pointer ${
              !localMuted && soundEnabled
                ? "bg-[#141210]/90 border-amber-500/30 text-amber-400 hover:bg-[#1f1c18]"
                : "bg-rose-950/80 border-rose-500/40 text-rose-400"
            }`}
            title={localMuted ? "Ativar Som" : "Silenciar"}
          >
            {!localMuted && soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Synth Preset Selector */}
        <select
          value={presetId}
          onChange={(e) => {
            if (!audioStarted) startAudioEngine();
            setPresetId(e.target.value as SynthPresetId);
          }}
          className="bg-[#141210]/90 hover:bg-[#1f1c18] text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide outline-none cursor-pointer shadow-lg backdrop-blur-md transition-all"
        >
          {SYNTH_PRESETS.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#141210] text-amber-300">
              {p.label}
            </option>
          ))}
        </select>

        {/* Open / Close Guide Toggle */}
        <button
          onClick={() => setShowGuide((g) => !g)}
          className="bg-[#141210]/90 hover:bg-[#1f1c18] text-amber-400/90 hover:text-amber-300 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide cursor-pointer shadow-lg backdrop-blur-md transition-all"
        >
          {showGuide ? "Close Guide" : "Open Guide"}
        </button>

        {/* Optional Song Teleprompter Selector */}
        <select
          value={songId}
          onChange={(e) => {
            const nextId = e.target.value;
            setSongId(nextId);
            setLyricIdx(0);
            const found = SONG_PROMPTS.find((s) => s.id === nextId);
            if (found && nextId !== "free") {
              setSelectedKey(found.key);
            }
          }}
          className="bg-[#141210]/80 hover:bg-[#1f1c18] text-amber-200/70 hover:text-amber-300 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] outline-none cursor-pointer backdrop-blur-md transition-all"
        >
          {SONG_PROMPTS.map((s) => (
            <option key={s.id} value={s.id} className="bg-[#141210] text-amber-200">
              🎵 {s.title}
            </option>
          ))}
        </select>
      </div>

      {/* =================================================================== */}
      {/* 4. TOP-CENTER LYRICS / TELEPROMPTER (e.g. "YOU'RE GONNA SAY")       */}
      {/* =================================================================== */}
      {currentSongLine && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none px-4">
          <div
            className="text-xl sm:text-2xl md:text-3xl font-bold tracking-widest text-amber-50 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] uppercase"
            style={{ fontFamily: "'Courier New', monospace" }}
          >
            {currentSongLine.lyric}
          </div>
          <div className="mt-1 inline-block px-3 py-0.5 rounded-full bg-black/65 border border-amber-500/30 text-[11px] text-amber-300">
            {currentSongLine.hint}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. TOP-RIGHT VERTICAL BAR METER (9 Horizontal Bars)                */}
      {/* =================================================================== */}
      <div
        className="absolute top-4 right-4 z-20 flex flex-col gap-1 p-1.5 rounded-lg bg-[#141210]/75 border border-white/10 backdrop-blur-md"
        title="Filtro / Expressão Vertical da Mão"
      >
        {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((barIdx) => {
          const isLit = barIdx <= expressionLevel;
          return (
            <button
              key={barIdx}
              onClick={() => setExpressionLevel(barIdx)}
              className={`w-12 h-2 rounded-[2px] transition-all cursor-pointer ${
                isLit
                  ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.75)]"
                  : "bg-stone-800/90 hover:bg-stone-700"
              }`}
            />
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* 6. LEFT HAND GUIDE PANEL (Scale Degrees I-VII & Minor/Major)       */}
      {/* =================================================================== */}
      {showGuide && (
        <div className="absolute left-4 top-40 z-20 w-28 rounded-xl bg-[#141210]/85 border border-white/10 backdrop-blur-md p-2.5 shadow-2xl space-y-1.5">
          <div className="text-[10px] font-bold tracking-widest text-amber-500/80 uppercase text-center pb-1 border-b border-white/10">
            LEFT HAND
          </div>

          {/* 7 Scale Note Rows (VII down to I) */}
          <div className="space-y-1">
            {leftHandRows.map((row) => {
              const isSelected = activeDegree === row.degree;
              return (
                <button
                  key={row.degree}
                  onClick={() => {
                    if (!audioStarted) startAudioEngine();
                    if (manualDegreeLockRef.current === row.degree) {
                      manualDegreeLockRef.current = null;
                      setActiveDegree(0);
                    } else {
                      manualDegreeLockRef.current = row.degree;
                      setActiveDegree(row.degree);
                      if (manualQualityOverride === null) {
                        setIsMajor(row.defaultMajor);
                      }
                    }
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-amber-500/30 border border-amber-400/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                      : "hover:bg-white/5 text-stone-300 border border-transparent"
                  }`}
                >
                  <span>{row.name}</span>
                  {row.badge.isEmoji ? (
                    <span className="text-sm leading-none">{row.badge.text}</span>
                  ) : (
                    <span
                      className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${
                        isSelected
                          ? "bg-amber-100 text-stone-950"
                          : "bg-slate-300/85 text-stone-950"
                      }`}
                    >
                      {row.badge.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Minor / Major Toggle Footer */}
          <div className="pt-1.5 border-t border-white/10 grid grid-cols-2 gap-1">
            <button
              onClick={() => {
                setManualQualityOverride(false);
                setIsMajor(false);
              }}
              className={`flex flex-col items-center justify-center py-1 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                !isMajor
                  ? "bg-amber-500/30 border-amber-400/70 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                  : "bg-stone-900/60 border-white/5 text-stone-400 hover:text-stone-200"
              }`}
              title="Inclinar pulso para a esquerda (↙) ou clicar para Menor"
            >
              <span className="w-4 h-4 rounded bg-slate-300/90 text-stone-950 flex items-center justify-center text-[9px] mb-0.5">
                ↙
              </span>
              <span>Minor</span>
            </button>

            <button
              onClick={() => {
                setManualQualityOverride(true);
                setIsMajor(true);
              }}
              className={`flex flex-col items-center justify-center py-1 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                isMajor
                  ? "bg-amber-500/30 border-amber-400/70 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                  : "bg-stone-900/60 border-white/5 text-stone-400 hover:text-stone-200"
              }`}
              title="Inclinar pulso para a direita (↗) ou clicar para Maior"
            >
              <span className="w-4 h-4 rounded bg-slate-300/90 text-stone-950 flex items-center justify-center text-[9px] mb-0.5">
                ↗
              </span>
              <span>Major</span>
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 7. RIGHT HAND GUIDE PANEL (Voicing 1-4 & Octave High/Low)          */}
      {/* =================================================================== */}
      {showGuide && (
        <div className="absolute right-4 top-36 z-20 w-28 rounded-xl bg-[#141210]/85 border border-white/10 backdrop-blur-md p-2.5 shadow-2xl space-y-2">
          <div className="text-[10px] font-bold tracking-widest text-amber-500/80 uppercase text-center pb-1 border-b border-white/10">
            RIGHT HAND
          </div>

          {/* 4 Voicing Rows */}
          <div className="space-y-1">
            {rightHandRows.map((v) => {
              const isSelected = activeVoicing === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setActiveVoicing(v.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-amber-500/30 border border-amber-400/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                      : "hover:bg-white/5 text-stone-300 border border-transparent"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${
                      isSelected
                        ? "bg-amber-100 text-stone-950"
                        : "bg-slate-300/85 text-stone-950"
                    }`}
                  >
                    {v.id}
                  </span>
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>

          {/* Octave Selector */}
          <div className="pt-1.5 border-t border-white/10 space-y-1">
            <div className="text-[9px] font-bold tracking-widest text-amber-500/80 uppercase text-center">
              OCTAVE
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setOctaveHigh(true)}
                className={`py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                  octaveHigh
                    ? "bg-amber-500/30 border-amber-400/70 text-amber-300"
                    : "bg-stone-900/60 border-white/5 text-stone-400 hover:text-stone-200"
                }`}
              >
                High
              </button>
              <button
                onClick={() => setOctaveHigh(false)}
                className={`py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                  !octaveHigh
                    ? "bg-amber-500/30 border-amber-400/70 text-amber-300"
                    : "bg-stone-900/60 border-white/5 text-stone-400 hover:text-stone-200"
                }`}
              >
                Low
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 8. BOTTOM-CENTER ACTIVE CHORD SYMBOL & ROMAN NUMERAL (e.g. F / IV) */}
      {/* =================================================================== */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center justify-center pointer-events-none">
        <div
          className={`text-3xl sm:text-4xl font-extrabold tracking-tight transition-all duration-150 ${
            isPlayingChord
              ? "text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.85)] scale-105"
              : "text-amber-500/60"
          }`}
        >
          {activeChordInfo.symbol}
        </div>
        <div className="text-xs font-bold tracking-widest text-amber-200/80 mt-0.5">
          {activeChordInfo.roman}
        </div>
      </div>

      {/* =================================================================== */}
      {/* 9. BOTTOM-LEFT '?' HELP BUTTON & BOTTOM-RIGHT SIGNATURE            */}
      {/* =================================================================== */}
      <button
        onClick={() => setShowIntroModal(true)}
        className="absolute bottom-4 left-4 z-20 w-9 h-9 rounded-full bg-[#141210]/85 hover:bg-[#221e1a] border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm font-bold shadow-lg cursor-pointer transition-all"
        title="Como jogar / Tutorial"
      >
        ?
      </button>

      <div className="absolute bottom-3 right-4 z-20 text-right pointer-events-none">
        <div className="text-[10px] text-stone-400/80">gesture synth</div>
        <div className="text-[9px] text-amber-500/60">1-7 chords • 2 hands</div>
      </div>

      {/* =================================================================== */}
      {/* 10. INTRO OVERLAY ("make music with your hands 🙌" - Screenshot 2) */}
      {/* =================================================================== */}
      {showIntroModal && (
        <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[3px] flex flex-col items-center justify-center p-6 text-center">
          {!showHowToPlay ? (
            <div className="max-w-md space-y-5 animate-fade-in">
              <div className="text-[11px] font-bold tracking-[0.28em] text-amber-400 uppercase">
                GESTURE SYNTH
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight tracking-tight">
                make music with
                <br />
                your hands 🙌
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowHowToPlay(true)}
                  className="px-4 py-2.5 rounded-lg bg-[#181512]/90 hover:bg-[#25201b] border border-amber-500/60 text-amber-300 text-xs font-bold tracking-wide cursor-pointer transition-all shadow-lg"
                >
                  💻 learn how to play
                </button>

                <button
                  onClick={startAudioEngine}
                  className="px-5 py-2.5 rounded-lg bg-[#181512]/90 hover:bg-amber-500 hover:text-stone-950 border border-white/20 hover:border-amber-400 text-white text-xs font-bold tracking-wide cursor-pointer transition-all shadow-lg"
                >
                  🤘 play now
                </button>
              </div>

              <p className="text-[11px] text-stone-400 pt-1">
                Camera access is active. Raise your hands or press keys 1–7 to play chords.
              </p>
            </div>
          ) : (
            /* Interactive Step-by-Step Guide Card */
            <div className="max-w-lg w-full bg-[#12100e]/95 border border-amber-500/40 rounded-2xl p-6 text-left space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                    Como Tocar o Gesture Synth
                  </h3>
                </div>
                <button
                  onClick={() => setShowHowToPlay(false)}
                  className="text-stone-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
                  <div className="text-amber-400 font-bold uppercase tracking-wider">
                    🤚 Mão Esquerda (Acordes)
                  </div>
                  <p className="text-stone-300 leading-relaxed">
                    Levante de <strong>1 a 5 dedos</strong> para tocar os graus <strong>I a V</strong> da escala (ex: C, D, E, F, G).
                  </p>
                  <ul className="space-y-1 text-stone-400 text-[11px]">
                    <li>• <strong>🤘 (Indicador + Mindinho):</strong> Grau VI (A / Am)</li>
                    <li>• <strong>🤟 (Polegar + Ind. + Mind.):</strong> Grau VII (B)</li>
                    <li>• <strong>Punho fechado:</strong> Silencia o acorde</li>
                    <li>• <strong>Inclinar pulso ↙ / ↗:</strong> Alterna Menor / Maior</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
                  <div className="text-amber-400 font-bold uppercase tracking-wider">
                    ✋ Mão Direita (Voicing & Filtro)
                  </div>
                  <p className="text-stone-300 leading-relaxed">
                    Modifica a riqueza harmônica e a textura do sintetizador em tempo real:
                  </p>
                  <ul className="space-y-1 text-stone-400 text-[11px]">
                    <li>• <strong>[1] Dedo:</strong> Acorde Fundamental (Root)</li>
                    <li>• <strong>[2] Dedos:</strong> 1ª Inversão (1st)</li>
                    <li>• <strong>[3] Dedos:</strong> Sétima Maior (Maj 7)</li>
                    <li>• <strong>[4] Dedos:</strong> Sétima Dominante (Dom 7)</li>
                    <li>• <strong>Altura da mão:</strong> Abre o filtro e muda Oitava</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-[11px] text-stone-400">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dica: Você também pode clicar nos painéis ou usar as teclas 1–7!</span>
                </div>
                <button
                  onClick={() => {
                    setShowHowToPlay(false);
                    startAudioEngine();
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold cursor-pointer transition-all"
                >
                  🤘 Começar a Tocar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SoundGoSynth;
