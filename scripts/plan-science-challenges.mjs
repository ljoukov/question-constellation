#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
	closeSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	CHALLENGE_ARCS,
	CHALLENGE_DIFFICULTIES,
	CHALLENGE_MECHANICS,
	SCIENCE_CHALLENGE_PLAN_SCHEMA,
	canonicalHash,
	sha256,
	slugify,
	stableStringify,
	validateChallengePlan
} from './lib/science-challenge-release.mjs';
import {
	assertSubstantiveCurriculumEvidence,
	trueCurriculumTopicLeaves
} from './lib/science-challenge-planner-curriculum.mjs';
import {
	normalizeChallengeCatalogSource,
	resolveChallengeCatalogSourcePath
} from './lib/challenge-catalog-source.mjs';

const specifications = Object.freeze({
	biology: 'aqa-gcse-biology-8461-v1.0',
	chemistry: 'aqa-gcse-chemistry-8462-v1.1',
	physics: 'aqa-gcse-physics-8463-v1.1'
});

/**
 * Build and exclusively publish one plan plus its paired curriculum-evidence file.
 *
 * @param {{ rootDir?: string, argv?: string[] }} [options]
 */
export function runScienceChallengePlanner({
	rootDir = process.cwd(),
	argv = process.argv.slice(2)
} = {}) {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(usage());
		return { status: 'help' };
	}

	const outputTargets = resolveScienceChallengePlanOutputs({
		rootDir,
		output: args.output
	});
	assertScienceChallengePlanOutputsAbsent(outputTargets);
	const sourceTarget = resolvePlannerRepositoryFile({
		rootDir,
		value: args.source,
		label: 'source snapshot',
		requireExistingFile: true
	});
	const catalogTarget = resolvePlannerRepositoryFile({
		rootDir,
		value: args.catalog,
		label: 'curriculum catalog',
		requireExistingFile: true
	});
	const challengeCatalogSourceTarget = resolvePlannerRepositoryFile({
		rootDir,
		value: args.catalogSource,
		label: 'active challenge catalog source',
		requireExistingFile: true
	});
	const briefTarget = resolvePlannerRepositoryFile({
		rootDir,
		value: args.brief,
		label: 'plan brief',
		requireExistingFile: true
	});

	const repositoryRoot = sourceTarget.repositoryRoot;
	const sourcePath = sourceTarget.filePath;
	const catalogPath = catalogTarget.filePath;
	const sourceSnapshot = JSON.parse(readFileSync(sourcePath, 'utf8'));
	const curriculumCatalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
	const brief = readPlanBrief(briefTarget.filePath);
	const { allocation, targetDistributions } = brief;

	const challengeCatalogSource = readChallengeCatalogSource(
		repositoryRoot,
		challengeCatalogSourceTarget.filePath
	);
	const existingIds = new Set(
		challengeCatalogSource.definitions.map((definition) => definition.id)
	);
	const rows = [];
	const curriculumEvidence = [];
	const sourceQuestions = normalizedSourceQuestions(sourceSnapshot);
	const usedSourceIds = new Set();

	for (const [subject, specificationId] of Object.entries(specifications)) {
		const specification = curriculumCatalog.specifications.find(
			(entry) => entry.id === specificationId
		);
		if (!specification) throw new Error(`Missing curriculum specification ${specificationId}.`);
		const componentById = new Map(
			specification.components.map((component) => [component.id, component])
		);
		const terminalTopics = trueCurriculumTopicLeaves(specification.components);
		const curriculumPdf = resolvePlannerRepositoryFile({
			rootDir: repositoryRoot,
			value: specification.localPath,
			label: 'curriculum PDF',
			requireExistingFile: true
		});
		const pages = extractPdfPages(
			curriculumPdf.filePath,
			specification.sha256,
			curriculumPdf.fileLabel
		);
		const subjectRows = [];
		for (const [chapterCode, quota] of Object.entries(allocation[subject])) {
			const chapter = specification.components.find(
				(component) => component.kind === 'chapter' && component.code === chapterCode
			);
			if (!chapter) throw new Error(`Missing ${subject} chapter ${chapterCode}.`);
			const leaves = terminalTopics
				.filter((component) => isDescendant(component, chapter, componentById))
				.sort((left, right) => left.displayOrder - right.displayOrder);
			if (leaves.length === 0) throw new Error(`${subject} ${chapterCode} has no leaf topics.`);
			if (quota < leaves.length) {
				throw new Error(
					`${subject} ${chapterCode} quota ${quota} cannot cover ${leaves.length} leaves.`
				);
			}
			const repeatedLeaves = spreadLeaves(leaves, quota);
			for (const [chapterIndex, component] of repeatedLeaves.entries()) {
				const occurrence = repeatedLeaves
					.slice(0, chapterIndex + 1)
					.filter((item) => item.id === component.id).length;
				const baseId = `${subject}-${slugify(component.title)}-${String(occurrence).padStart(2, '0')}`;
				const id = uniqueId(
					baseId,
					existingIds,
					new Set([...rows, ...subjectRows].map((plannedRow) => plannedRow.id))
				);
				subjectRows.push({
					id,
					subject,
					specificationId,
					specificationSha256: specification.sha256,
					chapterId: chapter.id,
					chapterCode: chapter.code,
					chapterTitle: chapter.title,
					curriculumComponentId: component.id,
					curriculumCode: component.code,
					curriculumTitle: component.title,
					curriculumPageStart: component.sourcePageStart,
					curriculumPageEnd: component.sourcePageEnd
				});
				if (!curriculumEvidence.some((entry) => entry.componentId === component.id)) {
					const sourceText = extractComponentSourceText(pages, component, specification.components);
					assertSubstantiveCurriculumEvidence(component, sourceText);
					curriculumEvidence.push({
						componentId: component.id,
						specificationId,
						specificationSha256: specification.sha256,
						code: component.code,
						title: component.title,
						pageStart: component.sourcePageStart,
						pageEnd: component.sourcePageEnd,
						sourceText,
						sourceTextSha256: canonicalHash(sourceText)
					});
				}
			}
		}

		const expectedTotal = Object.values(allocation[subject]).reduce((sum, value) => sum + value, 0);
		if (subjectRows.length !== expectedTotal) {
			throw new Error(
				`${subject} allocation produced ${subjectRows.length}; expected ${expectedTotal}.`
			);
		}
		const difficultySequence = balancedSequence(targetDistributions[subject].difficulty);
		const taskShapeAssignments = assignTaskShapes(
			subjectRows,
			targetDistributions[subject].taskShape,
			new Map(curriculumEvidence.map((entry) => [entry.componentId, entry]))
		);
		for (const [index, row] of subjectRows.entries()) {
			const difficulty = difficultySequence[index];
			const taskShape = taskShapeAssignments.get(row.id);
			const calibration = chooseCalibrationQuestion({
				row,
				difficulty,
				taskShape,
				questions: sourceQuestions.filter((question) => question.subject === subject),
				usedSourceIds
			});
			if (!calibration)
				throw new Error(`No unused ${subject} calibration question remains for ${row.id}.`);
			usedSourceIds.add(calibration.id);
			rows.push({
				...row,
				difficulty,
				taskShape,
				arc: arcFor(taskShape, row.chapterCode, index),
				mechanic: CHALLENGE_MECHANICS[index % CHALLENGE_MECHANICS.length],
				calibrationQuestionId: calibration.id,
				calibrationQuestionSha256: calibration.contentSha256,
				calibrationFit: calibrationFit(row, calibration),
				shard: null
			});
		}
	}

	rows.forEach((row, index) => {
		row.shard = `science-${String(Math.floor(index / args.shardSize) + 1).padStart(3, '0')}`;
	});

	const plan = {
		schemaVersion: SCIENCE_CHALLENGE_PLAN_SCHEMA,
		planId: args.planId,
		createdOn: args.createdOn,
		baseCatalogContentSha256: challengeCatalogSource.contentSha256,
		baseCatalogRecordCount: challengeCatalogSource.records.length,
		sourceSnapshotPath: sourceTarget.fileLabel,
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumCatalogPath: catalogTarget.fileLabel,
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		briefPath: briefTarget.fileLabel,
		briefSha256: canonicalHash(brief),
		allocation,
		targetDistributions,
		rows
	};

	const validation = validateChallengePlan(plan, { sourceSnapshot, curriculumCatalog });
	if (validation.status !== 'passed') {
		throw new Error(`Generated plan is invalid:\n${validation.issues.join('\n')}`);
	}
	assertPlanCoverage(plan, curriculumCatalog);

	const written = writeScienceChallengePlanOutputs({
		rootDir: repositoryRoot,
		output: args.output,
		planContents: `${stableStringify(plan)}\n`,
		evidenceContents: `${stableStringify({
			schemaVersion: 'science-curriculum-evidence/v1',
			planId: args.planId,
			catalogSha256: plan.curriculumCatalogSha256,
			components: curriculumEvidence
		})}\n`
	});
	const summary = {
		status: 'passed',
		plan: written.planLabel,
		curriculumEvidence: written.evidenceLabel,
		rows: rows.length,
		contexts: rows.length * 2,
		calibrationQuestions: usedSourceIds.size,
		shards: new Set(rows.map((row) => row.shard)).size,
		sha256: canonicalHash(plan)
	};
	console.log(JSON.stringify(summary, null, 2));
	return { ...summary, plan };
}

