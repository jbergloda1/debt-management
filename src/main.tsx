import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import './styles.css';
import { registerPwa } from './pwa/pwa';
import { watchResponsiveTables } from './components/responsiveTables';

registerPwa();
watchResponsiveTables();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={viVN} theme={{ token: { colorPrimary: '#0d9488', borderRadius: 10, fontFamily: "'Segoe UI', sans-serif", colorText: '#172b3a', controlHeight: 38 }, components: { Menu: { itemSelectedBg: '#e6f6f2', itemSelectedColor: '#087f73', itemHeight: 46 }, Modal: { borderRadiusLG: 20 } } }}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
