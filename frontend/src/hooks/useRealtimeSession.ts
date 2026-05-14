import { useState, useCallback, useMemo } from 'react';
import type {
  Pattern, SessionConfig, WebSocketMessage, ClaimResult, TokenUsage,
} from '../types';
import { DEFAULT_SESSION_CONFIG } from '../types';
import { useWebSocket } from './useWebSocket';
import { useSession } from './useSession';
import { useTranscript } from './useTranscript';
import { useEvents } from './useEvents';
import { useAudioVisualization } from './useAudioVisualization';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayback } from './useAudioPlayback';
import { dispatchMessage, type MessageHandlerDeps } from '../utils/messageHandlers';

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * Orchestrates the realtime session: websocket transport, session lifecycle,
 * audio capture/playback/visualization, transcript, events, and bookkeeping.
 */
export function useRealtimeSession(initialPattern: Pattern) {
  const [pattern, setPatternState] = useState<Pattern>(initialPattern);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);
  const [textMode, setTextMode] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(ZERO_USAGE);

  const { messages, addMessage, updatePartialMessage, clearMessages } = useTranscript();
  const { events, addEvent, clearEvents } = useEvents();
  const { userAmplitude, aiAmplitude, startVisualization, stopVisualization } = useAudioVisualization();
  const { playChunk, stopPlayback, flushAudio } = useAudioPlayback();

  const handleMessage = useCallback((msg: WebSocketMessage) => {
    const deps: MessageHandlerDeps = {
      addMessage, updatePartialMessage, addEvent,
      playChunk, flushAudio, setClaimResult, setTokenUsage,
    };
    dispatchMessage(msg, deps);
  }, [addMessage, updatePartialMessage, addEvent, playChunk, flushAudio]);

  const { isConnected, connect, disconnect, sendMessage } = useWebSocket(handleMessage);
  const { startCapture, stopCapture } = useAudioCapture(sendMessage);
  const { session, startSession, endSession } = useSession(pattern, connect, disconnect, sessionConfig);

  const handleStart = useCallback(() => {
    startSession();
    startVisualization();
    if (!textMode) startCapture();
  }, [startSession, startVisualization, startCapture, textMode]);

  const handleEnd = useCallback(() => {
    stopCapture();
    endSession();
    stopVisualization();
    stopPlayback();
  }, [endSession, stopVisualization, stopCapture, stopPlayback]);

  const handleTextSend = useCallback((text: string) => {
    sendMessage({ type: 'text.send', text });
  }, [sendMessage]);

  const setPattern = useCallback((p: Pattern) => {
    if (session.status === 'active') {
      if (!window.confirm('Changing pattern will end the current session. Continue?')) return;
      endSession();
    }
    setPatternState(p);
    clearMessages();
    clearEvents();
    setTokenUsage(ZERO_USAGE);
  }, [session.status, endSession, clearMessages, clearEvents]);

  return useMemo(() => ({
    // realtime state
    session, isConnected, messages, events, claimResult,
    userAmplitude, aiAmplitude, tokenUsage,
    // config
    pattern, sessionConfig, textMode,
    // setters
    setSessionConfig, setTextMode, setPattern, setClaimResult,
    // actions
    startSession: handleStart,
    endSession: handleEnd,
    sendMessage,
    sendText: handleTextSend,
    clearEvents, clearMessages,
  }), [
    session, isConnected, messages, events, claimResult,
    userAmplitude, aiAmplitude, tokenUsage,
    pattern, sessionConfig, textMode,
    setPattern, handleStart, handleEnd, sendMessage, handleTextSend,
    clearEvents, clearMessages,
  ]);
}

export type RealtimeSession = ReturnType<typeof useRealtimeSession>;
