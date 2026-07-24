export const SHORT_RECALL_CONTENT_VERSION = 'short-recall-v1';

export type ShortRecallPrompt = {
	challengeId: string;
	stem: string;
	canonicalAnswer: string;
	acceptedAliases: string[];
	preferredHiddenStepIndex: number;
	spellingVariants?: string[];
	contentVersion?: string;
};

export type ShortRecallMatchKind = 'exact' | 'alias' | 'spelling' | 'none';

export type ShortRecallMatch = {
	correct: boolean;
	kind: ShortRecallMatchKind;
	matchedAnswer: string | null;
};

const KEYBOARD_ROWS = [
	{ value: 'qwertyuiop', offset: 0 },
	{ value: 'asdfghjkl', offset: 0.25 },
	{ value: 'zxcvbnm', offset: 0.75 }
] as const;

const LEADING_FILLER = new Set(['a', 'an', 'the']);

export function matchShortRecall(
	response: string,
	prompt: Pick<ShortRecallPrompt, 'canonicalAnswer' | 'acceptedAliases' | 'spellingVariants'>
): ShortRecallMatch {
	const normalizedResponse = normalizeShortRecallAnswer(response);
	if (!normalizedResponse) return noShortRecallMatch();

	const acceptedAnswers = [prompt.canonicalAnswer, ...prompt.acceptedAliases];
	const normalizedAnswers = acceptedAnswers
		.map((answer, index) => ({
			answer,
			index,
			normalized: normalizeShortRecallAnswer(answer)
		}))
		.filter((candidate) => Boolean(candidate.normalized));

	for (const candidate of normalizedAnswers) {
		if (normalizedResponse === candidate.normalized) {
			return {
				correct: true,
				kind: candidate.index === 0 ? 'exact' : 'alias',
				matchedAnswer: candidate.answer
			};
		}
	}

	const spellingVariants = new Set(
		(prompt.spellingVariants ?? []).map(normalizeShortRecallAnswer).filter(Boolean)
	);
	if (spellingVariants.has(normalizedResponse)) {
		return {
			correct: true,
			kind: 'spelling',
			matchedAnswer: normalizedAnswers[0]?.answer ?? null
		};
	}

	return noShortRecallMatch();
}

export function normalizeShortRecallAnswer(value: string): string {
	const tokens = value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[’']/g, '')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

	while (tokens.length > 1 && LEADING_FILLER.has(tokens[0] ?? '')) tokens.shift();
	if (tokens.length > 2 && tokens[0] === 'it' && tokens[1] === 'is') tokens.splice(0, 2);
	return tokens.join(' ');
}

export function generateSpellingVariants(answers: readonly string[]): string[] {
	const accepted = new Set(answers.map(normalizeShortRecallAnswer).filter(Boolean));
	const variants = new Set<string>();

	for (const answer of accepted) {
		const tokens = answer.split(' ');
		for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
			const token = tokens[tokenIndex] ?? '';
			if (token.length <= 3) continue;

			const tokenVariants = new Set<string>();
			for (let index = 0; index < token.length - 1; index += 1) {
				if (token[index] === token[index + 1]) continue;
				tokenVariants.add(
					`${token.slice(0, index)}${token[index + 1]}${token[index]}${token.slice(index + 2)}`
				);
			}

			if (token.length >= 5) {
				for (let index = 0; index < token.length; index += 1) {
					tokenVariants.add(`${token.slice(0, index)}${token.slice(index + 1)}`);
					tokenVariants.add(`${token.slice(0, index + 1)}${token[index]}${token.slice(index + 1)}`);
				}
			}

			for (let index = 0; index < token.length; index += 1) {
				for (const neighbor of keyboardNeighbors(token[index] ?? '')) {
					tokenVariants.add(`${token.slice(0, index)}${neighbor}${token.slice(index + 1)}`);
				}
			}

			for (const tokenVariant of tokenVariants) {
				const phrase = tokens
					.map((current, index) => (index === tokenIndex ? tokenVariant : current))
					.join(' ');
				if (!accepted.has(phrase)) variants.add(phrase);
			}
		}
	}

	return [...variants].sort();
}

