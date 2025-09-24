import { useState, useMemo } from 'react';
import { isValidSequence } from '../utils/validation';
export default function SequenceForm({ onSubmit, initialValue = '' }) {
  const [seq, setSeq] = useState(initialValue);
  const valid = useMemo(() => isValidSequence(seq), [seq]);
  const submit = (e) => { e.preventDefault(); if (valid) onSubmit(seq); };
  return (
    <form onSubmit={submit}>
      <label htmlFor="sequence">Protein sequence</label>
      <textarea id="sequence" rows={6} value={seq} onChange={e=>setSeq(e.target.value)} />
      <button type="submit" disabled={!valid}>Analyze</button>
    </form>
  );
}
