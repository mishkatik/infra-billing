import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import App from './App';
import './i18n';

import './index.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './theme-transition.css';
import './mobile.css';

// Fix country-flag emoji rendering on Windows (injects 'Twemoji Country Flags').
polyfillCountryFlagEmojis();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
