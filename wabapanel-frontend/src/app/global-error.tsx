'use client';

import { useEffect, useState } from 'react';

const CHUNK_RE = /Loading chunk [\d]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const msg = String((error && (error.message || error.name)) || '');
    if (CHUNK_RE.test(msg)) {
      // A stale JS chunk from a previous deploy — reload once to fetch the new
      // build instead of showing a scary error to the customer.
      const K = '__chunk_reload__';
      const last = Number(sessionStorage.getItem(K) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(K, String(Date.now()));
        setReloading(true);
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#374151',
          background: '#f9fafb',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ marginBottom: 16, fontSize: 15 }}>
            {reloading ? 'Loading the latest version…' : 'Something went wrong.'}
          </p>
          {!reloading && (
            <button
              onClick={() => reset()}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Retry
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
