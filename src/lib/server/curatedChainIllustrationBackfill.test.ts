import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	APPROVED_CURATED_CHAIN_IDS,
	curatedDecisionFor,
	parseLightFileArgs,
	selectApprovedManifestEntries,
	validateCuratedJudgeCoverage,
	validateHistoricalBaselineWaiver,
	validateHistoricalPrompt
} from '../../../scripts/lib/curated-chain-illustration-backfill.mjs';

const rootDir = process.cwd();
const manifest = JSON.parse(
	readFileSync(path.join(rootDir, 'docs/chain-illustrations/manifest.json'), 'utf8')
);

describe('curated historical illustration theme-pair backfill', () => {
	it('is hard-limited to the three approved historical dark assets', () => {
		const entries = selectApprovedManifestEntries(manifest, APPROVED_CURATED_CHAIN_IDS);
		expect(entries.map((entry) => entry.answerChainId)).toEqual(APPROVED_CURATED_CHAIN_IDS);
		expect(
			entries.find((entry) => entry.answerChainId === 'physics-chain-grid-transformer-efficiency')
				?.sourceQuestionId
		).toBe('8464p1h-jun22-01-4');
		for (const entry of entries) {
			expect(entry.localPath).toBe(entry.selectedCandidate);
			expect(entry.candidates).toContain(entry.localPath);
			expect(entry.assetSha256).toMatch(/^[a-f0-9]{64}$/);
		}
	});

	it('requires the visual judge to audit all four approved stages', () => {
		const decision = { visualSteps: [1, 2, 3, 4].map((order) => ({ order })) };
		const complete = {
			variants: ['dark', 'light'].map((theme) => ({
				theme,
				panelAudits: [1, 2, 3, 4].map((order) => ({ order }))
			}))
		};
		expect(validateCuratedJudgeCoverage(complete, decision)).toEqual({
			status: 'passed',
			issues: []
		});
		const incomplete = structuredClone(complete);
		incomplete.variants[1].panelAudits.pop();
		expect(validateCuratedJudgeCoverage(incomplete, decision).status).toBe('failed');
	});

	it('requires an explicit approved chain selection', () => {
		expect(() => selectApprovedManifestEntries(manifest, [])).toThrow(
			'At least one explicit --chain-id is required'
		);
		expect(() => selectApprovedManifestEntries(manifest, ['some-other-chain'])).toThrow(
			'not one of the three approved historical illustration chains'
		);
		expect(() =>
			selectApprovedManifestEntries(manifest, [
				APPROVED_CURATED_CHAIN_IDS[0],
				APPROVED_CURATED_CHAIN_IDS[0]
			])
		).toThrow('Duplicate --chain-id');
	});

	it('binds each approved prompt to four distinct mechanism-specific visual anchors', () => {
		for (const entry of selectApprovedManifestEntries(manifest, APPROVED_CURATED_CHAIN_IDS)) {
			const stepTextByChain: Record<string, string[]> = {
				'bio-chain-vaccine-antigen-antibodies-memory-immunity': [
					'Harmless antigen',
					'Antibodies',
					'Memory cells',
					'Faster response'
				],
				'chem-chain-alloy-hardness-distorted-layers': [
					'Different atoms',
					'Distorted layers',
					'Less sliding',
					'Harder alloy'
				],
				'physics-chain-grid-transformer-efficiency': [
					'Step-up potential difference',
					'Lower current',
					'Less cable heating',
					'Higher efficiency'
				]
			};
			const candidate = {
				id: entry.answerChainId,
				steps: [1, 2, 3, 4].map((displayOrder) => ({
					id: `${entry.answerChainId}-step-${displayOrder}`,
					displayOrder,
					stepText: stepTextByChain[entry.answerChainId][displayOrder - 1]
				})),
				members: [{ questionId: entry.sourceQuestionId }]
			};
			const decision = curatedDecisionFor(entry, candidate);
			const prompt = readFileSync(path.join(rootDir, entry.promptPath), 'utf8');
			expect(validateHistoricalPrompt(prompt, decision)).toEqual({
				status: 'passed',
				issues: []
			});
			expect(decision.visualSteps).toHaveLength(4);
			expect(new Set(decision.visualSteps.map((step) => step.distinctVisualAnchor)).size).toBe(4);
			expect(decision.visualSteps.every((step) => step.textHiddenMeaning.length > 20)).toBe(true);
			expect(JSON.stringify(decision)).not.toMatch(/\bp\s*\.\s*d\s*\./i);
		}
	});

	it('accepts supplied light edits only with an explicit approved chain mapping', () => {
		const mapping = parseLightFileArgs([`${APPROVED_CURATED_CHAIN_IDS[2]}=tmp/light-grid.webp`]);
		expect(mapping.get(APPROVED_CURATED_CHAIN_IDS[2])).toBe('tmp/light-grid.webp');
		expect(() => parseLightFileArgs(['missing-separator'])).toThrow(
			'--light-file must use <chain-id>=<path>'
		);
		expect(() => parseLightFileArgs(['other-chain=tmp/light.webp'])).toThrow(
			'not approved for curated light backfill'
		);
	});

	it('waives only an identical minor limitation inherited from a pinned approved dark', () => {
		const variant = (theme: 'dark' | 'light') => ({
			theme,
			pass: false,
			scientificAccuracy: 4,
			evidenceFidelity: 3,
			textExactness: 3,
			sequenceClarity: 3,
			ipadLegibility: 2,
			mnemonicCoherence: 2,
			appStyleFit: 2,
			textIndependentMeaning: false,
			distinctVisualAnchors: true,
			causalChangesVisible: true,
			noDominantRepetition: true,
			terminologyClear: true,
			compositionPlanFollowed: true,
			noQuestionSpecificValues: true,
			panelAudits: [
				{
					order: 1,
					understandableWithoutText: false,
					defects: ['A small specificity cue depends on the label.']
				}
			],
			total: 19,
			defects: ['A small specificity cue depends on the label.']
		});
		const judge = {
			variants: [variant('dark'), variant('light')],
			crossThemeConsistency: {
				compositionMatch: true,
				contentMatch: true,
				textMatch: true,
				scientificMeaningMatch: true,
				score: 4,
				defects: []
			}
		};
		expect(validateHistoricalBaselineWaiver(judge).status).toBe('passed');

		judge.variants[0].noQuestionSpecificValues = false;
		expect(validateHistoricalBaselineWaiver(judge).status).toBe('failed');
		judge.variants[0].noQuestionSpecificValues = true;

		judge.variants[1].defects.push('Light-only regression.');
		expect(validateHistoricalBaselineWaiver(judge).status).toBe('failed');
	});
});