/**
 * Resolve the plan and fixed sibling evidence destination without accepting an absolute or
 * repository-escaping operator path.
 *
 * @param {{ rootDir?: string, output?: string }} [options]
 */
export function resolveScienceChallengePlanOutputs({
	rootDir = process.cwd(),
	output = 'tmp/science-challenges/candidate-release/plan.json'
} = {}) {
	const plan = resolvePlannerRepositoryFile({
		rootDir,
		value: output,
		label: 'plan output'
	});
	const evidencePath = path.join(path.dirname(plan.filePath), 'curriculum-evidence.json');
	if (evidencePath === plan.filePath) {
		throw new Error(
			'--output must not use the reserved curriculum-evidence.json sibling filename.'
		);
	}
	return {
		repositoryRoot: plan.repositoryRoot,
		planPath: plan.filePath,
		planLabel: plan.fileLabel,
		evidencePath,
		evidenceLabel: repoRelativeLabel(plan.repositoryRoot, evidencePath)
	};
}

/**
 * Claim both final paths with exclusive creation before writing either payload. On any failure,
 * remove only files whose device/inode identity still matches this invocation's claims.
 *
 * @param {{ rootDir?: string, output?: string, planContents: string | NodeJS.ArrayBufferView, evidenceContents: string | NodeJS.ArrayBufferView }} options
 */
