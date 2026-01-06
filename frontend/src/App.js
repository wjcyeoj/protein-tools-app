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

// --- RFdiffusion UI helpers ---
const RF_RANGES = {
  len:              { min: 10,  max: 1000, step: 1,  suggest: [60,100,150,200,300] },
  num:              { min: 1,   max: 20,   step: 1,  suggest: [1,3,5,10] },
  num_steps:        { min: 10,  max: 200,  step: 1,  suggest: [30,50,60,80,100] },
  temperature:      { min: 0.1, max: 2.0,  step: 0.01, suggest: [0.8,1.0,1.1,1.2] },
  guidance_scale:   { min: 0.5, max: 5.0,  step: 0.1,  suggest: [1.0,2.0,2.5,3.0] },
  recycle:          { min: 0,   max: 5,    step: 1,  suggest: [0,1,2,3] },
  seed:             { min: 0,   max: 2147483647, step: 1, suggest: [] }, // 32-bit-ish
  symmetry_order:   { min: 2,   max: 12,   step: 1,  suggest: [2,3,4,5,6] },
  min_plddt:        { min: 0,   max: 100,  step: 0.1, suggest: [60,70,80] },
};

const clamp = (v, {min, max}) => {
  if (v === '' || v === null || Number.isNaN(Number(v))) return '';
  const x = Number(v);
  return Math.min(max, Math.max(min, x));
};

