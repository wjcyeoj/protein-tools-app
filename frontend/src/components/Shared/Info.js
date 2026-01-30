// frontend/src/components/Shared/Info.js
export default function Info({ children }) {
  return (
    <span className="tooltipWrap">
      <span className="tooltipIcon" aria-label="Info">ⓘ</span>
      <span className="tooltipBubble">{children}</span>
    </span>
  );
}
