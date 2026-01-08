# backend/utils/pdb.py
from __future__ import annotations

from pathlib import Path


def parse_pdb_positions(path: Path) -> dict:
    """
    From a PDB, build per-chain stats based on ATOM/HETATM residue records.
    length = count of distinct residue numbers per chain.
    """
    chain_resis: dict[str, set[int]] = {}
    chain_cys: dict[str, set[int]] = {}
    chain_lys: dict[str, set[int]] = {}

    with open(path) as f:
        for line in f:
            if not (line.startswith("ATOM") or line.startswith("HETATM")):
                continue
            resn = line[17:20].strip().upper()
            chain = (line[21] or "_").strip() or "_"
            try:
                resi = int(line[22:26])
            except ValueError:
                continue

            chain_resis.setdefault(chain, set()).add(resi)
            if resn == "CYS":
                chain_cys.setdefault(chain, set()).add(resi)
            elif resn == "LYS":
                chain_lys.setdefault(chain, set()).add(resi)

    chains = []
    for ch in sorted(chain_resis.keys()):
        resis = chain_resis[ch]
        chains.append(
            {
                "id": ch,
                "length": len(resis),
                "cysteines": sorted(chain_cys.get(ch, set())),
                "lysines": sorted(chain_lys.get(ch, set())),
            }
        )

    totals = {
        "length": sum(c["length"] for c in chains),
        "cysteines": sum(len(c["cysteines"]) for c in chains),
        "lysines": sum(len(c["lysines"]) for c in chains),
    }
    return {"chains": chains, "totals": totals}
