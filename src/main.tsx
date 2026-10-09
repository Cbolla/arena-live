import React from 'react';
import { createRoot } from 'react-dom/client';
import { useArena } from './lib/state';
import { LiveView } from './components/LiveView';
import { Admin } from './pages/Admin';
import { GiftFinder } from './pages/GiftFinder';
import './styles.css';
import './live-layout.css';
import './gift-finder.css';
function App() { const { state, connected } = useArena(); const live = location.pathname === '/live'; if (location.pathname === '/presentes') return <GiftFinder/>; return live ? <main className="obs-page"><LiveView state={state} connected={connected}/></main> : <Admin state={state} connected={connected}/>; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
