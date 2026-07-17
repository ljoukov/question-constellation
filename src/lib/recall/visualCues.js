/**
 * Native emoji that are familiar enough to act as quick visual landmarks for
 * GCSE science cards. The list intentionally excludes correctness symbols,
 * flags, text/number emoji and multi-emoji compositions.
 */
export const approvedRecallVisualCues = Object.freeze([
	'🔬',
	'🧫',
	'🧬',
	'🫀',
	'🫁',
	'🦠',
	'💉',
	'💊',
	'🌿',
	'🍃',
	'🍄',
	'🦋',
	'🌍',
	'🌡️',
	'💧',
	'💨',
	'🏃',
	'🏋️',
	'⚛️',
	'🔗',
	'⚖️',
	'🧪',
	'🧂',
	'🔥',
	'⚡',
	'🧊',
	'⏱️',
	'⛽',
	'📏',
	'🫧',
	'♻️',
	'⚙️',
	'🔌',
	'🔋',
	'📈',
	'🔀',
	'☢️',
	'🏎️',
	'🎳',
	'🚗',
	'🌊',
	'🌈',
	'🧲',
	'🌌',
	'🏔️',
	'💻',
	'🧮',
	'🔐',
	'🗄️',
	'🌐',
	'🧩',
	'🗺️',
	'🌋',
	'🌪️',
	'🏙️',
	'🌳',
	'🏭',
	'🏛️',
	'👑',
	'🗳️',
	'⚔️',
	'📜',
	'🚂',
	'⏳',
	'✍️',
	'🔎',
	'💬',
	'📖',
	'🎭',
	'🧭',
	'🧵',
	'🪞',
	'🌹',
	'🌙',
	'🗝️',
	'📘'
]);

/**
 * A generated card only sees the cues for its own subject. This prevents a
 * syntactically valid but irrelevant cue from slipping through the importer.
 * Subject membership is deliberately only the first safety check; the
 * complete card still needs the semantic review defined by the generation
 * prompt before it is stored.
 */
export const approvedRecallVisualCuesBySubject = Object.freeze({
	Biology: Object.freeze([
		'🔬',
		'🧫',
		'🧬',
		'🫀',
		'🫁',
		'🦠',
		'💉',
		'💊',
		'🌿',
		'🍃',
		'🍄',
		'🦋',
		'🌍',
		'🌡️',
		'💧',
		'💨',
		'🏃',
		'🏋️',
		'🧪',
		'📘'
	]),
	Chemistry: Object.freeze([
		'⚛️',
		'🔗',
		'⚖️',
		'🧪',
		'🧂',
		'🔥',
		'⚡',
		'🧊',
		'⏱️',
		'⛽',
		'📏',
		'🫧',
		'♻️',
		'🌡️',
		'📘'
	]),
	Physics: Object.freeze([
		'⚙️',
		'⚡',
		'🔗',
		'🔌',
		'🔋',
		'📈',
		'🔀',
		'☢️',
		'🏃',
		'🏋️',
		'🏎️',
		'🎳',
		'🚗',
		'🌊',
		'🌈',
		'🧲',
		'🌌',
		'🏔️',
		'⚛️',
		'⚖️',
		'🌡️',
		'📘'
	]),
	'Computer Science': Object.freeze(['💻', '🧮', '🔐', '🗄️', '🌐', '🧩', '🔀', '📈', '📘']),
	Geography: Object.freeze(['🗺️', '🌍', '🌋', '🌪️', '🌊', '🏙️', '🌳', '🏭', '🏔️', '♻️', '📘']),
	History: Object.freeze(['🏛️', '👑', '🗳️', '⚔️', '📜', '🚂', '🏭', '⏳', '📘']),
	'English Language': Object.freeze(['✍️', '🔎', '💬', '📖', '🎭', '🧩', '📘']),
	'English Literature': Object.freeze([
		'📖',
		'🧭',
		'🧵',
		'🎭',
		'💬',
		'🔎',
		'🪞',
		'⚖️',
		'👑',
		'🌹',
		'🔥',
		'🌙',
		'⏳',
		'🏛️',
		'🗝️',
		'📘'
	])
});

const approvedRecallVisualCueSet = new Set(approvedRecallVisualCues);
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** @param {string} value */
export function isSingleGrapheme(value) {
	return [...graphemeSegmenter.segment(value.trim())].length === 1;
}

/** @param {unknown} value */
export function isApprovedRecallVisualCue(value) {
	return (
		typeof value === 'string' &&
		value === value.trim() &&
		isSingleGrapheme(value) &&
		approvedRecallVisualCueSet.has(value)
	);
}

