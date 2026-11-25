import { createRoot } from 'react-dom/client';
import './hooks/usePWAInstall';
import { initAutoUpdater } from './lib/autoUpdater';
import App from './App.tsx';
import './index.css';

initAutoUpdater();

createRoot(document.getElementById('root')!).render(<App />);
