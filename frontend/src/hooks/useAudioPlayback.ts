import { useRef, useCallback } from 'react';
import { PCM16, decodeBase64Pcm16ToFloat32 } from '../utils/pcm16';

/**
 * Plays back PCM16 24kHz audio chunks received from the Voice Live API.
 * Queues buffers for gapless playback within a single response.
 * Interrupts previous audio when a new response starts.
 */
export function useAudioPlayback() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef(0);
  const gainRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const ensureContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: PCM16.SAMPLE_RATE });
      audioCtxRef.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gain.connect(ctx.destination);
      gainRef.current = gain;
      nextStartRef.current = 0;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  /** Stop all currently scheduled/playing audio immediately. */
  const flushAudio = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    activeSourcesRef.current = [];
    nextStartRef.current = 0;
  }, []);

  const playChunk = useCallback(
    (base64Audio: string) => {
      const ctx = ensureContext();
      const gain = gainRef.current!;

      const float32 = decodeBase64Pcm16ToFloat32(base64Audio);

      const buffer = ctx.createBuffer(1, float32.length, PCM16.SAMPLE_RATE);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);

      // Clean up finished sources from tracking list
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      };

      // Schedule gapless playback
      const now = ctx.currentTime;
      const startTime = Math.max(now, nextStartRef.current);
      source.start(startTime);
      nextStartRef.current = startTime + buffer.duration;

      activeSourcesRef.current.push(source);
    },
    [ensureContext],
  );

  const stop = useCallback(() => {
    flushAudio();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    gainRef.current = null;
  }, [flushAudio]);

  return { playChunk, stopPlayback: stop, flushAudio };
}
