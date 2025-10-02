// frontend/src/components/Controls/ProteinMpnnParams.js
import Field from '../Shared/Field';

export default function ProteinMpnnParams({ params, setParams }) {
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>
      <h3 style={{ marginTop: 0 }}>ProteinMPNN parameters</h3>

      <Field label="model_name">
        <select
          value={params.model_name}
          onChange={(e) => setParams((p) => ({ ...p, model_name: e.target.value }))}
        >
          <option value="v_48_002">v_48_002</option>
          <option value="v_48_010">v_48_010</option>
          <option value="v_48_020">v_48_020</option>
          <option value="v_48_030">v_48_030</option>
          <option value="ca_48_010">ca_48_010</option>
          <option value="s_48_020">s_48_020</option>
        </select>
      </Field>

      <Field label="num_seq_per_target">
        <input
          type="number"
          min={1}
          max={200}
          value={params.num_seq_per_target}
          onChange={(e) =>
            setParams((p) => ({ ...p, num_seq_per_target: Number(e.target.value || 1) }))
          }
        />
      </Field>

      <Field label="batch_size">
        <input
          type="number"
          min={1}
          max={32}
          value={params.batch_size}
          onChange={(e) =>
            setParams((p) => ({ ...p, batch_size: Number(e.target.value || 1) }))
          }
        />
      </Field>

      <Field label="sampling_temp">
        <input
          type="number"
          step="0.01"
          min={0.05}
          max={1.5}
          value={params.sampling_temp}
          onChange={(e) =>
            setParams((p) => ({ ...p, sampling_temp: Number(e.target.value || 0.2) }))
          }
        />
      </Field>
    </section>
  );
}
