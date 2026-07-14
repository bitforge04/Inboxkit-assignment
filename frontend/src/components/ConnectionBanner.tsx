import { useGameStore } from '../store/gameStore';

export const ConnectionBanner: React.FC = () => {
  const connected = useGameStore((s) => s.connected);
  if (connected) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-900/95 text-red-200 text-sm text-center py-2 font-medium">
      ⚡ Reconnecting to server…
    </div>
  );
};
