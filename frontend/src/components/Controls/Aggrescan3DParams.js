// frontend/src/components/Tools/Aggrescan3DParams.js
import Info from '../Shared/Info';
import { clamp } from '../../constants/rf';

export default function Aggrescan3DParams({ params, setParams, defaults }) {
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Aggrescan3D parameters</h3>
        <button
          type="button"
          className="btnSecondary"
          style={{ padding: "6px 10px", fontSize: 12 }}
          onClick={() => setParams({ ...defaults })}
        >
          Reset to defaults
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginTop: -6, marginBottom: 10 }}>
        Aggrescan3D estimates aggregation-prone regions based on 3D structure.
        Results depend on structure quality and optional refinement.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
        <div>
          <label>
            <strong>Distance:&nbsp;</strong>
            <select
              value={params.distance}
              onChange={(e) => setParams(p => ({ ...p, distance: Number(e.target.value) }))}
            >
              <option value={5}>5 Å</option>
              <option value={10}>10 Å</option>
            </select>
          </label>
          <Info>
            Defines the radius used to evaluate aggregation propensity.
            <br /><br />
            <b>5 Å</b>: focuses on surface-exposed residues (surface aggregation risk).<br />
            <b>10 Å</b>: includes buried residues (overall aggregation tendency).
          </Info>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={!!params.dynamic}
              onChange={(e) => setParams(p => ({ ...p, dynamic: e.target.checked }))}
            /> Dynamic
          </label>
          <Info>
            Enables dynamic mode, which samples conformational flexibility if supported by the backend.
            Can better capture transiently exposed aggregation-prone regions, but may increase runtime.
          </Info>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={!!params.foldx}
              onChange={(e) => setParams(p => ({ ...p, foldx: e.target.checked }))}
            /> FoldX
          </label>
          <Info>
            Runs FoldX structural refinement before aggregation analysis.
            This can improve side-chain packing and geometry, but increases runtime and may fail for some structures.
          </Info>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={!!params.hide}
              onChange={(e) => setParams(p => ({ ...p, hide: e.target.checked }))}
            /> Hide
          </label>
          <Info>
            Hides the uploaded structure from public-facing outputs or shared results (if supported by the backend).
            Does not affect the analysis itself.
          </Info>
        </div>

        <div>
          <label>
            <strong>Poll (sec):&nbsp;</strong>
            <input
              type="number"
              min={1}
              max={120}
              value={params.poll_s}
              onChange={(e) => setParams(p => ({ ...p, poll_s: clamp(e.target.value, { min:1, max:120 }) }))}
              style={{ width: 140 }}
            />
          </label>
          <Info>
            How often the frontend checks job status. Smaller values update faster but create more server requests.
            Usually fine to leave at default.
          </Info>
        </div>

        <div>
          <label>
            <strong>Timeout (sec):&nbsp;</strong>
            <input
              type="number"
              min={60}
              max={7200}
              value={params.timeout_s}
              onChange={(e) => setParams(p => ({ ...p, timeout_s: clamp(e.target.value, { min:60, max:7200 }) }))}
              style={{ width: 160 }}
            />
          </label>
          <Info>
            Maximum time allowed for the run before it is aborted.
            Increase for large structures or when using FoldX.
          </Info>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Upload a <b>.pdb</b> file for Aggrescan3D analysis.
      </div>
    </section>
  );
}
