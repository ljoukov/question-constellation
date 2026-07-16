/** @typedef {'bio-chain-vaccine-antigen-antibodies-memory-immunity' | 'chem-chain-alloy-hardness-distorted-layers' | 'physics-chain-grid-transformer-efficiency'} ApprovedChainId */
/** @typedef {Record<string, any> & {answerChainId: string, id: string, sourceQuestionId: string, localPath: string, assetSha256: string, promptPath: string, lightLocalPath: string, lightAssetSha256: string, lightPromptPath: string, selectedCandidate: string, candidates: string[], width: number, height: number, altText: string, caption: string, selectionRationale: string}} CuratedManifestEntry */
/** @typedef {{heading: string, microcopy: string, visual: string, distinctVisualAnchor: string, textHiddenMeaning: string, misconceptionGuards: string[]}} CuratedVisualStep */
/** @typedef {{manifestId: string, sourceQuestionId: string, localPath: string, assetSha256: string, promptPath: string, lightLocalPath: string, lightAssetSha256: string, lightPromptPath: string, expectedStepText: string[], title: string, compositionMode: 'continuous-journey' | 'single-subject-state-progression' | 'linked-distinct-scenes', visualAnchor: string, continuousPath: string, visualWithoutTextSummary: string, visualSteps: CuratedVisualStep[]}} CuratedPlan */
/** @typedef {Record<string, any> & {visualSteps: Array<CuratedVisualStep & {order: number, sourceStepIds: string[]}>}} CuratedDecision */

/** @type {readonly ApprovedChainId[]} */
export const APPROVED_CURATED_CHAIN_IDS = Object.freeze([
	'bio-chain-vaccine-antigen-antibodies-memory-immunity',
	'chem-chain-alloy-hardness-distorted-layers',
	'physics-chain-grid-transformer-efficiency'
]);