export function writeScienceChallengePlanOutputs({
	rootDir = process.cwd(),
	output = 'tmp/science-challenges/candidate-release/plan.json',
	planContents,
	evidenceContents
}) {
	const targets = resolveScienceChallengePlanOutputs({ rootDir, output });
	ensurePlannerOutputParent(targets);
	const files = [
		{
			filePath: targets.planPath,
			fileLabel: targets.planLabel,
			contents: planContents
		},
		{
			filePath: targets.evidencePath,
			fileLabel: targets.evidenceLabel,
			contents: evidenceContents
		}
	];
	const claims = [];
	let activeLabel = targets.planLabel;

	try {
		for (const file of files) {
			activeLabel = file.fileLabel;
			ensurePlannerOutputParent(targets);
			const descriptor = openSync(file.filePath, 'wx', 0o666);
			const stats = fstatSync(descriptor);
			if (!stats.isFile()) {
				closeSync(descriptor);
				throw new Error('Exclusive output claim did not create a regular file.');
			}
			claims.push({
				...file,
				descriptor,
				device: stats.dev,
				inode: stats.ino
			});
		}

		// Refuse a parent-path swap after claiming but before payload bytes are written.
		ensurePlannerOutputParent(targets);
		for (const claim of claims) {
			activeLabel = claim.fileLabel;
			writeFileSync(claim.descriptor, claim.contents, { encoding: 'utf8' });
			fsyncSync(claim.descriptor);
		}
		for (const claim of claims) {
			closeSync(claim.descriptor);
			claim.descriptor = null;
		}
	} catch (error) {
		for (const claim of claims) {
			if (claim.descriptor === null) continue;
			try {
				closeSync(claim.descriptor);
			} catch {
				// Identity-checked cleanup below is still safe after a close failure.
			}
			claim.descriptor = null;
		}
		const cleanupIncomplete = claims.some((claim) => !removeMatchingPlannerClaim(claim));
		throw plannerOutputWriteError(error, activeLabel, cleanupIncomplete);
	}

	return {
		planPath: targets.planPath,
		planLabel: targets.planLabel,
		evidencePath: targets.evidencePath,
		evidenceLabel: targets.evidenceLabel
	};
}

/**
 * @param {{ rootDir?: string, value: string, label: string, requireExistingFile?: boolean }} options
 */
