// frontend/src/components/Controls/AlphaFoldParams.js
import Field from "../Shared/Field";
import Info from "../Shared/Info";

export default function AlphaFoldParams({ params, setParams }) {
  return (
    <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, margin: "1rem 0" }}>
      <h3 style={{ marginTop: 0 }}>AlphaFold parameters</h3>

      <div style={{ fontSize: 12, color: "#666", marginTop: -6, marginBottom: 10 }}>
        Rough rule: multimer + full_dbs + relax is most thorough but slowest.
      </div>

      <Field
        label={
          <>
            model_preset
            <Info>
              Monomer predicts a single chain. Multimer is for complexes (multiple chains) and can model interfaces better,
              but usually runs slower.
            </Info>
          </>
        }
      >
        <select
          value={params.model_preset}
          onChange={(e) => setParams((p) => ({ ...p, model_preset: e.target.value }))}
        >
          <option value="monomer">monomer</option>
          <option value="multimer">multimer</option>
        </select>
      </Field>

      <Field
        label={
          <>
            db_preset
            <Info>
              Controls which databases are used for MSA/template search. full_dbs is more sensitive but slower/heavier.
              reduced_dbs is faster but may reduce accuracy on difficult targets.
            </Info>
          </>
        }
      >
        <select
          value={params.db_preset}
          onChange={(e) => setParams((p) => ({ ...p, db_preset: e.target.value }))}
        >
          <option value="full_dbs">full_dbs</option>
          <option value="reduced_dbs">reduced_dbs</option>
        </select>
      </Field>

      <Field
        label={
          <>
            max_template_date
            <Info>
              Limits structural templates to those released before this date. Newer dates allow more templates and often help accuracy.
              Older dates are useful for benchmarking to avoid “future” templates.
            </Info>
          </>
        }
      >
        <input
          type="date"
          value={params.max_template_date}
          onChange={(e) => setParams((p) => ({ ...p, max_template_date: e.target.value }))}
        />
      </Field>

      <Field
        label={
          <>
            models_to_relax
            <Info>
              Amber relaxation refines stereochemistry and reduces clashes. none is fastest. best relaxes the top-ranked model.
              all relaxes every model (slowest).
            </Info>
          </>
        }
      >
        <select
          value={params.models_to_relax}
          onChange={(e) => setParams((p) => ({ ...p, models_to_relax: e.target.value }))}
        >
          <option value="none">none</option>
          <option value="best">best</option>
          <option value="all">all</option>
        </select>
      </Field>

      <Field
        label={
          <>
            use_gpu_relax
            <Info>
              Only matters if relaxation is enabled. If supported on the server, GPU relax can speed up relaxation. No effect when models_to_relax is none.
            </Info>
          </>
        }
      >
        <input
          type="checkbox"
          checked={!!params.use_gpu_relax}
          onChange={(e) => setParams((p) => ({ ...p, use_gpu_relax: e.target.checked }))}
        />
      </Field>

      <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
        Note: for multimer you don’t need <code>pdb70</code>; backend picks correct flags.
      </div>
    </section>
  );
}
