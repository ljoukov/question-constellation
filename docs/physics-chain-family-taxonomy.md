# Physics Chain Family Taxonomy

Temporary validation draft based on the current 78 active/draft Physics exact
answer chains.

This file is a prompt-validation artifact. It groups current exact chains into
method-shaped chain families and records where a family is cross-topic or still
too local.

## Summary

- Active/draft exact chains reviewed: 78
- Proposed visible families: 9
- Strongest pattern: calculation, input-change effects, measurement/data methods
- Main risk: some recall chains are thin and should not be presented as rich
  reasoning chains

## Families

### 1. Pick The Relationship -> Rearrange -> Calculate

Method pattern: identify quantities -> choose relationship -> convert/rearrange
-> calculate missing value.

Topics represented: electricity, waves, energy, thermal physics, forces, motion,
springs, magnetism.

Chains:

- `physics-chain-wave-equation-calculation`
- `physics-chain-energy-power-time-calculation`
- `physics-chain-specific-heat-capacity-calculation`
- `physics-chain-constant-acceleration-v2-u2-velocity-calculation`
- `physics-chain-magnetic-flux-density-calculation`
- `physics-chain-momentum-equation-calculation`
- `physics-chain-resultant-force-mass-calculation`
- `physics-chain-circuit-power-pd-current-calculation`
- `physics-chain-circuit-power-current-resistance-calculation`
- `physics-chain-work-done-force-distance-calculation`
- `physics-chain-gravitational-potential-energy-calculation`
- `physics-chain-hookes-law-spring-constant-calculation`
- `physics-chain-kinetic-energy-speed-calculation`
- `physics-chain-ohms-law-calculation`
- `physics-chain-spring-elastic-potential-energy-calculation`
- `physics-chain-weight-mass-gravitational-field-strength`
- `physics-chain-spring-elastic-potential-energy-rearrange-extension`
- `physics-chain-latent-heat-change-state-calculation`

Review notes: Strong cross-topic family. Keep exact chains separate because the
formula and unit traps differ, but the learner-facing family is the same method.

### 2. Use Rate, Time, Area, Gradient, Or Repeated Fraction

Method pattern: read a time/rate/area/gradient/fraction relation -> apply it to
the physical quantity -> state the result.

Topics represented: radiation, motion, waves, electricity, graph interpretation.

Chains:

- `physics-chain-half-life-activity-change`
- `physics-chain-thinking-distance-reaction-time`
- `physics-chain-braking-distance-velocity-time-area`
- `physics-chain-period-frequency-calculation`
- `physics-chain-half-life-nuclear-stability`
- `physics-chain-acceleration-change-in-velocity-time`
- `physics-chain-graph-gradient-represents-rate`
- `physics-chain-charge-current-time-calculation`

Review notes: Cross-topic. Some members could also fit the calculation family,
but the repeated hidden step is interpreting a time/rate relation.

### 3. Recall Or Name The Rule, Object, Category, Or Relationship

Method pattern: identify cue -> recall exact rule/name/category -> state it.

Topics represented: electricity, waves, forces, radiation, components, working
scientifically.

Chains:

- `physics-chain-wave-equation-formula-recall`
- `physics-chain-transverse-longitudinal-oscillation-direction`
- `physics-chain-ohms-law-equation-recall`
- `physics-chain-energy-power-time-equation-recall`
- `physics-chain-direct-alternating-pd-direction`
- `physics-chain-momentum-equation-recall`
- `physics-chain-resultant-force-mass-acceleration-equation-recall`
- `physics-chain-elastic-deformation-return-original-length`
- `physics-chain-alpha-particle-composition-recall`
- `physics-chain-peer-review-name-recall`
- `physics-chain-radioactive-decay-random-process`
- `physics-chain-vector-magnitude-direction-scalar-magnitude-only`
- `physics-chain-thermistor-component-recall`

Review notes: Strongly cross-topic, but pedagogically thin. Label as recall-style
so it does not compete with richer chains.

### 4. Change An Input Or Property -> Predict The Output Or Effect

Method pattern: change condition/property -> mechanism changes -> observed
effect changes.

Topics represented: circuits, forces, magnetism, radiation safety, particle
model, thermal physics.

Chains:

- `physics-chain-motor-effect-force-change`
- `physics-chain-resistance-decreases-current-increases`
- `physics-chain-electromagnet-force-increase-controls`
- `physics-chain-resistor-current-pd-direct-proportion`
- `physics-chain-resultant-force-acceleration-proportionality`
- `physics-chain-radiation-dose-reduction-risk`
- `physics-chain-ldr-potential-divider-pd-change`
- `physics-chain-gas-temperature-collisions-pressure`
- `physics-chain-high-thermal-conductivity-faster-transfer`
- `physics-chain-electromagnet-current-switches-magnetism-release`
- `physics-chain-specific-heat-capacity-temperature-change`

