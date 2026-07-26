export type LabeledAnswerField = {
	label: string;
};

export function normalizedLabeledAnswerKey(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function parseLabeledAnswerMap(value: string) {
	return new Map(
		value
			.split(/\r?\n/)
			.map((line) => {
				const [label, ...rest] = line.split(':');
				const key = normalizedLabeledAnswerKey(label ?? '');
				if (!key) return null;
				const serializedValue = rest.join(':');
				// Remove our separator only. Trimming here drops a learner's in-progress trailing space.
				const fieldValue = serializedValue.startsWith(' ')
					? serializedValue.slice(1)
					: serializedValue;
				return [key, fieldValue] as const;
			})
			.filter((entry): entry is readonly [string, string] => Boolean(entry))
	);
}

export function serializeLabeledAnswerFields(
	fields: readonly LabeledAnswerField[],
	answers: Readonly<Record<string, string>>,
	choice: string | null = null
) {
	const choiceAnswer = choice ? [`Choice: ${choice}`] : [];
	return [
		...choiceAnswer,
		...fields.map((field) => {
			const value = answers[field.label] ?? '';
			return `${field.label}:${value.length > 0 ? ` ${value}` : ''}`;
		})
	].join('\n');
}