/** @type {Readonly<Record<ApprovedChainId, CuratedPlan>>} */
const CURATED_PLANS = Object.freeze({
	'bio-chain-vaccine-antigen-antibodies-memory-immunity': {
		manifestId: 'chain-illustration-vaccine-immunity-v1',
		sourceQuestionId: '8464b1h-jun24-03-3',
		localPath: 'docs/chain-illustrations/candidates/vaccine-immunity-b.webp',
		assetSha256: 'a4d937ef587509887d31ea730f3656ddb1ca7fc4ba2f4a5120c7edd45a9778b9',
		promptPath: 'docs/chain-illustrations/prompts/vaccine-immunity.txt',
		lightLocalPath: 'docs/chain-illustrations/candidates/vaccine-immunity-b-light.webp',
		lightAssetSha256: '16337b647a4cde4739dca5b08d44455590b96efd6a793b135a22014ca4543899',
		lightPromptPath: 'docs/chain-illustrations/prompts/vaccine-immunity-light-edit.txt',
		expectedStepText: ['Harmless antigen', 'Antibodies', 'Memory cells', 'Faster response'],
		title: 'HOW DOES A VACCINE CREATE IMMUNITY?',
		compositionMode: 'linked-distinct-scenes',
		visualAnchor:
			'One translucent upper-body figure links injection, immune recognition, memory and later protection.',
		continuousPath:
			'Follow a clockwise path around the same body: upper-left, upper-right, lower-right, lower-left.',
		visualWithoutTextSummary:
			'A vaccine introduces harmless antigen shapes; matching antibodies form, memory cells remain, and a later pathogen is neutralised rapidly.',
		visualSteps: [
			{
				heading: 'HARMLESS ANTIGEN',
				microcopy: 'Vaccine primes the immune system',
				visual:
					'A clean vaccine injection enters the upper arm and releases isolated harmless antigen fragments, never an intact pathogen.',
				distinctVisualAnchor:
					'A syringe at the upper arm with a few clearly shaped harmless antigen fragments.',
				textHiddenMeaning: 'The injection visibly introduces only antigen fragments into the body.',
				misconceptionGuards: ['Do not show an intact dangerous pathogen being injected.']
			},
			{
				heading: 'SPECIFIC ANTIBODIES',
				microcopy: 'White blood cells make a match',
				visual:
					'One lymphocyte produces Y-shaped antibodies whose binding tips visibly match the antigen shapes.',
				distinctVisualAnchor:
					'A lymphocyte surrounded by shape-matched Y antibodies binding one antigen.',
				textHiddenMeaning:
					'Matching shapes make antibody specificity visible without relying on the caption.',
				misconceptionGuards: ['Do not imply that antibodies bind every antigen shape.']
			},
			{
				heading: 'MEMORY CELLS REMAIN',
				microcopy: 'Ready for the same pathogen',
				visual:
					'A small, quiet cluster of persistent luminous memory cells remains after the first response.',
				distinctVisualAnchor: 'A compact long-lived cluster of luminous memory cells.',
				textHiddenMeaning:
					'A persistent cell cluster remains in reserve after the initial immune activity fades.',
				misconceptionGuards: ['Do not depict memory cells as stored antibodies.']
			},
			{
				heading: 'FASTER RESPONSE NEXT TIME',
				microcopy: 'Pathogen stopped before illness',
				visual:
					'On later exposure, many matching antibodies rapidly surround and neutralise live pathogens before illness develops.',
				distinctVisualAnchor:
					'A later pathogen swarm being rapidly enclosed by many matching antibodies.',
				textHiddenMeaning:
					'The dense rapid antibody response visibly overwhelms the later pathogen.',
				misconceptionGuards: [
					'Do not imply that vaccination guarantees no pathogen enters the body.'
				]
			}
		]
	},
	'chem-chain-alloy-hardness-distorted-layers': {
		manifestId: 'chain-illustration-alloy-hardness-v1',
		sourceQuestionId: '8464c1h-jun22-05-3',
		localPath: 'docs/chain-illustrations/candidates/alloy-hardness-a.webp',
		assetSha256: '6c97bcc5d3d4b41c37f43ab3a848246b14acb8b921e3ee3c08cae6c00dc5ee19',
		promptPath: 'docs/chain-illustrations/prompts/alloy-hardness.txt',
		lightLocalPath: 'docs/chain-illustrations/candidates/alloy-hardness-a-light.webp',
		lightAssetSha256: 'c4541cf1828657982cf23f19ad38ebd21ad46f9a9b64f2708d5b8f215f14ba70',
		lightPromptPath: 'docs/chain-illustrations/prompts/alloy-hardness-light-edit.txt',
		expectedStepText: ['Different atoms', 'Distorted layers', 'Less sliding', 'Harder alloy'],
		title: 'WHY ARE ALLOYS HARDER?',
		compositionMode: 'single-subject-state-progression',
		visualAnchor:
			'One metal lattice evolves from regular layers into a distorted alloy, then into blocked shear and a resistant sample.',
		continuousPath:
			'Follow the same material clockwise from mixed atom sizes to distortion, blocked sliding and macroscopic hardness.',
		visualWithoutTextSummary:
			'Different-sized atoms disrupt regular layers, obstruct their sliding, and make the alloy resist deformation.',
		visualSteps: [
			{
				heading: 'DIFFERENT-SIZED ATOMS',
				microcopy: 'An alloy mixes atom sizes',
				visual:
					'A close metallic lattice contains a few visibly larger and smaller atoms among regular metal atoms.',
				distinctVisualAnchor:
					'A regular atomic lattice punctuated by unmistakably larger and smaller atoms.',
				textHiddenMeaning:
					'The mixed atom sizes are visible immediately through contrasting diameters.',
				misconceptionGuards: ['Do not depict molecules, ions or stronger individual atoms.']
			},
			{
				heading: 'LAYERS DISTORT',
				microcopy: 'The regular rows are disrupted',
				visual:
					'The differently sized atoms physically bend and disrupt otherwise ordered atomic rows.',
				distinctVisualAnchor: 'Bent lattice rows wrapping around mismatched atom sizes.',
				textHiddenMeaning: 'Straight rows visibly kink around larger and smaller atoms.',
				misconceptionGuards: ['Do not imply the whole metal melts or fractures.']
			},
			{
				heading: "LAYERS CAN'T SLIDE",
				microcopy: 'The atoms block movement',
				visual:
					'A shear arrow tries to move one atomic layer, but mismatched atoms physically obstruct the slip.',
				distinctVisualAnchor: 'A large shear arrow stopped at a visible atomic-size obstruction.',
				textHiddenMeaning:
					'The attempted sideways layer movement is visibly blocked at the distorted lattice.',
				misconceptionGuards: ['Do not show layers sliding freely past the mismatched atoms.']
			},
			{
				heading: 'ALLOY IS HARDER',
				microcopy: 'More force is needed to deform it',
				visual:
					'A clean alloy sample resists a press or indentation and shows minimal deformation.',
				distinctVisualAnchor: 'A macroscopic press meeting an almost undented metal sample.',
				textHiddenMeaning: 'The sample visibly retains its shape under the applied press.',
				misconceptionGuards: ['Connect hardness to inhibited layer sliding, not stronger atoms.']
			}
		]
	},
	'physics-chain-grid-transformer-efficiency': {
		manifestId: 'chain-illustration-step-up-grid-v1',
		sourceQuestionId: '8464p1h-jun22-01-4',
		localPath: 'docs/chain-illustrations/candidates/step-up-grid-b.webp',
		assetSha256: '2e0dd46ed5612100d7548b442b0dde43ecf24540ab474ffff066d3c15a7a063e',
		promptPath: 'docs/chain-illustrations/prompts/step-up-grid.txt',
		lightLocalPath: 'docs/chain-illustrations/candidates/step-up-grid-b-light.webp',
		lightAssetSha256: '811309e6d0f7f8c89d0fef514bd44dfeff9b9d860df543aa1bf656b1a7dee69a',
		lightPromptPath: 'docs/chain-illustrations/prompts/step-up-grid-light-edit.txt',
		expectedStepText: [
			'Step-up potential difference',
			'Lower current',
			'Less cable heating',
			'Higher efficiency'
		],
		title: 'WHY DOES THE GRID STEP UP VOLTAGE?',
		compositionMode: 'continuous-journey',
		visualAnchor:
			'One National Grid journey runs from a power station through a step-up transformer and pylons to illuminated homes.',
		continuousPath:
			'Follow energy left to right from generation, through transmission cable mechanisms, to consumer homes.',
		visualWithoutTextSummary:
			'A transformer raises potential difference, current flow becomes lower, the cable releases less heat, and more energy reaches homes.',
		visualSteps: [
			{
				heading: 'POTENTIAL DIFFERENCE UP',
				microcopy: 'The transformer raises voltage',
				visual:
					'A step-up transformer cutaway shows more turns on the output coil and a bright high-voltage line leaving it.',
				distinctVisualAnchor:
					'A transformer coil cutaway with visibly more turns on the transmission side.',
				textHiddenMeaning:
					'The coil ratio and brighter outgoing line visibly establish the step-up action.',
				misconceptionGuards: [
					'Do not imply that the transformer creates energy or increases power.'
				]
			},
			{
				heading: 'CURRENT DOWN',
				microcopy: 'The same power needs less current',
				visual:
					'The transmission cable carries a thinner, calmer cyan flow, with a small correct P = VI as supporting notation.',
				distinctVisualAnchor:
					'A cable cutaway containing a visibly thinner, calmer current flow and small P = VI notation.',
				textHiddenMeaning:
					'The narrowed flow inside the same transmission path makes the lower current concrete.',
				misconceptionGuards: [
					'Do not imply electricity travels faster or that transmitted power falls.'
				]
			},
			{
				heading: 'LESS CABLE HEATING',
				microcopy: 'Less energy is wasted',
				visual:
					'A transmission-cable cross-section releases little amber heat beside a faint high-current alternative, supported by P_loss = I²R.',
				distinctVisualAnchor:
					'A copper cable cross-section with minimal heat beside a faint hotter comparison.',
				textHiddenMeaning:
					'The cooler main cable versus the ghosted hot alternative visibly shows reduced heating.',
				misconceptionGuards: ['Do not show zero resistance or zero energy loss.']
			},
			{
				heading: 'HIGHER EFFICIENCY',
				microcopy: 'More energy reaches consumers',
				visual:
					'The continuous energy path reaches a row of illuminated homes with little wasted heat.',
				distinctVisualAnchor: 'A row of illuminated homes receiving the continuing energy path.',
				textHiddenMeaning:
					'The concrete destination shows more of the transmitted energy reaching consumers.',
				misconceptionGuards: [
					'Do not replace the homes with an abstract efficiency gauge or checkmark.'
				]
			}
		]
	}
});

