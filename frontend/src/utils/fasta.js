// frontend/src/utils/fasta.js

// Returns FASTA string from raw input (either already-FASTA or wraps a raw sequence)
// or null if input is empty/invalid.
export function makeFastaFromRaw(raw, header = "sequence") {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  // Already looks like FASTA (has at least one '>' header)
  if (trimmed.startsWith(">") || trimmed.includes("\n>")) {
    return trimmed.endsWith("\n") ? trimmed : trimmed + "\n";
  }

  // Wrap a raw sequence as a single FASTA record
  const seqOnly = trimmed.replace(/\s+/g, "");
  if (!seqOnly) return null;

  const safeHeader = (header || "sequence").trim() || "sequence";
  return `>${safeHeader}\n${seqOnly}\n`;
}

// Builds a browser File from raw input (FASTA or raw seq); returns File or null.
export function makeVirtualFastaFile(raw, header = "sequence") {
  const fasta = makeFastaFromRaw(raw, header);
  if (!fasta) return null;
  const safeName = (header || "sequence").replace(/[^A-Za-z0-9_.-]+/g, "_");
  return new File([fasta], `${safeName}.fasta`, { type: "text/plain" });
}
