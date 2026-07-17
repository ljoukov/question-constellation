export const ASSET_CANVAS_ANSWER_PREFIX = 'qc-asset-canvas-v1:';
export const MAX_ASSET_CANVAS_ANSWER_LENGTH = 5_000;

export type AssetCanvasPoint = [number, number];
export type AssetCanvasStroke = AssetCanvasPoint[];

export type AssetCanvasAnswer = {
	strokes: AssetCanvasStroke[];
	working: string;
	finalAnswer: string;
};

const MAX_STROKES = 12;
const MAX_POINTS_PER_STROKE = 96;

function finiteCoordinate(value: unknown) {
	const number = Number(value);
	if (!Number.isFinite(number)) return null;
	return Math.max(0, Math.min(1_000, Math.round(number)));
}

function sanitizePoint(value: unknown): AssetCanvasPoint | null {
	if (!Array.isArray(value) || value.length < 2) return null;
	const x = finiteCoordinate(value[0]);
	const y = finiteCoordinate(value[1]);
	return x === null || y === null ? null : [x, y];
}

function evenlySampleStroke(stroke: AssetCanvasStroke, maximum: number) {
	if (stroke.length <= maximum) return stroke;
	if (maximum <= 2) return [stroke[0], stroke.at(-1)!];
	return Array.from({ length: maximum }, (_, index) => {
		const sourceIndex = Math.round((index * (stroke.length - 1)) / (maximum - 1));
		return stroke[sourceIndex];
	});
}

function sanitizeStrokes(value: unknown): AssetCanvasStroke[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, MAX_STROKES)
		.map((stroke) =>
			Array.isArray(stroke)
				? evenlySampleStroke(
						stroke.map(sanitizePoint).filter((point): point is AssetCanvasPoint => Boolean(point)),
						MAX_POINTS_PER_STROKE
					)
				: []
		)
		.filter((stroke) => stroke.length > 0);
}

function stringValue(value: unknown) {
	return typeof value === 'string' ? value : '';
}

export function emptyAssetCanvasAnswer(): AssetCanvasAnswer {
	return { strokes: [], working: '', finalAnswer: '' };
}

export function parseAssetCanvasAnswer(raw: string): AssetCanvasAnswer {
	if (!raw) return emptyAssetCanvasAnswer();
	if (!raw.startsWith(ASSET_CANVAS_ANSWER_PREFIX)) {
		// A plain-text answer from an older renderer is still useful written working.
		return { strokes: [], working: raw, finalAnswer: '' };
	}

	try {
		const value = JSON.parse(raw.slice(ASSET_CANVAS_ANSWER_PREFIX.length)) as Record<
			string,
			unknown
		>;
		return {
			strokes: sanitizeStrokes(value.strokes),
			working: stringValue(value.working),
			finalAnswer: stringValue(value.finalAnswer)
		};
	} catch {
		return emptyAssetCanvasAnswer();
	}
}

function encoded(answer: AssetCanvasAnswer) {
	return `${ASSET_CANVAS_ANSWER_PREFIX}${JSON.stringify(answer)}`;
}

export function serializeAssetCanvasAnswer(value: AssetCanvasAnswer) {
	let answer: AssetCanvasAnswer = {
		strokes: sanitizeStrokes(value.strokes),
		working: stringValue(value.working),
		finalAnswer: stringValue(value.finalAnswer)
	};

	if (!assetCanvasAnswerIsMeaningful(answer)) return '';

	let result = encoded(answer);
	for (
		let maximum = 64;
		result.length > MAX_ASSET_CANVAS_ANSWER_LENGTH && maximum >= 2;
		maximum--
	) {
		answer = {
			...answer,
			strokes: answer.strokes.map((stroke) => evenlySampleStroke(stroke, maximum))
		};
		result = encoded(answer);
	}

	if (result.length > MAX_ASSET_CANVAS_ANSWER_LENGTH) {
		const overflow = result.length - MAX_ASSET_CANVAS_ANSWER_LENGTH;
		answer = {
			...answer,
			working: answer.working.slice(0, Math.max(0, answer.working.length - overflow))
		};
		result = encoded(answer);
	}

	if (result.length > MAX_ASSET_CANVAS_ANSWER_LENGTH) {
		const overflow = result.length - MAX_ASSET_CANVAS_ANSWER_LENGTH;
		answer = {
			...answer,
			finalAnswer: answer.finalAnswer.slice(0, Math.max(0, answer.finalAnswer.length - overflow))
		};
		result = encoded(answer);
	}

	return result.slice(0, MAX_ASSET_CANVAS_ANSWER_LENGTH);
}

export function assetCanvasAnswerIsMeaningful(value: AssetCanvasAnswer | string) {
	const answer = typeof value === 'string' ? parseAssetCanvasAnswer(value) : value;
	return (
		answer.strokes.some((stroke) => stroke.length > 0) ||
		answer.working.trim().length > 0 ||
		answer.finalAnswer.trim().length > 0
	);
}

export function assetCanvasAnswerForGrading(raw: string) {
	const answer = parseAssetCanvasAnswer(raw);
	return [
		answer.strokes.length
			? `DRAWING_STROKES_RECORDED: ${answer.strokes.length} (vector coordinates are recorded, but the visual relationship to the source figure is not automatically verifiable)`
			: 'DRAWING_STROKES_RECORDED: 0',
		answer.working.trim() ? `WRITTEN_WORKING:\n${answer.working.trim()}` : null,
		answer.finalAnswer.trim() ? `FINAL_ANSWER:\n${answer.finalAnswer.trim()}` : null
	]
		.filter(Boolean)
		.join('\n');
}
