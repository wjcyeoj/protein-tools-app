import React, { useState } from 'react';
import { submitJob } from '../api/jobs';

export default function JobSubmitForm({ onSubmitted }) {
  const [tool, setTool] = useState('proteinmpnn');
  const [file, setFile] = useState(null);

  // AlphaFold options (optional UI toggles later)
  const [modelPreset] = useState('monomer');
  const [dbPreset] = useState('full_dbs');
  const [maxTemplateDate] = useState('2024-12-31');

  // ProteinMPNN options (use more inputs later if needed)
  const [mpnnModelName] = useState('v_48_020');
  const [mpnnNumSeq] = useState(10);
  const [mpnnBatch] = useState(1);
  const [mpnnTemp] = useState(0.1);
  const [mpnnFreeze] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (!file) { setErr('Please choose a file'); return; }
    setErr(''); setBusy(true);
    try {
      const options = tool === 'alphafold'
        ? { model_preset: modelPreset, db_preset: dbPreset, max_template_date: maxTemplateDate }
        : {
            mpnn_model_name: mpnnModelName,
            mpnn_num_seq: mpnnNumSeq,
            mpnn_batch_size: mpnnBatch,
            mpnn_sampling_temp: mpnnTemp,
            mpnn_freeze_spec: mpnnFreeze || undefined,
          };
      const res = await submitJob({ tool, file, options });
      onSubmitted?.(res.job_id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Tool</label>
        <select value={tool} onChange={(e) => setTool(e.target.value)} className="border rounded p-2">
          <option value="proteinmpnn">ProteinMPNN</option>
          <option value="alphafold">AlphaFold</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Input file</label>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <p className="text-xs text-gray-500 mt-1">
          ProteinMPNN expects .pdb/.cif; AlphaFold expects .fasta
        </p>
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <button disabled={busy} className="bg-black text-white rounded px-4 py-2">
        {busy ? 'Submitting…' : 'Submit job'}
      </button>
    </form>
  );
}
