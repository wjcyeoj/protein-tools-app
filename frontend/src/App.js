// frontend/src/App.js
import React, { useEffect, useRef, useState } from "react";

const LS_TOOL = "ptools.tool";
const LS_AF = "ptools.afParams";
const LS_MPNN = "ptools.mpnnParams";

export default function App() {
  // Which tool?
  const [tool, setTool] = useState(
    () => localStorage.getItem(LS_TOOL) || "alphafold"
  );

  // Files
  const [file, setFile] = useState(null);

  // AlphaFold params (keep names your backend expects)
  const [afParams, setAfParams] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_AF)) || {
        model_preset: "monomer", // monomer | multimer
        db_preset: "full_dbs",   // full_dbs | reduced_dbs
        max_template_date: "2024-12-31",
        models_to_relax: "none", // none | best | all
        use_gpu_relax: false,
      };
    } catch {
      return {
        model_preset: "monomer",
        db_preset: "full_dbs",
        max_template_date: "2024-12-31",
        models_to_relax: "none",
        use_gpu_relax: false,
      };
    }
  });

  // ProteinMPNN params
  const [mpnnParams, setMpnnParams] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_MPNN)) || {
        model_name: "v_48_020",   // v_48_002 | v_48_010 | v_48_020 | v_48_030 | ca_* | s_*
        num_seq_per_target: 10,
        batch_size: 1,
        sampling_temp: 0.2,       // 0.1–1.0 typical
      };
    } catch {
      return {
        model_name: "v_48_020",
        num_seq_per_target: 10,
        batch_size: 1,
        sampling_temp: 0.2,
      };
    }
  });

  // Job tracking
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("idle"); // idle|running|finished|error
  const [logs, setLogs] = useState("");
  const pollRef = useRef(null);

  // Persist tool/params to localStorage
  useEffect(() => localStorage.setItem(LS_TOOL, tool), [tool]);
  useEffect(() => localStorage.setItem(LS_AF, JSON.stringify(afParams)), [afParams]);
  useEffect(() => localStorage.setItem(LS_MPNN, JSON.stringify(mpnnParams)), [mpnnParams]);

  // Submit job
  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      alert("Please choose a file first.");
      return;
    }
    const body = new FormData();
    body.append("tool", tool); // must be 'alphafold' or 'proteinmpnn'
    body.append("file", file);
    body.append("params", JSON.stringify(tool === "alphafold" ? afParams : mpnnParams));

    setStatus("running");
    setLogs("");
    setJobId("");
    try {
      const res = await fetch("/jobs", { method: "POST", body });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Submit failed (${res.status}): ${t}`);
      }
      const { job_id } = await res.json();
      setJobId(job_id);
    } catch (err) {
      setStatus("error");
      alert(err.message);
    }
  }

  // Poll status + logs
  useEffect(() => {
    if (!jobId) return;
    async function tick() {
      try {
        const s = await fetch(`/jobs/${jobId}`);
        if (s.ok) {
          const js = await s.json();
          setStatus(js.status);
        }
        const l = await fetch(`/jobs/${jobId}/logs?tail=400`);
        if (l.ok) setLogs(await l.text());
      } catch {
        /* ignore transient errors */
      }
    }
    tick();
    pollRef.current = setInterval(tick, 2500);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const canDownload = jobId && status === "finished";

  // Streamed download (fast start, smaller memory)
  async function handleDownload() {
    if (!canDownload) return;
    try {
      const res = await fetch(`/jobs/${jobId}/download_stream`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") || "";
      const m = dispo.match(/filename="?([^"]+)"?/);
      const filename = m?.[1] || `${jobId}.tgz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download failed: ${e.message}`);
    }
  }

  // Small helpers
  function AFField({ label, children }) {
    return (
      <div style={{ marginBottom: 8 }}>
        <label><strong>{label}:</strong> {children}</label>
      </div>
    );
  }
  function MPNNField({ label, children }) {
    return (
      <div style={{ marginBottom: 8 }}>
        <label><strong>{label}:</strong> {children}</label>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "2rem auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 6 }}>Protein Tools</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Run AlphaFold or ProteinMPNN on your EC2 instance.</p>

      {/* Tool selector */}
      <section style={{ margin: "1rem 0" }}>
        <label>
          <strong>Tool:&nbsp;</strong>
          <select value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="alphafold">AlphaFold</option>
            <option value="proteinmpnn">ProteinMPNN</option>
          </select>
        </label>
      </section>

      {/* File chooser */}
      <section style={{ margin: "1rem 0" }}>
        <input
          type="file"
          accept={tool === "alphafold" ? ".fa,.fasta" : ".pdb,.cif"}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          {tool === "alphafold" ? "Upload FASTA (.fa/.fasta)" : "Upload PDB/CIF (.pdb/.cif)"}
        </div>
      </section>

      {/* AlphaFold params */}
      {tool === "alphafold" && (
        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, margin: "1rem 0" }}>
          <h3 style={{ marginTop: 0 }}>AlphaFold parameters</h3>

          <AFField label="model_preset">
            <select
              value={afParams.model_preset}
              onChange={(e) => setAfParams(p => ({ ...p, model_preset: e.target.value }))}
            >
              <option value="monomer">monomer</option>
              <option value="multimer">multimer</option>
            </select>
          </AFField>

          <AFField label="db_preset">
            <select
              value={afParams.db_preset}
              onChange={(e) => setAfParams(p => ({ ...p, db_preset: e.target.value }))}
            >
              <option value="full_dbs">full_dbs</option>
              <option value="reduced_dbs">reduced_dbs</option>
            </select>
          </AFField>

          <AFField label="max_template_date">
            <input
              type="date"
              value={afParams.max_template_date}
              onChange={(e) => setAfParams(p => ({ ...p, max_template_date: e.target.value }))}
            />
          </AFField>

          <AFField label="models_to_relax">
            <select
              value={afParams.models_to_relax}
              onChange={(e) => setAfParams(p => ({ ...p, models_to_relax: e.target.value }))}
            >
              <option value="none">none</option>
              <option value="best">best</option>
              <option value="all">all</option>
            </select>
          </AFField>

          <AFField label="use_gpu_relax">
            <input
              type="checkbox"
              checked={!!afParams.use_gpu_relax}
              onChange={(e) => setAfParams(p => ({ ...p, use_gpu_relax: e.target.checked }))}
            />
          </AFField>

          <div style={{ fontSize: 12, color: "#666" }}>
            Note: for multimer you don’t need <code>pdb70</code>; backend handles the correct flags.
          </div>
        </section>
      )}

      {/* ProteinMPNN params */}
      {tool === "proteinmpnn" && (
        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, margin: "1rem 0" }}>
          <h3 style={{ marginTop: 0 }}>ProteinMPNN parameters</h3>

          <MPNNField label="model_name">
            <select
              value={mpnnParams.model_name}
              onChange={(e) => setMpnnParams(p => ({ ...p, model_name: e.target.value }))}
            >
              <option value="v_48_002">v_48_002</option>
              <option value="v_48_010">v_48_010</option>
              <option value="v_48_020">v_48_020</option>
              <option value="v_48_030">v_48_030</option>
              <option value="ca_48_010">ca_48_010</option>
              <option value="s_48_020">s_48_020</option>
            </select>
          </MPNNField>

          <MPNNField label="num_seq_per_target">
            <input
              type="number"
              min={1}
              max={200}
              value={mpnnParams.num_seq_per_target}
              onChange={(e) =>
                setMpnnParams(p => ({ ...p, num_seq_per_target: Number(e.target.value || 1) }))
              }
            />
          </MPNNField>

          <MPNNField label="batch_size">
            <input
              type="number"
              min={1}
              max={32}
              value={mpnnParams.batch_size}
              onChange={(e) =>
                setMpnnParams(p => ({ ...p, batch_size: Number(e.target.value || 1) }))
              }
            />
          </MPNNField>

          <MPNNField label="sampling_temp">
            <input
              type="number"
              step="0.01"
              min={0.05}
              max={1.5}
              value={mpnnParams.sampling_temp}
              onChange={(e) =>
                setMpnnParams(p => ({ ...p, sampling_temp: Number(e.target.value || 0.2) }))
              }
            />
          </MPNNField>
        </section>
      )}

      {/* Actions */}
      <form onSubmit={handleSubmit} style={{ margin: "1rem 0" }}>
        <button type="submit">Submit</button>
        <button
          type="button"
          style={{ marginLeft: 8 }}
          disabled={!jobId}
          onClick={() => {
            setJobId("");
            setStatus("idle");
            setLogs("");
          }}
        >
          Clear job
        </button>
      </form>

      {/* Status & Download */}
      <section style={{ margin: "0.5rem 0 1rem" }}>
        <div><strong>Job ID:</strong> {jobId || "—"}</div>
        <div><strong>Status:</strong> {status}</div>
        <div style={{ marginTop: 8 }}>
          <button disabled={!canDownload} onClick={handleDownload}>
            {canDownload ? "Download results" : "Preparing…"}
          </button>
        </div>
      </section>

      {/* Logs */}
      <section>
        <strong>Logs</strong>
        <pre
          style={{
            background: "#0b0b0b",
            color: "#aefba8",
            padding: 12,
            minHeight: 180,
            whiteSpace: "pre-wrap",
            borderRadius: 8,
          }}
        >
          {logs || "(waiting…)"}
        </pre>
      </section>
    </div>
  );
}
