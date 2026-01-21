export const TOOLS = [
  { id: "alphafold",    name: "AlphaFold", desc: "Predict protein structure from FASTA (monomer/multimer)." },
  { id: "proteinmpnn",  name: "ProteinMPNN", desc: "Design sequences for a fixed backbone (PDB/CIF input)." },
  { id: "rfdiffusion",  name: "RFdiffusion", desc: "Generate novel backbones (free mode or motif-guided)." },
  { id: "aggrescan3d",  name: "Aggrescan3D", desc: "Estimate aggregation hotspots from 3D structure (PDB)." },
  { id: "proteinsol",   name: "ProteinSol", desc: "Compute sequence-based solubility metrics from FASTA." },
  { id: "residueid",    name: "Residue Identifier", desc: "Summarize residues (e.g., cysteines/lysines) from FASTA/PDB." },
  { id: "msa",          name: "MSA Consensus", desc: "Find fully conserved positions from a multi-FASTA alignment." },
];

export function toolById(id) {
  return TOOLS.find(t => t.id === id);
}
