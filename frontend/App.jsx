import SequenceForm from './components/SequenceForm';
import ResultsPanel from './components/ResultsPanel';
import { useAnalyzeSequence } from './hooks/useAnalyzeSequence';

export default function App() {
  const { status, data, error, run } = useAnalyzeSequence();
  // if your original App.js had extra UI (charts/downloads), paste them back here,
  // calling the same `run(sequence)` when the user submits.
  return (
    <main style={{maxWidth:960, margin:'0 auto', padding:'16px'}}>
      <h1>Protein Tools</h1>
      <SequenceForm onSubmit={run} />
      <div style={{marginTop:16}}>
        <ResultsPanel status={status} error={error} data={data} />
      </div>
    </main>
  );
}
