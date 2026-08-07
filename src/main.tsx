import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeNativeApp } from './services/nativeApp';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void initializeNativeApp();
