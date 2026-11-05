import { useEffect, useState } from 'react';
import { speech } from '../lib/speech';
import type { Maneuver, Route } from '../lib/types';

/**
 * Turn-by-turn navigation overlay (concept from FloorNav's MobileNavigationHUD).
 * Steps advance manually or with "Auto walk", which simulates walking at a
 * normal pace so the route can be demonstrated without indoor positioning.
 */
interface Props {
  route: Route;
  step: number;
  floorName: (id: string) => string;
  onStep: (i: number) => void;
  onEnd: () => void;
}

const ARROW: Record<Maneuver, string> = {
  start: '●',
  straight: '↑',
  'turn-left': '←',
  'turn-right': '→',
  'slight-left': '↖',
  'slight-right': '↗',
  'take-elevator': '⇅',
  'take-stairs': '⇅',
  arrive: '★',
};

export function NavigationHUD({ route, step, floorName, onStep, onEnd }: Props) {
  const [muted, setMuted] = useState(speech.isMuted());
  const [auto, setAuto] = useState(false);
  const s = route.steps[step];
  const last = route.steps.length - 1;

  useEffect(() => {
    speech.speak(s.instruction);
  }, [s.instruction]);

  useEffect(() => {
    if (!auto || step >= last) return;
    // Demo pace: 1 s per 3 m walked, 3 s for floor changes, minimum 2.5 s.
    const ms = Math.max(2500, s.distance > 0 ? (route.steps[step + 1]?.distance ?? 0) * 333 : 3000);
    const t = setTimeout(() => onStep(step + 1), ms);
    return () => clearTimeout(t);
  }, [auto, step, last, s.distance, route.steps, onStep]);

  useEffect(() => () => speech.stop(), []);

  const remaining = route.steps.slice(step + 1).reduce((m, x) => m + x.distance, 0);

  return (
    <div className="hud" role="region" aria-label="Turn-by-turn navigation">
      <div className="hud-main">
        <span className={`hud-arrow a-${s.action}`} aria-hidden="true">
          {ARROW[s.action]}
        </span>
        <div>
          <div className="hud-instr" aria-live="polite">
            {s.instruction}
          </div>
          <small>
            Step {step + 1} of {route.steps.length} - {floorName(s.floorId)} - {Math.round(remaining)} m left
          </small>
        </div>
      </div>
      <div className="hud-actions">
        <button onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous step">
          Back
        </button>
        <button className="primary" onClick={() => onStep(Math.min(last, step + 1))} disabled={step === last}>
          Next
        </button>
        <button className={auto ? 'active' : ''} onClick={() => setAuto((a) => !a)} disabled={step === last}>
          {auto ? 'Pause' : 'Auto walk'}
        </button>
        {speech.supported() && (
          <button
            className={muted ? '' : 'active'}
            onClick={() => {
              speech.setMuted(!muted);
              setMuted(!muted);
              if (muted) speech.speak(s.instruction);
            }}
            aria-pressed={!muted}
          >
            Voice {muted ? 'off' : 'on'}
          </button>
        )}
        <button className="danger" onClick={onEnd}>
          End
        </button>
      </div>
    </div>
  );
}
