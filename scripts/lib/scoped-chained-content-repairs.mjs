/**
 * Use the atomic source prompt for the question row and rendering overlay. The expanded
 * self-contained version remains available separately for contexts that need inherited setup.
 *
 * @param {Record<string, any>} question
 */
export function atomicQuestionPromptForImport(question) {
	for (const value of [
		question.prompt_text,
		question.self_contained_prompt_markdown,
		question.self_contained_prompt_text,
		question.full_prompt_text,
		question.id
	]) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return '';
}

/**
 * Apply deliberately small, reviewed repairs after loading the generated baseline. Keeping this
 * overlay in the ordinary importer prevents a whole-bank refresh from reverting curated atomic
 * prompts, titles, mark evidence, or chain wording.
 *
 * @param {Array<Record<string, any>>} questions
 * @param {Record<string, any>} repair
 */
export function applyScopedQuestionRepairs(questions, repair) {
	validateRepairEnvelope(repair);
	const sourceById = uniqueRowsById(questions, 'Baseline questions');
	const repairsById = uniqueRowsById(repair.questions ?? [], 'Scoped question repairs');
	for (const id of repairsById.keys()) {
		if (!sourceById.has(id)) throw new Error(`Scoped question repair ${id} has no baseline row.`);
	}
	return questions.map((question) => {
		const patch = repairsById.get(question.id);
		if (!patch) return question;
		for (const field of [
			'id',
			'source_document_id',
			'parent_source_question_ref',
			'source_question_ref'
		]) {
			if (patch[field] !== undefined && patch[field] !== question[field]) {
				throw new Error(
					`Scoped question repair ${question.id} cannot change identity field ${field}.`
				);
			}
		}
		return { ...question, ...patch };
	});
}

/**
 * @param {Array<Record<string, any>>} chains
 * @param {Record<string, any>} repair
 */
export function applyScopedChainRepairs(chains, repair) {
	validateRepairEnvelope(repair);
	const sourceById = uniqueRowsById(chains, 'Semantic chains');
	const repairsById = uniqueRowsById(repair.chains ?? [], 'Scoped chain repairs');
	for (const id of repairsById.keys()) {
		if (!sourceById.has(id))
			throw new Error(`Scoped chain repair ${id} has no semantic-chain row.`);
	}

	const repairedChains = chains.map((chain) => {
		const patch = repairsById.get(chain.id);
		if (!patch) return chain;
		const { steps: patchedSteps, stepMode = 'exact', ...topLevelPatch } = patch;
		if (!patchedSteps) return { ...chain, ...topLevelPatch };
		if (!['exact', 'reviewed-extension'].includes(stepMode)) {
			throw new Error(`Scoped chain repair ${chain.id} has unsupported stepMode ${stepMode}.`);
		}
		const sourceSteps = stepsWithStableIds(chain);
		const sourceStepsById = uniqueRowsById(sourceSteps, `Semantic chain ${chain.id} steps`);
		const patchedStepsById = uniqueRowsById(
			/** @type {Array<Record<string, any>>} */ (patchedSteps),
			`Scoped chain repair ${chain.id} steps`
		);
		const missingSourceStepIds = [...sourceStepsById.keys()].filter(
			(id) => !patchedStepsById.has(id)
		);
		const addedSteps = [...patchedStepsById.values()].filter(
			(step) => !sourceStepsById.has(step.id)
		);
		if (missingSourceStepIds.length || (stepMode === 'exact' && addedSteps.length)) {
			throw new Error(
				`Scoped chain repair ${chain.id} must cover the exact source step-id set: ${[
					...sourceStepsById.keys()
				].join(', ')}.`
			);
		}
		if (stepMode === 'reviewed-extension') {
			if (addedSteps.length !== 1 || sourceSteps.length + addedSteps.length > 4) {
				throw new Error(
					`Scoped chain repair ${chain.id} reviewed-extension must add exactly one conclusion step and remain at four steps or fewer.`
				);
			}
			for (const [index, step] of addedSteps.entries()) {
				const expectedId = `${chain.id}-step-${sourceSteps.length + index + 1}`;
				if (step.id !== expectedId || step.step_role !== 'conclusion') {
					throw new Error(
						`Scoped chain repair ${chain.id} reviewed extension ${step.id} must be the unique conclusion step ${expectedId}.`
					);
				}
			}
		}
		const steps = [
			...sourceSteps.map((step) => ({ ...step, ...patchedStepsById.get(step.id) })),
			...addedSteps
		];
		return { ...chain, ...topLevelPatch, steps };
	});
	return applyNamedStepPatches(repairedChains, repair.stepPatches ?? []);
}
export const SCOPED_REPAIR_SCHEMA_VERSION = 'scoped-science-content-repair/v3';

