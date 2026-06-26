#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { generateJson, loadLocalEnv } from '@ljoukov/llm';
import {
	answerChainSpecificityIssues,
	blockingAnswerChainSpecificityIssues,
	chainSpecificityIssueSummary
} from './answer-chain-specificity.mjs';

const rootDir = process.cwd();
const extractionRoot = path.join(
	rootDir,
	'data/vision-extracted/aqa-combined-science-trilogy-higher/physics'
);
const taxonomyPath = path.join(rootDir, 'docs/physics-chain-family-taxonomy.md');
const defaultModel = process.env.PHYSICS_CHAIN_REPAIR_MODEL ?? 'chatgpt-gpt-5.5-fast';

const paperArg = stringArg('paper', '');
const allPapers = hasArg('all');
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const specificity = hasArg('specificity');
const model = stringArg('model', defaultModel);
const batchSize = integerArg('batch-size', 16, 1);

if (!paperArg && !allPapers) {
	throw new Error('Pass --paper=<source_document_id> or --all.');
}

loadLocalEnv();
process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
process.env.CHATGPT_RESPONSES_EXPERIMENTAL_HEADER = 'off';

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function integerArg(name, defaultValue, minValue) {
	const value = stringArg(name, '');
	if (!value) return defaultValue;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return parsed;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function taxonomyExcerpt() {
	if (!existsSync(taxonomyPath)) return '';
	const raw = readFileSync(taxonomyPath, 'utf8');
	return raw
		.split(/\r?\n/)
		.filter((line) => /physics-chain-|^## |^### /.test(line))
		.join('\n')
		.slice(0, 18000);
}

function loadPaperFiles() {
	if (!existsSync(extractionRoot)) {
		throw new Error(
			`No vision extraction directory found at ${path.relative(rootDir, extractionRoot)}.`
		);
	}
	const files = readdirSync(extractionRoot)
		.filter((fileName) => fileName.endsWith('.json'))
		.sort();
	const selected = allPapers
		? files
		: files.filter(
				(fileName) => fileName === `${paperArg}.json` || fileName.startsWith(`${paperArg}.`)
			);
	if (!selected.length) throw new Error(`No extracted Physics paper matched ${paperArg}.`);
	return selected.map((fileName) => {
		const filePath = path.join(extractionRoot, fileName);
		return { filePath, paper: readJson(filePath) };
	});
}

function compactQuestion(question, sourceDocumentId) {
	return {
		sourceDocumentId,
		sourceQuestionRef: question.sourceQuestionRef,
		marks: question.marks,
		topicPath: question.topicPath ?? [],
		specRef: question.specRef ?? null,
		commandWord: question.commandWord ?? null,
		promptText: question.promptText,
		contextText: question.contextText ?? null,
		response: question.response ?? null,
		markSchemeItems: (question.markSchemeItems ?? []).map((item, index) => ({
			index,
			text: item.text,
			marks: item.marks ?? null
		})),
		markChecklist: (question.markChecklist ?? []).map((item, index) => ({
			index,
			text: item.text,
			required: item.required,
			markSchemeItemIndexes: item.markSchemeItemIndexes ?? []
		})),
		modelAnswer: question.modelAnswer?.answerText ?? null,
		currentAnswerChain: question.answerChain ?? null,
		currentAnswerChainIssues: question.answerChain
			? answerChainSpecificityIssues(question.answerChain, {
					commandWord: question.commandWord
				})
			: [],
		commonWeakAnswers: question.commonWeakAnswers ?? []
	};
}

const AnswerChainSchema = z.object({
	id: z.string().nullable(),
	title: z.string(),
	canonicalChainText: z.string(),
	summary: z.string(),
	broadTopic: z.string().nullable(),
	chainFamilyId: z.string().nullable(),
	steps: z.array(
		z.object({
			stepText: z.string(),
			stepRole: z.string(),
			explanation: z.string().nullable(),
			commonOmission: z.string().nullable(),
			markSchemeItemIndexes: z.array(z.number())
		})
	),
	confidence: z.number(),
	needsHumanReview: z.boolean(),
	reviewNotes: z.array(z.string())
});

const WeakAnswerSchema = z.object({
	weakAnswerText: z.string(),
	missingStepIndexes: z.array(z.number()),
	explanation: z.string(),
	confidence: z.number()
});

const RepairSchema = z.object({
	repairs: z.array(
		z.object({
			sourceDocumentId: z.string(),
			sourceQuestionRef: z.string(),
			answerChain: AnswerChainSchema,
			commonWeakAnswers: z.array(WeakAnswerSchema).nullable()
		})
	)
});

function buildPrompt(tasks) {
	return [
		'Create missing answerChain objects for these AQA GCSE Combined Science Physics questions.',
		'Also repair any provided currentAnswerChain whose currentAnswerChainIssues show prompt-specific numeric solution wording.',
		'The question data below was already extracted visually from the original question paper and mark scheme PDFs. Do not infer from old PDF text extraction.',
		'Return exactly one repair for every input task.',
		'Every answerChain must describe the reusable answer move tested by the question.',
		'For simple recall, MCQ, matching, or label questions, create a compact single-step chain that names the discriminating fact, classification, reading move, or selection rule.',
		'For calculation or explanation questions, create 2-5 concise steps that match the official checklist and mark scheme.',
		'For calculation chains, do not put prompt-specific numbers, substitutions, intermediate values, final numeric answers, or question-specific units in title, canonicalChainText, summary, stepText, explanation, or commonOmission.',
		'Use generic method wording such as "convert the extension to metres", "substitute the known values into $E_e=\\frac{1}{2}ke^2$", and "calculate the energy with the correct unit". Keep solved arithmetic such as "$k=8500$", "$e=0.012$", "$E_e=0.612$", "14% of 770 J", or "Step 4/5" out of the answerChain; those belong only in markChecklist/modelAnswer/commonWeakAnswers.',
		'Use markSchemeItemIndexes as 0-based indexes into the provided markSchemeItems array.',
		'When a chain matches a known Physics chain id below, reuse that id exactly. Otherwise invent a stable id starting physics-chain-.',
		'Do not include raw mark-scheme instructions, AO tags, or mark counts in chain text.',
		'',
		'Known Physics chain ids and family context:',
		taxonomyExcerpt(),
		'',
		'Questions needing chains:',
		JSON.stringify(tasks, null, 2)
	].join('\n');
}

async function repairBatch(tasks) {
	const input = [
		{
			role: 'system',
			content:
				'You are a GCSE Physics answer-chain extraction agent. You convert source-grounded mark evidence into concise reusable learner answer chains.'
		},
		{
			role: 'user',
			content: buildPrompt(tasks)
		}
	];
	const { value } = await generateJson({
		model,
		thinkingLevel: 'medium',
		telemetry: false,
		input,
		schema: RepairSchema
	});
	return value.repairs;
}

function taskKey(sourceDocumentId, sourceQuestionRef) {
	return `${sourceDocumentId}::${sourceQuestionRef}`;
}

const paperFiles = loadPaperFiles();
const tasks = [];
const questionByKey = new Map();
const filesBySourceDocumentId = new Map();

for (const entry of paperFiles) {
	const sourceDocumentId = entry.paper.sourceDocument.id;
	filesBySourceDocumentId.set(sourceDocumentId, entry);
	for (const question of entry.paper.questions ?? []) {
		const chainIssues = question.answerChain
			? blockingAnswerChainSpecificityIssues(question.answerChain, {
					commandWord: question.commandWord
				})
			: [];
		const needsChain =
			question.marks !== null &&
			question.marks !== undefined &&
			(force || !question.answerChain || (specificity && chainIssues.length > 0));
		if (!needsChain) continue;
		const key = taskKey(sourceDocumentId, question.sourceQuestionRef);
		tasks.push(compactQuestion(question, sourceDocumentId));
		questionByKey.set(key, question);
	}
}

console.log(
	JSON.stringify(
		{
			source: path.relative(rootDir, extractionRoot),
			papers: paperFiles.map((entry) => entry.paper.sourceDocument.id),
			missing_chains: tasks.length,
			model,
			batch_size: batchSize,
			dry_run: dryRun
		},
		null,
		2
	)
);

if (tasks.length === 0) process.exit(0);

const repairsByKey = new Map();
for (let index = 0; index < tasks.length; index += batchSize) {
	const batch = tasks.slice(index, index + batchSize);
	console.log(`repairing chains ${index + 1}-${index + batch.length} of ${tasks.length}`);
	const repairs = await repairBatch(batch);
	for (const repair of repairs) {
		repairsByKey.set(taskKey(repair.sourceDocumentId, repair.sourceQuestionRef), repair);
	}
}

const missingRepairs = tasks.filter(
	(task) => !repairsByKey.has(taskKey(task.sourceDocumentId, task.sourceQuestionRef))
);
if (missingRepairs.length > 0) {
	throw new Error(
		`Repair model did not return ${missingRepairs.length} chains: ${missingRepairs
			.slice(0, 12)
			.map((task) => `${task.sourceDocumentId} ${task.sourceQuestionRef}`)
			.join(', ')}`
	);
}

let updated = 0;
for (const task of tasks) {
	const key = taskKey(task.sourceDocumentId, task.sourceQuestionRef);
	const repair = repairsByKey.get(key);
	const repairIssues = blockingAnswerChainSpecificityIssues(repair.answerChain, {
		commandWord: task.commandWord
	});
	if (repairIssues.length > 0) {
		throw new Error(
			`Repair still produced prompt-specific chain wording for ${task.sourceDocumentId} ${task.sourceQuestionRef}: ${chainSpecificityIssueSummary(repairIssues, 4)}`
		);
	}
	const question = questionByKey.get(key);
	question.answerChain = repair.answerChain;
	if ((question.commonWeakAnswers ?? []).length === 0 && repair.commonWeakAnswers?.length) {
		question.commonWeakAnswers = repair.commonWeakAnswers;
	}
	updated += 1;
}

if (!dryRun) {
	for (const entry of paperFiles) {
		writeFileSync(entry.filePath, `${JSON.stringify(entry.paper, null, 2)}\n`);
	}
}

console.log(JSON.stringify({ updated, dry_run: dryRun }, null, 2));
