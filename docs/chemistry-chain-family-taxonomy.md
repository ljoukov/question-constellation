# Chemistry Chain Family Taxonomy

Temporary validation draft based on the current 93 active/draft Chemistry exact
answer chains.

The stored topic metadata is mostly `Unknown`, so this taxonomy is based on
chain titles and method shape.

## Summary

- Active/draft exact chains reviewed: 93
- Proposed visible families: 10
- Strongest patterns: particle mechanism, practical sequence, evidence tests,
  quantitative conversion, equation balancing
- Main risk: some organic, acid, and environmental chains can collapse into
  topic buckets unless they are named by method

## Families

### 1. Particle Structure Or Bonding -> Macroscopic Property

Method pattern: particle/structure feature -> force or mobility mechanism ->
observed material property.

Topics represented: bonding, structure, metals, alloys, ionic compounds,
molecular substances, hydrocarbons.

Chains:

- `chem-chain-alloy-hardness-distorted-layers`
- `chem-chain-delocalised-electrons-electrical-conduction`
- `chem-chain-larger-molecules-stronger-intermolecular-forces-higher-boiling-point`
- `chem-chain-ionic-lattice-high-melting-point`
- `chem-chain-simple-molecular-low-melting-boiling-point`
- `chem-chain-metal-thermal-conduction-delocalised-electrons`
- `chem-chain-ionic-conduction-mobile-ions`
- `chem-chain-more-carbon-atoms-higher-viscosity`

Review notes: Strong method family. It crosses several chemistry topics while
preserving the same particle-to-property reasoning.

### 2. Condition Change -> Collision, Energy, Or Equilibrium Effect

Method pattern: change condition -> particle collisions/energy or equilibrium
response -> rate/yield/position changes.

Topics represented: rates, equilibrium, acids, catalysis.

Chains:

- `chem-chain-temperature-rate-particle-collisions`
- `chem-chain-concentration-particles-collision-frequency-rate`
- `chem-chain-equilibrium-closed-system-equal-rates`
- `chem-chain-equilibrium-pressure-fewer-gas-moles`
- `chem-chain-equilibrium-temperature-exothermic-shifts-endothermic`
- `chem-chain-catalyst-lower-activation-energy`
- `chem-chain-catalyst-no-equilibrium-position-change`
- `chem-chain-equilibrium-concentration-shift-to-oppose-change`
- `chem-chain-alkali-plus-acid-excess-ph-high-to-low`

Review notes: Medium cross-topic. Equilibrium and rates should remain exact
chains, but the family is the shared condition-change method.

### 3. Evidence, Test, Or Observation -> Identify Substance Or Class

Method pattern: perform or read a test -> observe result -> identify substance,
ion, gas, class, or purity.

Topics represented: chemical tests, chromatography, organic chemistry, acids,
purity, flame tests.

Chains:

- `chem-chain-alkene-bromine-water-test`
- `chem-chain-oxygen-gas-glowing-splint-relights`
- `chem-chain-chlorine-damp-litmus-bleached`
- `chem-chain-pure-water-boiling-freezing-test`
- `chem-chain-hydrogen-lit-splint-squeaky-pop`
- `chem-chain-carbon-dioxide-limewater-presence-absence`
- `chem-chain-chromatography-mixture-multiple-spots`
- `chem-chain-chromatography-identify-by-known-rf`
- `chem-chain-acidic-solution-indicator-red`
- `chem-chain-sodium-burning-yellow-flame-white-solid`
- `chem-chain-carbonate-acid-observations-excess`

Review notes: Strong method family. It is not a chemical-tests topic bucket
because chromatography, indicators, gases, and reaction observations all use the
same evidence-to-identity move.

### 4. Practical Sequence -> Separate, Purify, Extract, Or Prepare

Method pattern: choose ordered method steps -> separate/remove/collect material
-> obtain useful product or valid sample.

Topics represented: fractional distillation, salts, chromatography, potable
water, extraction, electrolysis, practical preparation.

Chains:

- `chem-chain-crude-oil-fractional-distillation`
- `chem-chain-dissolved-solids-evaporate-constant-mass`
- `chem-chain-chromatography-insoluble-does-not-move`
- `chem-chain-filtration-remove-excess-solid-from-salt-solution`
- `chem-chain-salt-solution-heat-cool-crystallise`
- `chem-chain-chromatography-different-solubilities-move-different-distances`
- `chem-chain-groundwater-filter-sterilise-potable`
- `chem-chain-filter-then-crystallise-soluble-salt`
- `chem-chain-phytomining-plants-burned-to-ash`
- `chem-chain-copper-from-solution-displacement-electrolysis`
- `chem-chain-desalination-distillation-energy-cost`
- `chem-chain-above-carbon-electrolysis-molten-compound`

Review notes: Strong cross-topic family. `desalination-distillation-energy-cost`
has an evaluation tail but still fits the method sequence.

### 5. Reaction Description -> Products, Observations, Or Consequences

Method pattern: identify reaction context -> infer products/observations ->
state consequence.

Topics represented: acids, combustion, pollution, electrolysis, extraction,
atmosphere.

Chains:

- `chem-chain-acid-base-reaction-neutralisation`
- `chem-chain-excess-insoluble-solid-all-acid-reacted`
- `chem-chain-gas-product-escapes-mass-decreases`
- `chem-chain-aluminium-carbon-anode-reacts-with-oxygen`
- `chem-chain-crude-oil-formation-plankton-burial-compression-time`
- `chem-chain-cracking-smaller-useful-products`
- `chem-chain-greenhouse-effect-radiation-trapping`
- `chem-chain-nitrogen-oxides-high-temperature-engine`
- `chem-chain-pollutant-gases-acid-rain-respiratory-problems`
- `chem-chain-sulfur-in-fuel-sulfur-dioxide-acid-rain`
- `chem-chain-limited-oxygen-incomplete-combustion-products`
- `chem-chain-temperature-returns-by-energy-transfer-surroundings`

