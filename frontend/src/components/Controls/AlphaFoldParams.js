// frontend/src/components/Controls/AlphaFoldParams.js
import Field from '../Shared/Field';

export default function AlphaFoldParams({ params, setParams }) {
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, margin: '1rem 0' }}>
      <h3 style={{ marginTop: 0 }}>AlphaFold parameters</h3>

      <Field label="model_preset">
        <select
          value={params.model_preset}
          onChange={(e) => setParams((p) => ({ ...p, model_preset: e.target.value }))}
        >
          <option value="monomer">monomer</option>
          <option value="multimer">multimer</option>
        </select>
      </Field>

      <Field label="db_preset">
        <select
          value={params.db_preset}
          onChange={(e) => setParams((p) => ({ ...p, db_preset: e.target.value }))}
        >
          <option value="full_dbs">full_dbs</option>
          <option value="reduced_dbs">reduced_dbs</option>
        </select>
      </Field>

      <Field label="max_template_date">
        <input
          type="date"
          value={params.max_template_date}
          onChange={(e) => setParams((p) => ({ ...p, max_template_date: e.target.value }))}
        />
      </Field>

      <Field label="models_to_relax">
        <select
          value={params.models_to_relax}
          onChange={(e) => setParams((p) => ({ ...p, models_to_relax: e.target.value }))}
        >
          <option value="none">none</option>
          <option value="best">best</option>
          <option value="all">all</option>
        </select>
      </Field>

      <Field label="use_gpu_relax">
        <input
          type="checkbox"
          checked={!!params.use_gpu_relax}
          onChange={(e) => setParams((p) => ({ ...p, use_gpu_relax: e.target.checked }))}
        />
      </Field>

      <div style={{ fontSize: 12, color: '#666' }}>
        Note: for multimer you don’t need <code>pdb70</code>; backend picks correct flags.
      </div>
    </section>
  );
}
