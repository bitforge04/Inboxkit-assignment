import { GridCanvas }        from './components/GridCanvas';
import { Sidebar }           from './components/Sidebar';
import { HoverTooltip }      from './components/HoverTooltip';
import { ToastContainer }    from './components/ToastContainer';
import { ConnectionBanner }  from './components/ConnectionBanner';
import { useSocket }         from './hooks/useSocket';

export default function App() {
  const { claimCell } = useSocket();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-950">
      <ConnectionBanner />
      <GridCanvas onClaim={claimCell} />
      <HoverTooltip />
      <Sidebar />
      <ToastContainer />
    </div>
  );
}
