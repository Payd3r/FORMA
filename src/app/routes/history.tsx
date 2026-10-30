import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSessioni } from '../lib/useSessioni';
import { useLibrary, sessionDay } from '../lib/useTemplate';
import { number, sessionTotals } from '../lib/training';
import Icon from '../components/ui/Icon';

export default function HistoryRoute() {
  const { data: sessions = [], isLoading } = useSessioni();
  const { data: library } = useLibrary();

  // Persistenza dei filtri tra navigazioni
  const [query, setQuery] = useState(() => sessionStorage.getItem('forma_diary_query') ?? '');
  const [plan, setPlan] = useState(() => sessionStorage.getItem('forma_diary_plan') ?? 'all');
  const [month, setMonth] = useState(() => sessionStorage.getItem('forma_diary_month') ?? '');
  const [filtersExpanded, setFiltersExpanded] = useState(() => sessionStorage.getItem('forma_diary_expanded') === 'true');

  useEffect(() => {
    sessionStorage.setItem('forma_diary_query', query);
  }, [query]);

  useEffect(() => {
    sessionStorage.setItem('forma_diary_plan', plan);
  }, [plan]);

  useEffect(() => {
    sessionStorage.setItem('forma_diary_month', month);
  }, [month]);

  useEffect(() => {
    sessionStorage.setItem('forma_diary_expanded', String(filtersExpanded));
  }, [filtersExpanded]);

  const completed = sessions.filter(s => s.status === 'completed');
  const filtered = completed.filter(
    s =>
      (plan === 'all' || s.templateId === plan) &&
      (!month || s.date.startsWith(month)) &&
      (!query ||
        `${sessionDay(s, library?.templates).label} ${s.sessionNotes ?? ''} ${sessionDay(s, library?.templates).exercises.map(e => e.name).join(' ')}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()))
  );

  const plans = [
    ...new Map(
      sessions.map(s => [
        s.templateId,
        s.templateName ?? library?.templates.find(t => t.templateId === s.templateId)?.name ?? 'Scheda precedente',
      ])
    ).entries(),
  ];

  const hasActiveFilters = query.trim() !== '' || month !== '' || plan !== 'all';

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <p className="eyebrow">TUTTO QUELLO CHE HAI FATTO</p>
          <h1>Il tuo <em>diario</em></h1>
        </div>
        <div className="history-count">
          <strong>{completed.length}</strong>
        </div>
      </div>

      {/* Barra di ricerca con tasto accordion filtri sulla destra 90/10 */}
      <div className="diary-search-accordion-bar">
        <label className="search-field diary-search-input-field">
          <Icon name="search" />
          <input
            placeholder="Cerca un esercizio, una seduta, un appunto…"
            value={query}
            aria-label="Cerca nel diario"
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setQuery('')}
              aria-label="Cancella testo"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
        <button
          type="button"
          className={`diary-filters-toggle-btn ${filtersExpanded ? 'expanded' : ''} ${hasActiveFilters ? 'has-active' : ''}`}
          aria-label={filtersExpanded ? 'Chiudi filtri avanzati' : 'Apri filtri avanzati'}
          title={filtersExpanded ? 'Nascondi filtri' : 'Mostra filtri'}
          onClick={() => setFiltersExpanded(prev => !prev)}
        >
          <Icon name="settings" size={18} />
          {hasActiveFilters && <span className="diary-filter-badge" />}
        </button>
      </div>

      {/* Accordion filtri espandibile */}
      {filtersExpanded && (
        <div className="diary-expanded-filters-box">
          <div className="diary-expanded-filter-row">
            <div className="diary-filter-control">
              <label className="eyebrow">SCHEDA</label>
              <select
                className="input"
                value={plan}
                aria-label="Filtra per scheda"
                onChange={e => setPlan(e.target.value)}
              >
                <option value="all">Tutte le schede</option>
                {plans.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="diary-filter-control">
              <label className="eyebrow">MESE</label>
              <input
                className="input"
                type="month"
                aria-label="Filtra per mese"
                value={month}
                onChange={e => setMonth(e.target.value)}
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              className="text-link diary-reset-filters-btn"
              onClick={() => {
                setQuery('');
                setPlan('all');
                setMonth('');
              }}
            >
              <Icon name="close" size={13} />
              <span>Azzera tutti i filtri</span>
            </button>
          )}
        </div>
      )}

      {/* Lista sedute diario */}
      <div className="panel diary-panel">
        {isLoading ? (
          <div className="loading-state">Leggo il diario…</div>
        ) : filtered.length ? (
          filtered.map((session, index) => {
            const day = sessionDay(session, library?.templates);
            const totals = sessionTotals(session);
            const monthLabel = new Date(`${session.date}T12:00:00`).toLocaleDateString('it-IT', {
              month: 'long',
              year: 'numeric',
            });
            const first =
              !index || filtered[index - 1].date.slice(0, 7) !== session.date.slice(0, 7);

            return (
              <div key={session.sessionId} className="diary-session-item-wrap">
                {first && (
                  <div className="diary-month-divider">
                    <span className="diary-month-label">{monthLabel}</span>
                  </div>
                )}
                <Link className="session-row" to={`/workout/${session.sessionId}`}>
                  <div className="date-tile">
                    <strong>{session.date.slice(8)}</strong>
                    <span>
                      {new Date(`${session.date}T12:00:00`).toLocaleDateString('it-IT', {
                        weekday: 'short',
                      })}
                    </span>
                  </div>
                  <div className="session-row-main">
                    <strong>{day.label}</strong>
                    <small>
                      {totals.exercises} esercizi · {totals.sets} serie
                    </small>
                    {session.sessionNotes && (
                      <p className="session-note-preview">{session.sessionNotes}</p>
                    )}
                  </div>
                  <span className="session-volume">
                    {number(totals.volume)} <small>kg</small>
                  </span>
                  <Icon name="arrow" size={18} />
                </Link>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <Icon name="book" size={35} />
            <h3>{completed.length ? 'Nessuna seduta con questi filtri' : 'La tua storia comincia da una serie'}</h3>
            <p>
              {completed.length
                ? 'Cambia ricerca per ritrovare i tuoi allenamenti'
                : 'Le sedute completate si raccolgono qui, con tutti i dettagli'}
            </p>
            <Link className="text-link" to="/workout">
              Apri allenamento <Icon name="arrow" size={17} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
