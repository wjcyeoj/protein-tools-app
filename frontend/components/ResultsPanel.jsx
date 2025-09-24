export default function ResultsPanel({ status, error, data }) {
  if (status === 'idle') return <div>Enter a sequence to start.</div>;
  if (status === 'loading') return <div>Analyzing…</div>;
  if (status === 'error') return <div style={{color:'#b91c1c'}}>Error: {error}</div>;
  return <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(data, null, 2)}</pre>;
}
