import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	CHALLENGE_ILLUSTRATION_IMAGE_MODEL,
	buildChallengeDarkRetryPrompt,
	buildChallengePromptBundle,
	buildChallengeRunPlan,
	challengeUsageJudgePrompt,
	challengeUsageJudgeSchema,
	validateChallengeIllustrationSpec,
	validateChallengeUsageJudge
} from '../../../scripts/lib/challenge-illustration-pipeline.mjs';

const spec = JSON.parse(
	readFileSync(
		new URL(
			'../../../docs/challenge-illustrations/specs/enzyme-denaturation-earned.json',
			import.meta.url
		),
		'utf8'
	)
);

type UsageFinding = {
	defectId: string;
	themes: string[];
	panelOrders: number[];
	defect: string;
};

type UsageJudgeFixture = {
	variants: Array<{
		theme: string;
		mobileCropSafe: boolean;
		mobileLegible: boolean;
		evidenceSupported: boolean;
		answerLeakFree: boolean;
		stageAppropriate: boolean;
		defects: string[];
	}>;
	findings: UsageFinding[];
	crossThemeUsageMatch: boolean;
	pass: boolean;
	rationale: string;
};

describe('challenge illustration pipeline', () => {
	it('validates an evidence-mapped earned spec and augments the shared atlas prompt', () => {
		expect(validateChallengeIllustrationSpec(spec)).toEqual({ status: 'passed', issues: [] });
		const bundle = buildChallengePromptBundle(spec);
		expect(bundle.darkStylePrompt).toContain('biological laboratory-process atlas');
		expect(bundle.darkInstructionPrompt).toContain('16:9 landscape');
		expect(bundle.darkInstructionPrompt).toContain('CHALLENGE DISPLAY STAGE - EARNED');
		expect(bundle.darkInstructionPrompt).toContain('720-pixel-wide horizontal mobile canvas');
		expect(bundle.darkInstructionPrompt).toContain('first 240-pixel viewport');
		expect(bundle.lightInstructionPrompt).toContain('strict theme conversion');
		expect(bundle.decision.visualSteps).toHaveLength(4);
		expect(bundle.candidate.members[0].markSchemeItems).toHaveLength(4);
	});

	it('fails a teaser spec that leaks its configured answer wording or escapes the repo', () => {
		const teaser = structuredClone(spec);
		teaser.displayStage = 'teaser';
		teaser.teaserLeakage = {
			allowedClues: ['The plant is hot and gas output has fallen.'],
			forbiddenText: ['active site changes'],
			forbiddenVisuals: ['A before-and-after active-site solution diagram.']
		};
		teaser.output.darkPath = '../escaped.webp';
		const result = validateChallengeIllustrationSpec(teaser);
		expect(result.status).toBe('failed');
		expect(result.issues).toContain(
			'Teaser learner-visible content leaks forbidden text: active site changes.'
		);
		expect(result.issues).toContain('output.darkPath must be a relative in-repository .webp path.');
	});

	it('rejects an invalid horizontal-pan viewport contract', () => {
		const invalid = structuredClone(spec);
		invalid.usage.mobileViewportWidth = invalid.usage.mobileWidth;
		expect(validateChallengeIllustrationSpec(invalid).issues).toContain(
			'usage.mobileViewportWidth must be an integer from 200 to 480 and smaller than mobileWidth for pan.'
		);
	});

	it('adds only observed shared and challenge-specific defects to a fresh retry', () => {
		const retry = buildChallengeDarkRetryPrompt('BASE PROMPT', {
			visualJudge: {
				variant: {
					theme: 'dark',
					defects: ['The panel-two arrow points at the substrate rather than the enzyme.'],
					panelAudits: []
				},
				glitchFindings: [
					{
						glitchId: 'ambiguous_symbol_or_label_placement',
						themes: ['dark'],
						panelOrders: [2],
						defect: 'The panel-two arrow has two plausible targets.'
					}
				]
			},
			usageJudge: {
				findings: [
					{
						defectId: 'mobile_legibility',
						themes: ['dark'],
						panelOrders: [3],
						defect: 'The active-site silhouette disappears at 360 pixels.'
					}
				]
			}
		});
		expect(retry).toContain('brand-new DARK ORIGINAL from scratch');
		expect(retry).toContain('ambiguous_symbol_or_label_placement');
		expect(retry).toContain('The panel-two arrow has two plausible targets.');
		expect(retry).toContain('mobile_legibility');
		expect(retry).toContain('The active-site silhouette disappears at 360 pixels.');
		expect(retry).toContain('The panel-two arrow points at the substrate rather than the enzyme.');
		expect(retry).not.toContain('bypass_topology:');
		expect(retry).not.toContain('teaser_answer_leakage:');
		expect(retry).not.toContain('unsupported_evidence:');
	});

	it('makes dry-run planning deterministic and model-call free', () => {
		const first = buildChallengeRunPlan(spec, {
			mode: 'review-existing',
			darkPath: 'dark.webp',
			lightPath: 'light.webp',
			maxAttempts: 3
		});
		const second = buildChallengeRunPlan(structuredClone(spec), {
			mode: 'review-existing',
			darkPath: 'dark.webp',
			lightPath: 'light.webp',
			maxAttempts: 3
		});
		expect(first).toEqual(second);
		expect(first.status).toBe('dry-run');
		expect(first.model).toBe(CHALLENGE_ILLUSTRATION_IMAGE_MODEL);
		expect(first.specSha256).toHaveLength(64);
		expect(first.prompts?.darkSha256).toHaveLength(64);
		expect(first.outputs.darkPath).toBe(
			'static/product/challenges/atlas/enzyme-denaturation-dark-v1.webp'
		);
	});

	it('enforces mobile, evidence, stage and leakage booleans in the usage judge', () => {
		const passing: UsageJudgeFixture = {
			variants: ['dark', 'light'].map((theme) => ({
				theme,
				mobileCropSafe: true,
				mobileLegible: true,
				evidenceSupported: true,
				answerLeakFree: true,
				stageAppropriate: true,
				defects: []
			})),
			findings: [],
			crossThemeUsageMatch: true,
			pass: true,
			rationale: 'Both variants fit the earned challenge stage.'
		};
		expect(validateChallengeUsageJudge(passing, spec, 'pair')).toEqual({
			status: 'passed',
			issues: []
		});
		const failing = structuredClone(passing);
		failing.variants[1].mobileLegible = false;
		failing.variants[1].defects = ['The microcopy is unreadable at mobile size.'];
		failing.findings = [
			{
				defectId: 'mobile_legibility',
				themes: ['light'],
				panelOrders: [4],
				defect: 'The panel-four microcopy is unreadable at mobile size.'
			}
		];
		failing.pass = false;
		expect(validateChallengeUsageJudge(failing, spec, 'pair')).toEqual({
			status: 'passed',
			issues: []
		});
	});

	it('embeds exhaustive evidence and teaser rules in structured usage judging', () => {
		const prompt = challengeUsageJudgePrompt(
			spec,
			{ dark: { status: 'passed' }, light: { status: 'passed' } },
			'pair'
		);
		expect(prompt).toContain('SUPPORTED EVIDENCE - EXHAUSTIVE');
		expect(prompt).toContain('AQA 8464B1H June 2024 question 04.3 mark scheme');
		expect(prompt).toContain('mobileCropSafe');
		expect(prompt).toContain('horizontal pan');
		expect(prompt).toContain('initial mobile viewport crop');
		expect(prompt).toContain('must not juxtapose stage 1 with a later non-consecutive stage');
		expect(prompt).toContain('mobile_sequence');
		expect(prompt).toContain('unsupported_evidence');
		expect(challengeUsageJudgeSchema('pair').properties.variants.minItems).toBe(2);
	});
});