Review notes: Strong cross-topic family. Good example of the intended learner
benefit.

### 5. Trace A Path Through A System -> Explain Transfer, Loss, Or Safety

Method pattern: follow current/waves/energy/radiation through a system -> locate
transfer, loss, detection, or protection -> explain outcome.

Topics represented: grid electricity, circuits, radio waves, radiation, energy
stores, thermal balance.

Chains:

- `physics-chain-grid-transformer-efficiency`
- `physics-chain-radio-wave-signal-transfer`
- `physics-chain-earth-wire-fault-current-safety`
- `physics-chain-count-rate-less-than-activity`
- `physics-chain-parallel-resistance-less-than-smallest`
- `physics-chain-fuel-heating-energy-store-changes`
- `physics-chain-spring-elastic-energy-to-height`
- `physics-chain-steady-temperature-rate-balance`

Review notes: Cross-topic. `parallel-resistance-less-than-smallest` is the
least obvious fit, but it follows the same path-through-system logic.

### 6. Test, Configuration, Or Result -> Infer Behaviour Or Identity

Method pattern: observe setup/result -> map to known behaviour -> infer property,
component, or direction.

Topics represented: radiation, circuits, magnetism, practical setup.

Chains:

- `physics-chain-radiation-absorber-inference`
- `physics-chain-led-one-way-current`
- `physics-chain-meter-series-parallel-placement`
- `physics-chain-reverse-connections-negative-current-pd`
- `physics-chain-permanent-magnet-repulsion-test`

Review notes: Medium cross-topic. Keep separate from recall because these chains
use a result or configuration, not just a name cue.

### 7. Resultant Interaction -> Motion Outcome

Method pattern: identify resultant force or interaction -> infer acceleration,
deceleration, or constant motion.

Topics represented: forces, motion, drag, terminal velocity.

Chains:

- `physics-chain-resistive-force-terminal-motion`
- `physics-chain-opposing-force-causes-deceleration`
- `physics-chain-zero-resultant-force-constant-motion`

Review notes: Local but method-shaped. Could merge with family 4 if the visible
family count needs to shrink.

### 8. Balance Or Conserve Counted Quantities

Method pattern: compare before and after -> conserve count, charge, particles, or
momentum -> complete outcome.

Topics represented: momentum, circuits, nuclear equations.

Chains:

- `physics-chain-collision-momentum-conservation-qualitative`
- `physics-chain-parallel-current-sharing-addition`
- `physics-chain-beta-emission-nuclear-equation-balancing`
- `physics-chain-alpha-decay-equation-balancing`

Review notes: Strong cross-topic family despite small size. This is a good
example of family crossing topic boundaries.

### 9. Measurement, Error, Or Control Choice -> Valid Result

Method pattern: choose measurement/control/correction -> reduce error or make
comparison valid -> obtain usable result.

Topics represented: working scientifically, springs, waves, forces, graph/data
work.

Chains:

- `physics-chain-half-range-uncertainty-calculation`
- `physics-chain-spring-length-change-measurement`
- `physics-chain-ripple-wavelength-multiple-waves-scale-divide`
- `physics-chain-eye-level-reduces-parallax-error`
- `physics-chain-zero-offset-correction`
- `physics-chain-plot-data-line-best-fit`
- `physics-chain-trolley-acceleration-investigation-method`
- `physics-chain-control-variable-valid-comparison`

Review notes: Strong cross-topic method family. Consider splitting graph/data
into a secondary family only if it grows substantially.

## Cross-Topic Notes

Most exact Physics chains remain topic-local because exact mark schemes are
specific. Cross-topic transfer appears mainly at the family layer.

Clearly cross-topic exact chains include:

- `physics-chain-energy-power-time-calculation`
- `physics-chain-energy-power-time-equation-recall`
- `physics-chain-work-done-force-distance-calculation`
- `physics-chain-spring-elastic-energy-to-height`
- `physics-chain-steady-temperature-rate-balance`
- `physics-chain-graph-gradient-represents-rate`
- `physics-chain-plot-data-line-best-fit`
- `physics-chain-zero-offset-correction`
- `physics-chain-eye-level-reduces-parallax-error`
- `physics-chain-half-range-uncertainty-calculation`
- `physics-chain-control-variable-valid-comparison`
- `physics-chain-motor-effect-force-change`
- `physics-chain-magnetic-flux-density-calculation`
- `physics-chain-electromagnet-force-increase-controls`
- `physics-chain-radiation-dose-reduction-risk`

Methodology update from this subject: do not force the taxonomy up to 12-15
families. Physics currently reads cleaner as 9 method families.
