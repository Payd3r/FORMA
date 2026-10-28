import { useState } from 'react';
import { recoveryStatusLabels, type RecoveryReport, type MuscleRecovery } from '../../lib/recovery';
const color = (status: MuscleRecovery['status']) => ({ recent: '#e99561', recovering: '#e5c34b', lighter: '#90c86d', unknown: '#dce1df' })[status];
const shapes: Record<string, { front?: string; back?: string }> = {
  Chest: { front: 'M76 72 Q90 64 98 79 L98 104 Q80 111 68 97Z M124 72 Q110 64 102 79 L102 104 Q120 111 132 97Z' },
  Shoulders: { front: 'M72 65 Q55 66 49 85 L62 96 73 79Z M128 65 Q145 66 151 85 L138 96 127 79Z', back: 'M72 65 Q55 66 49 85 L62 96 73 79Z M128 65 Q145 66 151 85 L138 96 127 79Z' },
  Biceps: { front: 'M47 91 61 101 54 132 41 128Z M153 91 139 101 146 132 159 128Z' },
  Triceps: { back: 'M47 91 61 101 54 132 41 128Z M153 91 139 101 146 132 159 128Z' },
  Back: { back: 'M76 68 98 76 98 143 79 130 67 96Z M124 68 102 76 102 143 121 130 133 96Z' },
  Legs: { front: 'M75 159 96 170 91 223 72 223 66 183Z M125 159 104 170 109 223 128 223 134 183Z' },
  Glutes: { back: 'M74 146 98 145 98 175 Q82 187 69 173Z M126 146 102 145 102 175 Q118 187 131 173Z' },
  Hamstrings: { back: 'M72 182 96 184 91 223 72 223 66 194Z M128 182 104 184 109 223 128 223 134 194Z' },
  Calves: { front: 'M74 235 89 235 86 272 77 277 72 257Z M126 235 111 235 114 272 123 277 128 257Z', back: 'M74 235 89 235 86 272 77 277 72 257Z M126 235 111 235 114 272 123 277 128 257Z' }
};
/** Custom local vector: color represents recent logged load, never medical readiness. */
export default function RecoveryMap({ report, compact = false, onSelect }: { report: RecoveryReport; compact?: boolean; onSelect?: (group: MuscleRecovery) => void }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [selected, select] = useState<string>('');
  const active = report.groups.find(group => group.muscleGroup === selected);
  return <section className={`recovery-map ${compact ? 'compact' : ''}`}>
    <div className="section-heading"><h2>Recupero</h2><div className="body-side-switch" style={{ display: 'flex', gap: 4 }}>{(['front', 'back'] as const).map(view => <button type="button" key={view} className={`btn ${side === view ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '7px 10px', fontSize: 10 }} aria-pressed={side === view} onClick={() => setSide(view)}>{view === 'front' ? 'Fronte' : 'Retro'}</button>)}</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '110px minmax(0,1fr)' : 'minmax(100px,.8fr) minmax(0,1fr)', gap: 16, alignItems: 'center', marginTop: 18 }}>
      <svg viewBox="25 8 150 295" role="img" aria-label={`Mappa ${side === 'front' ? 'frontale' : 'posteriore'} del carico muscolare recente`} style={{ width: '100%', maxHeight: compact ? 210 : 300 }}>
        <path d="M87 47 Q76 40 79 24 Q81 10 100 10 Q119 10 121 24 Q124 40 113 47 L112 58 130 63 Q148 65 155 88 L162 127 171 160 160 165 147 132 138 108 134 144 138 183 131 225 127 277 135 291 116 292 108 275 105 229 100 197 95 229 92 275 84 292 65 291 73 277 69 225 62 183 66 144 62 108 53 132 40 165 29 160 38 127 45 88 Q52 65 70 63 L88 58Z" fill="#eef1ed" stroke="#cbd3cc" strokeWidth="1.2" />
        <path d="M100 66V143M79 119H94M106 119H121M80 130H94M106 130H120" stroke="#d2d9d2" fill="none" strokeWidth="2" strokeLinecap="round" />
        {report.groups.map(group => { const d = shapes[group.muscleGroup]?.[side]; return d && <path key={group.muscleGroup} d={d} fill={color(group.status)} stroke={selected === group.muscleGroup ? '#24342d' : '#fff'} strokeWidth={selected === group.muscleGroup ? 2 : 1.5} />; })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>{report.groups.map(group => <button type="button" key={group.muscleGroup} onClick={() => { select(group.muscleGroup); onSelect?.(group); }} aria-pressed={selected === group.muscleGroup} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: selected === group.muscleGroup ? 'var(--soft)' : 'transparent', border: 0, padding: '7px 5px', borderRadius: 7, minHeight: 33, fontSize: 11 }}><span style={{ width: 7, height: 7, background: color(group.status), borderRadius: '50%', flexShrink: 0 }} /><strong style={{ fontWeight: 550, flex: 1 }}>{group.label}</strong><span className="recovery-status" style={{ fontSize: compact ? 8 : 9, color: 'var(--color-muted)' }}>{compact ? ({ recent: 'Recente', recovering: 'Residuo', lighter: 'Ridotto', unknown: '—' })[group.status] : recoveryStatusLabels[group.status]}</span></button>)}</div>
    </div>
    {active && <div role="status" style={{ marginTop: 15, padding: 13, background: 'var(--soft)', borderRadius: 10, fontSize: 11 }}><strong>{active.label} · {recoveryStatusLabels[active.status]}</strong><p style={{ marginTop: 5, color: 'var(--color-muted)' }}>{active.reason}{active.hoursSinceLast !== undefined ? ` · circa ${Math.floor(active.hoursSinceLast)} h dall’ultima seduta` : ''}</p></div>}

  </section>;
}
