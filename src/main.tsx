import { LangProvider } from './lang';
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from '../hone_resort'
import './index.css'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { inject as injectAnalytics } from '@vercel/analytics'

injectSpeedInsights()
injectAnalytics()

// === JS ERROR TRACKING (GA4) ===
const reportError = (description: string) => {
  const gtag = (window as any).gtag;
  if (typeof gtag === 'function') {
    gtag('event', 'exception', { description: description.slice(0, 150), fatal: false });
  }
};
window.addEventListener('error', (e) => reportError(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => reportError(`unhandled_rejection: ${String(e.reason)}`));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Booking engine pages stay unreachable until VITE_BOOKING_ENGINE=on is set for that environment.
const BOOKING_ENGINE = import.meta.env.VITE_BOOKING_ENGINE === 'on'
const CheckoutPage = BOOKING_ENGINE ? lazy(() => import('./pages/CheckoutPage')) : () => null
const checkout = <Suspense fallback={null}><CheckoutPage /></Suspense>

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <LangProvider>
      <BrowserRouter>
        {BOOKING_ENGINE ? (
          <Routes>
            <Route path="/checkout" element={checkout} />
            <Route path="/checkout/:kode" element={checkout} />
            <Route path="/booking" element={checkout} />
            <Route path="/booking/:kode" element={checkout} />
            <Route path="*" element={<App />} />
          </Routes>
        ) : <App />}
      </BrowserRouter>
      </LangProvider>
    </HelmetProvider>
  </React.StrictMode>,
)
