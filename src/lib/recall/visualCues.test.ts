import { describe, expect, it } from 'vitest';

import { recallCards } from './aqaScienceRecall';
import {
	approvedRecallVisualCues,
	approvedRecallVisualCuesBySubject,
	isApprovedRecallVisualCue,
	isApprovedRecallVisualCueForSubject,
	isSingleGrapheme,
	recallVisualCueById
} from './visualCues.js';

describe('recall card visual cues', () => {
	it('gives every current card exactly one approved visual cue', () => {
		expect(Object.keys(recallVisualCueById)).toHaveLength(recallCards.length);

		for (const card of recallCards) {
			expect(isSingleGrapheme(card.visualCue), `${card.id} must use one grapheme`).toBe(true);
			expect(isApprovedRecallVisualCue(card.visualCue), `${card.id} uses an unapproved cue`).toBe(
				true
			);
			expect(recallVisualCueById[card.id as keyof typeof recallVisualCueById]).toBe(card.visualCue);
		}
	});

	it('rejects visual cues that are words, pairs, correctness signals or outside the allowlist', () => {
		expect(isApprovedRecallVisualCue('heart')).toBe(false);
		expect(isApprovedRecallVisualCue('🫀 🔬')).toBe(false);
		expect(isApprovedRecallVisualCue('✅')).toBe(false);
		expect(isApprovedRecallVisualCue('❓')).toBe(false);
		expect(isApprovedRecallVisualCue('🧠')).toBe(false);
		expect(new Set(approvedRecallVisualCues).size).toBe(approvedRecallVisualCues.length);
	});

	it('only accepts cues from the generated card subject allowlist', () => {
		expect(isApprovedRecallVisualCueForSubject('🫀', 'Biology')).toBe(true);
		expect(isApprovedRecallVisualCueForSubject('🫀', 'Physics')).toBe(false);
		expect(isApprovedRecallVisualCueForSubject('🧲', 'Physics')).toBe(true);
		expect(isApprovedRecallVisualCueForSubject('🧲', 'Chemistry')).toBe(false);
		expect(isApprovedRecallVisualCueForSubject('🧪', 'Chemistry')).toBe(true);
		expect(isApprovedRecallVisualCueForSubject('🧪', 'Unknown')).toBe(false);
		expect(isApprovedRecallVisualCueForSubject('📘', 'Biology')).toBe(true);
		expect(isApprovedRecallVisualCueForSubject('📘', 'Chemistry')).toBe(true);
		expect(isApprovedRecallVisualCueForSubject('📘', 'Physics')).toBe(true);
		expect(isApprovedRecallVisualCueForSubject('📘', 'constructor')).toBe(false);
		expect(isApprovedRecallVisualCueForSubject('📘', '__proto__')).toBe(false);
		for (const cues of Object.values(approvedRecallVisualCuesBySubject)) {
			for (const cue of cues) expect(isApprovedRecallVisualCue(cue)).toBe(true);
		}
	});

	it('uses broad fallbacks where a literal cue would disclose or narrow the answer', () => {
		const expectedFallbacks = {
			'bio-nucleus-function': '🔬',
			'bio-chloroplast-function': '🔬',
			'bio-stem-cell-definition': '🔬',
			'bio-osmosis-definition': '🔬',
			'bio-enzyme-definition': '🔬',
			'bio-aerobic-respiration-equation': '🔬',
			'bio-anaerobic-respiration-muscles': '🔬',
			'bio-photosynthesis-equation': '🔬',
			'bio-transpiration-definition': '🔬',
			'bio-homeostasis-definition': '🔬',
			'bio-meiosis-purpose': '🔬',
			'bio-natural-selection-steps': '🔬',
			'bio-biodiversity-definition': '🔬',
			'bio-decomposers-role': '🔬',
			'chem-isotope-definition': '🧪',
			'chem-electrolysis-definition': '🧪',
			'chem-chromatography-rf': '🧪',
			'chem-carbon-dioxide-test': '🧪',
			'chem-life-cycle-assessment': '🧪',
			'phys-kinetic-energy-equation': '⚙️',
			'phys-gpe-equation': '⚙️',
			'phys-potential-difference-definition': '⚙️',
			'phys-density-equation': '⚙️',
			'phys-specific-heat-capacity-equation': '⚙️',
			'phys-isotope-definition': '⚙️',
			'phys-half-life-definition': '⚙️',
			'phys-resultant-force-equation': '⚙️',
			'phys-weight-equation': '⚙️',
			'phys-momentum-equation': '⚙️',
			'phys-frequency-definition': '⚙️',
			'phys-wave-speed-equation': '⚙️',
			'phys-magnetic-field-wire': '🔌',
			'phys-transformer-purpose': '⚙️'
		} as const;

		for (const [id, cue] of Object.entries(expectedFallbacks)) {
			expect(recallVisualCueById[id as keyof typeof recallVisualCueById], id).toBe(cue);
		}
	});
});
