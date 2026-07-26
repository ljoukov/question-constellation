#!/usr/bin/env node

import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { requireScienceChallengeModelRunPolicy } from './lib/science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_ART_REVIEW_BOOLEAN_FIELDS,
	SCIENCE_ART_REVIEW_DISPOSITIONS,
	SCIENCE_ART_REVIEW_ISSUE_CATEGORIES,
	SCIENCE_ART_REVIEW_ISSUE_SEVERITIES,
	SCIENCE_QUESTION_ART_REVIEW_INPUT_SCHEMA,
	SCIENCE_QUESTION_ART_REVIEW_SCHEMA,
	canonicalHash,
	sha256,
	stableStringify,
	validateIndependentArtReviewRow,
	validateQuestionArtManifest
} from './lib/science-challenge-release.mjs';
import {
	buildArtReviewModelTurn,
	buildArtReviewRequest
} from './lib/science-challenge-review-evidence.mjs';

const MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const rootDir = process.cwd();
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (args.model !== MODEL || args.thinkingLevel !== THINKING_LEVEL) {
	throw new Error(`Release art review requires ${MODEL}/${THINKING_LEVEL}.`);
}
const manifestPath = path.resolve(rootDir, args.manifest);
if (!existsSync(manifestPath)) throw new Error(`Manifest does not exist: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestValidation = validateQuestionArtManifest(manifest, {
	expectedCount: args.requireCount
});
if (manifestValidation.status !== 'passed') {
	throw new Error(
		`Invalid science question art manifest:\n${manifestValidation.issues.join('\n')}`
	);
}
const selected = selectSpecs(manifest.specs, args.ids, args.limit);
for (const spec of selected) {
	for (const file of [spec.output.darkPath, spec.output.lightPath]) {
		if (!existsSync(path.resolve(rootDir, file))) throw new Error(`Missing generated art: ${file}`);
	}
}
const outputRoot = path.resolve(rootDir, args.outputRoot);
mkdirSync(outputRoot, { recursive: true });
const batches = chunk(selected, args.batchSize);
const tasks = batches.map((specs, batchIndex) => async () => reviewBatch(specs, batchIndex));
const batchResults = await runConcurrent(tasks, args.concurrency);
const reviews = batchResults.flatMap((result) => result.reviews ?? []);
const invalidBatches = batchResults.filter((result) => result.status !== 'passed');
const rejected = reviews.filter((review) => !review.accepted);
const annotatedAccepted = reviews.filter(
	(review) => review.accepted && review.disposition === 'retain-with-annotation'
);
const cleanAccepted = reviews.filter(
	(review) => review.accepted && review.disposition === 'accept'
);
const missing = selected.filter((spec) => !reviews.some((review) => review.id === spec.id));
const assetInventory = buildAssetInventory(selected);
const summary = {
	schemaVersion: SCIENCE_QUESTION_ART_REVIEW_SCHEMA,
	releaseId: manifest.releaseId,
	manifestSha256: canonicalHash(manifest),
	assetInventorySha256: canonicalHash(assetInventory),
	model: args.model,
	thinkingLevel: args.thinkingLevel,
	reviewedAt: new Date().toISOString(),
	selectedCount: selected.length,
	acceptedCount: reviews.filter((review) => review.accepted).length,
	cleanAcceptedCount: cleanAccepted.length,
	annotatedAcceptedCount: annotatedAccepted.length,
	rejectedCount: rejected.length,
	majorRejectedCount: rejected.length,
	missingCount: missing.length,
	invalidBatchCount: invalidBatches.length,
	batchCount: batchResults.length,
	status: rejected.length || missing.length || invalidBatches.length ? 'failed' : 'passed',
	reviews,
	batches: batchResults.map(withoutReviews),
	missingIds: missing.map((spec) => spec.id),
	invalidBatches
};
writeFileSync(path.join(outputRoot, 'review-summary.json'), `${stableStringify(summary)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== 'passed') process.exit(1);

function withoutReviews(result) {
	const summaryResult = { ...result };
	delete summaryResult.reviews;
	return summaryResult;
}

async function reviewBatch(specs, batchIndex) {
	const batchId = `art-review-${String(batchIndex + 1).padStart(3, '0')}`;
	const batchDir = path.join(outputRoot, 'batches', batchId);
	const resultPath = path.join(batchDir, 'result.json');
	const runSummaryPath = path.join(batchDir, 'run-summary.json');
	const reviewInput = buildReviewInput(specs);
	const reviewRequest = buildArtReviewRequest({
		specs,
		assetInventory: reviewInput.assets,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	});
	const requestSha256 = canonicalHash(reviewRequest);
	if (args.resume && existsSync(resultPath)) {
		const existing = JSON.parse(readFileSync(resultPath, 'utf8'));
		if (
			existsSync(runSummaryPath) &&
			validateReviewResult(existing, specs, reviewInput, reviewRequest).status === 'passed'
		) {
			return buildBatchResult(
				batchId,
				batchDir,
				specs,
				reviewInput,
				reviewRequest,
				existing,
				'resumed'
			);
		}
	}
	mkdirSync(batchDir, { recursive: true });
	writeFileSync(path.join(batchDir, 'review-input.json'), `${stableStringify(reviewInput)}\n`);
	writeFileSync(path.join(batchDir, 'review-request.json'), `${stableStringify(reviewRequest)}\n`);
	const prompt = reviewPrompt(specs, requestSha256);
	writeFileSync(path.join(batchDir, 'prompt.txt'), `${prompt}\n`);
	const modelWorkDir = mkdtempSync(
		path.join(tmpdir(), `question-constellation-science-${batchId}-`)
	);
	let run;
	try {
		const content = stageReviewContent({
			specs,
			reviewInput,
			prompt,
			modelWorkDir
		});
		run = await runCodexSdkTurn(
			buildArtReviewModelTurn({
				prompt,
				structuredInput: content,
				workDir: modelWorkDir,
				eventsPath: path.join(batchDir, 'events.jsonl'),
				lastMessagePath: path.join(batchDir, 'last-message.json'),
				summaryPath: runSummaryPath,
				model: args.model,
				thinkingLevel: args.thinkingLevel,
				timeoutMs: args.timeoutMs,
				outputSchema: reviewOutputSchema(specs.length, requestSha256),
				sandboxMode: 'read-only',
				environmentMode: 'minimal'
			})
		);
	} finally {
		rmSync(modelWorkDir, { recursive: true, force: true });
	}
	requireScienceChallengeModelRunPolicy({
		summary: run,
		eventLogBytes: readFileSync(path.join(batchDir, 'events.jsonl')),
		lastMessageBytes: readFileSync(path.join(batchDir, 'last-message.json')),
		expectedModel: args.model,
		expectedThinkingLevel: args.thinkingLevel,
		policyLabel: `${batchId} art review run`
	});
	let result;
	try {
		result = JSON.parse(run.finalResponse);
	} catch (error) {
		return {
			batchId,
			status: 'failed',
			error: `Review response was not JSON: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const currentReviewInput = buildReviewInput(specs);
	if (canonicalHash(currentReviewInput) !== canonicalHash(reviewInput)) {
		return {
			batchId,
			status: 'failed',
			error: 'Review inputs changed while the batch was running.'
		};
	}
	result.provenance = {
		inputSha256: canonicalHash(reviewInput),
		requestSha256,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	};
	const validation = validateReviewResult(result, specs, reviewInput, reviewRequest);
	writeFileSync(path.join(batchDir, 'validation.json'), `${stableStringify(validation)}\n`);
	writeFileSync(resultPath, `${stableStringify(result)}\n`);
	if (validation.status !== 'passed') {
		return { batchId, status: 'failed', issues: validation.issues };
	}
	return buildBatchResult(batchId, batchDir, specs, reviewInput, reviewRequest, result, 'reviewed');
}

function buildBatchResult(batchId, batchDir, specs, reviewInput, reviewRequest, result, action) {
	const runSummaryPath = path.join(batchDir, 'run-summary.json');
	const resultPath = path.join(batchDir, 'result.json');
	const inputPath = path.join(batchDir, 'review-input.json');
	const requestPath = path.join(batchDir, 'review-request.json');
	const eventLogPath = path.join(batchDir, 'events.jsonl');
	const lastMessagePath = path.join(batchDir, 'last-message.json');
	const promptPath = path.join(batchDir, 'prompt.txt');
	const runSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
	if (!existsSync(eventLogPath) || !existsSync(lastMessagePath) || !existsSync(promptPath)) {
		throw new Error(`${batchId} run summary has invalid model provenance.`);
	}
	requireScienceChallengeModelRunPolicy({
		summary: runSummary,
		eventLogBytes: readFileSync(eventLogPath),
		lastMessageBytes: readFileSync(lastMessagePath),
		expectedModel: args.model,
		expectedThinkingLevel: args.thinkingLevel,
		policyLabel: `${batchId} art review run`
	});
	return {
		batchId,
		status: 'passed',
		action,
		ids: specs.map((spec) => spec.id),
		inputSha256: canonicalHash(reviewInput),
		inputPath: path.relative(rootDir, inputPath),
		inputFileSha256: sha256(readFileSync(inputPath)),
		requestPath: path.relative(rootDir, requestPath),
		requestSha256: canonicalHash(reviewRequest),
		requestFileSha256: sha256(readFileSync(requestPath)),
		resultPath: path.relative(rootDir, resultPath),
		resultSha256: canonicalHash(result),
		runSummaryPath: path.relative(rootDir, runSummaryPath),
		runSummarySha256: canonicalHash(runSummary),
		eventLogPath: path.relative(rootDir, eventLogPath),
		eventLogSha256: sha256(readFileSync(eventLogPath)),
		lastMessagePath: path.relative(rootDir, lastMessagePath),
		lastMessageSha256: sha256(readFileSync(lastMessagePath)),
		promptPath: path.relative(rootDir, promptPath),
		promptSha256: sha256(readFileSync(promptPath)),
		model: runSummary.model,
		thinkingLevel: runSummary.thinkingLevel,
		reviews: result.reviews
	};
}

function reviewPrompt(specs, requestSha256) {
	return `You are the independent visual release judge for ${specs.length} GCSE science question-illustration pairs. You did not author the questions, briefs or images. Inspect every attached DARK then LIGHT pair against the learner-facing question first and the brief second. Return only structured JSON.
The supplied prompt and attached images are complete. Do not inspect the filesystem or call tools.

REVIEW REQUEST SHA-256: ${requestSha256}
Echo this exact value in the top-level requestSha256 field. It binds this response to the ordered briefs and exact dark/light image bytes.

AUTHORITY ORDER
- The learner-facing question is authoritative. The brief is a fallible implementation proposal, not evidence that a conflicting image is correct.
- First compare question with scene, visualAnchor, approvedMeaning, altText and accuracyConstraints. Set briefConsistentWithQuestion=false if the brief changes any variable, allele letter or case, genotype, chemical formula, unit, object count, direction, sample label, material or apparatus state.
- Then inspect both images. Set visibleNotationMatchesQuestion=false if any visible notation, label, symbol, unit or count differs from the exact question. A correct Aa × Aa Punnett square fails an Rr × Rr question.
- Never excuse an image because it follows a contradictory brief. Report both the brief defect and the visible defect.

PASS STANDARD — apply every item independently to every pair
1. Scientific accuracy: every visible object, count, connection, state, scale relationship and apparatus arrangement is scientifically plausible. No extra object implies a false method or mechanism.
2. Exact relevance: the scene is unmistakably specific to this question context, not a generic topic collage or an image for a different task.
3. Brief consistency: every brief field agrees with the exact learner-facing question.
4. Visible notation agreement: every visible variable, allele, genotype, formula, unit, count and label exactly matches the question.
5. No answer leakage: no visible result, conclusion, correct option, solved value, worked method, causal answer, labelled solution or mnemonic makes the learner task automatic.
6. No unwanted text: no title, caption, unintended label, equation, number, option marker, logo, watermark, pseudo-lettering or typographic debris. Exact question-required notation is allowed only when the brief explicitly requires it.
7. Theme fidelity: light is the same composition as dark—same crop, geometry, objects, counts, states, directions and scientific meaning. Only palette, shadows, highlights and glow may change.
8. Visual quality: polished tactile editorial science art, crisp at card size, intentional hierarchy, generous safe margins, no warped apparatus, fused objects, repeated limbs/components, impossible reflections or obvious generation artefacts.
9. Mobile safety: the essential scene remains understandable in a centred 16:9 card approximately 360 px wide without zooming.
10. Accessibility: alt text accurately and completely describes visible content without leaking the answer.

SEVERITY AND DISPOSITION
- major: reserve this for a clear, material contradiction visible at ordinary card scale that makes the pair unusable or likely to teach the wrong science—for example wrong task/answer, conflicting notation or named material, an impossible causal setup, a result that solves the question, or a missing essential object/state. disposition=fresh-regenerate, accepted=false. Supply a concrete regenerationInstruction and leave annotation empty.
- minor: a local or plausibly benign imperfection that leaves the core task identity, scientific takeaway, notation, answer and mobile interpretation intact—for example slightly imperfect nonessential depiction, stylised colour/glow, unequal cosmetic surface finish, or an extra unlabelled ancillary pipe/fixture whose function is not part of the question. disposition=retain-with-annotation, accepted=true. Supply a concise annotation and leave regenerationInstruction empty.
- When a plausible non-answer-changing interpretation exists, prefer minor. Do not mark a pair major merely because an unlabelled ancillary object could be over-interpreted, a specimen finish is cosmetically unequal, or a stylised material is not literally coloured. Escalate only when the visible defect itself establishes a wrong fact or wrong task state.
- A contextual illustration may omit a numerical observation already stated completely in the learner-facing text or show the apparatus immediately before that observation. Treat this as minor when the image remains scientifically plausible, does not assert a conflicting result, and the self-contained question supplies all evidence needed to answer. Do not require generative art to repeat exact question-given numbers merely to pass.
- clean: no issue. disposition=accept, accepted=true.
- Never propose editing or inpainting a failed image. Every major failure is regenerated as a brand-new dark composition, then a new light sibling is derived from that accepted dark master. The rejected pair remains immutable evidence.

Set accepted=true only when all ten booleans are true, score is at least 18/20 and there are no major issues. Minor issues may remain as annotations. Every accepted=false row must contain at least one major issue. Be strict about semantic failures and conservative about regeneration: do not regenerate for minor imperfections.

PAIR BRIEFS
${stableStringify(
	specs.map((spec, index) => ({
		pair: index + 1,
		id: spec.id,
		subject: spec.subject,
		question: spec.question,
		scene: spec.scene,
		visualAnchor: spec.visualAnchor,
		approvedMeaning: spec.approvedMeaning,
		altText: spec.altText,
		accuracyConstraints: spec.accuracyConstraints,
		forbiddenDetails: spec.forbiddenDetails
	}))
)}`;
}

function stageReviewContent({ specs, reviewInput, prompt, modelWorkDir }) {
	const content = [{ type: 'text', text: prompt }];
	for (const [index, spec] of specs.entries()) {
		const expected = reviewInput.assets[index];
		if (expected?.id !== spec.id) {
			throw new Error(`Review input order does not match ${spec.id}.`);
		}
		for (const theme of ['dark', 'light']) {
			const sourcePath = path.resolve(rootDir, spec.output[`${theme}Path`]);
			const stagedPath = path.join(
				modelWorkDir,
				`pair-${String(index + 1).padStart(2, '0')}-${theme}.webp`
			);
			copyFileSync(sourcePath, stagedPath);
			const stagedSha256 = sha256(readFileSync(stagedPath));
			if (stagedSha256 !== expected[`${theme}Sha256`]) {
				throw new Error(
					`Staged ${theme} image bytes changed after review input hashing for ${spec.id}.`
				);
			}
			content.push({
				type: 'text',
				text: `PAIR ${index + 1} / ${spec.id} / ${theme.toUpperCase()}`
			});
			content.push({ type: 'local_image', path: stagedPath });
		}
	}
	return content;
}

function reviewOutputSchema(count, requestSha256) {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['requestSha256', 'reviews'],
		properties: {
			requestSha256: { type: 'string', const: requestSha256 },
			reviews: {
				type: 'array',
				minItems: count,
				maxItems: count,
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'accepted',
						'disposition',
						'score',
						'scientificallyAccurate',
						'exactlyRelevant',
						'briefConsistentWithQuestion',
						'visibleNotationMatchesQuestion',
						'answerNeutral',
						'textClean',
						'themeConsistent',
						'visuallyPolished',
						'mobileSafe',
						'accessibleAlt',
						'visibleTakeaway',
						'issues'
					],
					properties: {
						id: { type: 'string', minLength: 1 },
						accepted: { type: 'boolean' },
						disposition: {
							type: 'string',
							enum: [...SCIENCE_ART_REVIEW_DISPOSITIONS]
						},
						score: { type: 'integer', minimum: 0, maximum: 20 },
						scientificallyAccurate: { type: 'boolean' },
						exactlyRelevant: { type: 'boolean' },
						briefConsistentWithQuestion: { type: 'boolean' },
						visibleNotationMatchesQuestion: { type: 'boolean' },
						answerNeutral: { type: 'boolean' },
						textClean: { type: 'boolean' },
						themeConsistent: { type: 'boolean' },
						visuallyPolished: { type: 'boolean' },
						mobileSafe: { type: 'boolean' },
						accessibleAlt: { type: 'boolean' },
						visibleTakeaway: { type: 'string', minLength: 1 },
						issues: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: [
									'category',
									'severity',
									'description',
									'annotation',
									'regenerationInstruction'
								],
								properties: {
									category: {
										type: 'string',
										enum: [...SCIENCE_ART_REVIEW_ISSUE_CATEGORIES]
									},
									severity: {
										type: 'string',
										enum: [...SCIENCE_ART_REVIEW_ISSUE_SEVERITIES]
									},
									description: { type: 'string', minLength: 1 },
									annotation: { type: 'string' },
									regenerationInstruction: { type: 'string' }
								}
							}
						}
					}
				}
			}
		}
	};
}

function validateReviewResult(result, specs, reviewInput, reviewRequest) {
	const issues = [];
	const requestSha256 = canonicalHash(reviewRequest);
	if (result?.requestSha256 !== requestSha256) {
		issues.push('Raw review response does not bind the exact request and image bytes.');
	}
	if (result?.provenance?.inputSha256 !== canonicalHash(reviewInput)) {
		issues.push('Review provenance does not match the current briefs and image bytes.');
	}
	if (
		result?.provenance?.requestSha256 !== requestSha256 ||
		result?.provenance?.model !== args.model ||
		result?.provenance?.thinkingLevel !== args.thinkingLevel
	) {
		issues.push('Review provenance uses the wrong model or thinking level.');
	}
	if (!Array.isArray(result?.reviews) || result.reviews.length !== specs.length) {
		issues.push(`Expected ${specs.length} reviews.`);
		return { status: 'failed', issues };
	}
	const reviewById = new Map(result.reviews.map((review) => [review.id, review]));
	if (reviewById.size !== result.reviews.length) issues.push('Review ids must be unique.');
	for (const spec of specs) {
		const review = reviewById.get(spec.id);
		if (!review) {
			issues.push(`Missing review for ${spec.id}.`);
			continue;
		}
		const sharedValidation = validateIndependentArtReviewRow(review);
		for (const issue of sharedValidation.issues) issues.push(`${spec.id}.${issue}`);
		for (const field of SCIENCE_ART_REVIEW_BOOLEAN_FIELDS) {
			if (typeof review[field] !== 'boolean') issues.push(`${spec.id}.${field} must be boolean.`);
		}
		if (!Number.isInteger(review.score) || review.score < 0 || review.score > 20) {
			issues.push(`${spec.id}.score must be 0-20.`);
		}
		if (typeof review.visibleTakeaway !== 'string' || !review.visibleTakeaway.trim()) {
			issues.push(`${spec.id}.visibleTakeaway is required.`);
		}
		const reviewIssues = Array.isArray(review.issues) ? review.issues : null;
		if (!reviewIssues) {
			issues.push(`${spec.id}.issues must be an array.`);
		} else {
			for (const [issueIndex, issue] of reviewIssues.entries()) {
				if (
					typeof issue?.category !== 'string' ||
					typeof issue?.severity !== 'string' ||
					typeof issue?.description !== 'string' ||
					!issue.description.trim() ||
					typeof issue?.annotation !== 'string' ||
					typeof issue?.regenerationInstruction !== 'string' ||
					!SCIENCE_ART_REVIEW_ISSUE_SEVERITIES.includes(issue.severity)
				) {
					issues.push(`${spec.id}.issues[${issueIndex}] is incomplete.`);
				}
			}
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

function buildReviewInput(specs) {
	return {
		schemaVersion: SCIENCE_QUESTION_ART_REVIEW_INPUT_SCHEMA,
		manifestSpecsSha256: canonicalHash(specs),
		assets: buildAssetInventory(specs)
	};
}

function buildAssetInventory(specs) {
	return specs.map((spec) => ({
		id: spec.id,
		darkSha256: sha256(readFileSync(path.resolve(rootDir, spec.output.darkPath))),
		lightSha256: sha256(readFileSync(path.resolve(rootDir, spec.output.lightPath)))
	}));
}

function selectSpecs(specs, ids, limit) {
	let selected = ids.length ? specs.filter((spec) => ids.includes(spec.id)) : [...specs];
	for (const id of ids)
		if (!specs.some((spec) => spec.id === id)) throw new Error(`Unknown art id ${id}.`);
	if (limit !== null) selected = selected.slice(0, limit);
	return selected;
}

function chunk(values, size) {
	const chunks = [];
	for (let index = 0; index < values.length; index += size)
		chunks.push(values.slice(index, index + size));
	return chunks;
}

async function runConcurrent(tasks, concurrency) {
	const results = new Array(tasks.length);
	let cursor = 0;
	async function worker() {
		while (cursor < tasks.length) {
			const index = cursor;
			cursor += 1;
			try {
				results[index] = await tasks[index]();
			} catch (error) {
				results[index] = {
					status: 'failed',
					error: error instanceof Error ? error.message : String(error)
				};
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
	return results;
}

function parseArgs(argv) {
	const values = new Map();
	const ids = [];
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') values.set('help', true);
		else if (arg === '--resume') values.set('resume', true);
		else if (arg.startsWith('--id=')) ids.push(arg.slice('--id='.length));
		else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			values.set(key, rest.join('='));
		}
	}
	return {
		help: Boolean(values.get('help')),
		resume: Boolean(values.get('resume')),
		ids,
		manifest: String(
			values.get('manifest') ?? 'tmp/science-challenges/science-500-v1/compiled/art-manifest.json'
		),
		outputRoot: String(
			values.get('output-root') ?? 'tmp/science-challenges/science-500-v1/art-review'
		),
		model: String(values.get('model') ?? MODEL),
		thinkingLevel: String(values.get('thinking-level') ?? THINKING_LEVEL),
		batchSize: integer(values.get('batch-size') ?? 4, '--batch-size', 1, 6),
		concurrency: integer(values.get('concurrency') ?? 2, '--concurrency', 1, 4),
		timeoutMs: integer(values.get('timeout-ms') ?? 7_200_000, '--timeout-ms', 1, 14_400_000),
		requireCount: integer(values.get('require-count') ?? 1_000, '--require-count', 1, 1_000),
		limit: nullableInteger(values.get('limit'), '--limit', 1)
	};
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function nullableInteger(value, label, minimum) {
	if (value === undefined || value === null || value === '') return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum)
		throw new Error(`${label} must be an integer >= ${minimum}.`);
	return parsed;
}

function usage() {
	return [
		'Usage: node scripts/review-science-question-art.mjs [options]',
		'',
		'--manifest=<art-manifest.json>',
		'--output-root=<directory>',
		'--id=<art-id>            Repeat to select specific contexts',
		'--limit=<count>',
		'--batch-size=<1-6>       Default 4 pairs / 8 images',
		'--concurrency=<1-4>      Default 2',
		'--timeout-ms=<number>',
		'--require-count=<count>  Full manifest count gate; default 1000',
		'--resume'
	].join('\n');
}
