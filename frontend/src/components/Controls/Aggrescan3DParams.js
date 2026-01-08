// frontend/src/components/Tools/Aggrescan3DParams.js
import Info from '../Shared/Info';
import { clamp } from '../../constants/rf';

export default function Aggrescan3DParams({ params, setParams }) {
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>
      <h3 style={{ marginTop: 0 }}>Aggrescan3D parameters</h3>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12 }}>
        <div>
          <label>
            <strong>Distance:&nbsp;</strong>
            <select
              value={params.distance}
              onChange={(e) => setParams(p => ({ ...p, distance: Number(e.target.value) }))}
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
              checked={!!params.dynamic}
              onChange={(e) => setParams(p => ({ ...p, dynamic: e.target.checked }))}
            /> Dynamic
          </label>
          <Info>Runs dynamic mode (if supported by backend runner).</Info>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={!!params.foldx}
              onChange={(e) => setParams(p => ({ ...p, foldx: e.target.checked }))}
            /> FoldX
          </label>
          <Info>Enable FoldX refinement (if supported).</Info>
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={!!params.hide}
              onChange={(e) => setParams(p => ({ ...p, hide: e.target.checked }))}
            /> Hide
          </label>
          <Info>Hide structure in public outputs (if supported).</Info>
        </div>

        <div>
          <label>
            <strong>Poll (sec):&nbsp;</strong>
            <input
              type="number"
              min={1}
              max={120}
              value={params.poll_s}
              onChange={(e) => setParams(p => ({ ...p, poll_s: clamp(e.target.value, {min:1, max:120}) }))}
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
              value={params.timeout_s}
              onChange={(e) => setParams(p => ({ ...p, timeout_s: clamp(e.target.value, {min:60, max:7200}) }))}
              style={{ width: 160 }}
            />
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Upload a <b>.pdb</b> file for Aggrescan3D.
      </div>
    </section>
  );
}
