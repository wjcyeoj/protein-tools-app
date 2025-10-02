// shows residueid JSON if available
export default function ResultsPanel({ tool, status, data }) {
  if (tool !== 'residueid' || status !== 'finished' || !data) return null;
  return (
    <section style={{ marginTop: 12 }}>
      <strong>Residue summary</strong>
      <pre style={{ background:'#f6f6f6', padding:12, borderRadius:8 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
