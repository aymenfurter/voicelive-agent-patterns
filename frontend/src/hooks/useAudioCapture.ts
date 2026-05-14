import { useRef, useCallback } from 'react';
import { PCM16, arrayBufferToBase64 } from '../utils/pcm16';

/**
 * Captures microphone audio as PCM16 24kHz mono using AudioWorklet
 * and streams base64-encoded chunks over a WebSocket via sendMessage.
 */
export function useAudioCapture(
  sendMessage: (msg: { type: string; audio: string }) => void,
) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: PCM16.SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: PCM16.SAMPLE_RATE });
    audioCtxRef.current = audioCtx;

    await audioCtx.audioWorklet.addModule('/pcm16-capture-processor.js');

    const source = audioCtx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioCtx, 'pcm16-capture-processor');

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const b64 = arrayBufferToBase64(event.data);
      sendMessage({ type: 'audio', audio: b64 });
    };

    source.connect(workletNode);
    workletNode.connect(audioCtx.destination);
    workletRef.current = workletNode;
  }, [sendMessage]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (workletRef.current) {
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }, []);

  return { startCapture: start, stopCapture: stop };
}
