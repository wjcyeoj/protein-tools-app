// frontend/src/App.js
import { Link, useParams, Navigate } from "react-router-dom";
import { toolById } from "../tools";
import "../App.css";

import useGlobalSfx from '../sfx/useGlobalSfx';
import { configureSfx, playSfx } from '../sfx/sfx';

import doneMp3 from '../assets/sfx/done.mp3';

import React, { useEffect, useRef, useState } from 'react';
import '../App.css';
import Field from '../components/Shared/Field';
import FreezeSpecInput from '../components/Controls/FreezeSpecInput';
import AlphaFoldParams from '../components/Controls/AlphaFoldParams';
import ProteinMpnnParams from '../components/Controls/ProteinMpnnParams';
import InputSection from '../components/Controls/InputSection';

import StatusBlock from '../components/Results/StatusBlock';
import LogsPanel from '../components/Results/LogsPanel';
import DownloadPanel from '../components/Results/DownloadPanel';

import useJob from '../hooks/useJob';
import RFdiffusionParams from '../components/Controls/RFdiffusionParams';
import Aggrescan3DParams from '../components/Controls/Aggrescan3DParams';
import { buildJobRequest } from '../jobs/buildJobRequest';

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
  useGlobalSfx({ hover: true });
  const LS_SFX = 'ptools.sfxEnabled';
  const [sfxEnabled, setSfxEnabled] = useState(() => {
    const v = localStorage.getItem(LS_SFX);
    return v === null ? true : v === 'true';
  });

  useEffect(() => {
    localStorage.setItem(LS_SFX, String(sfxEnabled));
    configureSfx({ isEnabled: sfxEnabled, vol: 0.25 });
  }, [sfxEnabled]);

  const { toolId } = useParams();
  const meta = toolById(toolId);
  const validTool = Boolean(meta);
  const tool = meta?.id || "alphafold";

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
  useEffect(() => localStorage.setItem(LS_AF, JSON.stringify(afParams)), [afParams]);
  useEffect(() => localStorage.setItem(LS_MPNN, JSON.stringify(mpnnParams)), [mpnnParams]);

  // reset file/text when tool changes (keeps old behavior)
  useEffect(() => {
    setFile(null);
    setSeqText('');
    setInputMode('file');
  }, [tool]);

  const freezeRef = useRef(null);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prev !== 'finished' && status === 'finished') {
      playSfx(doneMp3);
    }
  }, [status]);

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
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <h1 className="title">{meta.name}</h1>
            <p className="subtitle">{meta.desc}</p>
          </div>
        </div>
        <Link
          to="/"
          className="btnSecondary"
          style={{ padding: "10px 12px", borderRadius: 12, textDecoration: "none" }}
        >
          ← Main menu
        </Link>
      </div>

      <button
        type="button"
        className="btnSecondary"
        onClick={() => setSfxEnabled(v => !v)}
        aria-pressed={sfxEnabled}
        title="Toggle sound effects"
      >
        Sound: {sfxEnabled ? 'On' : 'Off'}
      </button>

      <div className="card">
        <div className="cardInner">
          <div className="grid2">
            <div className="section">
              <label>Job name (optional)</label>
              <input
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="e.g., spike_protein_multimer_v2"
                spellCheck={false}
              />
              <div className="help">Used to label outputs and server-side folders (if supported).</div>
            </div>
          </div>

          <div className="section">
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
          </div>

          {tool === 'aggrescan3d' && (
            <div className="section">
              <Aggrescan3DParams params={a3dParams} setParams={setA3dParams} />
            </div>
          )}

          {tool === 'alphafold' && (
            <div className="section">
              <AlphaFoldParams params={afParams} setParams={setAfParams} />
            </div>
          )}

          {tool === 'proteinmpnn' && (
            <div className="section">
              <ProteinMpnnParams params={mpnnParams} setParams={setMpnnParams} />
              <FreezeSpecInput inputRef={freezeRef} />
            </div>
          )}

          {tool === 'rfdiffusion' && (
            <div className="section">
              <RFdiffusionParams params={rfParams} setParams={setRfParams} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="section">
            <div className="btnRow">
              <button type="submit" className="btnPrimary">Submit</button>
              <button
                type="button"
                className="btnSecondary"
                disabled={!jobId}
                onClick={clearJob}
              >
                Clear job
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="section">
        <StatusBlock jobId={jobId} status={status} />
      </div>

      {/* Your existing notes + panels can remain as-is */}
      {/* (They will inherit better typography + pre styling.) */}

      {resultTool === 'aggrescan3d' && resultData?.foldx_requested && !resultData?.foldx_used && resultData?.fallback_used && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid #fde68a',
          background: '#fffbeb',
          color: '#92400e'
        }}>
          <b>Note:</b> FoldX refinement failed on the server, so this run completed <b>without FoldX</b>.
          The aggregation scores may differ slightly from a FoldX-refined run.
        </div>
      )}

      <div className="section">
        <DownloadPanel jobId={jobId} canDownload={canDownload} />
      </div>

      <div className="section">
        <LogsPanel logs={logs} />
      </div>

      {/* rest of your conditional summaries unchanged */}
    </div>
  );
}
