import { useState, useRef, useCallback } from 'react';

export function useAudioVisualization() {
  const [userAmplitude, setUserAmplitude] = useState(0);
  const [aiAmplitude, setAiAmplitude] = useState(0);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startVisualization = useCallback(async () => {
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
        const normalized = Math.min(avg / 128, 1);
        setUserAmplitude(normalized);

        // Simulate AI amplitude with subtle variation (real app would get from audio output)
        setAiAmplitude((prev) => {
          const target = Math.random() * 0.3;
          return prev + (target - prev) * 0.1;
        });

        animFrameRef.current = requestAnimationFrame(update);
      };

      update();
    } catch (err) {
      console.error('Failed to start audio visualization:', err);
    }
  }, []);

  const stopVisualization = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    setUserAmplitude(0);
    setAiAmplitude(0);
  }, []);

  return { userAmplitude, aiAmplitude, startVisualization, stopVisualization };
}