const NAMED_STEP_PATCH_FIELDS = Object.freeze([
	'step_text',
	'step_role',
	'explanation',
	'common_omission'
]);

/** @param {Record<string, any>} chain */
function stepsWithStableIds(chain) {
	return /** @type {Array<Record<string, any>>} */ (chain.steps ?? []).map((step, index) => ({
		...step,
		id: step.id ?? `${chain.id}-step-${index + 1}`
	}));
}

/**
 * @param {Array<Record<string, any>>} chains
 * @param {Array<Record<string, any>>} stepPatches
 */
function applyNamedStepPatches(chains, stepPatches) {
	const chainById = uniqueRowsById(chains, 'Semantic chains after scoped repair');
	const patchesByChainAndStep = new Map();
	for (const patch of stepPatches) {
		const chainId = String(patch.chain_id ?? '').trim();
		const stepId = String(patch.step_id ?? '').trim();
		if (!chainId || !stepId) throw new Error('Scoped step patch requires chain_id and step_id.');
		const key = `${chainId}:${stepId}`;
		if (patchesByChainAndStep.has(key)) {
			throw new Error(`Scoped step patches contain duplicate target ${key}.`);
		}
		const unexpectedFields = Object.keys(patch).filter(
			(field) => !['chain_id', 'step_id', ...NAMED_STEP_PATCH_FIELDS].includes(field)
		);
		if (unexpectedFields.length) {
			throw new Error(
				`Scoped step patch ${key} contains unsupported fields: ${unexpectedFields.join(', ')}.`
			);
		}
		const namedFields = Object.fromEntries(
			NAMED_STEP_PATCH_FIELDS.filter((field) => patch[field] !== undefined).map((field) => [
				field,
				patch[field]
			])
		);
		if (!Object.keys(namedFields).length) {
			throw new Error(`Scoped step patch ${key} has no named fields to update.`);
		}
		const chain = chainById.get(chainId);
		if (!chain) throw new Error(`Scoped step patch ${key} targets an unknown chain.`);
		if (!stepsWithStableIds(chain).some((step) => step.id === stepId)) {
			throw new Error(`Scoped step patch ${key} targets an unknown step id.`);
		}
		patchesByChainAndStep.set(key, namedFields);
	}

	return chains.map((chain) => {
		const steps = stepsWithStableIds(chain);
		if (!stepPatches.some((patch) => patch.chain_id === chain.id)) return chain;
		return {
			...chain,
			steps: steps.map((step) => ({
				...step,
				...(patchesByChainAndStep.get(`${chain.id}:${step.id}`) ?? {})
			}))
		};
	});
}

/** @param {Record<string, any>} repair */
function validateRepairEnvelope(repair) {
	if (repair.schemaVersion !== SCOPED_REPAIR_SCHEMA_VERSION) {
		throw new Error(
			`Scoped repair schema must be exactly ${SCOPED_REPAIR_SCHEMA_VERSION}; received ${String(repair.schemaVersion)}.`
		);
	}
}

/**
 * @param {Array<Record<string, any>>} values
 * @param {string} label
 */
function uniqueRowsById(values, label) {
	const rows = new Map();
	for (const value of values) {
		const id = String(value?.id ?? '').trim();
		if (!id) throw new Error(`${label} contains a row without an id.`);
		if (rows.has(id)) throw new Error(`${label} contains duplicate id ${id}.`);
		rows.set(id, value);
	}
	return rows;
}
