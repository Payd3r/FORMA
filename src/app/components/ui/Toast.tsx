import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Icon from './Icon';

export type Toast = {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
};

type ToastContextType = {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.type ?? 'success'}`} role="status">
            <span className="toast-icon">
              {t.type === 'error' ? (
                <Icon name="close" size={16} />
              ) : (
                <Icon name="check" size={16} />
              )}
            </span>
            <span className="toast-message">{t.message}</span>
            <button
              className="toast-close"
              aria-label="Chiudi notifica"
              onClick={() => removeToast(t.id)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

