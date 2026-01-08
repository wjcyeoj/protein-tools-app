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
import RFdiffusionParams from './components/Controls/RFdiffusionParams';
import Aggrescan3DParams from './components/Controls/Aggrescan3DParams';
import { buildJobRequest } from './jobs/buildJobRequest';

const LS_TOOL = 'ptools.tool';
const LS_AF = 'ptools.afParams';
const LS_MPNN = 'ptools.mpnnParams';
const LS_JOBNAME = 'ptools.jobName';

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tool, setTool] = useState(() => localStorage.getItem(LS_TOOL) || 'alphafold');
  const [file, setFile] = useState(null);

  const [jobName, setJobName] = useState(() => localStorage.getItem(LS_JOBNAME) || '');
  useEffect(() => localStorage.setItem(LS_JOBNAME, jobName), [jobName]);

  const { jobId, status, logs, canDownload, submit, clearJob } = useJob();

  const [resultData, setResultData] = useState(null);
  const [resultTool, setResultTool] = useState(null);

  useEffect(() => {
    if (jobId && status === 'finished') {
      fetch(`/jobs/${jobId}`)
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(info => {
          setResultData(info.result_data || null);
          setResultTool(info.tool || null);
        })
        .catch(() => {
          setResultData(null);
          setResultTool(null);
        });
    } else {
      setResultData(null);
      setResultTool(null);
    }
  }, [jobId, status]);

  const [afParams, setAfParams] = useState(() =>
    loadJson(LS_AF, {
      model_preset: 'monomer',
      db_preset: 'full_dbs',
      max_template_date: '2024-12-31',
      models_to_relax: 'none',
      use_gpu_relax: false,
    })
  );

  const [mpnnParams, setMpnnParams] = useState(() =>
    loadJson(LS_MPNN, {
      model_name: 'v_48_020',
      num_seq_per_target: 10,
      batch_size: 1,
      sampling_temp: 0.2,
    })
  );

  // text input mode for allowed tools
  const [inputMode, setInputMode] = useState('file'); // 'file' | 'text'
  const [seqName, setSeqName] = useState('query');
  const [seqText, setSeqText] = useState('');

  const [a3dParams, setA3dParams] = useState({
    distance: 10,
    dynamic: false,
    foldx: false,
    hide: true,
    poll_s: 10,
    timeout_s: 1800,
  });

  const [rfParams, setRfParams] = useState({
    mode: 'free',
    len: 100,
    num: 1,
    contigs: '',

    num_steps: '',
    temperature: '',
    guidance_scale: '',
    recycle: '',
    seed: '',
    deterministic: false,

    symmetry_type: '',
    symmetry_order: '',
    min_plddt: '',

    checkpoint: '',
    extra_overrides: '',
  });

  // persist selections
  useEffect(() => localStorage.setItem(LS_TOOL, tool), [tool]);
  useEffect(() => localStorage.setItem(LS_AF, JSON.stringify(afParams)), [afParams]);
  useEffect(() => localStorage.setItem(LS_MPNN, JSON.stringify(mpnnParams)), [mpnnParams]);

  // reset file/text when tool changes (keeps old behavior)
  useEffect(() => {
    setFile(null);
    setSeqText('');
    setInputMode('file');
  }, [tool]);

  const freezeRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();

    const freezeSpec = freezeRef.current?.value?.trim() || '';
    const built = buildJobRequest({
      tool,
      jobName,
      file,
      inputMode,
      seqText,
      seqName,
      afParams,
      mpnnParams,
      freezeSpec,
      a3dParams,
      rfParams,
    });

    if (!built.ok) {
      alert(built.error);
      return;
    }

    try {
      await submit(built.body);
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
            <option value="rfdiffusion">RFdiffusion</option>
            <option value="aggrescan3d">Aggrescan3D</option>
            <option value="proteinsol">ProteinSol</option>
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

      <InputSection
        tool={tool}
        rfMode={rfParams.mode}
        file={file}
        setFile={setFile}
        inputMode={inputMode}
        setInputMode={setInputMode}
        seqName={seqName}
        setSeqName={setSeqName}
        seqText={seqText}
        setSeqText={setSeqText}
      />

      {tool === 'aggrescan3d' && (
        <Aggrescan3DParams params={a3dParams} setParams={setA3dParams} />
      )}

      {tool === 'alphafold' && (
        <AlphaFoldParams params={afParams} setParams={setAfParams} />
      )}

      {tool === 'proteinmpnn' && (
        <>
          <ProteinMpnnParams params={mpnnParams} setParams={setMpnnParams} />
          <FreezeSpecInput inputRef={freezeRef} />
        </>
      )}

      {tool === 'rfdiffusion' && (
        <RFdiffusionParams params={rfParams} setParams={setRfParams} />
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

      {/* FoldX fallback note (kept as-is) */}
      {resultTool === 'aggrescan3d' && resultData?.foldx_requested && !resultData?.foldx_used && resultData?.fallback_used && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #ffe08a',
          background: '#fff8db',
          color: '#6a4b00'
        }}>
          <b>Note:</b> FoldX refinement failed on the server, so this run completed <b>without FoldX</b>.
          The aggregation scores may differ slightly from a FoldX-refined run.
        </div>
      )}

      <DownloadPanel jobId={jobId} canDownload={canDownload} />
      <LogsPanel logs={logs} />

      {/* ProteinSol summary (kept; can be moved later) */}
      {resultTool === 'proteinsol' && resultData && (
        <section style={{ marginTop: 12 }}>
          <strong>ProteinSol results</strong>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            Sequences: {resultData.summary?.n_sequences ?? '-'} ·
            Avg scaled-sol: {resultData.summary?.avg_scaled_sol ?? '-'} ·
            Avg percent-sol: {resultData.summary?.avg_percent_sol ?? '-'}
          </div>

          {Array.isArray(resultData.rows) && resultData.rows.length > 0 && (
            <pre style={{ background:'#f6f6f6', padding:12, borderRadius:8, whiteSpace:'pre-wrap', marginTop: 8 }}>
              {resultData.rows.slice(0, 10).map(r =>
                `${r.ID || r.id || '(id?)'}  scaled-sol=${r["scaled-sol"]}  percent-sol=${r["percent-sol"]}  pI=${r["pI"]}`
              ).join('\n')}
              {resultData.rows.length > 10 ? `\n... (${resultData.rows.length - 10} more)` : ''}
            </pre>
          )}

          {resultData.error && <div style={{ color: '#a00', marginTop: 8 }}>{resultData.error}</div>}
        </section>
      )}

      {/* Residue Identifier summary (kept; can be moved later) */}
      {resultTool === 'residueid' && resultData?.chains?.length > 0 && (
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

      {/* MSA summary (kept; can be moved later) */}
      {resultTool === 'msa' && resultData && (
        <section style={{ marginTop: 12 }}>
          <strong>Conserved positions</strong>
          <div style={{ fontSize: 12, color: '#666' }}>
            Sequences: {resultData.n_sequences ?? '-'} · Aligned length: {resultData.aligned_length ?? '-'}
            {resultData.note && <div>Note: {resultData.note}</div>}
          </div>
          <div style={{ marginTop: 8 }}>
            {Array.isArray(resultData.conserved) && resultData.conserved.length ? (
              <>
                <div style={{ marginBottom: 6 }}>Count: {resultData.conserved.length}</div>
                <pre style={{ background:'#f6f6f6', padding:12, borderRadius:8, whiteSpace:'pre-wrap' }}>
                  {resultData.conserved.map(c => `${c.position}:${c.residue}`).join(', ')}
                </pre>
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
