/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Mic, Square, Loader2, AlertCircle } from 'lucide-react';
import { useVoiceInput, BLOCKED_MIC_MESSAGE } from '../utils/useVoiceInput';

export interface MicButtonProps {
  onTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
  disabled?: boolean;
}

export function MicButton({
  onTranscript,
  onFinalTranscript,
  className = '',
  size = 'md',
  title = 'Voice input',
  disabled = false,
}: MicButtonProps) {
  const [showBlockedToast, setShowBlockedToast] = useState(false);

  const { state, error, blocked, start, stop, reset } = useVoiceInput({
    onTranscriptChange: (text) => {
      onTranscript?.(text);
    },
    onFinalTranscript: (text) => {
      onFinalTranscript?.(text);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    if (state === 'listening') {
      stop();
    } else if (state === 'processing') {
      // currently processing transcription
    } else {
      if (blocked) {
        setShowBlockedToast(true);
        setTimeout(() => setShowBlockedToast(false), 4000);
        return;
      }
      start().catch(() => {});
    }
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }[size];

  let stateStyle = 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  if (state === 'listening') {
    stateStyle = 'bg-red-600 text-white animate-pulse shadow-md hover:bg-red-700';
  } else if (state === 'processing') {
    stateStyle = 'bg-slate-100 text-blue-600 cursor-wait';
  } else if (blocked || state === 'error') {
    stateStyle = 'text-amber-700 hover:bg-amber-50';
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state === 'processing'}
        title={blocked ? BLOCKED_MIC_MESSAGE : state === 'listening' ? 'Stop listening' : title}
        aria-label={state === 'listening' ? 'Stop listening' : 'Start voice input'}
        className={`rounded-full shrink-0 flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${sizeClasses} ${stateStyle} ${className}`}
      >
        {state === 'listening' ? (
          <Square className="w-3.5 h-3.5 fill-current" />
        ) : state === 'processing' ? (
          <Loader2 className={`${iconSizes} animate-spin`} />
        ) : (
          <Mic className={iconSizes} />
        )}
      </button>

      {/* Floating alert if mic is blocked or encountered an error */}
      {(showBlockedToast || (blocked && state === 'error')) && (
        <div
          role="alert"
          className="absolute bottom-full right-0 mb-2 z-50 w-64 p-2.5 rounded-xl bg-slate-900 text-white text-xs shadow-xl flex items-start gap-2 animate-in fade-in zoom-in-95 duration-150"
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="leading-snug">{BLOCKED_MIC_MESSAGE}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowBlockedToast(false);
                reset();
              }}
              className="mt-1 text-[11px] underline text-blue-300 hover:text-blue-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
