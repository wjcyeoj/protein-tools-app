// frontend/src/App.js
import React, { useEffect, useRef, useState } from 'react';
import Field from './components/Shared/Field';
import FreezeSpecInput from './components/Controls/FreezeSpecInput';
import AlphaFoldParams from './components/Controls/AlphaFoldParams';
import ProteinMpnnParams from './components/Controls/ProteinMpnnParams';
import InputSection from './components/Controls/InputSection';
import StatusBlock from './components/Results/StatusBlock';
import LogsPanel from './components/Results/LogsPanel';
import DownloadPanel from './components/Results/DownloadPanel';
import useJob from './hooks/useJob';
import { makeVirtualFastaFile } from './utils/fasta';

const LS_TOOL = 'ptools.tool';
const LS_AF = 'ptools.afParams';
const LS_MPNN = 'ptools.mpnnParams';
const LS_JOB = 'ptools.currentJob';
const LS_JOBNAME = 'ptools.jobName';

export default function App() {
  const [tool, setTool] = useState(() => localStorage.getItem(LS_TOOL) || 'alphafold');
  const [file, setFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0); // 0–100, or null if unknown
  const [jobName, setJobName] = useState(() => localStorage.getItem(LS_JOBNAME) || '');
  useEffect(() => localStorage.setItem(LS_JOBNAME, jobName), [jobName]);
  const xhrRef = useRef(null);
  const { jobId, status, logs, canDownload, submit, clearJob } = useJob();
  const [resultData, setResultData] = useState(null);
  useEffect(() => {
    if ((tool === 'residueid' || tool === 'msa') && jobId && status === 'finished') {
      fetch(`/jobs/${jobId}`)
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(info => setResultData(info.result_data || null))
        .catch(() => setResultData(null));
    } else {
      setResultData(null);
    }
  }, [tool, jobId, status]);

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

  const freezeRef = React.createRef();
  // let users choose file vs text for AlphaFold
  const [inputMode, setInputMode] = useState('file'); // "file" | "text"
  const [seqName, setSeqName] = useState('query'); // header if user pastes plain sequence
  const [seqText, setSeqText] = useState(''); // pasted FASTA or plain sequence

  // persist selections
  useEffect(() => localStorage.setItem(LS_TOOL, tool), [tool]);
  useEffect(() => localStorage.setItem(LS_AF, JSON.stringify(afParams)), [afParams]);
  useEffect(() => localStorage.setItem(LS_MPNN, JSON.stringify(mpnnParams)), [mpnnParams]);

  // Submit job (send individual fields the backend expects)
  async function handleSubmit(e) {
    e.preventDefault();

    // Decide what file to send
    let fileToSend = file;

    if (tool === 'alphafold' && inputMode === 'text') {
      const f = makeVirtualFastaFile(seqText, seqName);
      if (!f) {
        alert('Please paste a valid FASTA or sequence.');
        return;
      }
      fileToSend = f;
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
    if (tool === 'residueid' && !fileToSend) {
      alert('Please choose a FASTA or PDB file (or paste a FASTA sequence).');
      return;
    }
    if (tool === 'msa' && !fileToSend && inputMode !== 'text') {
      alert('Upload or paste a multi-FASTA for the MSA tool.');
      return;
    }

    // Build form data (unchanged for MPNN; AF fields still sent the same)
    const freezeSpec = freezeRef.current?.value?.trim() || '';
    const body = new FormData();
    body.append('tool', tool);
    if (jobName && jobName.trim()) {
      body.append('job_id', jobName.trim()); // backend validates / dedupes
    }

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

    try {
      await submit(body); // starts polling and stores job id
    } catch (err) {
      alert(err.message);
    }
  }

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
            <option value="residueid">Residue Identifier</option>
            <option value="msa">Multiple Sequence Consensus</option>
          </select>
        </label>
      </section>

      <Field label="Job name (optional)">
        <input
          type="text"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          placeholder="e.g., spike_protein_multimer_v2"
          style={{ width: 320 }}
          spellCheck={false}
        />
      </Field>

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
          onClick={clearJob}
        >
          Clear job
        </button>
      </form>

      <StatusBlock jobId={jobId} status={status} />
      <DownloadPanel jobId={jobId} canDownload={canDownload} />

      {/* Logs */}
      <LogsPanel logs={logs} />

      {tool === 'residueid' && status === 'finished' && resultData?.chains?.length > 0 && (
        <section style={{ marginTop: 12 }}>
          <strong>Residue summary</strong>
          <div style={{ marginTop: 6 }}>
            {resultData.chains.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div><b>Chain {c.id}</b> — length: {c.length}</div>
                <div>Cysteines: {c.cysteines.length ? c.cysteines.join(', ') : 'none'}</div>
                <div>Lysines: {c.lysines.length ? c.lysines.join(', ') : 'none'}</div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#666' }}>
              Totals — length: {resultData.totals.length}, C: {resultData.totals.cysteines}, K: {resultData.totals.lysines}
            </div>
          </div>
        </section>
      )}

      {tool === 'msa' && status === 'finished' && resultData && (
        <section style={{ marginTop: 12 }}>
          <strong>Conserved positions</strong>
          <div style={{ fontSize: 12, color: '#666' }}>
            Sequences: {resultData.n_sequences ?? '-'} · Aligned length: {resultData.aligned_length ?? '-'}
            {resultData.note && <div>Note: {resultData.note}</div>}
          </div>
          <div style={{ marginTop: 8 }}>
            {Array.isArray(resultData.conserved) && resultData.conserved.length ? (
              <>
                <div style={{ marginBottom: 6 }}>
                  Count: {resultData.conserved.length}
                </div>
                <table style={{ borderCollapse:'collapse', marginTop:8, fontSize:14 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #ddd' }}>Position</th>
                      <th style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #ddd' }}>Residue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultData.conserved.map(c => (
                      <tr key={c.position}>
                        <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{c.position}</td>
                        <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{c.residue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div>No fully conserved columns found.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
