# Standards in Motion — Content Studio

Plain HTML/CSS/JS authoring studio for Mandarin Oriental **reel-style training series**.
No build step, no framework — open `index.html` and work.

## What's inside

| Page | Purpose |
|---|---|
| `index.html` | Content Studio home |
| `reels.html` | Reel library — every series, Quick Start test course, xAPI reporting |
| `editor.html` | Reel Studio editor — author reels, knowledge checks, assessments |
| `player.html` | Runtime player (bundled into every exported package) |

## Key features

- **Author once, export twice** — SCORM 1.2 or xAPI (Tin Can) packages, Docebo-ready.
- **Knowledge checks + final assessments** with pass marks, retry modes, per-question timing.
- **xAPI reporting lane** — pulls statements from the Docebo LRS, flattens them into a
  47-column CSV (username, course name, per-question duration, score, raw JSON, …).
- **Supabase cloud lane** — sign-in gate, per-owner course saves (RLS), assessment-row
  telemetry, and versioned package history (`sim-packages` bucket).
- **Multilingual publish** — English source auto-translated into 4 languages at publish time.

## Supabase setup

Run `supabase_sim_migration.sql` (repo root) once in the Supabase SQL Editor.
It creates **only** `sim_`-prefixed objects (`sim_courses`, `sim_assessment_rows`,
`sim_package_versions`, the `sim-packages` bucket) with owner-scoped RLS — nothing
else in the project is touched.

Auth is email/password (Supabase Auth). Authors need accounts created by an admin
in the Supabase dashboard (Authentication → Users).

## Runtime notes

- All script tags carry `?v=` cache-bust stamps — bump them when the JS changes.
- Exported packages embed the runtime files fetched with `cache:"no-store"`, so a
  package always contains the current player code.
- The xAPI launcher normalises Docebo's array-wrapped actor fields before sending
  statements (Docebo's own LRS rejects its own launch format otherwise).
