// frontend/src/App.js
import React, { useEffect, useRef, useState } from 'react';
import Field from './components/Shared/Field';
import FreezeSpecInput from './components/Controls/FreezeSpecInput';
import AlphaFoldParams from './components/Controls/AlphaFoldParams';
import ProteinMpnnParams from './components/Controls/ProteinMpnnParams';
import InputSection from './components/Controls/InputSection';
import StatusBlock from './components/Results/StatusBlock';
import LogsPanel from './components/Results/LogsPanel';

const LS_TOOL = 'ptools.tool';
const LS_AF = 'ptools.afParams';
const LS_MPNN = 'ptools.mpnnParams';
const LS_JOB = 'ptools.currentJob';

export default function App() {
  const [tool, setTool] = useState(() => localStorage.getItem(LS_TOOL) || 'alphafold');
  const [file, setFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0); // 0–100, or null if unknown
  const xhrRef = useRef(null);

  const [afParams, setAfParams] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(LS_AF)) || {
          model_preset: 'monomer',
          db_preset: 'full_dbs',
          max_template_date: '2024-12-31',
          models_to_relax: 'none',
          use_gpu_relax: false,
        }
      );
    } catch {
      return {
        model_preset: 'monomer',
        db_preset: 'full_dbs',
        max_template_date: '2024-12-31',
        models_to_relax: 'none',
        use_gpu_relax: false,
      };
    }
  });

  const [mpnnParams, setMpnnParams] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(LS_MPNN)) || {
          model_name: 'v_48_020',
          num_seq_per_target: 10,
          batch_size: 1,
          sampling_temp: 0.2,
        }
      );
    } catch {
      return {
        model_name: 'v_48_020',
        num_seq_per_target: 10,
        batch_size: 1,
        sampling_temp: 0.2,
      };
    }
  });

  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState('');
  const pollRef = useRef(null);
  const freezeRef = React.createRef();
  // let users choose file vs text for AlphaFold
  const [inputMode, setInputMode] = useState('file'); // "file" | "text"
  const [seqName, setSeqName] = useState('query'); // header if user pastes plain sequence
  const [seqText, setSeqText] = useState(''); // pasted FASTA or plain sequence

  // persist selections
  useEffect(() => localStorage.setItem(LS_TOOL, tool), [tool]);
  useEffect(() => localStorage.setItem(LS_AF, JSON.stringify(afParams)), [afParams]);
  useEffect(() => localStorage.setItem(LS_MPNN, JSON.stringify(mpnnParams)), [mpnnParams]);

  // reattach to an in-flight job after refresh
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(LS_JOB) || 'null');
    if (saved?.id) {
      setJobId(saved.id);
      if (saved.tool) setTool(saved.tool);
    }
  }, []);

  // Submit job (send individual fields the backend expects)
  async function handleSubmit(e) {
    e.preventDefault();

    // Decide what file to send
    let fileToSend = file;

    // For AlphaFold, if user chose "paste text" mode, convert it to a virtual FASTA file
    if (tool === 'alphafold' && inputMode === 'text') {
      const raw = (seqText || '').trim();
      if (!raw) {
        alert('Please paste a FASTA or sequence.');
        return;
      }

      // If it already looks like FASTA, use as-is; otherwise wrap as a single FASTA record
      let fastaText;
      if (raw.startsWith('>') || raw.includes('\n>')) {
        fastaText = raw.endsWith('\n') ? raw : raw + '\n';
      } else {
        const seqOnly = raw.replace(/\s+/g, '');
        if (!seqOnly) {
          alert('No sequence letters found in the pasted text.');
          return;
        }
        const header = (seqName || 'sequence').trim() || 'sequence';
        fastaText = `>${header}\n${seqOnly}\n`;
      }

      const safeName = (seqName || 'sequence').replace(/[^A-Za-z0-9_.-]+/g, '_');
      fileToSend = new File([fastaText], `${safeName}.fasta`, { type: 'text/plain' });
    }

    // Validate inputs per tool
    if (tool === 'proteinmpnn' && !fileToSend) {
      alert('Please choose a PDB/CIF file for ProteinMPNN.');
      return;
    }
    if (tool === 'alphafold' && !fileToSend) {
      alert('Please choose a FASTA file or paste a sequence.');
      return;
    }

    // Build form data (unchanged for MPNN; AF fields still sent the same)
    const freezeSpec = freezeRef.current?.value?.trim() || '';
    const body = new FormData();
    body.append('tool', tool);
    body.append('file', fileToSend);

    if (tool === 'alphafold') {
      body.append('model_preset', afParams.model_preset);
      body.append('db_preset', afParams.db_preset);
      body.append('max_template_date', afParams.max_template_date);
      body.append('models_to_relax', afParams.models_to_relax);
      body.append('use_gpu_relax', String(!!afParams.use_gpu_relax));
    } else {
      body.append('mpnn_model_name', mpnnParams.model_name);
      body.append('mpnn_num_seq', String(mpnnParams.num_seq_per_target));
      body.append('mpnn_batch_size', String(mpnnParams.batch_size));
      body.append('mpnn_sampling_temp', String(mpnnParams.sampling_temp));
      if (freezeSpec) body.append('mpnn_freeze_spec', freezeSpec);
    }

    setStatus('running');
    setLogs('');
    setJobId('');
    try {
      const res = await fetch('/jobs', { method: 'POST', body });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Submit failed (${res.status}): ${t}`);
      }
      const { job_id } = await res.json();
      setJobId(job_id);
      localStorage.setItem(LS_JOB, JSON.stringify({ id: job_id, tool }));
    } catch (err) {
      setStatus('error');
      alert(err.message);
    }
  }

  // Poll status + logs (parse JSON from /logs)
  useEffect(() => {
    if (!jobId) return;

    async function tick() {
      try {
        const s = await fetch(`/jobs/${jobId}`);
        if (s.ok) {
          const js = await s.json();
          setStatus(js.status);
          // if finished/failed, clear the “current job” marker
          if (js.status && js.status !== 'running') {
            localStorage.removeItem(LS_JOB);
          }
        }
        const l = await fetch(`/jobs/${jobId}/logs?tail=400`);
        if (l.ok) {
          const j = await l.json(); // backend returns { log: "..." }
          // optional cleanup: collapse excessive separators
          const cleaned = (j.log || '').replace(/(\n[-=]{3,}\n)+/g, '\n');
          setLogs(cleaned);
        }
      } catch {
        // ignore transient errors
      }
    }

    tick();
    pollRef.current = setInterval(tick, 2500);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const canDownload = jobId && status === 'finished';

  async function handleDownload(mode = 'full') {
    if (!canDownload || downloading) return;

    setDownloading(true);
    setDownloadPct(0);

    const url = `/jobs/${jobId}/download?mode=${mode}`;
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    // Fires repeatedly as bytes arrive
    xhr.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        setDownloadPct(pct);
      } else {
        // Backend didn’t send Content-Length (shouldn’t happen with /download, but just in case)
        setDownloadPct(null);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const dispo = xhr.getResponseHeader('content-disposition') || '';
        const m = dispo.match(/filename="?([^"]+)"?/);
        const filename = m?.[1] || `${jobId}.tgz`;

        const blobUrl = URL.createObjectURL(xhr.response);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } else {
        alert(`Download failed: HTTP ${xhr.status}`);
      }
      setDownloading(false);
      setDownloadPct(0);
      xhrRef.current = null;
    };

    xhr.onerror = () => {
      alert('Network error during download');
      setDownloading(false);
      setDownloadPct(0);
      xhrRef.current = null;
    };

    xhr.onabort = () => {
      setDownloading(false);
      setDownloadPct(0);
      xhrRef.current = null;
    };

    xhr.send();
  }

  function cancelDownload() {
    if (xhrRef.current) xhrRef.current.abort();
  }

  // Clean up any in-flight XHR when unmounting
  useEffect(() => {
    return () => {
      if (xhrRef.current) xhrRef.current.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: '2rem auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 6 }}>Protein Tools</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Run AlphaFold or ProteinMPNN on your EC2 instance.
      </p>

      <section style={{ margin: '1rem 0' }}>
        <label>
          <strong>Tool:&nbsp;</strong>
          <select value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="alphafold">AlphaFold</option>
            <option value="proteinmpnn">ProteinMPNN</option>
          </select>
        </label>
      </section>

      {/* File chooser OR paste box */}
      <InputSection
        tool={tool}
        file={file}
        setFile={setFile}
        inputMode={inputMode}
        setInputMode={setInputMode}
        seqName={seqName}
        setSeqName={setSeqName}
        seqText={seqText}
        setSeqText={setSeqText}
      />

      {tool === 'alphafold' && (
        <AlphaFoldParams params={afParams} setParams={setAfParams} />
      )}

      {tool === 'proteinmpnn' && (
        <>
          <ProteinMpnnParams params={mpnnParams} setParams={setMpnnParams} />
          <FreezeSpecInput inputRef={freezeRef} />
        </>
      )}

      <form onSubmit={handleSubmit} style={{ margin: '1rem 0' }}>
        <button type="submit">Submit</button>
        <button
          type="button"
          style={{ marginLeft: 8 }}
          disabled={!jobId}
          onClick={() => {
            setJobId('');
            setStatus('idle');
            setLogs('');
            localStorage.removeItem(LS_JOB);
          }}
        >
          Clear job
        </button>
      </form>

      <StatusBlock jobId={jobId} status={status} />
        <div style={{ marginTop: 8 }}>
          <button disabled={!canDownload || downloading} onClick={() => handleDownload('full')}>
            {downloading
              ? downloadPct != null
                ? `Downloading… ${downloadPct}%`
                : 'Downloading…'
              : 'Download results'}
          </button>

          {/* Optional: a smaller “lite” archive */}
          <button
            style={{ marginLeft: 8 }}
            disabled={!canDownload || downloading}
            onClick={() => handleDownload('lite')}
            title="Skips MSAs/PKLs for a much smaller download"
          >
            {downloading ? '…' : 'Download (lite)'}
          </button>

          {downloading && (
            <div style={{ marginTop: 8 }}>
              <progress value={downloadPct ?? 0} max="100" style={{ width: '100%' }} />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {downloadPct != null ? `${downloadPct}%` : 'Downloading… (size unknown)'}
                <button type="button" onClick={cancelDownload} style={{ marginLeft: 8 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Logs */}
      <LogsPanel logs={logs} />
    </div>
  );
}
