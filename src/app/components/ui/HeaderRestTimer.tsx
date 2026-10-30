import { useEffect, useState } from 'react';
import type { RestTimer as Timer } from '../../lib/restTimer';

export default function HeaderRestTimer({ timer }: { timer: Timer }) {
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
    <div className="header-rest-pill" title="Tempo di recupero">
      <svg className="header-rest-circle" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="56.5"
          strokeDashoffset={56.5 * (1 - progress)}
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span className="header-rest-label">Recupero</span>
      <strong className="header-rest-digits">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </strong>
    </div>
  );
}