/** @param {unknown} value @param {unknown} subject */
export function isApprovedRecallVisualCueForSubject(value, subject) {
	if (typeof subject !== 'string' || !Object.hasOwn(approvedRecallVisualCuesBySubject, subject)) {
		return false;
	}
	return (
		isApprovedRecallVisualCue(value) &&
		approvedRecallVisualCuesBySubject[
			/** @type {keyof typeof approvedRecallVisualCuesBySubject} */ (subject)
		].includes(/** @type {string} */ (value))
	);
}

/**
 * Curated backfill for the original hand-authored deck. Each cue identifies
 * the card's broad scientific context without disclosing the tested answer.
 */
export const recallVisualCueById = Object.freeze({
	'bio-eukaryote-prokaryote': '🧫',
	'bio-nucleus-function': '🔬',
	'bio-mitochondria-function': '🧫',
	'bio-ribosome-function': '🧫',
	'bio-chloroplast-function': '🔬',
	'bio-stem-cell-definition': '🧫',
	'bio-diffusion-definition': '💨',
	'bio-osmosis-definition': '🔬',
	'bio-active-transport-definition': '🔬',
	'bio-enzyme-definition': '🔬',
	'bio-coronary-heart-disease': '🫀',
	'bio-vaccination-memory-cells': '💉',
	'bio-antibiotics-vs-painkillers': '💊',
	'bio-aerobic-respiration-equation': '🔬',
	'bio-anaerobic-respiration-muscles': '🏋️',
	'bio-photosynthesis-equation': '🌿',
	'bio-transpiration-definition': '🔬',
	'bio-homeostasis-definition': '🔬',
	'bio-hormone-definition': '🔬',
	'bio-meiosis-purpose': '🔬',
	'bio-genotype-phenotype': '🧬',
	'bio-natural-selection-steps': '🦋',
	'bio-biodiversity-definition': '🔬',
	'bio-decomposers-role': '🔬',
	'chem-atom-definition': '⚛️',
	'chem-isotope-definition': '🧪',
	'chem-subatomic-charges': '⚛️',
	'chem-mixture-definition': '🧪',
	'chem-ionic-bonding': '🔗',
	'chem-covalent-bonding': '🔗',
	'chem-metallic-bonding': '🔗',
	'chem-moles-mass-mr': '⚖️',
	'chem-concentration-mass-volume': '⚖️',
	'chem-group-one-reactivity': '🔥',
	'chem-electrolysis-definition': '🧪',
	'chem-neutralisation-products': '🧪',
	'chem-soluble-salt-method': '🧂',
	'chem-exothermic-definition': '🧪',
	'chem-endothermic-definition': '🧪',
	'chem-temperature-rate': '🌡️',
	'chem-catalyst-definition': '🧪',
	'chem-alkane-general-formula': '⛽',
	'chem-alkene-bromine-water': '🧪',
	'chem-chromatography-rf': '🧪',
	'chem-flame-test-lithium': '🔥',
	'chem-carbon-dioxide-test': '🧪',
	'chem-life-cycle-assessment': '🧪',
	'phys-scalar-vector': '⚙️',
	'phys-kinetic-energy-equation': '⚙️',
	'phys-gpe-equation': '⚙️',
	'phys-power-equation': '⚡',
	'phys-efficiency-equation': '⚙️',
	'phys-current-equation': '🔌',
	'phys-potential-difference-definition': '⚙️',
	'phys-resistance-equation': '🔌',
	'phys-iv-characteristics-practical': '📈',
	'phys-ohmic-conductor': '🔌',
	'phys-series-current': '🔗',
	'phys-parallel-pd': '🔀',
	'phys-density-equation': '⚙️',
	'phys-specific-heat-capacity-equation': '⚙️',
	'phys-specific-latent-heat-equation': '🌡️',
	'phys-isotope-definition': '⚙️',
	'phys-half-life-definition': '⚙️',
	'phys-resultant-force-equation': '⚙️',
	'phys-force-unit': '🏋️',
	'phys-weight-equation': '⚙️',
	'phys-acceleration-equation': '🏎️',
	'phys-momentum-equation': '⚙️',
	'phys-stopping-distance': '🚗',
	'phys-frequency-definition': '⚙️',
	'phys-wave-speed-equation': '⚙️',
	'phys-electromagnetic-spectrum-order': '🌈',
	'phys-magnetic-field-wire': '🔌',
	'phys-transformer-purpose': '⚙️',
	'phys-red-shift': '🌌'
});

/** @param {string} cardId */
export function recallVisualCueFor(cardId) {
	const visualCue = /** @type {Record<string, string>} */ (recallVisualCueById)[cardId];
	if (!visualCue) throw new Error(`Missing visual cue for recall card ${cardId}`);
	return visualCue;
}