function resolvePlannerRepositoryFile({
	rootDir = process.cwd(),
	value,
	label,
	requireExistingFile = false
}) {
	if (typeof rootDir !== 'string' || rootDir.length === 0) {
		throw new Error('Repository root must be a non-empty path.');
	}
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.includes('\0') ||
		path.isAbsolute(value) ||
		path.win32.isAbsolute(value)
	) {
		throw new Error(`${label} must be a repo-relative path contained by the repository root.`);
	}
	const repositoryRoot = path.resolve(rootDir);
	const rootStats = safePlannerLstat(repositoryRoot, 'repository root');
	if (!rootStats || rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
		throw new Error('Repository root must be an existing non-symlink directory.');
	}
	const filePath = path.resolve(repositoryRoot, value);
	const fileLabel = repoRelativeLabel(repositoryRoot, filePath);
	if (requireExistingFile) assertPlannerInputFile(repositoryRoot, filePath, label);
	return { repositoryRoot, filePath, fileLabel };
}

/** @param {string} repositoryRoot @param {string} filePath */
function repoRelativeLabel(repositoryRoot, filePath) {
	const relative = path.relative(repositoryRoot, filePath);
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error('Path must be a repo-relative file contained by the repository root.');
	}
	return relative.split(path.sep).join('/');
}

/** @param {string} repositoryRoot @param {string} filePath @param {string} label */
function assertPlannerInputFile(repositoryRoot, filePath, label) {
	const relativeParent = path.relative(repositoryRoot, path.dirname(filePath));
	let current = repositoryRoot;
	for (const component of relativeParent ? relativeParent.split(path.sep) : []) {
		current = path.join(current, component);
		const stats = safePlannerLstat(current, label);
		if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error(`${label} must have non-symlink repository parents.`);
		}
	}
	const stats = safePlannerLstat(filePath, label);
	if (!stats || stats.isSymbolicLink() || !stats.isFile()) {
		throw new Error(`${label} must be an existing regular non-symlink file.`);
	}
}

/**
 * @param {{ repositoryRoot: string, planPath: string, evidencePath: string }} targets
 */
function assertScienceChallengePlanOutputsAbsent(targets) {
	assertSafePlannerOutputPrefix(targets);
	for (const filePath of [targets.planPath, targets.evidencePath]) {
		if (safePlannerLstat(filePath, 'plan output')) {
			throw new Error('Plan output already exists or is a symbolic link; refusing to overwrite.');
		}
	}
}

/**
 * Inspect the existing parent prefix without creating it.
 *
 * @param {{ repositoryRoot: string, planPath: string }} targets
 */
function assertSafePlannerOutputPrefix(targets) {
	const relativeParent = path.relative(targets.repositoryRoot, path.dirname(targets.planPath));
	let current = targets.repositoryRoot;
	for (const component of relativeParent ? relativeParent.split(path.sep) : []) {
		current = path.join(current, component);
		const stats = safePlannerLstat(current, 'plan output parent');
		if (!stats) break;
		if (stats.isSymbolicLink()) throw new Error('Plan output parents must not be symbolic links.');
		if (!stats.isDirectory()) throw new Error('Every plan output parent must be a directory.');
	}
}

/**
 * @param {{ repositoryRoot: string, planPath: string }} targets
 */
function ensurePlannerOutputParent(targets) {
	const relativeParent = path.relative(targets.repositoryRoot, path.dirname(targets.planPath));
	let current = targets.repositoryRoot;
	for (const component of relativeParent ? relativeParent.split(path.sep) : []) {
		current = path.join(current, component);
		let stats = safePlannerLstat(current, 'plan output parent');
		if (!stats) {
			try {
				mkdirSync(current);
			} catch (error) {
				if (plannerFilesystemCode(error) !== 'EEXIST') {
					throw new Error(
						`Could not create the plan output parent${safePlannerCodeSuffix(error)}.`
					);
				}
			}
			stats = safePlannerLstat(current, 'plan output parent');
		}
		if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error('Plan output parents must remain non-symlink directories.');
		}
	}
}

/** @param {{filePath: string, device: number | bigint, inode: number | bigint}} claim */
function removeMatchingPlannerClaim(claim) {
	try {
		const stats = safePlannerLstat(claim.filePath, 'claimed plan output');
		if (!stats) return true;
		if (
			stats.isSymbolicLink() ||
			!stats.isFile() ||
			stats.dev !== claim.device ||
			stats.ino !== claim.inode
		) {
			return false;
		}
		unlinkSync(claim.filePath);
		return true;
	} catch {
		return false;
	}
}

