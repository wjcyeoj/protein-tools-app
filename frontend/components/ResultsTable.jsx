export default function ResultsTable({ data }) {
  if (!data) return null;
  return (
    <table>
      <tbody>
        {Object.entries(data).map(([k,v])=>(
          <tr key={k}><th style={{textAlign:'left'}}>{k}</th><td><pre>{JSON.stringify(v,null,2)}</pre></td></tr>
        ))}
      </tbody>
    </table>
  );
}