/**
 * Select only explicitly requested entries from the historical calibration manifest.
 * @param {unknown} manifest
 * @param {readonly string[]} chainIds
 * @returns {CuratedManifestEntry[]}
 */
export function selectApprovedManifestEntries(manifest, chainIds) {
	if (!manifest || typeof manifest !== 'object') throw new Error('Manifest must be an object.');
	const manifestObject = /** @type {Record<string, any>} */ (manifest);
	if (!Number.isInteger(manifestObject.version) || manifestObject.version < 1) {
		throw new Error('Historical manifest version must be a positive integer.');
	}
	if (manifestObject.styleKey !== 'luminous-scientific-atlas-v1') {
		throw new Error('Historical manifest styleKey must remain luminous-scientific-atlas-v1.');
	}
	if (!Array.isArray(chainIds) || chainIds.length === 0) {
		throw new Error('At least one explicit --chain-id is required.');
	}
	if (new Set(chainIds).size !== chainIds.length) {
		throw new Error('Duplicate --chain-id values are not allowed.');
	}
	for (const chainId of chainIds) {
		if (!APPROVED_CURATED_CHAIN_IDS.some((approvedId) => approvedId === chainId)) {
			throw new Error(
				`${chainId} is not one of the three approved historical illustration chains.`
			);
		}
	}
	const entries = /** @type {CuratedManifestEntry[]} */ (
		Array.isArray(manifestObject.illustrations) ? manifestObject.illustrations : []
	);
	return chainIds.map((chainId) => {
		const plan = CURATED_PLANS[/** @type {ApprovedChainId} */ (chainId)];
		const matches = entries.filter((entry) => entry?.answerChainId === chainId);
		if (matches.length !== 1) {
			throw new Error(`${chainId} must have exactly one historical manifest entry.`);
		}
		const entry = matches[0];
		const expected = {
			id: plan.manifestId,
			sourceQuestionId: plan.sourceQuestionId,
			localPath: plan.localPath,
			promptPath: plan.promptPath,
			assetSha256: plan.assetSha256,
			lightLocalPath: plan.lightLocalPath,
			lightAssetSha256: plan.lightAssetSha256,
			lightPromptPath: plan.lightPromptPath
		};
		for (const [field, value] of Object.entries(expected)) {
			if (entry[field] !== value) {
				throw new Error(`${chainId} ${field} must remain ${value}.`);
			}
		}
		if (entry.selectedCandidate !== entry.localPath) {
			throw new Error(`${chainId} must use its explicitly selected historical candidate.`);
		}
		if (!Array.isArray(entry.candidates) || !entry.candidates.includes(entry.localPath)) {
			throw new Error(`${chainId} selected candidate is missing from the candidate audit list.`);
		}
		if (!Number.isInteger(entry.width) || !Number.isInteger(entry.height)) {
			throw new Error(`${chainId} historical dimensions are missing.`);
		}
		for (const field of ['altText', 'caption', 'selectionRationale']) {
			if (typeof entry[field] !== 'string' || !entry[field].trim()) {
				throw new Error(`${chainId} ${field} must remain non-empty.`);
			}
		}
		return entry;
	});
}

