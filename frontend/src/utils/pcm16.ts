/** Codec helpers for the 24kHz mono PCM16 audio used by the Voice Live API. */

const PCM16_SAMPLE_RATE = 24000;
const PCM16_MAX = 32768;

export const PCM16 = { SAMPLE_RATE: PCM16_SAMPLE_RATE };

export function decodeBase64ToPcm16(base64: string): Int16Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export function pcm16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / PCM16_MAX;
  return float32;
}

export function decodeBase64Pcm16ToFloat32(base64: string): Float32Array {
  return pcm16ToFloat32(decodeBase64ToPcm16(base64));
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
