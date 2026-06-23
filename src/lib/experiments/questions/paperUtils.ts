import type { ExamPaper, ExamQuestion, ExamQuestionBlock, ExamQuestionPart } from './types';

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

function partBlocks(part: ExamQuestionPart) {
	return [...(part.leadBlocks ?? []), ...part.blocks, ...(part.afterResponseBlocks ?? [])];
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

function focusPartWithDependencies(question: ExamQuestion, part: ExamQuestionPart) {
	const dependencies = visualDependencyBlocks(question, part);
	if (dependencies.length === 0) return part;
	return {
		...part,
		leadBlocks: [...dependencies, ...(part.leadBlocks ?? [])]
	};
}

export function focusPaperByRef(paper: ExamPaper, ref: string): ExamPaper | null {
	for (const question of paper.questions) {
		if (question.ref === ref) {
			return {
				...paper,
				title: `${paper.title} Question ${question.ref}`,
				questions: [question]
			};
		}

		const part = question.parts.find((candidate) => candidate.ref === ref);
		if (part) {
			return {
				...paper,
				title: `${paper.title} Question ${part.ref}`,
				questions: [
					{
						...question,
						parts: [focusPartWithDependencies(question, part)]
					}
				]
			};
		}
	}

	return null;
}
