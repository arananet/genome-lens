# genome-lens

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white) ![OpenSpec](https://img.shields.io/badge/OpenSpec-enforced-blueviolet) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> AI-powered genomics analysis platform that connects to genome databases via Model Context Protocol

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/arananet/genome-lens.git
cd genome-lens
bash setup.sh

# 2. Install genome database MCP servers (holy-bio-mcp suite)
pip install uv
uvx gget-mcp         # Ensembl, NCBI, UCSC, UniProt, BLAST, AlphaFold
uvx biothings-mcp    # MyGene.info, MyVariant.info, MyChem.info
uvx opengenes-mcp    # Aging/longevity gene database
uvx synergy-age-mcp  # Drug synergy database

# 3. Run tests
pytest
```

---

## Genome Database Agents (MCP)

genome-lens connects to major genomics databases via [Model Context Protocol](https://modelcontextprotocol.io/) servers, configured in `.claude/settings.json`:

| Agent | Databases | Install |
|---|---|---|
| **gget** | Ensembl, NCBI, UCSC, UniProt, BLAST, AlphaFold, COSMIC, CellxGene | `uvx gget-mcp` |
| **biothings** | MyGene.info, MyVariant.info, MyChem.info, MyDisease.info | `uvx biothings-mcp` |
| **opengenes** | OpenGenes (aging/longevity genes) | `uvx opengenes-mcp` |
| **synergy-age** | SynergyAge (drug synergy for longevity) | `uvx synergy-age-mcp` |

All four are part of the [holy-bio-mcp](https://github.com/longevity-genie/holy-bio-mcp) suite — free and open source.

---

## Usage

<!-- TODO: Show the smallest useful example of your project in action. -->

---

## Contributing

This project uses **OpenSpec** for spec-driven development — every feature
or bugfix starts with a spec file under `.openspec/specs/`. Each spec
includes a `roles` block to assign responsibility (`implementer`,
`reviewer`, `qa`, `product_owner`). See
[`docs/OPENSPEC.md`](docs/OPENSPEC.md) for the full workflow, or
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the contributor checklist.

---

## Documentation

| Topic | Where |
|---|---|
| Spec-driven workflow | [`docs/OPENSPEC.md`](docs/OPENSPEC.md) |
| Branch protection setup | [`docs/BRANCH_PROTECTION.md`](docs/BRANCH_PROTECTION.md) |
| Architecture decisions | [`docs/adr/`](docs/adr/) |
| Security policy | [`SECURITY.md`](SECURITY.md) |
| Support channels | [`SUPPORT.md`](SUPPORT.md) |
| Release history | [`CHANGELOG.md`](CHANGELOG.md) |

---

## License

[MIT](LICENSE)

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H51MPWG)
