import React from "react";

export default function InfoTooltip({ text }) {
  return (
    <span className="tooltipWrap">
      <span className="tooltipIcon" aria-label="Info" role="img">
        ⓘ
      </span>
      <span className="tooltipBubble">{text}</span>
    </span>
  );
}
