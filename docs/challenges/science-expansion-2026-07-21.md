# Science challenge expansion — 21 July 2026

## Scope

This cohort adds 20 independently addressable challenges to each science subject:

| Subject   | Existing |  Added | Published total | Question contexts |
| --------- | -------: | -----: | --------------: | ----------------: |
| Biology   |       10 |     20 |              30 |                60 |
| Chemistry |       10 |     20 |              30 |                60 |
| Physics   |       12 |     20 |              32 |                64 |
| **Total** |   **32** | **60** |          **92** |           **184** |

The catalogue, route-identity catalogue, curriculum registry, visuals registry, and challenge sitemap
are generated from the same 92 definitions. The challenge sitemap contains 96 URLs: the main hub,
three subject hubs, and 92 challenge leaves.

## Curriculum and content review

Every new id has an explicit reviewed AQA reference in
`src/lib/server/challengeCurriculum.ts`; there is no subject-wide fallback. Coverage includes exact
Combined Science or separate-science statements for cell structure, working scientifically, enzyme
action, food tests, IVF, vaccination, homeostasis, blood-glucose control, inheritance, bonding,
quantitative chemistry, electrolysis, energetics, analysis, equilibrium, life-cycle assessment,
particle pressure, uncertainty, forces, circuits, momentum, radiation, and thermal transfer.

An independent science-content review checked all 60 new definitions for scientific correctness,
calculation and unit accuracy, curriculum fit, answer logic, feedback, and transfer independence.
Corrections from that review included:

- replacing optional plasmids with guaranteed prokaryote contrasts;
- naming Benedict's as a reducing-sugar test rather than a glucose-specific test;
- filtering natural-water samples and using a complete heat–cool–weigh constant-mass cycle;
- preserving Chemistry LaTeX commands through TypeScript string parsing; and
- describing alloy hardness as resistance to permanent bending rather than elastic rigidity.

## Transfer-solvability policy

All 60 new follow-up problems are text-only and self-contained. The two existing follow-ups that
referred to an unseen diagram or graph were rewritten with the necessary facts in the prompt.

`contentValidation.test.ts` now rejects:

- a visual reference without real reviewed transfer artwork;
- transfer artwork without alt text or intrinsic dimensions; and
- drawing, plotting, sketching, shading, or labelling tasks unsupported by the renderer.

When a future transfer genuinely assesses visual reading, authors must use the reviewed light/dark
illustration workflow in `docs/challenge-illustrations/README.md` and inspect the actual rendered
transfer stage at phone and desktop widths.

## Release evidence

- Challenge suite: 46 tests passed.
- Full suite: 179 files and 1,122 tests passed.
- Svelte diagnostics: 0 errors and 0 warnings.
- Production Vite/Cloudflare build: passed.
- Sitemap crawl: seven sections, 4,255 URLs, and 96 challenge URLs passed locally.
- Browser route matrix: 24 desktop/mobile and light/dark cases passed with no console, layout, or
  horizontal-overflow failures.
- Full transfer playthroughs: the repaired Biology challenge plus new Biology, Chemistry, and Physics
  challenges were completed through the final follow-up stage on a narrow mobile viewport.

No database or object-store write is required for this authored catalogue cohort.