/**
 * Build the reviewed visual plan while binding its four stages to the current D1 step IDs.
 * @param {CuratedManifestEntry} entry
 * @param {Record<string, any>} candidate
 * @returns {CuratedDecision}
 */
export function curatedDecisionFor(entry, candidate) {
	const plan = CURATED_PLANS[/** @type {ApprovedChainId} */ (candidate?.id)];
	if (!plan) throw new Error(`${candidate?.id ?? 'Unknown chain'} is not approved for backfill.`);
	if (entry.answerChainId !== candidate.id)
		throw new Error('Manifest and D1 chain IDs do not match.');
	const steps = Array.isArray(candidate.steps)
		? [...candidate.steps].sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder))
		: [];
	if (steps.length !== plan.visualSteps.length) {
		throw new Error(`${candidate.id} must still have exactly four current chain steps.`);
	}
	for (const [index, expectedStepText] of plan.expectedStepText.entries()) {
		if (normalize(steps[index].stepText) !== normalize(expectedStepText)) {
			throw new Error(
				`${candidate.id} step ${index + 1} changed from the approved visual source: expected "${expectedStepText}", found "${steps[index].stepText}".`
			);
		}
	}
	const members = /** @type {Array<Record<string, any>>} */ (candidate.members ?? []);
	if (!members.some((member) => member.questionId === entry.sourceQuestionId)) {
		throw new Error(
			`${candidate.id} no longer contains manifest source ${entry.sourceQuestionId}.`
		);
	}
	return {
		chainId: candidate.id,
		verdict: 'accept',
		rationale:
			'This is the human-approved historical calibration illustration; only a composition-preserving light theme edit is permitted.',
		sameOrderedLinks: true,
		allMembersCovered: true,
		contextOnlyVariation: true,
		branching: false,
		representativeQuestionId: entry.sourceQuestionId,
		title: plan.title,
		altText: entry.altText,
		caption: entry.caption,
		compositionMode: plan.compositionMode,
		visualAnchor: plan.visualAnchor,
		continuousPath: plan.continuousPath,
		visualWithoutTextSummary: plan.visualWithoutTextSummary,
		visualSteps: plan.visualSteps.map((visualStep, index) => ({
			order: index + 1,
			...visualStep,
			sourceStepIds: [steps[index].id]
		})),
		evidenceByQuestion: []
	};
}

