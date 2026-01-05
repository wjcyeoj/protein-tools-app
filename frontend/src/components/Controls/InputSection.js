// frontend/src/components/Controls/InputSection.js
export default function InputSection({
  tool,
  rfMode = 'free',
  file,
  setFile,
  inputMode,     // 'file' | 'text' (AF only)
  setInputMode,
  seqName,
  setSeqName,
  seqText,
  setSeqText,
}) {
  const fileAccept =
    tool === 'alphafold' ? '.fa,.fasta' :
    tool === 'proteinmpnn' ? '.pdb,.cif' :
    tool === 'aggrescan3d' ? '.pdb' :
    tool === 'rfdiffusion' ? (rfMode === 'motif' ? '.pdb' : '') :
    tool === 'residueid' ? '.fa,.fasta,.pdb' :
    tool === 'msa' ? '.fa,.fasta' :
    '.fa,.fasta';
  const allowText = tool === 'alphafold' || tool === 'residueid' || tool === 'msa';
  const useText = allowText && inputMode === 'text';

  return (
    <section style={{ margin: '1rem 0' }}>
      {/* Mode toggle only for AlphaFold */}
      {allowText && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ marginRight: 12 }}>
            <input
              type="radio"
              name="af-input-mode"
              value="file"
              checked={inputMode === 'file'}
              onChange={() => setInputMode('file')}
            />{' '}
            Upload FASTA file
          </label>
          <label>
            <input
              type="radio"
              name="af-input-mode"
              value="text"
              checked={inputMode === 'text'}
              onChange={() => setInputMode('text')}
            />{' '}
            Paste FASTA / sequence
          </label>
        </div>
      )}

      {useText ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <label>
              <strong>Sequence name</strong>{' '}
              <input
                type="text"
                value={seqName}
                onChange={(e) => setSeqName(e.target.value)}
                style={{ width: 220 }}
              />
            </label>
          </div>

          <textarea
            rows={10}
            placeholder={`>chain_A
MKTAYIAK...
>chain_B
GHHHHHH...`}
            value={seqText}
            onChange={(e) => setSeqText(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />

          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Paste a full FASTA (multiple <code>&gt;</code> headers allowed for multimer) or a
            single raw sequence. Raw sequences will be wrapped as <code>&gt;{seqName}</code>.
          </div>
        </>
      ) : (
        <>
          <input
            type="file"
            accept={fileAccept}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            {tool === 'alphafold'
              ? 'Upload FASTA (.fa/.fasta)'
              : tool === 'rfdiffusion'
                ? (rfMode === 'motif'
                    ? 'Upload PDB for motif mode'
                    : 'No file required for free mode')
              : tool === 'proteinmpnn'
              ? 'Upload PDB/CIF (.pdb/.cif)'
              //: 'Upload FASTA (.fa/.fasta) or PDB (.pdb)'
              : tool === 'aggrescan3d'
              ? 'Upload PDB (.pdb)'
              : tool === 'msa'
              ? 'Upload multi-FASTA (.fa/.fasta) with ≥2 sequences'
              : 'Upload FASTA (.fa/.fasta) or PDB (.pdb)'
            }
          </div>
        </>
      )}
    </section>
  );
}
