// frontend/src/components/Results/StatusBlock.js
export default function StatusBlock({ jobId, status }) {
  return (
    <section style={{ margin: '0.5rem 0 1rem' }}>
      <div><strong>Job ID:</strong> {jobId || '—'}</div>
      <div><strong>Status:</strong> {status}</div>
    </section>
  );
}
