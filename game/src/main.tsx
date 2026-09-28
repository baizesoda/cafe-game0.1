import { createRoot } from 'react-dom/client';
import App from './App';
import { initPwa } from './pwa';

// 挂 Service Worker（M4）：注册是后台的事，不 await，不挡首屏
initPwa();

createRoot(document.getElementById('root')!).render(<App />);
