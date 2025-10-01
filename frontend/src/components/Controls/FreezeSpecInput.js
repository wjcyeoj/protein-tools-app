// frontend/src/components/Controls/FreezeSpecInput.js
const FREEZE_LS_KEY = 'ptools.freezeSpec';

export default function FreezeSpecInput({ inputRef }) {
  const freezeInit = () => localStorage.getItem(FREEZE_LS_KEY) || '';

  return (
    <div style={{ marginTop: 8 }}>
      <strong>Freeze residues (optional)</strong>
      <input
        ref={inputRef}
        type="text"
        defaultValue={freezeInit}
        onInput={(e) => localStorage.setItem(FREEZE_LS_KEY, e.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder={`Examples:
A:1-100        (freeze a range)
B:* or B:all   (freeze whole chain)
A:10,25,30     (freeze specific positions)
A:1-50, B:all  (combine)`}
        style={{ width: '100%' }}
      />
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        Format: <code>CHAIN[:SEL]</code>. <code>SEL</code> can be a number, a range <code>N-M</code>,
        a comma list <code>n,m,k</code>, or <code>*</code>/<code>all</code> for the entire chain.
        Separate items by commas or spaces.
      </div>
    </div>
  );
}
