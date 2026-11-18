/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'ready' | 'error';

export interface UseVoiceInputOptions {
  onTranscriptChange?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  lang?: string;
}

export interface UseVoiceInputReturn {
  state: VoiceInputState;
  transcript: string;
  interim: string;
  error: string | null;
  blocked: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export const BLOCKED_MIC_MESSAGE = 'The microphone is blocked here. Use the mic on your keyboard, or type instead.';

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onTranscriptChange, onFinalTranscript, lang } = options;

  const [state, setState] = useState<VoiceInputState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  // References to keep callbacks current without re-initializing recognition
  const onTranscriptChangeRef = useRef(onTranscriptChange);
  onTranscriptChangeRef.current = onTranscriptChange;
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeTranscriptRef = useRef('');
  const isStoppingRef = useRef(false);

  // Clean up any active microphone/recognition on unmount
  useEffect(() => {
    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      } catch {
        // ignore
      }
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
      } catch {
        // ignore
      }
    };
  }, []);

  const reset = useCallback(() => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    } catch {
      // ignore
    }
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch {
      // ignore
    }
    audioChunksRef.current = [];
    activeTranscriptRef.current = '';
    isStoppingRef.current = false;
    setState('idle');
    setTranscript('');
    setInterim('');
    setError(null);
    setBlocked(false);
  }, []);

  const stop = useCallback(() => {
    isStoppingRef.current = true;

    // If using SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }

    // If using MediaRecorder fallback
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        setState('processing');
        mediaRecorderRef.current.stop();
      } catch {
        setState('idle');
      }
    }
  }, []);

  const start = useCallback(async () => {
    // Reset state
    setError(null);
    setBlocked(false);
    setTranscript('');
    setInterim('');
    activeTranscriptRef.current = '';
    isStoppingRef.current = false;

    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    // Preferred: Web Speech API (continuous, interim results)
    if (SpeechRecognition) {
      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // ignore
          }
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang =
          lang || (typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US');

        recognition.onstart = () => {
          setState('listening');
        };

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          let currentFinal = activeTranscriptRef.current;

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            const text = res[0]?.transcript || '';
            if (res.isFinal) {
              currentFinal = currentFinal ? `${currentFinal} ${text.trim()}` : text.trim();
            } else {
              currentInterim += text;
            }
          }

          activeTranscriptRef.current = currentFinal;
          setTranscript(currentFinal);
          setInterim(currentInterim);

          const fullCurrent = currentInterim
            ? currentFinal
              ? `${currentFinal} ${currentInterim}`
              : currentInterim
            : currentFinal;

          onTranscriptChangeRef.current?.(fullCurrent);
        };

        recognition.onerror = (event: any) => {
          console.warn('[useVoiceInput] Speech recognition error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setBlocked(true);
            setError(BLOCKED_MIC_MESSAGE);
            setState('error');
          } else if (event.error === 'no-speech') {
            // Silent timeout
            if (!activeTranscriptRef.current) {
              setState('idle');
            }
          } else {
            setError(event.error || 'Speech recognition failed');
            setState('error');
          }
        };

        recognition.onend = () => {
          const finalVal = activeTranscriptRef.current.trim();
          if (finalVal) {
            setState('ready');
            onFinalTranscriptRef.current?.(finalVal);
          } else {
            setState((prev) => (prev === 'listening' ? 'idle' : prev));
          }
          recognitionRef.current = null;
        };

        recognition.start();
        return;
      } catch (err: any) {
        console.warn('[useVoiceInput] SpeechRecognition start failed, falling back to MediaRecorder:', err);
        // Fall through to MediaRecorder fallback
      }
    }

    // Fallback: MediaRecorder -> /api/transcribe
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError(BLOCKED_MIC_MESSAGE);
      setBlocked(true);
      setState('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop audio tracks immediately
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const chunks = audioChunksRef.current;
        if (!chunks.length) {
          setState('idle');
          return;
        }

        setState('processing');
        try {
          const audioBlob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          const reader = new FileReader();

          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
          });
          reader.readAsDataURL(audioBlob);
          const dataUrl = await base64Promise;

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: dataUrl,
              mimeType: recorder.mimeType || mimeType,
              language: lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
            }),
          });

          const data = await response.json();
          if (data.success && data.transcript) {
            const finalVal = data.transcript.trim();
            activeTranscriptRef.current = finalVal;
            setTranscript(finalVal);
            setState('ready');
            onTranscriptChangeRef.current?.(finalVal);
            onFinalTranscriptRef.current?.(finalVal);
          } else {
            setError(data.error || 'Could not transcribe recording');
            setState('error');
          }
        } catch (apiErr: any) {
          setError(apiErr?.message || 'Failed to send audio for transcription');
          setState('error');
        } finally {
          audioChunksRef.current = [];
        }
      };

      recorder.start(250);
      setState('listening');
    } catch (err: any) {
      console.error('[useVoiceInput] getUserMedia error:', err);
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        /denied|blocked|dismissed/i.test(err.message || '')
      ) {
        setBlocked(true);
        setError(BLOCKED_MIC_MESSAGE);
      } else {
        setError(err.message || 'Microphone access failed');
      }
      setState('error');
    }
  }, [lang]);

  return {
    state,
    transcript,
    interim,
    error,
    blocked,
    start,
    stop,
    reset,
  };
}
