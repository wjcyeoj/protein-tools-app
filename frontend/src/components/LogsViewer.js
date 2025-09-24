import React from 'react';

export default function LogsViewer({ value }) {
  return (
    <div>
      <h2 className="font-medium">Logs (tail)</h2>
      <pre className="bg-gray-100 p-3 rounded max-h-64 overflow-auto text-xs whitespace-pre-wrap">
        {value || '(no logs yet)'}
      </pre>
    </div>
  );
}