export function keyboardNeighbors(key: string): string[] {
	const normalizedKey = key.toLowerCase();
	let source: { row: number; column: number; x: number } | null = null;

	for (let row = 0; row < KEYBOARD_ROWS.length; row += 1) {
		const column = KEYBOARD_ROWS[row]?.value.indexOf(normalizedKey) ?? -1;
		if (column >= 0) {
			source = { row, column, x: column + (KEYBOARD_ROWS[row]?.offset ?? 0) };
			break;
		}
	}
	if (!source) return [];

	const neighbors: string[] = [];
	for (let row = 0; row < KEYBOARD_ROWS.length; row += 1) {
		const keyboardRow = KEYBOARD_ROWS[row];
		if (!keyboardRow) continue;
		for (let column = 0; column < keyboardRow.value.length; column += 1) {
			const candidate = keyboardRow.value[column];
			if (!candidate || candidate === normalizedKey) continue;
			const rowDistance = Math.abs(row - source.row);
			const xDistance = Math.abs(column + keyboardRow.offset - source.x);
			if (rowDistance <= 1 && xDistance <= 1.1) neighbors.push(candidate);
		}
	}
	return neighbors.sort();
}

export function validateShortRecallPrompt(value: unknown): ShortRecallPrompt | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.challengeId !== 'string' ||
		!value.challengeId.trim() ||
		value.challengeId !== value.challengeId.trim() ||
		typeof value.stem !== 'string' ||
		(value.stem.match(/___/g) ?? []).length !== 1 ||
		typeof value.canonicalAnswer !== 'string' ||
		!isShortRecallAnswer(value.canonicalAnswer) ||
		!Array.isArray(value.acceptedAliases) ||
		!value.acceptedAliases.every(isShortRecallAnswer) ||
		!Number.isInteger(value.preferredHiddenStepIndex) ||
		(value.preferredHiddenStepIndex as number) < 0
	) {
		return null;
	}

	const aliases = uniqueStrings(value.acceptedAliases as string[]);
	const canonicalAnswer = value.canonicalAnswer.trim();
	const canonicalNormalized = normalizeShortRecallAnswer(canonicalAnswer);
	if (aliases.some((alias) => normalizeShortRecallAnswer(alias) === canonicalNormalized))
		return null;

	const spellingVariants =
		value.spellingVariants === undefined
			? undefined
			: Array.isArray(value.spellingVariants) &&
				  value.spellingVariants.every(
						(candidate) => typeof candidate === 'string' && Boolean(candidate.trim())
				  )
				? uniqueStrings(value.spellingVariants as string[])
				: null;
	if (spellingVariants === null) return null;
	if (value.contentVersion !== undefined && typeof value.contentVersion !== 'string') return null;

	return {
		challengeId: value.challengeId,
		stem: value.stem.trim(),
		canonicalAnswer,
		acceptedAliases: aliases,
		preferredHiddenStepIndex: value.preferredHiddenStepIndex as number,
		...(spellingVariants ? { spellingVariants } : {}),
		...(typeof value.contentVersion === 'string'
			? { contentVersion: value.contentVersion.trim() }
			: {})
	};
}

function isShortRecallAnswer(value: unknown): value is string {
	if (typeof value !== 'string' || !value.trim()) return false;
	const normalized = normalizeShortRecallAnswer(value);
	const words = normalized.split(' ').filter(Boolean);
	return words.length >= 1 && words.length <= 2;
}

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		const normalized = normalizeShortRecallAnswer(trimmed);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(trimmed);
	}
	return unique;
}

function noShortRecallMatch(): ShortRecallMatch {
	return { correct: false, kind: 'none', matchedAnswer: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
