import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [tool, setTool] = useState("esmfold");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = async () => {
    if (!file) return alert("Upload a FASTA file first.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tool", tool);

    setLoading(true);
    try {
      const res = await axios.post("http://localhost:8000/predict/", formData);
      setResult(res.data.result);
    } catch (err) {
      console.error(err);
      alert("Prediction failed.");
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <h1>Protein Structure Predictor</h1>

      <label>Select Tool:</label>
      <select value={tool} onChange={(e) => setTool(e.target.value)}>
        <option value="esmfold">ESMFold</option>
        <option value="alphafold">AlphaFold</option>
        <option value="rfdiffusion">RFDiffusion</option>
      </select>

      <label>Upload FASTA File:</label>
      <input type="file" accept=".fasta, .txt" onChange={(e) => setFile(e.target.files[0])} />

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "Predicting..." : "Submit"}
      </button>

      {result && (
        <div>
          <h3>Result:</h3>
          <p>{result}</p>
        </div>
      )}
    </div>
  );
}

export default App;