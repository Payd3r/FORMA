import { useEffect, useState } from 'react';

export default function ElapsedStopwatch({ resetKey }: { resetKey: number | string | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!resetKey) {
      setElapsed(0);
      return;
    }
    const startTime = typeof resetKey === 'number' ? resetKey : new Date(resetKey).getTime();
    function update() {
      const diffSecs = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsed(diffSecs);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetKey]);

  if (!resetKey) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="header-stopwatch" title="Tempo dall'ultima serie">
      <span className="stopwatch-dot" />
      <span className="stopwatch-digits">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  );
}

