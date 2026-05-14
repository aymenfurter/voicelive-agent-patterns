import { useRef, useEffect, useState } from 'react';

interface Props {
  userAmplitude: number;
  aiAmplitude: number;
  isActive: boolean;
}

const NUM_BARS = 32;
const BAR_WIDTH = 4;
const BAR_GAP = 3;
const CANVAS_W = NUM_BARS * (BAR_WIDTH + BAR_GAP);
const CANVAS_H = 60;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceAnimation({ userAmplitude, aiAmplitude, isActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const smoothUserRef = useRef(0);
  const smoothAiRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Session timer
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      startTimeRef.current = null;
      setElapsed(0);
    }
  }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const dpr = window.devicePixelRatio || 2;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const easing = 0.12;
      smoothUserRef.current += (userAmplitude - smoothUserRef.current) * easing;
      smoothAiRef.current += (aiAmplitude - smoothAiRef.current) * easing;
      const uAmp = smoothUserRef.current;
      const aAmp = smoothAiRef.current;
      const combinedAmp = Math.max(uAmp, aAmp);

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const centerBar = (NUM_BARS - 1) / 2;

      for (let i = 0; i < NUM_BARS; i++) {
        const x = i * (BAR_WIDTH + BAR_GAP);
        const dist = Math.abs(i - centerBar) / centerBar; // 0 at center, 1 at edges

        // Height: symmetrical from center, driven by amplitude
        const baseHeight = 3;
        const activeHeight = isActive
          ? combinedAmp * 40 * (1 - dist * 0.7) + 2
          : 0;
        const barHeight = Math.min(Math.max(baseHeight, baseHeight + activeHeight), CANVAS_H - 4);
        const y = (CANVAS_H - barHeight) / 2;

        // Alpha: brighter at center when active
        const alpha = isActive
          ? Math.max(0.12, (1 - dist * 0.6) * Math.min(1, 0.3 + combinedAmp * 0.7))
          : 0.08;

        ctx.fillStyle = `rgba(229, 169, 34, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barHeight, 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [userAmplitude, aiAmplitude, isActive]);

  return (
    <div className="voice-vis">
      <canvas ref={canvasRef} className="voice-canvas" />
      {isActive && (
        <div className="voice-timer">{formatDuration(elapsed)}</div>
      )}
    </div>
  );
}
