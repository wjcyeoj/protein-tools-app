import React from 'react';

export default function StatusPill({ status }) {
  const color =
    status === 'finished' ? 'bg-green-100 text-green-700' :
    status === 'failed'   ? 'bg-red-100 text-red-700' :
    status === 'running'  ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${color}`}>
      {status || '…'}
    </span>
  );
}