Review notes: Medium family. Watch for becoming a leftover bucket. Keep only
when the chain is a reaction context leading to observable or applied outcome.

### 6. Amount Relationship -> Convert, Scale, Or Calculate

Method pattern: identify quantities -> convert units or representation -> use
ratio/mean/percentage/moles relation -> calculate result.

Topics represented: quantitative chemistry, concentration, bond energies,
chromatography, isotope abundance, uncertainty.

Chains:

- `chem-chain-concentration-mass-volume-unit-conversion`
- `chem-chain-element-percentage-by-mass-from-mr`
- `chem-chain-percentage-of-total-mass-to-component-mass`
- `chem-chain-missing-value-from-mean`
- `chem-chain-bond-energy-unknown-from-energy-change`
- `chem-chain-stoichiometric-mass-from-moles-and-ratio`
- `chem-chain-chromatography-rf-relationship`
- `chem-chain-isotope-abundance-weighted-mean-ar`
- `chem-chain-avogadro-particles-moles-conversion`
- `chem-chain-compound-mass-mr-to-moles`
- `chem-chain-smaller-reading-larger-percentage-uncertainty`
- `chem-chain-limiting-or-excess-reactant-moles-ratio-product-amount`
- `chem-chain-ph-change-factor-ten`

Review notes: Strong cross-topic family. Exact chains should remain separate
because the calculation traps are different.

### 7. Formula, Equation, Or Symbol Representation -> Complete Correct Form

Method pattern: read names, charges, displayed structures, or reaction statement
-> construct formula/equation/symbol -> balance or check conservation.

Topics represented: ionic formulae, half-equations, hydrocarbons, state symbols,
combustion, cracking, covalent structures.

Chains:

- `chem-chain-metal-ion-reduction-half-equation`
- `chem-chain-chloride-oxidation-half-equation`
- `chem-chain-cracking-equation-atom-balance`
- `chem-chain-hydrocarbon-combustion-equation-balance`
- `chem-chain-oxidation-electron-loss-half-equation`
- `chem-chain-ion-charges-neutral-formula`
- `chem-chain-displayed-molecule-count-atoms-formula`
- `chem-chain-supplied-general-formula-to-molecular-formula`
- `chem-chain-complete-symbol-equation-product-formulae-then-balance`
- `chem-chain-covalent-dot-cross-shared-and-nonbonding-electrons`
- `chem-chain-aqueous-solution-state-symbol-aq`
- `chem-chain-non-aqueous-state-symbol-from-physical-state`

Review notes: Strong method family. This is better than separate topic families
for half-equations, hydrocarbons, and state symbols.

### 8. Atomic Structure Or Ion Formation -> Reactivity Or Compound Formation

Method pattern: electron shells/charges/ionisation -> ease of electron transfer
or ion formation -> reactivity/compound outcome.

Topics represented: periodic table, ionic bonding, acids, redox.

Chains:

- `chem-chain-group-7-smaller-atom-stronger-attraction-electron-gain`
- `chem-chain-group-1-more-shells-weaker-attraction-electron-loss`
- `chem-chain-ionic-compound-electron-transfer-ion-ratio`
- `chem-chain-strong-acid-complete-ionisation`

Review notes: Local-to-medium. `oxidation-electron-loss-half-equation` also
fits family 7; keep primary assignment in family 7 if one primary is required.

### 9. Data, Graph, Or Practical Variable -> Valid Interpretation

Method pattern: read data/graph/practical design -> identify rate, variable,
trend, or uncertainty -> state supported interpretation.

Topics represented: rates, graph work, practical design, energy changes.

Chains:

- `chem-chain-rate-from-graph-gradient-tangent`
- `chem-chain-plot-table-data-line-best-fit`
- `chem-chain-dependent-variable-temperature-change`
- `chem-chain-acid-carbonate-gas-collection-method`
- `chem-chain-rate-decreases-as-reaction-progresses-graph`
- `chem-chain-exothermic-reaction-profile-products-lower`

Review notes: Cross-topic but overlaps with families 2 and 6. Use as a primary
family only when the hidden link is data/practical interpretation or reading a
representation rather than the chemistry mechanism.

### 10. Recall Or Name A Category, Formula Family, Or Accepted Effect

Method pattern: identify cue -> recall exact term, family, category, or accepted
effect.

Topics represented: organic chemistry, formulations, state symbols, enzymes,
climate effects.

Chains:

- `chem-chain-hydrocarbon-carbon-hydrogen-only`
- `chem-chain-alkane-general-formula-cnh2n-plus-2`
- `chem-chain-three-carbon-alkane-propane`
- `chem-chain-formulation-mixture-useful-product`
- `chem-chain-biological-catalyst-enzyme-name`
- `chem-chain-global-climate-change-effects-exact-recall`

Review notes: Thin recall family. Some members could move to family 7 if the
task requires constructing a formula rather than naming one.

## Assignment Caveats

Some chains naturally have a primary and secondary family:

- `chem-chain-rate-decreases-as-reaction-progresses-graph`: condition/rate
  family plus data/graph family.
- `chem-chain-oxidation-electron-loss-half-equation`: representation family plus
  electron-transfer family.
- `chem-chain-smaller-reading-larger-percentage-uncertainty`: calculation family
  plus data/practical validity family.
- `chem-chain-desalination-distillation-energy-cost`: practical sequence plus
  evaluation of energy cost.

Methodology update from this subject: Chemistry benefits from separating
`particle mechanism -> property` from `condition change -> rate/equilibrium`.
Those look topic-adjacent but train different missing links.
