#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ALLOWED_STEP_ROLES, publicChainStyleIssues } from './lib/answer-chain-style.mjs';
import { d1Query, d1Rows } from './lib/d1-rest.mjs';
import { loadDefaultEnv, loadDotEnvFile, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/review-d1-answer-chain-reuse.mjs

Prepares D1 candidate evidence, launches Codex to decide which draft cross-paper answer
chains are safe to publish, validates Codex's review plan, and optionally applies it to D1.

Optional:
  --subject=all|Biology|Chemistry|Physics
  --chain-id=<id>                    may be passed multiple times
  --min-papers=2
  --min-questions=2
  --limit=10
  --work-dir=tmp/codex-d1-chain-reuse-review
  --output=tmp/codex-d1-chain-reuse-review/review-plan.full.json
  --summary=tmp/codex-d1-chain-reuse-review/summary.json
  --input-plan=tmp/codex-d1-chain-reuse-review/review-plan.full.json
  --model=gpt-5.5
  --thinking-level=xhigh
  --timeout-ms=7200000
  --repair-attempts=1
  --dotenv=/path/to/.env.local      optional env file for Cloudflare/Codex credentials
  --write                           apply accepted plan rows to D1
  --force
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const subject = stringArg('subject', 'all');
const chainIds = stringArgs('chain-id');
const minPapers = integerArg('min-papers', 2, 1);
const minQuestions = integerArg('min-questions', 2, 1);
const limit = integerArg('limit', 0, 0);
const workDir = path.resolve(rootDir, stringArg('work-dir', 'tmp/codex-d1-chain-reuse-review'));
const codexPlanPath = path.join(workDir, 'review-plan.json');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join(workDir, 'review-plan.full.json'))
);
const summaryPath = path.resolve(rootDir, stringArg('summary', path.join(workDir, 'summary.json')));
const inputPlanPath = stringArg('input-plan', '');
const model = stringArg('model', 'gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'xhigh');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const repairAttempts = integerArg('repair-attempts', 1, 0);
const dotenvPath = stringArg('dotenv', '');
const write = hasArg('write');
const force = hasArg('force');
const dryRun = hasArg('dry-run');

if (dotenvPath) loadDotEnvFile(path.resolve(rootDir, dotenvPath));

let fullPlan;
if (inputPlanPath) {
	fullPlan = readJson(path.resolve(rootDir, inputPlanPath));
	fullPlan.validation = validateFullPlan(fullPlan);
} else {
	const candidates = await loadCandidates();
	const selectedCandidates = limit > 0 ? candidates.slice(0, limit) : candidates;
	if (dryRun) {
		const plan = {
			status: 'dry-run',
			subject,
			chainIds,
			minPapers,
			minQuestions,
			workDir: relative(workDir),
			outputPath: relative(outputPath),
			summaryPath: relative(summaryPath),
			model,
			thinkingLevel,
			selectedChains: selectedCandidates.length,
			candidates: selectedCandidates.map((candidate) => ({
				id: candidate.id,
				subjectArea: candidate.subjectArea,
				publicationReadyQuestions: candidate.publicationReadyQuestions,
				publicationReadyPapers: candidate.publicationReadyPapers
			}))
		};
		console.log(JSON.stringify(plan, null, 2));
		process.exit(0);
	}
	prepareWorkDir(selectedCandidates);
	const prompt = buildPrompt();
	writeFileSync(path.join(workDir, 'prompt.md'), prompt);
	const startedAt = new Date().toISOString();
	const codexRuns = [];
	try {
		codexRuns.push(
			await runCodexSdkTurn({
				prompt,
				workDir,
				eventsPath: path.join(workDir, 'events.jsonl'),
				lastMessagePath: path.join(workDir, 'last-message.txt'),
				summaryPath: path.join(workDir, 'codex-run-summary.json'),
				model,
				thinkingLevel,
				timeoutMs
			})
		);
		let reviewPlan = ensureCodexPlan();
		let validation = validatePlan(selectedCandidates, reviewPlan.decisions ?? []);
		for (
			let attempt = 1;
			validation.status !== 'passed' && attempt <= repairAttempts;
			attempt += 1
		) {
			writeJson(path.join(workDir, `validation-failed-${attempt}.json`), validation);
			const repairPrompt = buildRepairPrompt(attempt);
			writeFileSync(path.join(workDir, `repair-prompt-${attempt}.md`), repairPrompt);
			codexRuns.push(
				await runCodexSdkTurn({
					prompt: repairPrompt,
					workDir,
					eventsPath: path.join(workDir, `repair-events-${attempt}.jsonl`),
					lastMessagePath: path.join(workDir, `repair-last-message-${attempt}.txt`),
					summaryPath: path.join(workDir, `repair-summary-${attempt}.json`),
					model,
					thinkingLevel,
					timeoutMs
				})
			);
			reviewPlan = ensureCodexPlan();
			validation = validatePlan(selectedCandidates, reviewPlan.decisions ?? []);
		}
		fullPlan = {
			status: validation.status,
			generatedAt: new Date().toISOString(),
			startedAt,
			finishedAt: new Date().toISOString(),
			subject,
			chainIds,
			minPapers,
			minQuestions,
			model,
			thinkingLevel,
			selectedChains: selectedCandidates.length,
			candidates: selectedCandidates,
			decisions: reviewPlan.decisions ?? [],
			validation,
			codexRuns: codexRuns.map(stripFinalResponse),
			artifacts: artifacts()
		};
		writeJson(outputPath, fullPlan);
	} catch (error) {
		const failed = {
			status: 'failed',
			startedAt,
			finishedAt: new Date().toISOString(),
			subject,
			chainIds,
			minPapers,
			minQuestions,
			model,
			thinkingLevel,
			selectedChains: selectedCandidates.length,
			candidates: selectedCandidates,
			codexRuns: codexRuns.map(stripFinalResponse),
			error: error instanceof Error ? error.message : String(error),
			artifacts: artifacts()
		};
		writeJson(outputPath, failed);
		writeJson(summaryPath, summarizeFullPlan(failed));
		throw error;
	}
}

if (write) {
	if (fullPlan.validation?.status !== 'passed') {
		throw new Error('Refusing to write a D1 answer-chain reuse plan with validation errors.');
	}
	fullPlan.write = await applyPlan(fullPlan);
	writeJson(outputPath, fullPlan);
}

const summary = summarizeFullPlan(fullPlan);
writeJson(summaryPath, summary);
console.log(JSON.stringify(summary, null, 2));
if (fullPlan.validation?.status !== 'passed') process.exit(1);

async function loadCandidates() {
	const subjectFilter = subject && subject !== 'all' ? 'AND ac.subject_area = ?' : '';
	const chainFilter = chainIds.length ? `AND ac.id IN (${chainIds.map(() => '?').join(', ')})` : '';
	const params = [...(subjectFilter ? [subject] : []), ...(chainIds.length ? chainIds : [])];
	const rawCandidates = await d1Rows(
		`SELECT ac.id, ac.slug, ac.title, ac.canonical_chain_text AS canonicalChainText,
		        ac.summary, ac.subject_area AS subjectArea, ac.broad_topic AS broadTopic,
		        ac.status, ac.needs_human_review AS needsHumanReview,
		        COUNT(DISTINCT q.id) AS cleanQuestionLinks,
		        COUNT(DISTINCT q.source_document_id) AS cleanPapers
		 FROM answer_chains ac
		 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
		 JOIN questions q ON q.id = qac.question_id
		 WHERE ac.status = 'draft'
		   AND ac.needs_human_review = 0
		   AND q.status = 'draft'
		   AND q.needs_human_review = 0
		   AND qac.needs_human_review = 0
		   ${subjectFilter}
		   ${chainFilter}
		 GROUP BY ac.id
		 HAVING cleanPapers >= ? AND cleanQuestionLinks >= ?
		 ORDER BY ac.subject_area, cleanPapers DESC, cleanQuestionLinks DESC, ac.id`,
		[...params, minPapers, minQuestions],
		{ rootDir }
	);
	if (rawCandidates.length === 0) return [];
	const ids = rawCandidates.map((candidate) => candidate.id);
	const stepsByChain = groupBy(await fetchSteps(ids), (step) => step.chainId);
	const examplesByChain = groupBy(await fetchExamples(ids), (example) => example.chainId);
	const candidates = [];
	for (const candidate of rawCandidates) {
		const allExamples = examplesByChain.get(candidate.id) ?? [];
		const publicationReady = allExamples.filter((example) => example.publicationReady);
		const readyPapers = new Set(publicationReady.map((example) => example.sourceDocumentId));
		if (publicationReady.length < minQuestions || readyPapers.size < minPapers) continue;
		candidates.push({
			...candidate,
			cleanQuestionLinks: Number(candidate.cleanQuestionLinks ?? 0),
			cleanPapers: Number(candidate.cleanPapers ?? 0),
			publicationReadyQuestions: publicationReady.length,
			publicationReadyPapers: readyPapers.size,
			currentSteps: stepsByChain.get(candidate.id) ?? [],
			eligibleExamples: publicationReady.map(compactExample),
			attachedReviewExamples: allExamples
				.filter((example) => !example.publicationReady)
				.slice(0, 8)
				.map(compactExample)
		});
	}
	return candidates;
}

async function fetchSteps(chainIds) {
	return (
		await Promise.all(
			chunk(chainIds, 80).map((ids) =>
				d1Rows(
					`SELECT answer_chain_id AS chainId, display_order AS displayOrder,
					        step_text AS stepText, step_role AS stepRole,
					        explanation, common_omission AS commonOmission
					 FROM answer_chain_steps
					 WHERE answer_chain_id IN (${ids.map(() => '?').join(', ')})
					 ORDER BY answer_chain_id, display_order`,
					ids,
					{ rootDir }
				)
			)
		)
	).flat();
}

async function fetchExamples(chainIds) {
	const examples = (
		await Promise.all(
			chunk(chainIds, 80).map((ids) =>
				d1Rows(
					`SELECT qac.answer_chain_id AS chainId, qac.id AS linkId,
					        qac.needs_human_review AS linkNeedsReview,
					        qac.fit_confidence AS fitConfidence, qac.fit_notes AS fitNotes,
					        q.id AS questionId, q.status AS questionStatus,
					        q.needs_human_review AS questionNeedsReview,
					        q.source_document_id AS sourceDocumentId,
					        q.source_question_ref AS sourceQuestionRef,
					        q.prompt_text AS promptText,
					        q.self_contained_prompt_text AS selfContainedPromptText,
					        q.command_word AS commandWord, q.marks,
					        q.subject_area AS subjectArea, q.paper, q.series, q.year,
					        (SELECT COUNT(*) FROM question_rendering_overlays qro WHERE qro.question_id = q.id) AS overlayCount,
					        (SELECT COUNT(*) FROM mark_scheme_items ms WHERE ms.question_id = q.id) AS markRows,
					        (SELECT COUNT(*) FROM mark_checklist_items mc WHERE mc.question_id = q.id) AS checklistRows,
					        (SELECT COUNT(*) FROM model_answers ma WHERE ma.question_id = q.id) AS modelAnswerRows,
					        (SELECT COUNT(*) FROM question_response_answer_keys ak WHERE ak.question_id = q.id) AS answerKeyRows
					 FROM question_answer_chains qac
					 JOIN questions q ON q.id = qac.question_id
					 WHERE qac.answer_chain_id IN (${ids.map(() => '?').join(', ')})
					 ORDER BY qac.answer_chain_id,
					          q.status,
					          q.source_document_id,
					          q.source_question_ref`,
					ids,
					{ rootDir }
				)
			)
		)
	).flat();
	const questionIds = examples.map((example) => example.questionId);
	const markRows = await fetchRowsByQuestion(
		questionIds,
		`SELECT question_id AS questionId, display_order AS displayOrder, item_type AS itemType, text
		 FROM mark_scheme_items
		 WHERE question_id IN (__IDS__)
		 ORDER BY question_id, display_order`
	);
	const modelAnswers = await fetchRowsByQuestion(
		questionIds,
		`SELECT question_id AS questionId, answer_text AS answerText, derivation
		 FROM model_answers
		 WHERE question_id IN (__IDS__)
		 ORDER BY question_id, id`
	);
	const answerKeys = await fetchRowsByQuestion(
		questionIds,
		`SELECT question_id AS questionId, response_kind AS responseKind, target_id AS targetId,
		        correct_answer AS correctAnswer
		 FROM question_response_answer_keys
		 WHERE question_id IN (__IDS__)
		 ORDER BY question_id, display_order`
	);
	const marksByQuestion = groupBy(markRows, (row) => row.questionId);
	const modelsByQuestion = groupBy(modelAnswers, (row) => row.questionId);
	const keysByQuestion = groupBy(answerKeys, (row) => row.questionId);
	return examples.map((example) => {
		const mechanical = {
			overlayCount: Number(example.overlayCount ?? 0),
			markRows: Number(example.markRows ?? 0),
			checklistRows: Number(example.checklistRows ?? 0),
			modelAnswerRows: Number(example.modelAnswerRows ?? 0),
			answerKeyRows: Number(example.answerKeyRows ?? 0)
		};
		const noReview =
			example.questionStatus === 'draft' &&
			Number(example.questionNeedsReview ?? 0) === 0 &&
			Number(example.linkNeedsReview ?? 0) === 0;
		const hasAnswerEvidence = mechanical.modelAnswerRows > 0 || mechanical.answerKeyRows > 0;
		return {
			...example,
			...mechanical,
			markSchemeItems: (marksByQuestion.get(example.questionId) ?? []).slice(0, 10),
			modelAnswers: (modelsByQuestion.get(example.questionId) ?? []).slice(0, 2),
			answerKeys: (keysByQuestion.get(example.questionId) ?? []).slice(0, 8),
			publicationReady:
				noReview &&
				mechanical.overlayCount > 0 &&
				mechanical.markRows > 0 &&
				mechanical.checklistRows > 0 &&
				hasAnswerEvidence,
			blockers: [
				...(noReview ? [] : ['review/status flag']),
				...(mechanical.overlayCount > 0 ? [] : ['missing render overlay']),
				...(mechanical.markRows > 0 ? [] : ['missing mark rows']),
				...(mechanical.checklistRows > 0 ? [] : ['missing checklist rows']),
				...(hasAnswerEvidence ? [] : ['missing model answer or answer key'])
			]
		};
	});
}

async function fetchRowsByQuestion(questionIds, sqlTemplate) {
	if (questionIds.length === 0) return [];
	return (
		await Promise.all(
			chunk(questionIds, 80).map((ids) =>
				d1Rows(sqlTemplate.replace('__IDS__', ids.map(() => '?').join(', ')), ids, { rootDir })
			)
		)
	).flat();
}

function prepareWorkDir(candidates) {
	if (existsSync(workDir)) {
		if (!force) throw new Error(`Work dir already exists; pass --force: ${relative(workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	writeJson(path.join(workDir, 'candidates.json'), { candidates });
	writeFileSync(path.join(workDir, 'helper.mjs'), helperSource());
	const specSourcePath = path.join(rootDir, 'docs/extraction-spec.md');
	if (existsSync(specSourcePath)) {
		mkdirSync(path.join(workDir, 'docs'), { recursive: true });
		copyFileSync(specSourcePath, path.join(workDir, 'docs/extraction-spec.md'));
	}
}

function buildPrompt() {
	return `You are running a Codex answer-chain publication review for Question Constellation.

Inputs in this isolated work directory:
- candidates.json: D1-derived evidence for draft answer chains that already have mechanically complete, no-review draft question links across multiple papers.
- helper.mjs: deterministic validator for your review plan.
- docs/extraction-spec.md: product/schema contract if needed.

Do not use the web. Do not inspect git or the repository. Do not write outside this work directory. Do not connect to D1. The parent runner will apply accepted rows after validation.

Your task:
1. Read candidates.json.
2. For each candidate, inspect every eligibleExamples entry. Use prompt text, self-contained prompt text, markSchemeItems, modelAnswers, and answerKeys as evidence.
3. Decide if the eligible examples genuinely share one reusable mark-scoring answer chain across papers.
4. Ignore attachedReviewExamples for publication decisions; they are shown only to warn you about existing suspicious links. Do not include them in questionIdsToPublish.
5. Write review-plan.json with exactly this shape:
{
  "decisions": [
    {
      "chainId": "string",
      "status": "accept" | "reject",
      "questionIdsToPublish": ["question id"],
      "evidenceSummary": "short source-grounded reason",
      "warnings": ["short warning"],
      "repair": null | {
        "title": "1-5 word memory handle",
        "canonicalChainText": "2-5 compact links joined by ->",
        "summary": "short memory cue",
        "steps": [
          {
            "stepText": "1-5 word link label",
            "stepRole": "${[...ALLOWED_STEP_ROLES].join('" | "')}",
            "explanation": "short teaching note",
            "commonOmission": "short weak-answer note"
          }
        ]
      }
    }
  ]
}

Accept only when:
- every listed questionId is in eligibleExamples;
- at least ${minQuestions} accepted questions span at least ${minPapers} source papers;
- the same ordered method or recall handle earns marks in every accepted question;
- the repaired visible chain is compact and reusable.

Reject when:
- examples are only topic-similar but need different reasoning;
- mark evidence looks corrupted or insufficient;
- the chain would be a one-question solved answer;
- the safe publish set would not span multiple papers.

Style rules:
- title is usually 1-3 words, hard maximum 5 words.
- canonicalChainText has 2-5 tiny links joined by " -> ".
- each canonical link and stepText is usually 1-4 words, hard maximum 5 words.
- summary is one short memory cue, not an instruction sentence repeating the chain.
- do not put final numeric answers, exact tick-box letters, exact table values, or one-off facts into visible chain fields.
- keep concrete GCSE terms when they are the mark-scoring idea.
- multi-step means a real mark-scoring method, not filler. Good steps are the links a student must remember to earn marks.

Good reusable chain examples:
- title "IVF sequence"; canonical "hormones -> collect eggs -> fertilise -> implant"
  Fits IVF process questions across papers because the same ordered treatment sequence earns marks.
- title "Rf equation"; canonical "distances -> divide -> rearrange -> units"
  Fits chromatography Rf calculations where numbers change but the method is the same.
- title "Crude oil"; canonical "dead plankton -> buried -> compressed -> time"
  Fits crude-oil formation recall across papers without copying one paper's wording.
- title "Equilibrium shift"; canonical "temp up -> exothermic opposes -> shifts left"
  Fits repeated one-mark Le Chatelier decisions with the same condition and direction.
- title "Food test"; canonical "reagent -> treatment -> colour"
  Fits food-test method questions, but only when every member question is actually a food-test method item.

Bad chain examples:
- "resource gained -> biological use" is too generic unless the mark scheme really lacks concrete terms.
- "cause -> process -> effect" is usually too generic for GCSE memory.
- "State the useful resource the organism gains..." is an instruction sentence, not a chain step.
- "Willow bark", "7.5 cm", "FSH and LH", or a tick-box answer copied into the chain is too one-off.
- A chain with only one public paper/question is not reusable enough for publication here.

After writing review-plan.json, run:
node helper.mjs validate-plan --candidates=candidates.json --plan=review-plan.json --output=validation.json

If validation fails, edit review-plan.json and rerun validation until it passes or a real source problem remains. Finish with a concise final message listing accepted/rejected counts and artifact paths.`;
}

function buildRepairPrompt(attempt) {
	return `Repair Codex D1 answer-chain review plan attempt ${attempt}.

Inputs:
- candidates.json
- review-plan.json
- validation-failed-${attempt}.json
- helper.mjs

Read the validation failures, edit review-plan.json only, and rerun:
node helper.mjs validate-plan --candidates=candidates.json --plan=review-plan.json --output=validation.json

Keep the same acceptance standard: publish only mechanically complete no-review examples whose reusable answer chain really spans multiple papers.`;
}

function ensureCodexPlan() {
	if (!existsSync(codexPlanPath)) throw new Error('Codex did not write review-plan.json.');
	return readJson(codexPlanPath);
}

function validateFullPlan(plan) {
	return validatePlan(plan.candidates ?? [], plan.decisions ?? []);
}

function validatePlan(candidates, decisions) {
	const findings = [];
	const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const decisionById = new Map();
	for (const decision of decisions) {
		if (decisionById.has(decision.chainId)) {
			findings.push(error(decision.chainId, 'duplicate_decision', 'decision'));
		}
		decisionById.set(decision.chainId, decision);
	}
	for (const candidate of candidates) {
		if (!decisionById.has(candidate.id)) {
			findings.push(error(candidate.id, 'missing_decision', 'decision'));
		}
	}
	for (const decision of decisions) {
		const candidate = candidateById.get(decision.chainId);
		if (!candidate) {
			findings.push(error(decision.chainId, 'unexpected_decision', 'decision'));
			continue;
		}
		if (!['accept', 'reject'].includes(decision.status)) {
			findings.push(error(decision.chainId, 'bad_status', String(decision.status)));
			continue;
		}
		if (decision.status === 'reject') continue;
		validateAcceptedDecision({ candidate, decision, findings });
	}
	const errorFindings = findings.filter((finding) => finding.severity === 'error');
	const warningFindings = findings.filter((finding) => finding.severity === 'warning');
	return {
		status: errorFindings.length > 0 ? 'failed' : 'passed',
		errors: errorFindings.length,
		warnings: warningFindings.length,
		findings
	};
}

function validateAcceptedDecision({ candidate, decision, findings }) {
	if (!decision.repair) {
		findings.push(error(decision.chainId, 'accepted_without_repair', 'repair'));
		return;
	}
	const eligibleById = new Map(
		candidate.eligibleExamples.map((example) => [example.questionId, example])
	);
	const questionIds = [...new Set(decision.questionIdsToPublish ?? [])];
	if (questionIds.length !== (decision.questionIdsToPublish ?? []).length) {
		findings.push(error(decision.chainId, 'duplicate_question_to_publish', 'questionIdsToPublish'));
	}
	for (const questionId of questionIds) {
		if (!eligibleById.has(questionId)) {
			findings.push(error(decision.chainId, 'non_eligible_question_to_publish', questionId));
		}
	}
	const selectedExamples = questionIds
		.map((questionId) => eligibleById.get(questionId))
		.filter(Boolean);
	const selectedPapers = new Set(selectedExamples.map((example) => example.sourceDocumentId));
	if (questionIds.length < minQuestions || selectedPapers.size < minPapers) {
		findings.push(
			error(
				decision.chainId,
				'accepted_without_cross_paper_coverage',
				`${questionIds.length} questions, ${selectedPapers.size} papers`
			)
		);
	}
	const styleChain = {
		id: decision.chainId,
		title: decision.repair.title,
		canonicalChainText: decision.repair.canonicalChainText,
		summary: decision.repair.summary,
		publicQuestions: questionIds.length,
		publicPapers: selectedPapers.size,
		steps: decision.repair.steps ?? []
	};
	for (const issue of publicChainStyleIssues(styleChain, { includeReuseWarnings: true })) {
		findings.push(issue);
	}
	if (!Array.isArray(decision.repair.steps) || decision.repair.steps.length < 2) {
		findings.push(error(decision.chainId, 'too_few_steps', 'steps'));
	}
	if ((decision.repair.steps ?? []).length > 5) {
		findings.push(error(decision.chainId, 'too_many_steps', `${decision.repair.steps.length}`));
	}
}

async function applyPlan(plan) {
	const accepted = plan.decisions.filter((decision) => decision.status === 'accept');
	const exampleByQuestionId = new Map(
		(plan.candidates ?? []).flatMap((candidate) =>
			(candidate.eligibleExamples ?? []).map((example) => [example.questionId, example])
		)
	);
	let chainsPublished = 0;
	let questionsPublished = 0;
	let questionTitlesUpdated = 0;
	let chainLinksUpdated = 0;
	let stepsDeleted = 0;
	let stepsInserted = 0;
	for (const decision of accepted) {
		const repair = decision.repair;
		const chainResult = await d1Query(
			`UPDATE answer_chains
			 SET title = ?,
			     canonical_chain_text = ?,
			     summary = ?,
			     status = 'published',
			     needs_human_review = 0,
			     review_notes_json = '[]',
			     updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?
			   AND status = 'draft'
			   AND needs_human_review = 0`,
			[repair.title, repair.canonicalChainText, repair.summary, decision.chainId],
			{ rootDir }
		);
		chainsPublished += Number(chainResult.meta?.changes ?? 0);
		const deleteResult = await d1Query(
			`DELETE FROM answer_chain_steps WHERE answer_chain_id = ?`,
			[decision.chainId],
			{ rootDir }
		);
		stepsDeleted += Number(deleteResult.meta?.changes ?? 0);
		for (const [index, step] of repair.steps.entries()) {
			await d1Query(
				`INSERT INTO answer_chain_steps
				 (id, answer_chain_id, display_order, step_text, step_role, explanation,
				  common_omission, supported_by_mark_scheme_item_ids_json, evidence_json)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					`${decision.chainId}-step-${index + 1}`,
					decision.chainId,
					index + 1,
					step.stepText,
					step.stepRole,
					step.explanation || null,
					step.commonOmission || null,
					'[]',
					'[]'
				],
				{ rootDir }
			);
			stepsInserted += 1;
		}
		for (const questionId of decision.questionIdsToPublish) {
			const questionResult = await d1Query(
				`UPDATE questions
				 SET status = 'published', updated_at = CURRENT_TIMESTAMP
				 WHERE id = ?
				   AND status = 'draft'
				   AND needs_human_review = 0`,
				[questionId],
				{ rootDir }
			);
			questionsPublished += Number(questionResult.meta?.changes ?? 0);
			const title = questionTitleFromPrompt(exampleByQuestionId.get(questionId)?.promptText ?? '');
			if (title) {
				questionTitlesUpdated += await updateQuestionMetadataTitle(questionId, title);
			}
			const linkResult = await d1Query(
				`UPDATE question_answer_chains
				 SET needs_human_review = 0,
				     review_notes_json = '[]',
				     fit_notes = ?,
				     fit_confidence = COALESCE(fit_confidence, 0.9)
				 WHERE answer_chain_id = ?
				   AND question_id = ?
				   AND needs_human_review = 0`,
				[decision.evidenceSummary || repair.summary, decision.chainId, questionId],
				{ rootDir }
			);
			chainLinksUpdated += Number(linkResult.meta?.changes ?? 0);
		}
	}
	return {
		writtenAt: new Date().toISOString(),
		chainsPublished,
		questionsPublished,
		questionTitlesUpdated,
		chainLinksUpdated,
		stepsDeleted,
		stepsInserted
	};
}

