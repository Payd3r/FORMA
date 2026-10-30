import { useEffect, useState } from 'react';
import type { RestTimer as Timer } from '../../lib/restTimer';

export default function RestTimer({ timer }: { timer: Timer; onEnd?: () => void; onExtend?: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [timer.deadline]);

  const remaining = Math.max(0, Math.ceil((timer.deadline - now) / 1000));
  if (remaining <= 0) return null;

  const progress = Math.min(1, Math.max(0, (now - timer.startedAt) / (timer.deadline - timer.startedAt)));
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <section className="clean-rest-timer-box" data-testid="rest-timer" aria-label="Recupero tra le serie">
      <div className="clean-rest-ring-wrap">
        <svg className="clean-rest-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r="27"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeDasharray="169.65"
            strokeDashoffset={169.65 * (1 - progress)}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
          />
        </svg>
      </div>
      <div className="clean-rest-info">
        <span className="clean-rest-tag">RECUPERO IN CORSO</span>
        <strong className="clean-rest-digits" role="timer" aria-label="Tempo di recupero">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </strong>
      </div>
    </section>
  );
}
