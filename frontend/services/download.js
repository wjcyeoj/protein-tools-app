import API_BASE from './api';

// Parse filename from Content-Disposition if present
function filenameFromDisposition(dispo) {
  if (!dispo) return null;
  const m = dispo.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// A) GET download (what many apps had before)
export function openGETDownload(jobId) {
  const url = `${API_BASE}/download?job_id=${encodeURIComponent(jobId)}`;
  // Use a normal navigation so the browser handles it natively
  window.open(url, '_blank', 'noopener');
}
