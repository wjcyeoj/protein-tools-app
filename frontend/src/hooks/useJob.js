// frontend/src/hooks/useJob.js
import { useCallback, useEffect, useRef, useState } from 'react';

const LS_JOB = 'ptools.currentJob';

export default function useJob() {
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState('');

  const pollRef = useRef(null);

  // Reattach to in-flight job on refresh
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_JOB) || 'null');
      if (saved?.id) setJobId(saved.id);
    } catch {}
  }, []);

  const clearTimer = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollOnce = useCallback(async (id) => {
    try {
      // status
      const s = await fetch(`/jobs/${id}`);
      if (s.ok) {
        const js = await s.json();
        if (js?.status) setStatus(js.status);
        if (js?.status && js.status !== 'running') {
          localStorage.removeItem(LS_JOB);
        }
      }
      // logs
      const l = await fetch(`/jobs/${id}/logs?tail=400`);
      if (l.ok) {
        const j = await l.json(); // { log }
        const cleaned = (j.log || '').replace(/(\n[-=]{3,}\n)+/g, '\n');
        setLogs(cleaned);
      }
    } catch {
      // ignore transient errors
    }
  }, []);

  const startPolling = useCallback((id) => {
    clearTimer();
    pollOnce(id);
    pollRef.current = setInterval(() => pollOnce(id), 2500);
  }, [pollOnce]);

  const submit = useCallback(async (formData) => {
    setStatus('running');
    setLogs('');
    setJobId('');

    const res = await fetch('/jobs', { method: 'POST', body: formData });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Submit failed (${res.status}): ${t}`);
    }
    const { job_id } = await res.json();

    setJobId(job_id);
    localStorage.setItem(LS_JOB, JSON.stringify({ id: job_id }));
    startPolling(job_id);

    return job_id;
  }, [startPolling]);

  const clearJob = useCallback(() => {
    setJobId('');
    setStatus('idle');
    setLogs('');
    localStorage.removeItem(LS_JOB);
    clearTimer();
  }, []);

  useEffect(() => () => clearTimer(), []);

  const canDownload = !!jobId && status === 'finished';

  return { jobId, status, logs, canDownload, submit, clearJob };
}
