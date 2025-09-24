import React, { useState } from 'react';
import JobSubmitForm from '../components/JobSubmitForm';
import LogsViewer from '../components/LogsViewer';
import StatusPill from '../components/StatusPill';
import DownloadButtons from '../components/DownloadButtons';
import useJobPoll from '../hooks/useJobPoll';

export default function Home() {
  const [jobId, setJobId] = useState(null);
  const { job, logs, error } = useJobPoll(jobId);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Run a Job</h1>

      <JobSubmitForm onSubmitted={setJobId} />

      {jobId && (
        <div className="space-y-2">
          <div className="text-sm">Job: <code>{jobId}</code></div>
          {error && <div className="text-red-600">{String(error.message || error)}</div>}
          <div className="text-sm">
            Status: <StatusPill status={job?.status || '...'} />
            {job?.exit_code != null ? ` (code ${job.exit_code})` : ''}
          </div>

          <LogsViewer value={logs} />

          {job?.status === 'finished' && <DownloadButtons jobId={jobId} />}
        </div>
      )}
    </div>
  );
}
