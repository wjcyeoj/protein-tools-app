import React, { useEffect, useRef, useState } from "react";

const Poll = ({ url, interval=2000, render }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    let timer;
    const go = async () => {
      try { const r = await fetch(url); setData(await r.json()); }
      catch { /* ignore */ }
      timer = setTimeout(go, interval);
    };
    go(); return () => clearTimeout(timer);
  }, [url, interval]);
  return render(data);
};

export default function App() {
  const [tool, setTool] = useState("alphafold"); // 'alphafold' | 'mpnn'
  // AF state
  const fastaRef = useRef();
  const [afModel, setAfModel] = useState("monomer");
  const [afDb, setAfDb] = useState("full_dbs");
  const [afDate, setAfDate] = useState("2024-12-31");
  const [afRelax, setAfRelax] = useState("none");
  const [afUseGpuRelax, setAfUseGpuRelax] = useState(false);
  const [afOutName, setAfOutName] = useState("job");

  // MPNN state
  const pdbRef = useRef();
  const [mpnnModel, setMpnnModel] = useState("v_48_020");
  const [mpnnNum, setMpnnNum] = useState(1);
  const [mpnnBatch, setMpnnBatch] = useState(1);
  const [mpnnTemp, setMpnnTemp] = useState(0.1);

  const [jobId, setJobId] = useState(null);
  const [logs, setLogs] = useState("");
  const [status, setStatus] = useState(null);

  const submit = async () => {
    setJobId(null); setLogs(""); setStatus(null);
    if (tool === "alphafold") {
      const f = fastaRef.current.files?.[0]; if (!f) return alert("Choose a FASTA");
      const fd = new FormData();
      fd.append("fasta", f);
      fd.append("model_preset", afModel);
      fd.append("db_preset", afDb);
      fd.append("max_template_date", afDate);
      fd.append("models_to_relax", afRelax);
      fd.append("use_gpu_relax", afUseGpuRelax ? "true" : "false");
      fd.append("out_name", afOutName || "job");
      const r = await fetch("/jobs", { method: "POST", body: fd });
      if (!r.ok) return alert("AF submit failed: " + r.status);
      const j = await r.json(); setJobId(j.job_id);
    } else {
      const f = pdbRef.current.files?.[0]; if (!f) return alert("Choose a PDB");
      const fd = new FormData();
      fd.append("file", f);
      fd.append("model_name", mpnnModel);
      fd.append("num_seqs", String(mpnnNum));
      fd.append("batch_size", String(mpnnBatch));
      fd.append("sampling_temp", String(mpnnTemp));
      const r = await fetch("/mpnn/jobs/upload", { method: "POST", body: fd });
      if (!r.ok) return alert("MPNN submit failed: " + r.status);
      const j = await r.json(); setJobId(j.job_id);
    }
  };

  useEffect(() => {
    let t;
    const pull = async () => {
      if (!jobId) return;
      const base = tool === "alphafold" ? `/jobs/${jobId}` : `/mpnn/jobs/${jobId}`;
      try {
        const [s, l] = await Promise.all([
          fetch(base),
          fetch(`${base}/logs?tail=200`)
        ]);
        if (s.ok) setStatus(await s.json());
        if (l.ok) setLogs(await l.text());
      } catch {}
      t = setTimeout(pull, 2000);
    };
    pull(); return () => clearTimeout(t);
  }, [jobId, tool]);

  const download = () => {
    if (!jobId) return;
    const base = tool === "alphafold" ? `/jobs/${jobId}` : `/mpnn/jobs/${jobId}`;
    window.location.href = `${base}/download`;
  };

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Protein Tools</h1>

      <div style={{ marginBottom: 12 }}>
        <label><input type="radio" checked={tool==="alphafold"} onChange={()=>setTool("alphafold")} /> AlphaFold</label>{" "}
        <label><input type="radio" checked={tool==="mpnn"} onChange={()=>setTool("mpnn")} /> ProteinMPNN</label>
      </div>

      {tool === "alphafold" ? (
        <section style={{border:"1px solid #ddd", padding:16, borderRadius:8}}>
          <h2>AlphaFold</h2>
          <div>FASTA: <input ref={fastaRef} type="file" accept=".fa,.fasta,.txt" /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12, marginTop:12}}>
            <label>Model preset
              <select value={afModel} onChange={e=>setAfModel(e.target.value)}>
                <option value="monomer">monomer</option>
                <option value="monomer_casp14">monomer_casp14</option>
                <option value="multimer">multimer</option>
              </select>
            </label>
            <label>DB preset
              <select value={afDb} onChange={e=>setAfDb(e.target.value)}>
                <option value="full_dbs">full_dbs</option>
                <option value="reduced_dbs">reduced_dbs</option>
              </select>
            </label>
            <label>Max template date
              <input value={afDate} onChange={e=>setAfDate(e.target.value)} placeholder="YYYY-MM-DD"/>
            </label>
            <label>Models to relax
              <select value={afRelax} onChange={e=>setAfRelax(e.target.value)}>
                <option value="none">none</option>
                <option value="best">best</option>
                <option value="all">all</option>
              </select>
            </label>
            <label>GPU relax
              <input type="checkbox" checked={afUseGpuRelax} onChange={e=>setAfUseGpuRelax(e.target.checked)} />
            </label>
            <label>Output name
              <input value={afOutName} onChange={e=>setAfOutName(e.target.value)} placeholder="job"/>
            </label>
          </div>
          <button style={{marginTop:12}} onClick={submit}>Submit AlphaFold</button>
        </section>
      ) : (
        <section style={{border:"1px solid #ddd", padding:16, borderRadius:8}}>
          <h2>ProteinMPNN</h2>
          <div>PDB: <input ref={pdbRef} type="file" accept=".pdb" /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12, marginTop:12}}>
            <label>Model
              <select value={mpnnModel} onChange={e=>setMpnnModel(e.target.value)}>
                <option>v_48_020</option>
                <option>v_48_010</option>
                <option>v_48_002</option>
                <option>ca_48_020</option>
                <option>s_48_020</option>
              </select>
            </label>
            <label># sequences
              <input type="number" min="1" value={mpnnNum} onChange={e=>setMpnnNum(Number(e.target.value))}/>
            </label>
            <label>Batch size
              <input type="number" min="1" value={mpnnBatch} onChange={e=>setMpnnBatch(Number(e.target.value))}/>
            </label>
            <label>Temperature
              <input type="number" step="0.01" min="0.01" max="1.5"
                     value={mpnnTemp} onChange={e=>setMpnnTemp(Number(e.target.value))}/>
            </label>
          </div>
          <button style={{marginTop:12}} onClick={submit}>Submit MPNN</button>
        </section>
      )}

      {jobId && (
        <section style={{marginTop:20}}>
          <h3>Job: {jobId}</h3>
          <pre>Status: {status ? JSON.stringify(status) : "..."}</pre>
          <h4>Logs (tail)</h4>
          <textarea readOnly style={{width:"100%", height:200}} value={logs}/>
          <div style={{marginTop:8}}>
            <button onClick={download}>Download results</button>
          </div>
        </section>
      )}
    </div>
  );
}
