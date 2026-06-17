# Rollo Documentation Index

Official project documentation lives in this folder.

| Document | Description |
|----------|-------------|
| [**APP-STRUCTURE.md**](./APP-STRUCTURE.md) | Complete application architecture, features, data model, APIs, deployment modes (PWA, Windows EXE, Android APK), Syncthing layout, multi-server hub, and dynamic UI patterns |
| [**ISSUES-AND-ENHANCEMENTS.md**](./ISSUES-AND-ENHANCEMENTS.md) | Full historical backlog: bugs, security notes, technical debt, UX ideas, and roadmap |
| [**ISSUES-REMAINING.md**](./ISSUES-REMAINING.md) | **Open work only** — prioritized list of what is still not done (excludes fixes through `7ac44fe`) |

## Quick links

- [Run locally](../README.md) — `npm start` on port 3847
- [Android build](../android/README.md) — APK with embedded Node.js
- [Graphify](../graphify-out/) — knowledge graph (generated; see below)

## Graphify

This repo supports [Graphify](https://github.com/safishamsi/graphifyy) for codebase knowledge graphs:

```bash
npm run graphify          # full build → graphify-out/
npm run graphify:update   # incremental after doc/code changes
npm run graphify:query -- "How does multi-server probing work?"
```

Outputs: `graphify-out/graph.html`, `GRAPH_REPORT.md`, `graph.json`.

The `docs/` folder is included in the graph corpus so architecture and issue notes are queryable alongside source code.
