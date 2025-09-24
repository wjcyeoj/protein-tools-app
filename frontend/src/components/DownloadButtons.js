import React from 'react';
import { downloadUrl } from '../api/jobs';

export default function DownloadButtons({ jobId }) {
  return (
    <div className="flex gap-3">
      <a className="underline" href={downloadUrl(jobId, 'full')}>Download full</a>
      <a className="underline" href={downloadUrl(jobId, 'lite')}>Download lite</a>
    </div>
  );
}