const Info = ({ children }) => (
  <span title={children} style={{ cursor: 'help', marginLeft: 6, color: '#888' }}>ⓘ</span>
);

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
  useEffect(() => { setFile(null); }, [tool]);
  const xhrRef = useRef(null);
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

  const [a3dParams, setA3dParams] = useState({
    distance: 10,
    dynamic: false,
    foldx: false,
    hide: true,
    poll_s: 10,
    timeout_s: 1800,
  });

  const [rfParams, setRfParams] = useState({
    mode: 'free',   // 'free' | 'motif'
    len: 100,
    num: 1,
    contigs: '',

    // sampling / reproducibility
    num_steps: '',
    temperature: '',
    guidance_scale: '',
    recycle: '',
    seed: '',
    deterministic: false,

    // symmetry
    symmetry_type: '',
    symmetry_order: '',

    // quality
    min_plddt: '',

    // checkpoint
    checkpoint: '',

    // expert hydra (multiline, one per line)
    extra_overrides: '',
  });

  // persist selections
  useEffect(() => localStorage.setItem(LS_TOOL, tool), [tool]);
  useEffect(() => localStorage.setItem(LS_AF, JSON.stringify(afParams)), [afParams]);
  useEffect(() => localStorage.setItem(LS_MPNN, JSON.stringify(mpnnParams)), [mpnnParams]);

  // Submit job (send individual fields the backend expects)
  async function handleSubmit(e) {
    e.preventDefault();

    // Decide what file to send
    let fileToSend = file;

    if ((tool === 'alphafold' || tool === 'residueid' || tool === 'msa') && inputMode === 'text') {
      const f = makeVirtualFastaFile(seqText, seqName);
      if (!f) {
        alert('Please paste a valid FASTA or sequence.');
        return;
      }
      fileToSend = f;
    }

    if (tool === 'aggrescan3d') {
      if (!fileToSend) {
        alert('Please choose a PDB file for Aggrescan3D.');
        return;
      }
      const name = fileToSend.name || '';
      if (!name.toLowerCase().endsWith('.pdb')) {
        alert('Aggrescan3D expects a .pdb file.');
        return;
      }
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
    if (tool === 'msa' && !fileToSend) {
      alert('Please choose a FASTA or PDB file (or paste a FASTA sequence).');
      return;
    }

    if (tool === 'rfdiffusion') {
      if (rfParams.mode === 'motif' && !fileToSend) {
        alert('Please upload a PDB file for motif mode.');
        return;
      }
    }

    // Build form data (unchanged for MPNN; AF fields still sent the same)
    const freezeSpec = freezeRef.current?.value?.trim() || '';
    const body = new FormData();
    body.append('tool', tool);
    if (jobName && jobName.trim()) {
      body.append('job_id', jobName.trim()); // backend validates / dedupes
    }

    if (fileToSend instanceof File || fileToSend instanceof Blob) {
      body.append('file', fileToSend);
    }

    if (tool === 'rfdiffusion') {
      body.append('rf_mode', rfParams.mode);
      body.append('rf_num_designs', String(rfParams.num || 1));
      if (rfParams.mode === 'free') {
        body.append('rf_len', String(rfParams.len || 100));
      } else {
        body.append('rf_contigs', rfParams.contigs || '');
      }

      // sampling / reproducibility (only send if user provided)
      if (rfParams.num_steps) body.append('rf_num_steps', String(rfParams.num_steps));
      if (rfParams.temperature) body.append('rf_temperature', String(rfParams.temperature));
      if (rfParams.guidance_scale) body.append('rf_guidance_scale', String(rfParams.guidance_scale));
      if (rfParams.recycle !== '' && rfParams.recycle != null) body.append('rf_recycle', String(rfParams.recycle));
      if (rfParams.seed) body.append('rf_seed', String(rfParams.seed));
      body.append('rf_deterministic', String(!!rfParams.deterministic));

      // symmetry
      if (rfParams.symmetry_type) body.append('rf_symmetry_type', rfParams.symmetry_type);
      if (rfParams.symmetry_order) body.append('rf_symmetry_order', String(rfParams.symmetry_order));

      // quality
      if (rfParams.min_plddt) body.append('rf_min_plddt', String(rfParams.min_plddt));

      // checkpoint
      if (rfParams.checkpoint) body.append('rf_checkpoint', rfParams.checkpoint);

      // expert overrides
      if (rfParams.extra_overrides && rfParams.extra_overrides.trim()) {
        body.append('rf_extra_overrides', rfParams.extra_overrides);
      }
    }

    if (tool === 'aggrescan3d') {
      body.append('a3d_distance', String(a3dParams.distance));
      body.append('a3d_dynamic', String(!!a3dParams.dynamic));
      body.append('a3d_foldx', String(!!a3dParams.foldx));
      body.append('a3d_hide', String(!!a3dParams.hide));
      body.append('a3d_poll_s', String(a3dParams.poll_s));
      body.append('a3d_timeout_s', String(a3dParams.timeout_s));
    }

    if (tool === 'alphafold') {
      body.append('model_preset', afParams.model_preset);
      body.append('db_preset', afParams.db_preset);
      body.append('max_template_date', afParams.max_template_date);
      body.append('models_to_relax', afParams.models_to_relax);
      body.append('use_gpu_relax', String(!!afParams.use_gpu_relax));
    }

    if (tool === 'proteinmpnn') {
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
            <option value="rfdiffusion">RFdiffusion</option>
            <option value="aggrescan3d">Aggrescan3D</option>
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
        <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>
          <h3 style={{ marginTop: 0 }}>Aggrescan3D parameters</h3>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
            <div>
              <label>
                <strong>Distance:&nbsp;</strong>
                <select
                  value={a3dParams.distance}
                  onChange={(e) => setA3dParams(p => ({ ...p, distance: Number(e.target.value) }))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
              <Info>5Å = surface aggregation; 10Å = total aggregation.</Info>
            </div>

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={!!a3dParams.dynamic}
                  onChange={(e) => setA3dParams(p => ({ ...p, dynamic: e.target.checked }))}
                /> Dynamic
              </label>
              <Info>Runs a dynamic mode (if supported by your backend runner).</Info>
            </div>

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={!!a3dParams.foldx}
                  onChange={(e) => setA3dParams(p => ({ ...p, foldx: e.target.checked }))}
                /> FoldX
              </label>
              <Info>Enable FoldX refinement (if supported).</Info>
            </div>

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={!!a3dParams.hide}
                  onChange={(e) => setA3dParams(p => ({ ...p, hide: e.target.checked }))}
                /> Hide
              </label>
              <Info>Hide structure in public outputs (if supported by server).</Info>
            </div>

            <div>
              <label>
                <strong>Poll (sec):&nbsp;</strong>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={a3dParams.poll_s}
                  onChange={(e) => setA3dParams(p => ({ ...p, poll_s: clamp(e.target.value, {min:1, max:120}) }))}
                  style={{ width: 140 }}
                />
              </label>
            </div>

            <div>
              <label>
                <strong>Timeout (sec):&nbsp;</strong>
                <input
                  type="number"
                  min={60}
                  max={7200}
                  value={a3dParams.timeout_s}
                  onChange={(e) => setA3dParams(p => ({ ...p, timeout_s: clamp(e.target.value, {min:60, max:7200}) }))}
                  style={{ width: 160 }}
                />
              </label>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            Upload a <b>.pdb</b> file for Aggrescan3D.
          </div>
        </section>
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
        <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>
          <h3 style={{ marginTop: 0 }}>RFdiffusion parameters</h3>

          <div style={{ marginBottom: 8 }}>
            <label>
              <strong>Mode:&nbsp;</strong>
              <select
                value={rfParams.mode}
                onChange={(e) => setRfParams(p => ({ ...p, mode: e.target.value }))}
              >
                <option value="free">Free (length only)</option>
                <option value="motif">Motif (upload PDB + contigs)</option>
              </select>
              <Info>
                Free: generate a backbone of the requested length. Motif: keep given PDB segment(s) fixed (via contigs) and design around them.
              </Info>
            </label>
          </div>

          {rfParams.mode === 'free' && (
            <div style={{ marginBottom: 8 }}>
              <label>
                <strong>Length:&nbsp;</strong>
                <input
                  type="number"
                  min={RF_RANGES.len.min}
                  max={RF_RANGES.len.max}
                  step={RF_RANGES.len.step}
                  list="rf_len_suggest"
                  value={rfParams.len}
                  onChange={(e) => setRfParams(p => ({ ...p, len: clamp(e.target.value, RF_RANGES.len) }))}
                  style={{ width: 160 }}
                />
              </label>
              <datalist id="rf_len_suggest">
                {RF_RANGES.len.suggest.map(v => <option key={v} value={v} />)}
              </datalist>
              <Info>Target chain length (aa). 60–300 is a good starting range.</Info>
            </div>
          )}

          {rfParams.mode === 'motif' && (
            <div style={{ marginBottom: 8 }}>
              <label>
                <strong>Contigs:&nbsp;</strong>
                <input
                  type="text"
                  placeholder="e.g. 5-15/A10-25/30-40"
                  value={rfParams.contigs}
                  onChange={(e) => setRfParams(p => ({ ...p, contigs: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </label>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Use numbers for designed segments and chain+residue ranges from your PDB for fixed segments. “/0” inserts a chain break.
              </div>
            </div>
          )}

            <div>
              <label>
                <strong># designs:&nbsp;</strong>
                <input
                  type="number"
                  min={RF_RANGES.num.min}
                  max={RF_RANGES.num.max}
                  step={RF_RANGES.num.step}
                  list="rf_num_suggest"
                  value={rfParams.num}
                  onChange={(e) => setRfParams(p => ({ ...p, num: clamp(e.target.value, RF_RANGES.num) }))}
                  style={{ width: 140 }}
                />
              </label>
              <datalist id="rf_num_suggest">
                {RF_RANGES.num.suggest.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>

            <hr style={{ margin: '12px 0', border: 0, borderTop: '1px solid #eee' }} />

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
              {/* Sampling */}
              <div>
                <label><strong>Diffusion steps:&nbsp;</strong>
                  <input
                    type="number"
                    min={RF_RANGES.num_steps.min}
                    max={RF_RANGES.num_steps.max}
                    step={RF_RANGES.num_steps.step}
                    list="rf_steps_suggest"
                    value={rfParams.num_steps}
                    onChange={(e)=>setRfParams(p=>({...p, num_steps: clamp(e.target.value, RF_RANGES.num_steps)}))}
                    style={{ width: 160 }}
                    placeholder="e.g., 50"
                  />
                </label>
                <datalist id="rf_steps_suggest">
                  {RF_RANGES.num_steps.suggest.map(v => <option key={v} value={v} />)}
                </datalist>
                <Info>More steps → more thorough, slower. Try 50–80 for tough tasks.</Info>
              </div>

              <div>
                <label><strong>Temperature:&nbsp;</strong>
                  <input
                    type="number"
                    min={RF_RANGES.temperature.min}
                    max={RF_RANGES.temperature.max}
                    step={RF_RANGES.temperature.step}
                    list="rf_temp_suggest"
                    value={rfParams.temperature}
                    onChange={(e)=>setRfParams(p=>({...p, temperature: clamp(e.target.value, RF_RANGES.temperature)}))}
                    style={{ width: 160 }} placeholder="1.0"
                  />
                </label>
                <datalist id="rf_temp_suggest">
                  {RF_RANGES.temperature.suggest.map(v => <option key={v} value={v} />)}
                </datalist>
                <Info>Higher = more diversity; lower = more conservative. Start at 1.0.</Info>
              </div>

              <div>
                <label><strong>Guidance scale:&nbsp;</strong>
                  <input
                    type="number"
                    min={RF_RANGES.guidance_scale.min}
                    max={RF_RANGES.guidance_scale.max}
                    step={RF_RANGES.guidance_scale.step}
                    list="rf_guidance_suggest"
                    value={rfParams.guidance_scale}
                    onChange={(e)=>setRfParams(p=>({...p, guidance_scale: clamp(e.target.value, RF_RANGES.guidance_scale)}))}
                    style={{ width: 160 }} placeholder="2.0"
                  />
                </label>
                <datalist id="rf_guidance_suggest">
                  {RF_RANGES.guidance_scale.suggest.map(v => <option key={v} value={v} />)}
                </datalist>
                <Info>Strength of constraints (motif/potentials). Try 1.5–3.0.</Info>
              </div>

              <div>
                <label><strong>Recycles:&nbsp;</strong>
                  <select
                    value={rfParams.recycle === '' ? '' : String(rfParams.recycle)}
                    onChange={(e)=>setRfParams(p=>({...p, recycle: e.target.value === '' ? '' : clamp(e.target.value, RF_RANGES.recycle)}))}
                    style={{ width: 120 }}
                  >
                    <option value="">(auto)</option>
                    {RF_RANGES.recycle.suggest.map(v => <option key={v} value={v}>{v}</option>)}
                    {/* you can extend to 4,5 if needed */}
                  </select>
                </label>
                <Info>Extra refinement passes. 0–1 is a good start.</Info>
              </div>

              <div>
                <label><strong>Seed:&nbsp;</strong>
                  <input
                    type="number"
                    min={RF_RANGES.seed.min}
                    max={RF_RANGES.seed.max}
                    step={RF_RANGES.seed.step}
                    value={rfParams.seed}
                    onChange={(e)=>setRfParams(p=>({...p, seed: clamp(e.target.value, RF_RANGES.seed)}))}
                    style={{ width: 180 }} placeholder="random"
                 />
               </label>
               <div style={{ marginTop: 6 }}>
                 <label>
                   <input
                     type="checkbox"
                     checked={!!rfParams.deterministic}
                     onChange={(e)=>setRfParams(p=>({...p, deterministic: e.target.checked}))}
                   /> Deterministic
                 </label>
                 <Info>Set a seed + deterministic for reproducibility.</Info>
               </div>
             </div>

             {/* Symmetry */}
             <div>
               <label><strong>Symmetry type:&nbsp;</strong>
                 <select
                   value={rfParams.symmetry_type}
                   onChange={(e)=>setRfParams(p=>({...p, symmetry_type: e.target.value }))}
                 >
                   <option value="">(none)</option>
                   <option value="cyclic">cyclic</option>
                   <option value="dihedral">dihedral</option>
                   <option value="tetrahedral">tetrahedral</option>
                   <option value="octahedral">octahedral</option>
                   <option value="icosahedral">icosahedral</option>
                 </select>
                </label>
                <Info>Choose group symmetry if designing oligomers.</Info>
              </div>

              <div>
                <label><strong>Symmetry order:&nbsp;</strong>
                  <input
                    type="number"
                    min={RF_RANGES.symmetry_order.min}
                    max={RF_RANGES.symmetry_order.max}
                    step={RF_RANGES.symmetry_order.step}
                    list="rf_symorder_suggest"
                    value={rfParams.symmetry_order}
                    onChange={(e)=>setRfParams(p=>({...p, symmetry_order: clamp(e.target.value, RF_RANGES.symmetry_order)}))}
                    style={{ width: 140 }} placeholder="e.g., 2"
                 />
               </label>
               <datalist id="rf_symorder_suggest">
                 {RF_RANGES.symmetry_order.suggest.map(v => <option key={v} value={v} />)}
               </datalist>
               <Info>For cyclic: 2=C2 dimer, 3=C3 trimer, etc. Keep 2–6 to start.</Info>
             </div>

             {/* Quality filter */}
             <div>
               <label><strong>Min pLDDT:&nbsp;</strong>
                 <input
                   type="number"
                   min={RF_RANGES.min_plddt.min}
                   max={RF_RANGES.min_plddt.max}
                   step={RF_RANGES.min_plddt.step}
                   list="rf_plddt_suggest"
                   value={rfParams.min_plddt}
                   onChange={(e)=>setRfParams(p=>({...p, min_plddt: clamp(e.target.value, RF_RANGES.min_plddt)}))}
                   style={{ width: 140 }} placeholder="70"
                />
              </label>
              <datalist id="rf_plddt_suggest">
                {RF_RANGES.min_plddt.suggest.map(v => <option key={v} value={v} />)}
              </datalist>
              <Info>Filter out designs predicted below this confidence.</Info>
            </div>

            {/* Checkpoint */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label><strong>Checkpoint path (optional):&nbsp;</strong>
                <input
                  type="text"
                  value={rfParams.checkpoint}
                  onChange={(e)=>setRfParams(p=>({...p, checkpoint: e.target.value}))}
                  style={{ width: '100%' }} placeholder="/models/some_checkpoint.pt"
                />
              </label>
              <Info>Override default weights only if you have a specific checkpoint.</Info>
            </div>

            {/* Expert overrides */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label><strong>Expert Hydra overrides (one per line)</strong></label>
              <textarea
                value={rfParams.extra_overrides}
                onChange={(e)=>setRfParams(p=>({...p, extra_overrides: e.target.value}))}
                rows={4}
                placeholder={`e.g.\npotentials.clash.weight=1.0\nppi.hotspot_res='A45,A67'`}
                style={{ width: '100%', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                These are appended as raw Hydra overrides. Use with care.
              </div>
            </div>
          </div>
        </section>
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

      {/* Logs */}
      <LogsPanel logs={logs} />

      {/* Residue Identifier summary */}
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

      {/* MSA summary */}
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