/** @param {string} filePath @param {string} label */
function safePlannerLstat(filePath, label) {
	try {
		return lstatSync(filePath);
	} catch (error) {
		if (plannerFilesystemCode(error) === 'ENOENT') return null;
		throw new Error(`Could not inspect ${label}${safePlannerCodeSuffix(error)}.`);
	}
}

/** @param {unknown} error @param {string} label @param {boolean} cleanupIncomplete */
function plannerOutputWriteError(error, label, cleanupIncomplete) {
	const exists =
		plannerFilesystemCode(error) === 'EEXIST' || plannerFilesystemCode(error) === 'ELOOP';
	const reason = exists
		? `Output already exists or is a symbolic link; refusing to overwrite: ${label}.`
		: `Could not create plan output ${label}${safePlannerCodeSuffix(error)}.`;
	return new Error(
		`${reason}${cleanupIncomplete ? ' Claimed-output cleanup was incomplete.' : ''}`
	);
}

/** @param {unknown} error */
function safePlannerCodeSuffix(error) {
	const code = plannerFilesystemCode(error);
	return code ? ` (${code})` : '';
}

/** @param {unknown} error */
function plannerFilesystemCode(error) {
	return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
		? error.code
		: null;
}

function normalizedSourceQuestions(snapshot) {
	if (!Array.isArray(snapshot.questions))
		throw new Error('Source snapshot has no questions array.');
	return snapshot.questions.map((question) => ({
		...question,
		subject: String(question.subjectArea ?? question.subject_area ?? question.subject ?? '')
			.trim()
			.toLowerCase(),
		specRef: String(
			question.specificationReference ?? question.specRef ?? question.spec_ref ?? ''
		).trim(),
		topicPath: parseArray(question.topicPath ?? question.topic_path_json),
		prompt: String(
			question.selfContainedPromptText ??
				question.self_contained_prompt_text ??
				question.promptText ??
				question.prompt_text ??
				''
		),
		commandWord: String(question.commandWord ?? question.command_word ?? ''),
		marks: Number(question.marks ?? 0),
		answerFormat: String(question.answerFormat ?? question.answer_format ?? ''),
		contentSha256: String(
			question.contentSha256 ?? question.content_sha256 ?? canonicalHash(question)
		)
	}));
}

function chooseCalibrationQuestion({ row, difficulty, taskShape, questions, usedSourceIds }) {
	return questions
		.filter((question) => !usedSourceIds.has(question.id))
		.map((question) => ({ question, score: sourceFitScore(row, difficulty, taskShape, question) }))
		.sort(
			(left, right) => right.score - left.score || left.question.id.localeCompare(right.question.id)
		)[0]?.question;
}

function sourceFitScore(row, difficulty, taskShape, question) {
	let score = 0;
	const ref = question.specRef.replace(/^([456])\./, '4.');
	if (ref === row.curriculumCode) score += 160;
	if (ref.startsWith(`${row.curriculumCode}.`) || row.curriculumCode.startsWith(`${ref}.`))
		score += 90;
	if (ref.startsWith(`${row.chapterCode}.`) || ref === row.chapterCode) score += 45;
	const haystack =
		`${question.prompt} ${question.commandWord} ${question.topicPath.join(' ')}`.toLowerCase();
	for (const term of row.curriculumTitle
		.toLowerCase()
		.split(/\W+/)
		.filter((term) => term.length > 4)) {
		if (haystack.includes(term)) score += 5;
	}
	if (
		taskShape === 'quantitative' &&
		/calculate|determine|equation|value|mass|energy|force|rate|percentage/.test(haystack)
	)
		score += 30;
	if (
		taskShape === 'practical-or-data' &&
		/experiment|investigat|method|result|table|graph|data|measure|sample/.test(haystack)
	)
		score += 30;
	if (
		taskShape === 'visual-or-model' &&
		/model|structure|particle|cell|circuit|wave|field|apparatus/.test(haystack)
	)
		score += 25;
	if (taskShape === 'explanation' && /explain|suggest|why|describe/.test(haystack)) score += 20;
	if (taskShape === 'recall-or-selection' && /state|name|give|identify|which/.test(haystack))
		score += 20;
	const expectedMarks = difficulty === 'starter' ? 1.5 : difficulty === 'standard' ? 3 : 5;
	score -= Math.abs((question.marks || expectedMarks) - expectedMarks) * 3;
	return score;
}

