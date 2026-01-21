import React from "react";

export const TOOL_ICONS = {
  alphafold: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M12 2l8 5v10l-8 5-8-5V7l8-5z"
            fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 8v8" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),

  proteinmpnn: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M6 4h12v6H6z" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M6 12h12v8H6z" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),

  rfdiffusion: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 7v7l4 2" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),

  aggrescan3d: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M5 19V9M9 19V5M13 19v-7M17 19v-4"
            stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),

  proteinsol: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M12 2C8 7 6 10 6 13a6 6 0 0 0 12 0c0-3-2-6-6-11z"
            fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),

  residueid: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="7" y="3" width="10" height="18"
            fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),

  msa: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M6 6h12M6 12h12M6 18h12"
            stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),
};

export const TOOLS = [
  { id: "alphafold",    name: "AlphaFold", desc: "Predict protein structure from FASTA (monomer/multimer).", icon: TOOL_ICONS.alphafold },
  { id: "proteinmpnn",  name: "ProteinMPNN", desc: "Design sequences for a fixed backbone (PDB/CIF input).", icon: TOOL_ICONS.proteinmpnn },
  { id: "rfdiffusion",  name: "RFdiffusion", desc: "Generate novel backbones (free mode or motif-guided).", icon: TOOL_ICONS.rfdiffusion },
  { id: "aggrescan3d",  name: "Aggrescan3D", desc: "Estimate aggregation hotspots from 3D structure (PDB).", icon: TOOL_ICONS.aggrescan3d },
  { id: "proteinsol",   name: "ProteinSol", desc: "Compute sequence-based solubility metrics from FASTA.", icon: TOOL_ICONS.proteinsol },
  { id: "residueid",    name: "Residue Identifier", desc: "Summarize residues (e.g., cysteines/lysines) from FASTA/PDB.", icon: TOOL_ICONS.residueid },
  { id: "msa",          name: "MSA Consensus", desc: "Find fully conserved positions from a multi-FASTA alignment.", icon: TOOL_ICONS.msa },
];

export function toolById(id) {
  return TOOLS.find(t => t.id === id);
}
