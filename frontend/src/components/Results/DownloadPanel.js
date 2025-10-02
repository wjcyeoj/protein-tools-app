// frontend/src/components/Results/DownloadPanel.js
import { useEffect, useRef, useState } from 'react';

export default function DownloadPanel({ jobId, canDownload }) {
  const [downloading, setDownloading] = useState(false);
  const [pct, setPct] = useState(0);             // number 0–100 or null when unknown
  const xhrRef = useRef(null);

  useEffect(() => {
    // abort any in-flight XHR when this component unmounts
    return () => { if (xhrRef.current) xhrRef.current.abort(); };
  }, []);

  function runDownload(mode = 'full') {
    if (!canDownload || downloading) return;

    setDownloading(true);
    setPct(0);

    const url = `/jobs/${jobId}/download?mode=${mode}`;
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    xhr.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const p = Math.round((evt.loaded / evt.total) * 100);
        setPct(p);
      } else {
        setPct(null);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const dispo = xhr.getResponseHeader('content-disposition') || '';
        const m = dispo.match(/filename="?([^"]+)"?/);
        const filename = m?.[1] || `${jobId}.tgz`;

        const blobUrl = URL.createObjectURL(xhr.response);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } else {
        alert(`Download failed: HTTP ${xhr.status}`);
      }
      cleanup();
    };

    xhr.onerror = () => { alert('Network error during download'); cleanup(); };
    xhr.onabort  = () => cleanup();

    xhr.send();

    function cleanup() {
      setDownloading(false);
      setPct(0);
      xhrRef.current = null;
    }
  }

  function cancel() {
    if (xhrRef.current) xhrRef.current.abort();
  }

  return (
    <div>
      <button
        disabled={!canDownload || downloading}
        onClick={() => runDownload('full')}
      >
        {downloading ? (pct != null ? `Downloading… ${pct}%` : 'Downloading…') : 'Download results'}
      </button>

      <button
        style={{ marginLeft: 8 }}
        disabled={!canDownload || downloading}
        onClick={() => runDownload('lite')}
        title="Skips MSAs/PKLs for a much smaller download"
      >
        {downloading ? '…' : 'Download (lite)'}
      </button>

      {downloading && (
        <div style={{ marginTop: 8 }}>
          <progress value={pct ?? 0} max="100" style={{ width: '100%' }} />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            {pct != null ? `${pct}%` : 'Downloading… (size unknown)'}
            <button type="button" onClick={cancel} style={{ marginLeft: 8 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