function calibrationFit(row, question) {
	const normalized = question.specRef.replace(/^([456])\./, '4.');
	if (normalized === row.curriculumCode) return 'exact-topic';
	if (
		normalized.startsWith(`${row.curriculumCode}.`) ||
		row.curriculumCode.startsWith(`${normalized}.`)
	)
		return 'topic-family';
	if (normalized.startsWith(`${row.chapterCode}.`) || normalized === row.chapterCode)
		return 'same-chapter';
	return 'same-subject-task-shape';
}

function balancedSequence(counts) {
	const remaining = Object.entries(counts).map(([value, count]) => ({
		value,
		count,
		initial: count
	}));
	const total = remaining.reduce((sum, entry) => sum + entry.count, 0);
	const result = [];
	for (let index = 0; index < total; index += 1) {
		remaining.sort((left, right) => {
			const leftNeed = left.count / left.initial;
			const rightNeed = right.count / right.initial;
			return rightNeed - leftNeed || left.value.localeCompare(right.value);
		});
		const selected = remaining.find((entry) => entry.count > 0);
		if (!selected) break;
		result.push(selected.value);
		selected.count -= 1;
	}
	return result;
}

function assignTaskShapes(rows, counts, evidenceByComponentId) {
	const assignments = new Map();
	const remaining = new Set(rows.map((row) => row.id));
	const constrainedOrder = [
		'quantitative',
		'practical-or-data',
		'visual-or-model',
		'recall-or-selection',
		'explanation'
	];
	for (const shape of constrainedOrder) {
		const count = counts[shape] ?? 0;
		const ranked = rows
			.filter((row) => remaining.has(row.id))
			.map((row) => ({
				row,
				score: taskShapeSuitability(
					row,
					shape,
					evidenceByComponentId.get(row.curriculumComponentId)?.sourceText ?? ''
				)
			}))
			.sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id));
		if (ranked.length < count) throw new Error(`Not enough unassigned rows for ${shape}.`);
		for (const { row } of ranked.slice(0, count)) {
			assignments.set(row.id, shape);
			remaining.delete(row.id);
		}
	}
	if (assignments.size !== rows.length) {
		throw new Error(`Task-shape assignment covered ${assignments.size}/${rows.length} rows.`);
	}
	return assignments;
}

function taskShapeSuitability(row, shape, officialText) {
	const text = `${row.curriculumTitle} ${row.chapterTitle} ${officialText}`.toLowerCase();
	const score = (patterns, weight) =>
		patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? weight : 0), 0);
	if (shape === 'quantitative') {
		return (
			score(
				[
					/\b(?:calculat\w*|equation|quantit\w*|ratio|proportion|percentage|rate|mean|range|uncertaint\w*|magnification|surface area|volume|mass|moles?|concentration|yield|atom economy|energy|power|efficiency|charge|current|potential difference|resistance|density|pressure|force|acceleration|momentum|wavelength|frequency|half-life|distance|speed|time)\b/
				],
				60
			) +
			(row.subject === 'physics' ? 20 : 0) +
			(/required practical|investigat/.test(text) ? 8 : 0)
		);
	}
	if (shape === 'practical-or-data') {
		return score(
			[
				/required practical|investigat|experiment|method|measurement|sample|test for|chromatograph|flame test|titration|distillation|purif|culturing|microscop|sampling|field investigation|data|graph/
			],
			55
		);
	}
	if (shape === 'visual-or-model') {
		return score(
			[
				/model|structure|cell|organelle|chromosome|dna|allele|bond|lattice|particle|electrode|circuit|field|magnet|wave|ray|lens|atom|nucleus|isotope|solar system|orbit|star|force/
			],
			42
		);
	}
	if (shape === 'recall-or-selection') {
		return score(
			[
				/state|describe|identify|name|definition|types? of|properties|uses|examples|classification|group/
			],
			25
		);
	}
	return (
		score(
			[
				/explain|effect|process|how|why|mechanism|relationship|response|change|control|transfer|cycle|evolution/
			],
			20
		) + 5
	);
}

function spreadLeaves(leaves, quota) {
	const result = [...leaves];
	let cursor = 0;
	while (result.length < quota) {
		result.push(leaves[cursor % leaves.length]);
		cursor += 1;
	}
	return result;
}

function arcFor(taskShape, chapterCode, index) {
	if (taskShape === 'quantitative') return 'mark-the-working';
	if (taskShape === 'practical-or-data')
		return index % 2 ? 'complete-the-method' : 'read-the-evidence';
	if (taskShape === 'visual-or-model' && chapterCode === '4.5') return 'track-the-forces';
	if (taskShape === 'recall-or-selection') return 'read-the-evidence';
	return 'connect-cause-to-effect';
}

