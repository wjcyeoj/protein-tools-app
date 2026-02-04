# backend/utils/fasta.py
from __future__ import annotations

import shutil
import subprocess
import tempfile
import shlex
import re
from pathlib import Path
from typing import Iterable, Iterator

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def fasta_records(text: str) -> Iterator[tuple[str, str]]:
    """Yield (header, seq) tuples from FASTA text."""
    header: str | None = None
    seq_lines: list[str] = []
    for line in (text or "").splitlines():
        if line.startswith(">"):
            if header is not None:
                yield header, "".join(seq_lines).replace(" ", "").strip()
            header, seq_lines = line[1:].strip(), []
        else:
            seq_lines.append(line.strip())
    if header is not None:
        yield header, "".join(seq_lines).replace(" ", "").strip()


def read_fasta_file(path: Path) -> list[tuple[str, str]]:
    return list(fasta_records(path.read_text()))


def guess_chain_from_header(header: str, fallback_idx: int) -> str:
    """
    Try to infer a chain letter/ID from the FASTA header, else A/B/C...
    Recognizes: 'chain A', 'chain_A', 'A:', '[A]', '/A'
    """
    m = re.search(r"(?:^|\b|[_/\-\[\(])chain[_\s:-]*([A-Za-z0-9])\b", header, re.I)
    if not m:
        m = re.search(r"(?:^|\b|[_/\-\[\(])([A-Za-z0-9])(?:\b|[:\]])", header)
    return (m.group(1).upper() if m else ALPHABET[fallback_idx % len(ALPHABET)])


def parse_fasta_positions(text: str) -> dict:
    """
    Return per-chain stats for one or more FASTA records.
    If only one record: chain id defaults to 'A' unless header hints otherwise.
    """
    recs = list(fasta_records(text))
    if not recs:
        return {"chains": [], "totals": {"length": 0, "cysteines": 0, "lysines": 0}}

    chains = []
    for i, (hdr, seq) in enumerate(recs):
        chain_id = guess_chain_from_header(hdr, i if len(recs) > 1 else 0)
        if len(recs) == 1 and not re.search(r"chain", hdr, re.I):
            chain_id = "A"

        cys = [pos + 1 for pos, aa in enumerate(seq) if aa.upper() == "C"]
        lys = [pos + 1 for pos, aa in enumerate(seq) if aa.upper() == "K"]
        chains.append(
            {
                "id": chain_id,
                "length": len(seq),
                "cysteines": cys,
                "lysines": lys,
            }
        )

    totals = {
        "length": sum(c["length"] for c in chains),
        "cysteines": sum(len(c["cysteines"]) for c in chains),
        "lysines": sum(len(c["lysines"]) for c in chains),
    }
    return {"chains": chains, "totals": totals}


def muscle_align_if_available(src_fasta: Path) -> list[tuple[str, str]]:
    """
    If 'muscle' is installed, align sequences and return [(hdr, aligned_seq), ...].
    Otherwise, return the original records.
    """
    muscle = shutil.which("muscle")
    if not muscle:
        return read_fasta_file(src_fasta)

    with tempfile.TemporaryDirectory() as tmpd:
        out = Path(tmpd) / "aligned.fasta"
        cmd = f"{muscle} -align {shlex.quote(str(src_fasta))} -output {shlex.quote(str(out))} -quiet"
        subprocess.run(["bash", "-lc", cmd], check=True)
        return read_fasta_file(out)


def conserved_columns(records: list[tuple[str, str]], ignore_gaps: bool = True) -> dict:
    """
    records: [(header, aligned_seq), ...]
    Returns positions (1-based) where all sequences have the same letter (A-Z),
    optionally ignoring columns with any gap '-'.
    """
    if not records:
        return {"n_sequences": 0, "aligned_length": 0, "conserved": []}

    seqs = [s.upper() for _, s in records]
    L = len(seqs[0])
    if any(len(s) != L for s in seqs):
        return {"n_sequences": len(seqs), "aligned_length": 0, "conserved": []}

    conserved = []
    for i in range(L):
        col = [s[i] for s in seqs]
        if ignore_gaps and any(c == "-" for c in col):
            continue
        aa = col[0]
        if aa.isalpha() and all(c == aa for c in col):
            conserved.append({"position": i + 1, "residue": aa})

    return {"n_sequences": len(seqs), "aligned_length": L, "conserved": conserved}

def pairwise_pid(
    seq_a: str,
    seq_b: str,
    *,
    ignore_gaps: bool = True,
) -> float:
    """
    Percent identity between two *aligned* sequences.

    If ignore_gaps=True (default):
      - Only positions where BOTH sequences are not '-' are compared.
      - PID = matches / compared * 100
    """
    a = (seq_a or "").upper()
    b = (seq_b or "").upper()

    if len(a) != len(b) or len(a) == 0:
        return 0.0

    matches = 0
    compared = 0

    for ca, cb in zip(a, b):
        if ignore_gaps and (ca == "-" or cb == "-"):
            continue

        # If you want to also ignore columns where either is non-alphanumeric, add filtering here.
        compared += 1
        if ca == cb:
            matches += 1

    return (100.0 * matches / compared) if compared else 0.0


def pid_matrix(records: list[tuple[str, str]], *, ignore_gaps: bool = True) -> dict:
    """
    Build an NxN PID matrix for MSA records [(header, aligned_seq), ...].

    Returns:
      {
        "n_sequences": N,
        "aligned_length": L,
        "ignore_gaps": bool,
        "headers": [..],
        "matrix": [[..float..], ...],
        "summary": {"min": .., "max": .., "mean": ..}  # off-diagonal only
      }
    """
    if not records:
        return {
            "n_sequences": 0,
            "aligned_length": 0,
            "ignore_gaps": ignore_gaps,
            "headers": [],
            "matrix": [],
            "summary": {"min": 0.0, "max": 0.0, "mean": 0.0},
        }

    headers = [h for h, _ in records]
    seqs = [s.upper() for _, s in records]
    L = len(seqs[0])

    if any(len(s) != L for s in seqs):
        # Not an MSA / inconsistent alignment length
        return {
            "n_sequences": len(seqs),
            "aligned_length": 0,
            "ignore_gaps": ignore_gaps,
            "headers": headers,
            "matrix": [],
            "summary": {"min": 0.0, "max": 0.0, "mean": 0.0},
        }

    n = len(seqs)
    mat: list[list[float]] = [[0.0] * n for _ in range(n)]

    off_diag = []
    for i in range(n):
        mat[i][i] = 100.0
        for j in range(i + 1, n):
            pid = pairwise_pid(seqs[i], seqs[j], ignore_gaps=ignore_gaps)
            mat[i][j] = pid
            mat[j][i] = pid
            off_diag.append(pid)

    if off_diag:
        mn = min(off_diag)
        mx = max(off_diag)
        mean = sum(off_diag) / len(off_diag)
    else:
        mn = mx = mean = 0.0

    return {
        "n_sequences": n,
        "aligned_length": L,
        "ignore_gaps": ignore_gaps,
        "headers": headers,
        "matrix": mat,
        "summary": {"min": mn, "max": mx, "mean": mean},
    }