async function updateQuestionMetadataTitle(questionId, title) {
	const rows = await d1Rows(`SELECT metadata_json FROM questions WHERE id = ?`, [questionId], {
		rootDir
	});
	const metadata = safeParseJson(rows[0]?.metadata_json, {});
	if (metadata.title === title) return 0;
	metadata.title = title;
	const result = await d1Query(
		`UPDATE questions SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		[JSON.stringify(metadata), questionId],
		{ rootDir }
	);
	return Number(result.meta?.changes ?? 0);
}

function questionTitleFromPrompt(promptText) {
	const cleaned = String(promptText ?? '')
		.replace(/\[[^\]]*\bmarks?\b[^\]]*\]/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!cleaned) return '';
	const commandPattern =
		/(?:explain|describe|give|state|calculate|determine|compare|name|suggest|evaluate|use|write|draw|measure|identify|complete|what|which|why|how)\b/i;
	const command = cleaned.match(
		/\b(?:explain|describe|give|state|calculate|determine|compare|name|suggest|evaluate|write|draw|measure|identify|complete|what|which|why|how)\b.*?(?=\s+Tick\b|\s+Use the equation\b|\s+Give your answer\b|\s+[A-Z][A-Za-z ]+=|$)/i
	)?.[0];
	if (command) return truncateTitle(command);
	const sentence = cleaned
		.split(/(?<=[.?!])\s+/)
		.find(
			(part) =>
				commandPattern.test(part) && !/^(?:tick|use the equation|give your answer)\b/i.test(part)
		);
	if (sentence) return truncateTitle(sentence);
	return truncateTitle(cleaned);
}

function truncateTitle(title) {
	const normalized = String(title ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (normalized.length <= 120) return normalized;
	return `${normalized.slice(0, 117).trim()}...`;
}

function safeParseJson(raw, fallback) {
	try {
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

function helperSource() {
	return `#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...rest] = arg.slice(2).split('=');
  return [key, rest.join('=') || true];
}));
if (process.argv[2] !== 'validate-plan') throw new Error('Usage: node helper.mjs validate-plan --candidates=candidates.json --plan=review-plan.json --output=validation.json');
const candidates = JSON.parse(readFileSync(String(args.candidates), 'utf8')).candidates ?? [];
const plan = JSON.parse(readFileSync(String(args.plan), 'utf8'));
const result = validate(candidates, plan.decisions ?? []);
mkdirSync(path.dirname(String(args.output)), { recursive: true });
writeFileSync(String(args.output), JSON.stringify(result, null, 2) + '\\n');
console.log(JSON.stringify({ status: result.status, errors: result.errors, warnings: result.warnings }, null, 2));
if (result.status !== 'passed') process.exit(1);

