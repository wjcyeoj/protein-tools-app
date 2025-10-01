// frontend/src/components/Shared/Field.js
export default function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label>
        <strong>{label}: </strong> {children}
      </label>
    </div>
  );
}