function isDescendant(component, parent, componentById) {
	let current = component;
	while (current?.parentId) {
		if (current.parentId === parent.id) return true;
		current = componentById.get(current.parentId);
	}
	return false;
}

function extractPdfPages(pdfPath, expectedSha256, pdfLabel = 'curriculum PDF') {
	const bytes = readFileSync(pdfPath);
	const actual = sha256(bytes);
	if (actual !== expectedSha256) {
		throw new Error(
			`Curriculum PDF hash mismatch for ${pdfLabel}: expected ${expectedSha256}, found ${actual}.`
		);
	}
	const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	return text.split('\f');
}

function extractComponentSourceText(pages, component, components) {
	const pageText = pages.slice(component.sourcePageStart - 1, component.sourcePageEnd).join('\n\n');
	const lines = pageText.split(/\r?\n/);
	const start = findComponentLine(lines, component);
	if (start === -1) return pageText.trim();
	const nextComponent = components
		.filter(
			(candidate) =>
				candidate.kind === 'topic' &&
				candidate.displayOrder > component.displayOrder &&
				candidate.sourcePageStart <= component.sourcePageEnd
		)
		.sort((left, right) => left.displayOrder - right.displayOrder)[0];
	let end = lines.length;
	if (nextComponent) {
		const relativeNext = findComponentLine(lines.slice(start + 1), nextComponent);
		if (relativeNext !== -1) end = start + 1 + relativeNext;
	}
	return lines.slice(start, end).join('\n').trim();
}

function findComponentLine(lines, component) {
	const titleWords = component.title
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.split(/\s+/)
		.filter((word) => word.length > 3)
		.slice(0, 3);
	return lines.findIndex((line) => {
		const normalized = line.toLowerCase().replace(/[^a-z0-9. ]+/g, ' ');
		return (
			normalized.includes(component.code.toLowerCase()) &&
			titleWords.every((word) => normalized.includes(word))
		);
	});
}

function assertPlanCoverage(plan, catalog) {
	const covered = new Set(plan.rows.map((row) => row.curriculumComponentId));
	for (const specificationId of Object.values(specifications)) {
		const specification = catalog.specifications.find((entry) => entry.id === specificationId);
		for (const component of trueCurriculumTopicLeaves(specification.components)) {
			if (!covered.has(component.id))
				throw new Error(`Plan misses official leaf topic ${component.id}.`);
		}
	}
	if (new Set(plan.rows.map((row) => row.calibrationQuestionId)).size !== plan.rows.length) {
		throw new Error('Every generated round must use a distinct paper-calibration question.');
	}
	if (!CHALLENGE_DIFFICULTIES.every((value) => plan.rows.some((row) => row.difficulty === value))) {
		throw new Error('Difficulty coverage is incomplete.');
	}
	if (!CHALLENGE_ARCS.every((value) => plan.rows.some((row) => row.arc === value))) {
		throw new Error('Arc coverage is incomplete.');
	}
	if (!CHALLENGE_MECHANICS.every((value) => plan.rows.some((row) => row.mechanic === value))) {
		throw new Error('Mechanic coverage is incomplete.');
	}
}

function readChallengeCatalogSource(repositoryRoot, sourcePath) {
	const absolutePath = resolveChallengeCatalogSourcePath({
		rootDir: repositoryRoot,
		sourcePath
	});
	return normalizeChallengeCatalogSource(JSON.parse(readFileSync(absolutePath, 'utf8')), {
		source: absolutePath
	});
}