/** @param {string} promptText @param {CuratedDecision} decision */
export function validateHistoricalPrompt(promptText, decision) {
	const issues = [];
	if (!promptText.includes(`"${decision.title}"`)) issues.push('historical title is missing');
	for (const step of decision.visualSteps) {
		if (!promptText.includes(`"${step.heading}"`)) {
			issues.push(`historical heading is missing: ${step.heading}`);
		}
		if (!promptText.includes(`"${step.microcopy}"`)) {
			issues.push(`historical microcopy is missing: ${step.microcopy}`);
		}
	}
	if (/\bp\s*\.\s*d\s*\./i.test(promptText)) {
		issues.push('historical prompt contains unexplained p.d. shorthand');
	}
	const anchors = decision.visualSteps.map((step) => normalize(step.distinctVisualAnchor));
	if (new Set(anchors).size !== anchors.length) {
		issues.push('visual stages must have unique dominant anchors');
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/** @param {string[]} values */
export function parseLightFileArgs(values) {
	const files = new Map();
	for (const value of values) {
		const separator = value.indexOf('=');
		if (separator <= 0 || separator === value.length - 1) {
			throw new Error('--light-file must use <chain-id>=<path>.');
		}
		const chainId = value.slice(0, separator);
		const filePath = value.slice(separator + 1);
		if (!APPROVED_CURATED_CHAIN_IDS.some((approvedId) => approvedId === chainId)) {
			throw new Error(`${chainId} is not approved for curated light backfill.`);
		}
		if (files.has(chainId)) throw new Error(`Duplicate --light-file for ${chainId}.`);
		files.set(chainId, filePath);
	}
	return files;
}

/**
 * The shared judge validator checks score integrity; this calibration backfill additionally
 * requires an explicit audit for every one of its four approved visual stages.
 * @param {Record<string, any>} judge
 * @param {{visualSteps: Array<{order: number}>}} decision
 */
export function validateCuratedJudgeCoverage(judge, decision) {
	const issues = [];
	const expectedOrders = decision.visualSteps.map((step) => step.order);
	const variants = /** @type {Array<Record<string, any>>} */ (judge?.variants ?? []);
	for (const variant of variants) {
		const audits = /** @type {Array<Record<string, any>>} */ (variant.panelAudits ?? []);
		const orders = audits.map((audit) => audit.order);
		if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) {
			issues.push(
				`${variant.theme ?? 'unknown'} must audit every approved visual stage exactly once in order.`
			);
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/**
 * The dark files in this module are pinned, human-selected calibration assets. A pair judge may
 * identify a small limitation already present in that baseline, but the limitation must not block
 * a theme-only backfill when the light edit reproduces it exactly and adds no regression. This is
 * intentionally narrow: only textIndependentMeaning may be waived, and both variants must still
 * earn 19/20 with every other hard visual-learning flag passing. Newly generated dark assets use
 * the general judge and receive no such waiver.
 * @param {Record<string, any>} judge
 */
export function validateHistoricalBaselineWaiver(judge) {
	const issues = [];
	const variants = /** @type {Array<Record<string, any>>} */ (judge?.variants ?? []);
	const dark = variants.find((variant) => variant.theme === 'dark');
	const light = variants.find((variant) => variant.theme === 'light');
	if (!dark || !light || variants.length !== 2) {
		issues.push('exactly one dark and one light audit are required');
	}
	const consistency = judge?.crossThemeConsistency;
	if (
		!consistency?.compositionMatch ||
		!consistency?.contentMatch ||
		!consistency?.textMatch ||
		!consistency?.scientificMeaningMatch ||
		consistency?.score !== 4 ||
		(consistency?.defects ?? []).length
	) {
		issues.push('cross-theme consistency must be perfect');
	}
	for (const variant of [dark, light]) {
		if (!variant) continue;
		if (
			variant.scientificAccuracy !== 4 ||
			variant.evidenceFidelity < 3 ||
			variant.textExactness !== 3 ||
			variant.sequenceClarity !== 3 ||
			variant.ipadLegibility !== 2 ||
			variant.mnemonicCoherence !== 2 ||
			variant.appStyleFit !== 2 ||
			variant.total < 19
		) {
			issues.push(`${variant.theme} must otherwise score at least 19/20 with full core scores`);
		}
		for (const field of [
			'distinctVisualAnchors',
			'causalChangesVisible',
			'noDominantRepetition',
			'terminologyClear',
			'compositionPlanFollowed',
			'noQuestionSpecificValues',
			'takeawayMatchesGoal'
		]) {
			if (variant[field] !== true) issues.push(`${variant.theme} ${field} must remain true`);
		}
	}
	if (dark && light && inheritedDefectSignature(dark) !== inheritedDefectSignature(light)) {
		issues.push('the light edit must introduce no new or changed defect');
	}
	if (dark?.textIndependentMeaning !== light?.textIndependentMeaning) {
		issues.push('text-independent meaning must not regress between themes');
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		inheritedDefects: dark?.defects ?? []
	};
}

/** @param {Record<string, any>} variant */
function inheritedDefectSignature(variant) {
	const panelAudits = /** @type {Array<Record<string, any>>} */ (variant?.panelAudits ?? []);
	return JSON.stringify({
		textIndependentMeaning: variant?.textIndependentMeaning,
		textHiddenTakeaway: variant?.textHiddenTakeaway,
		fullImageTakeaway: variant?.fullImageTakeaway,
		associativeLinks: variant?.associativeLinks ?? [],
		unintendedTakeaways: variant?.unintendedTakeaways ?? [],
		takeawayMatchesGoal: variant?.takeawayMatchesGoal,
		defects: variant?.defects ?? [],
		panelAudits: panelAudits.map((audit) => ({
			order: audit?.order,
			understandableWithoutText: audit?.understandableWithoutText,
			defects: audit?.defects ?? []
		}))
	});
}

/** @param {unknown} value */
function normalize(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}
