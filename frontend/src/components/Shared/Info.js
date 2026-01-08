// frontend/src/components/Shared/Info.js
export default function Info({ children }) {
  return (
    <span title={children} style={{ cursor: 'help', marginLeft: 6, color: '#888' }}>
      ⓘ
    </span>
  );
}
