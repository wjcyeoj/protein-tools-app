// frontend/src/components/Controls/RFdiffusionParams.js
import Info from '../Shared/Info';
import { RF_RANGES, clamp } from '../../constants/rf';

export default function RFdiffusionParams({ params, setParams }) {
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>
      <h3 style={{ marginTop: 0 }}>RFdiffusion parameters</h3>

      <div style={{ fontSize: 12, color: '#666', marginTop: -6, marginBottom: 10 }}>
        In general: more <b>steps</b> = slower but can improve quality; higher <b>temperature</b> = more diversity;
        higher <b>guidance</b> = stronger conditioning (but can reduce diversity).
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>
          <strong>Mode:&nbsp;</strong>
          <select
            value={params.mode}
            onChange={(e) => setParams(p => ({ ...p, mode: e.target.value }))}
          >
            <option value="free">Free (length only)</option>
            <option value="motif">Motif (upload PDB + contigs)</option>
          </select>
          <Info>
            <b>Free</b>: generate a new backbone with the requested length (no structural constraints).{' '}
            <b>Motif</b>: keep segment(s) from your uploaded PDB fixed and design around them using contigs.
          </Info>
        </label>
      </div>

      {params.mode === 'free' && (
        <div style={{ marginBottom: 8 }}>
          <label>
            <strong>Length:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.len.min}
              max={RF_RANGES.len.max}
              step={RF_RANGES.len.step}
              list="rf_len_suggest"
              value={params.len}
              onChange={(e) => setParams(p => ({ ...p, len: clamp(e.target.value, RF_RANGES.len) }))}
              style={{ width: 160 }}
            />
          </label>
          <datalist id="rf_len_suggest">
            {RF_RANGES.len.suggest.map(v => <option key={v} value={v} />)}
          </datalist>
          <Info>
            Target chain length (amino acids). 80–200 is a good starting point; longer designs usually take more time
            and may be harder to fold.
          </Info>
        </div>
      )}

      {params.mode === 'motif' && (
        <div style={{ marginBottom: 8 }}>
          <label>
            <strong>Contigs:&nbsp;</strong>
            <input
              type="text"
              placeholder="e.g. 5-15/A10-25/30-40"
              value={params.contigs}
              onChange={(e) => setParams(p => ({ ...p, contigs: e.target.value }))}
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Use numbers for designed segments and chain+residue ranges from your PDB for fixed segments. “/0” inserts a chain break.
          </div>
          <Info>
            Contigs describe a pattern of <b>designed</b> (number ranges) and <b>fixed motif</b> segments (like A10-25).
            Motif mode is powerful, but invalid contigs are the #1 source of failed runs.
          </Info>
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
            value={params.num}
            onChange={(e) => setParams(p => ({ ...p, num: clamp(e.target.value, RF_RANGES.num) }))}
            style={{ width: 140 }}
          />
        </label>
        <datalist id="rf_num_suggest">
          {RF_RANGES.num.suggest.map(v => <option key={v} value={v} />)}
        </datalist>
        <Info>
          Number of backbones to generate. Runtime scales roughly with this value. Start with 1–5 for testing, then increase.
        </Info>
      </div>

      <hr style={{ margin: '12px 0', border: 0, borderTop: '1px solid #eee' }} />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
        <div>
          <label><strong>Diffusion steps:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.num_steps.min}
              max={RF_RANGES.num_steps.max}
              step={RF_RANGES.num_steps.step}
              list="rf_steps_suggest"
              value={params.num_steps}
              onChange={(e)=>setParams(p=>({...p, num_steps: clamp(e.target.value, RF_RANGES.num_steps)}))}
              style={{ width: 160 }}
              placeholder="e.g., 50"
            />
          </label>
          <datalist id="rf_steps_suggest">
            {RF_RANGES.num_steps.suggest.map(v => <option key={v} value={v} />)}
          </datalist>
          <Info>
            More steps usually increases compute time and can improve refinement. Try 50–80 first; increase if results look noisy.
          </Info>
        </div>

        <div>
          <label><strong>Temperature:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.temperature.min}
              max={RF_RANGES.temperature.max}
              step={RF_RANGES.temperature.step}
              list="rf_temp_suggest"
              value={params.temperature}
              onChange={(e)=>setParams(p=>({...p, temperature: clamp(e.target.value, RF_RANGES.temperature)}))}
              style={{ width: 160 }}
              placeholder="1.0"
            />
          </label>
          <datalist id="rf_temp_suggest">
            {RF_RANGES.temperature.suggest.map(v => <option key={v} value={v} />)}
          </datalist>
          <Info>
            Controls randomness/diversity. Higher = more diverse shapes; lower = more conservative. Start around 1.0.
          </Info>
        </div>

        <div>
          <label><strong>Guidance scale:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.guidance_scale.min}
              max={RF_RANGES.guidance_scale.max}
              step={RF_RANGES.guidance_scale.step}
              list="rf_guidance_suggest"
              value={params.guidance_scale}
              onChange={(e)=>setParams(p=>({...p, guidance_scale: clamp(e.target.value, RF_RANGES.guidance_scale)}))}
              style={{ width: 160 }}
              placeholder="2.0"
            />
          </label>
          <datalist id="rf_guidance_suggest">
            {RF_RANGES.guidance_scale.suggest.map(v => <option key={v} value={v} />)}
          </datalist>
          <Info>
            Strength of conditioning/constraints. Higher enforces constraints more strongly but can reduce diversity or cause failures if too high.
            Try 1.5–3.0.
          </Info>
        </div>

        <div>
          <label><strong>Recycles:&nbsp;</strong>
            <select
              value={params.recycle === '' ? '' : String(params.recycle)}
              onChange={(e)=>setParams(p=>({...p, recycle: e.target.value === '' ? '' : clamp(e.target.value, RF_RANGES.recycle)}))}
              style={{ width: 120 }}
            >
              <option value="">(auto)</option>
              {RF_RANGES.recycle.suggest.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <Info>
            Number of refinement recycles. More can improve quality but increases runtime. 0–1 is a good starting point.
          </Info>
        </div>

        <div>
          <label><strong>Seed:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.seed.min}
              max={RF_RANGES.seed.max}
              step={RF_RANGES.seed.step}
              value={params.seed}
              onChange={(e)=>setParams(p=>({...p, seed: clamp(e.target.value, RF_RANGES.seed)}))}
              style={{ width: 180 }}
              placeholder="random"
            />
          </label>
          <div style={{ marginTop: 6 }}>
            <label>
              <input
                type="checkbox"
                checked={!!params.deterministic}
                onChange={(e)=>setParams(p=>({...p, deterministic: e.target.checked}))}
              /> Deterministic
            </label>
            <Info>
              Use a fixed seed to reproduce results. “Deterministic” reduces randomness further (best-effort; exact reproducibility can still depend on hardware).
            </Info>
          </div>
        </div>

        <div>
          <label><strong>Symmetry type:&nbsp;</strong>
            <select
              value={params.symmetry_type}
              onChange={(e)=>setParams(p=>({...p, symmetry_type: e.target.value }))}
            >
              <option value="">(none)</option>
              <option value="cyclic">cyclic</option>
              <option value="dihedral">dihedral</option>
              <option value="tetrahedral">tetrahedral</option>
              <option value="octahedral">octahedral</option>
              <option value="icosahedral">icosahedral</option>
            </select>
          </label>
          <Info>
            Enforces global symmetry, useful for oligomeric assemblies. If you set a type, also set a reasonable symmetry order (e.g., cyclic C3).
          </Info>
        </div>

        <div>
          <label><strong>Symmetry order:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.symmetry_order.min}
              max={RF_RANGES.symmetry_order.max}
              step={RF_RANGES.symmetry_order.step}
              list="rf_symorder_suggest"
              value={params.symmetry_order}
              onChange={(e)=>setParams(p=>({...p, symmetry_order: clamp(e.target.value, RF_RANGES.symmetry_order)}))}
              style={{ width: 140 }}
              placeholder="e.g., 2"
            />
          </label>
          <datalist id="rf_symorder_suggest">
            {RF_RANGES.symmetry_order.suggest.map(v => <option key={v} value={v} />)}
          </datalist>
          <Info>
            Cyclic: 2=C2, 3=C3, etc. Dihedral: 2=D2, 3=D3, etc. Leave blank if symmetry type is none.
          </Info>
        </div>

        <div>
          <label><strong>Min pLDDT:&nbsp;</strong>
            <input
              type="number"
              min={RF_RANGES.min_plddt.min}
              max={RF_RANGES.min_plddt.max}
              step={RF_RANGES.min_plddt.step}
              list="rf_plddt_suggest"
              value={params.min_plddt}
              onChange={(e)=>setParams(p=>({...p, min_plddt: clamp(e.target.value, RF_RANGES.min_plddt)}))}
              style={{ width: 140 }}
              placeholder="70"
            />
          </label>
          <datalist id="rf_plddt_suggest">
            {RF_RANGES.min_plddt.suggest.map(v => <option key={v} value={v} />)}
          </datalist>
          <Info>
            Filters out low-confidence designs (if your backend uses this as a post-filter). Higher values are stricter and may yield fewer results.
          </Info>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label><strong>Checkpoint path (optional):&nbsp;</strong>
            <input
              type="text"
              value={params.checkpoint}
              onChange={(e)=>setParams(p=>({...p, checkpoint: e.target.value}))}
              style={{ width: '100%' }}
              placeholder="/models/some_checkpoint.pt"
            />
          </label>
          <Info>
            Override default weights only if you know what you’re doing. Wrong checkpoints often fail at load time.
          </Info>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label><strong>Expert Hydra overrides (one per line)</strong></label>
          <textarea
            value={params.extra_overrides}
            onChange={(e)=>setParams(p=>({...p, extra_overrides: e.target.value}))}
            rows={4}
            placeholder={`e.g.\npotentials.clash.weight=1.0\nppi.hotspot_res='A45,A67'`}
            style={{ width: '100%', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Appends raw Hydra overrides to the command. Use with care—invalid overrides can break runs.
          </div>
        </div>
      </div>
    </section>
  );
}
