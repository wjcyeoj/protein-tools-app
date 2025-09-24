import { useEffect, useRef, useState } from 'react';
import { getJob, getJobLogs } from '../api/jobs';

export default function useJobPoll(jobId, { interval = 3000 } = {}) {
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState('');
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function tick() {
      try {
        const [j, l] = await Promise.all([getJob(jobId), getJobLogs(jobId, 400)]);
        if (cancelled) return;
        setJob(j);
        setLogs(l.log || '');
        if (['finished', 'failed', 'unknown'].includes(j.status)) return;
        timer.current = setTimeout(tick, interval);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, interval]);

  return { job, logs, error };
}
