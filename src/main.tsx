import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';
import { store } from './platform/store';
import { BALANCE } from './game/data/economy';

// 首次交互解锁音频
function unlockAudio() {
  store.audio.unlock();
  window.removeEventListener('pointerdown', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);

store.init().then(() => {
  window.setInterval(() => {
    if (!document.hidden) void store.save();
  }, BALANCE.autoSaveSecDefault * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void store.save();
    else store.resume();
  });
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