function validate(candidates, decisions) {
  const findings = [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const decisionById = new Map();
  for (const decision of decisions) {
    if (decisionById.has(decision.chainId)) findings.push(issue('error', 'duplicate_decision', decision.chainId, 'decision'));
    decisionById.set(decision.chainId, decision);
  }
  for (const candidate of candidates) if (!decisionById.has(candidate.id)) findings.push(issue('error', 'missing_decision', candidate.id, 'decision'));
  for (const decision of decisions) {
    const candidate = candidateById.get(decision.chainId);
    if (!candidate) {
      findings.push(issue('error', 'unexpected_decision', decision.chainId, 'decision'));
      continue;
    }
    if (decision.status === 'reject') continue;
    if (decision.status !== 'accept') {
      findings.push(issue('error', 'bad_status', decision.chainId, String(decision.status)));
      continue;
    }
    const repair = decision.repair;
    if (!repair) {
      findings.push(issue('error', 'accepted_without_repair', decision.chainId, 'repair'));
      continue;
    }
    const eligibleById = new Map(candidate.eligibleExamples.map((example) => [example.questionId, example]));
    const questionIds = [...new Set(decision.questionIdsToPublish ?? [])];
    for (const questionId of questionIds) if (!eligibleById.has(questionId)) findings.push(issue('error', 'non_eligible_question_to_publish', decision.chainId, questionId));
    const selectedPapers = new Set(questionIds.map((questionId) => eligibleById.get(questionId)?.sourceDocumentId).filter(Boolean));
    if (questionIds.length < ${minQuestions} || selectedPapers.size < ${minPapers}) findings.push(issue('error', 'accepted_without_cross_paper_coverage', decision.chainId, questionIds.length + ' questions, ' + selectedPapers.size + ' papers'));
    checkStyle(decision.chainId, repair, findings);
  }
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  return { status: errors ? 'failed' : 'passed', errors, warnings, findings };
}

function checkStyle(chainId, repair, findings) {
  const titleWords = wordCount(repair.title);
  if (!repair.title || titleWords > 5 || String(repair.title).length > 56) findings.push(issue('error', 'title_too_long', chainId, repair.title));
  else if (titleWords > 3) findings.push(issue('warning', 'title_not_memory_handle', chainId, repair.title));
  const links = String(repair.canonicalChainText ?? '').split(/\\s*->\\s*/).map((part) => part.trim()).filter(Boolean);
  if (links.length < 2 || links.length > 5 || !String(repair.canonicalChainText ?? '').includes('->')) findings.push(issue('error', 'canonical_not_links', chainId, repair.canonicalChainText));
  for (const [index, link] of links.entries()) if (wordCount(link) > 4 || link.length > 34) findings.push(issue('error', 'canonical_link_too_long', chainId, 'link ' + index + ': ' + link));
  if (wordCount(repair.summary) > 12 || String(repair.summary ?? '').length > 78) findings.push(issue('error', 'summary_too_long', chainId, repair.summary));
  const steps = repair.steps ?? [];
  if (steps.length < 2 || steps.length > 5) findings.push(issue('error', 'bad_step_count', chainId, String(steps.length)));
  for (const [index, step] of steps.entries()) {
    if (wordCount(step.stepText) > 5 || String(step.stepText ?? '').length > 48) findings.push(issue('error', 'step_label_too_long', chainId, 'step ' + index + ': ' + step.stepText));
    if (!${JSON.stringify([...ALLOWED_STEP_ROLES])}.includes(step.stepRole)) findings.push(issue('error', 'unsupported_step_role', chainId, String(step.stepRole)));
  }
}

function wordCount(text) {
  return String(text ?? '').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}
function issue(severity, code, chainId, evidence) {
  return { severity, code, chainId, evidence };
}
`;
}

function summarizeFullPlan(plan) {
	const decisions = plan.decisions ?? [];
	const accepted = decisions.filter((decision) => decision.status === 'accept');
	const rejected = decisions.filter((decision) => decision.status === 'reject');
	return {
		status: plan.validation?.status ?? plan.status,
		output: relative(outputPath),
		summary: relative(summaryPath),
		selectedChains: plan.selectedChains ?? 0,
		acceptedChains: accepted.length,
		rejectedChains: rejected.length,
		questionsToPublish: accepted.reduce(
			(sum, decision) => sum + (decision.questionIdsToPublish?.length ?? 0),
			0
		),
		validation: plan.validation ?? null,
		codexRuns: plan.codexRuns ?? [],
		write: plan.write ?? null,
		artifacts: plan.artifacts ?? artifacts()
	};
}

function artifacts() {
	return {
		workDir: relative(workDir),
		candidates: relative(path.join(workDir, 'candidates.json')),
		prompt: relative(path.join(workDir, 'prompt.md')),
		events: relative(path.join(workDir, 'events.jsonl')),
		codexPlan: relative(codexPlanPath),
		validation: relative(path.join(workDir, 'validation.json')),
		output: relative(outputPath),
		summary: relative(summaryPath)
	};
}

function compactExample(example) {
	return {
		questionId: example.questionId,
		sourceDocumentId: example.sourceDocumentId,
		sourceQuestionRef: example.sourceQuestionRef,
		questionStatus: example.questionStatus,
		questionNeedsReview: Number(example.questionNeedsReview ?? 0),
		linkNeedsReview: Number(example.linkNeedsReview ?? 0),
		publicationReady: Boolean(example.publicationReady),
		blockers: example.blockers,
		promptText: snippet(example.promptText, 500),
		selfContainedPromptText: snippet(example.selfContainedPromptText, 650),
		commandWord: example.commandWord,
		marks: example.marks,
		markSchemeItems: example.markSchemeItems.map((item) => ({
			itemType: item.itemType,
			text: snippet(item.text, 360)
		})),
		modelAnswers: example.modelAnswers.map((answer) => snippet(answer.answerText, 300)),
		answerKeys: example.answerKeys.map((answer) => ({
			targetId: answer.targetId,
			correctAnswer: snippet(answer.correctAnswer, 100)
		}))
	};
}

function stripFinalResponse(summary) {
	const clone = { ...summary };
	delete clone.finalResponse;
	return clone;
}

function error(chainId, code, evidence) {
	return { severity: 'error', code, chainId, field: code, evidence };
}

function groupBy(values, keyFn) {
	const map = new Map();
	for (const value of values) {
		const key = keyFn(value);
		const existing = map.get(key);
		if (existing) existing.push(value);
		else map.set(key, [value]);
	}
	return map;
}

function chunk(values, size) {
	const out = [];
	for (let index = 0; index < values.length; index += size)
		out.push(values.slice(index, index + size));
	return out;
}

function snippet(value, maxLength) {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function stringArgs(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((arg) => arg.slice(prefix.length));
}

function integerArg(name, defaultValue, minValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}
