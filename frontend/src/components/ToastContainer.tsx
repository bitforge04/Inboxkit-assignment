import { useGameStore, Toast } from '../store/gameStore';

const ICONS: Record<Toast['type'], string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
};

const COLORS: Record<Toast['type'], string> = {
  success: 'bg-green-900/90 border-green-700 text-green-200',
  error:   'bg-red-900/90 border-red-700 text-red-200',
  info:    'bg-blue-900/90 border-blue-700 text-blue-200',
};

export const ToastContainer: React.FC = () => {
  const toasts      = useGameStore((s) => s.toasts);
  const removeToast = useGameStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl border
            text-sm font-medium shadow-xl backdrop-blur-sm
            animate-slide-up pointer-events-auto
            ${COLORS[toast.type]}
          `}
          onClick={() => removeToast(toast.id)}
        >
          <span className="text-base">{ICONS[toast.type]}</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
};
