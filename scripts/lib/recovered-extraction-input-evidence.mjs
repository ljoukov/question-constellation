const RECOVERABLE_RESPONSE_ITEM_TYPES = new Set([
	'custom_tool_call',
	'custom_tool_call_output',
	'function_call',
	'function_call_output'
]);

export function collectRecoveredPipelineCommandObservations(events, sourceDocumentId) {
	const sourceId = String(sourceDocumentId ?? '').trim();
	if (!sourceId) throw new Error('sourceDocumentId is required for command recovery.');
	const observations = [];
	for (const [eventIndex, event] of events.entries()) {
		if (
			event?.type !== 'response_item' ||
			!RECOVERABLE_RESPONSE_ITEM_TYPES.has(event?.payload?.type)
		) {
			continue;
		}
		for (const entry of nestedStrings(event.payload)) {
			const segments = entry.value.split(/\r?\n|\\n/);
			for (const [segmentIndex, segmentValue] of segments.entries()) {
				const observedCommand = segmentValue.trim();
				if (!observedCommand.includes('scripts/run-codex-production-import-pipeline.mjs')) {
					continue;
				}
				const sourceDocumentIds = flagValues(observedCommand, 'source-document-id');
				if (sourceDocumentIds.length !== 1 || sourceDocumentIds[0] !== sourceId) continue;
				const questionPapers = flagValues(observedCommand, 'question-paper');
				const markSchemes = flagValues(observedCommand, 'mark-scheme');
				if (questionPapers.length !== 1 || markSchemes.length !== 1) continue;
				observations.push({
					lineNumber: eventIndex + 1,
					timestamp: event?.timestamp ?? null,
					payloadType: event.payload.type,
					jsonPath: entry.jsonPath,
					segmentIndex,
					observedCommand,
					sourceDocumentId: sourceId,
					questionPaper: questionPapers[0],
					markScheme: markSchemes[0],
					supportingDocuments: unique(flagValues(observedCommand, 'supporting-document'))
				});
			}
		}
	}
	return observations;
}

export function flagValues(text, flagName) {
	const escapedName = String(flagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(
		`--${escapedName}=(?:"([^"\\r\\n]+)"|'([^'\\r\\n]+)'|([^\\s"',}\\]]+))`,
		'g'
	);
	return [...String(text).matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3]);
}

function* nestedStrings(value, jsonPath = '$') {
	if (typeof value === 'string') {
		yield { jsonPath, value };
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			yield* nestedStrings(item, `${jsonPath}[${index}]`);
		}
		return;
	}
	if (!value || typeof value !== 'object') return;
	for (const [key, item] of Object.entries(value)) {
		yield* nestedStrings(item, `${jsonPath}.${key}`);
	}
}

function unique(values) {
	return [...new Set(values)];
}
