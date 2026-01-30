// frontend/src/components/Shared/Field.js
export default function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {children}
      </label>
    </div>
  );
}