function readPlanBrief(filePath) {
	const brief = JSON.parse(readFileSync(filePath, 'utf8'));
	if (
		brief?.schemaVersion !== 'science-challenge-plan-brief/v1' ||
		!brief.allocation ||
		typeof brief.allocation !== 'object' ||
		Array.isArray(brief.allocation) ||
		!brief.targetDistributions ||
		typeof brief.targetDistributions !== 'object' ||
		Array.isArray(brief.targetDistributions)
	) {
		throw new Error('Plan brief must use science-challenge-plan-brief/v1.');
	}
	for (const subject of Object.keys(specifications)) {
		const subjectAllocation = brief.allocation[subject];
		const distributions = brief.targetDistributions[subject];
		if (
			!subjectAllocation ||
			typeof subjectAllocation !== 'object' ||
			Array.isArray(subjectAllocation) ||
			Object.keys(subjectAllocation).length === 0 ||
			Object.values(subjectAllocation).some(
				(count) => !Number.isInteger(count) || count < 1
			)
		) {
			throw new Error(`Plan brief allocation for ${subject} is invalid.`);
		}
		const subjectTotal = Object.values(subjectAllocation).reduce(
			(total, count) => total + count,
			0
		);
		for (const [dimension, allowedValues] of [
			['difficulty', CHALLENGE_DIFFICULTIES],
			[
				'taskShape',
				[
					'recall-or-selection',
					'explanation',
					'quantitative',
					'practical-or-data',
					'visual-or-model'
				]
			]
		]) {
			const counts = distributions?.[dimension];
			if (
				!counts ||
				typeof counts !== 'object' ||
				Array.isArray(counts) ||
				Object.keys(counts).some((value) => !allowedValues.includes(value)) ||
				allowedValues.some((value) => !Number.isInteger(counts[value]) || counts[value] < 0) ||
				Object.values(counts).reduce((total, count) => total + count, 0) !== subjectTotal
			) {
				throw new Error(
					`Plan brief ${dimension} distribution for ${subject} must sum to ${subjectTotal}.`
				);
			}
		}
	}
	return brief;
}

function uniqueId(baseId, existingIds, plannedIds) {
	let id = baseId;
	let suffix = 2;
	while (existingIds.has(id) || plannedIds.has(id)) {
		id = `${baseId}-${suffix}`;
		suffix += 1;
	}
	return id;
}

function parseArray(value) {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value !== 'string' || !value.trim()) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') values.set('help', true);
		else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			values.set(key, rest.join('='));
		}
	}
	const shardSize = Number(values.get('shard-size') ?? 8);
	if (!Number.isInteger(shardSize) || shardSize < 1 || shardSize > 20) {
		throw new Error('--shard-size must be an integer from 1 to 20.');
	}
	const createdOn = String(values.get('created-on') ?? new Date().toISOString().slice(0, 10));
	if (!/^\d{4}-\d{2}-\d{2}$/.test(createdOn)) {
		throw new Error('--created-on must be YYYY-MM-DD.');
	}
	return {
		help: Boolean(values.get('help')),
		source: String(values.get('source') ?? 'tmp/science-challenge-sources-v1.json'),
		catalog: String(values.get('catalog') ?? 'data/curricula/curriculum-catalog.json'),
		catalogSource: String(
			values.get('catalog-source') ?? 'tmp/challenge-catalog/current-source.json'
		),
		brief: String(values.get('brief') ?? 'tmp/science-challenges/plan-brief.json'),
		output: String(values.get('output') ?? 'tmp/science-challenges/candidate-release/plan.json'),
		planId: String(values.get('plan-id') ?? 'candidate-release'),
		createdOn,
		shardSize
	};
}

function usage() {
	return [
		'Usage: node scripts/plan-science-challenges.mjs [options]',
		'',
		'--source=<snapshot.json>  Read-only D1 snapshot from export-science-challenge-sources',
		'--catalog=<catalog.json>  Hash-bound curriculum catalog',
		'--catalog-source=<json>   Active D1 challenge source exported to ignored tmp/',
		'--brief=<brief.json>      Explicit ignored-workspace allocation and distribution brief',
		'--output=<plan.json>      Output plan (default tmp/science-challenges/candidate-release/plan.json)',
		'--plan-id=<id>            Stable plan id',
		'--created-on=<YYYY-MM-DD> Plan date (default today)',
		'--shard-size=<1-20>       Generation rows per model shard (default 8)'
	].join('\n');
}

function sanitizePlannerError(error, repositoryRoot) {
	const message = error instanceof Error ? error.message : String(error);
	const resolvedRoot = path.resolve(repositoryRoot);
	return message
		.split(resolvedRoot)
		.join('<repository>')
		.replace(/\/U[s]ers\/[^/\s"'`]+(?:\/[^\s"'`]*)?/g, '<local-path>')
		.replace(/\/h[o]me\/[^/\s"'`]+(?:\/[^\s"'`]*)?/g, '<local-path>')
		.replace(/[A-Za-z]:\\U[s]ers\\[^\\\s"'`]+(?:\\[^\s"'`]*)?/g, '<local-path>');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	try {
		runScienceChallengePlanner();
	} catch (error) {
		console.error(sanitizePlannerError(error, process.cwd()));
		process.exitCode = 1;
	}
}
