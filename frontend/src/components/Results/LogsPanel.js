// frontend/src/components/Results/LogsPanel.js
export default function LogsPanel({ logs }) {
  return (
    <section>
      <strong>Logs</strong>
      <pre
        style={{
          background: '#0b0b0b',
          color: '#aefba8',
          padding: 12,
          minHeight: 180,
          whiteSpace: 'pre-wrap',
          borderRadius: 8,
        }}
      >
        {logs || '(waiting…)'}
      </pre>
    </section>
  );
}
