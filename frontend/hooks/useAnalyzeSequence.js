import { useState, useCallback } from 'react';
import { analyzeSequence } from '../services/api';
export function useAnalyzeSequence() {
  const [status, setStatus] = useState('idle'); // idle|loading|success|error
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const run = useCallback(async (sequence) => {
    setStatus('loading'); setError(''); setData(null);
    try { const out = await analyzeSequence(sequence); setData(out); setStatus('success'); }
    catch (e) { setError(e?.message || 'Error'); setStatus('error'); }
  }, []);
  return { status, data, error, run };
}
