/**
 * Voice guidance using the Web Speech API (ported from FloorNav's speech.ts).
 * Safe to call in browsers without speech support or storage.
 */
const KEY = 'insideout.voice.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

let muted = readMuted();

export const speech = {
  supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },
  isMuted(): boolean {
    return muted;
  },
  setMuted(value: boolean) {
    muted = value;
    try {
      localStorage.setItem(KEY, String(value));
    } catch {
      // ignore
    }
    if (value) this.stop();
  },
  speak(text: string) {
    if (muted || !this.supported()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith('en') && /Natural|Google|Samantha/.test(v.name));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  },
  stop() {
    if (this.supported()) window.speechSynthesis.cancel();
  },
};
