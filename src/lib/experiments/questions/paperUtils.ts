import type {
	ExamPaper,
	ExamQuestion,
	ExamQuestionBlock,
	ExamQuestionPart,
	ExamResponse
} from './types';

export function questionRefs(paper: ExamPaper) {
	return paper.questions.flatMap((question) => [
		question.ref,
		...question.parts.map((part) => part.ref)
	]);
}

function textFromBlock(block: ExamQuestionBlock): string {
	if (block.kind === 'paragraph' || block.kind === 'equation') return block.text;
	if (block.kind === 'figure') return block.label ?? '';
	if (block.kind === 'table' || block.kind === 'structured-table') return block.label ?? '';
	if (block.kind === 'key') return block.items.map((item) => item.text).join(' ');
	if (block.kind === 'ordered-list' || block.kind === 'bullet-list') return block.items.join(' ');
	return '';
}

function normalizeVisualLabel(label: string) {
	return label
		.replace(/\bfig\.?\s+/i, 'Figure ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function referencedVisualLabels(blocks: ExamQuestionBlock[]) {
	const labels = new Set<string>();
	for (const block of blocks) {
		const text = textFromBlock(block);
		for (const match of text.matchAll(/\b(?:Figure|Fig\.?|Table)\s+\d+\b/gi)) {
			labels.add(normalizeVisualLabel(match[0]));
		}
	}
	return labels;
}

function blockVisualLabel(block: ExamQuestionBlock) {
	if (block.kind !== 'figure' && block.kind !== 'table' && block.kind !== 'structured-table') {
		return null;
	}
	return block.label ? normalizeVisualLabel(block.label) : null;
}

function blockKey(block: ExamQuestionBlock) {
	if (block.kind === 'figure') return `figure:${block.label ?? block.assetId}`;
	if (block.kind === 'table' || block.kind === 'structured-table') {
		return `${block.kind}:${block.label ?? ''}:${JSON.stringify(block)}`;
	}
	return `${block.kind}:${JSON.stringify(block)}`;
}

function responseAssetKey(response: ExamResponse) {
	if (response.kind === 'asset-canvas' || response.kind === 'image-label-zones') {
		return `asset:${response.assetId}`;
	}
	return null;
}

function uniqueBlocks(blocks: ExamQuestionBlock[]) {
	const seen = new Set<string>();
	return blocks.filter((block) => {
		const key = blockKey(block);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function mergeBlocks(base: ExamQuestionBlock[], extra: ExamQuestionBlock[]) {
	return uniqueBlocks([...base, ...extra]);
}

function partBlocks(part: ExamQuestionPart) {
	return [...(part.leadBlocks ?? []), ...part.blocks, ...(part.afterResponseBlocks ?? [])];
}

function addRenderedPartKeys(seen: Set<string>, part: ExamQuestionPart) {
	for (const block of partBlocks(part)) {
		seen.add(blockKey(block));
	}
	const assetKey = responseAssetKey(part.response);
	if (assetKey) seen.add(assetKey);
}

function visualDependencyBlocks(question: ExamQuestion, selectedPart: ExamQuestionPart) {
	const selectedBlocks = partBlocks(selectedPart);
	const neededLabels = referencedVisualLabels([...question.blocks, ...selectedBlocks]);
	if (neededLabels.size === 0) return [];

	for (const block of [...question.blocks, ...selectedBlocks]) {
		const label = blockVisualLabel(block);
		if (label) neededLabels.delete(label);
	}
	if (neededLabels.size === 0) return [];

	const dependencies: ExamQuestionBlock[] = [];
	const seenLabels = new Set<string>();
	for (const part of question.parts) {
		if (part.ref === selectedPart.ref) continue;
		for (const block of partBlocks(part)) {
			const label = blockVisualLabel(block);
			if (!label || !neededLabels.has(label) || seenLabels.has(label)) continue;
			dependencies.push(block);
			seenLabels.add(label);
		}
	}
	return dependencies;
}

function resolvePartDependencies(
	question: ExamQuestion,
	part: ExamQuestionPart,
	seen: Set<string>
) {
	const dependencies = visualDependencyBlocks(question, part);
	const supportBlocks = [...dependencies, ...(part.stemBlocks ?? [])].filter((block) => {
		const key = blockKey(block);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const resolvedPart = supportBlocks.length
		? {
				...part,
				leadBlocks: [...supportBlocks, ...(part.leadBlocks ?? [])]
			}
		: part;
	addRenderedPartKeys(seen, resolvedPart);
	return resolvedPart;
}

function resolveQuestionDependencies(question: ExamQuestion): ExamQuestion {
	const seen = new Set(question.blocks.map(blockKey));
	return {
		...question,
		parts: question.parts.map((part) => resolvePartDependencies(question, part, seen))
	};
}

export function resolvePaperDependencies(paper: ExamPaper): ExamPaper {
	return {
		...paper,
		questions: paper.questions.map(resolveQuestionDependencies)
	};
}

export function focusPaperByRef(paper: ExamPaper, ref: string): ExamPaper | null {
	for (const question of paper.questions) {
		if (question.ref === ref) {
			return {
				...paper,
				title: `${paper.title} Question ${question.ref}`,
				questions: [resolveQuestionDependencies(question)]
			};
		}

		const part = question.parts.find((candidate) => candidate.ref === ref);
		if (part) {
			const focusedQuestion = resolveQuestionDependencies({
				...question,
				blocks: mergeBlocks(question.blocks, part.stemBlocks ?? []),
				parts: [part]
			});
			return {
				...paper,
				title: `${paper.title} Question ${part.ref}`,
				questions: [focusedQuestion]
			};
		}
	}

	return null;
}
