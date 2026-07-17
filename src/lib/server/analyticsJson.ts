export function safeAnalyticsJson(value: unknown, maximum = 32_000): string | null {
	if (value === undefined || value === null) return null;

	try {
		const serialized = JSON.stringify(value);
		if (serialized.length <= maximum) return serialized;

		const envelope = (preview: string) =>
			JSON.stringify({
				truncated: true,
				originalLength: serialized.length,
				preview
			});
		const emptyEnvelope = envelope('');
		if (emptyEnvelope.length > maximum) return null;

		let lower = 0;
		let upper = Math.min(serialized.length, maximum);
		while (lower < upper) {
			const midpoint = Math.ceil((lower + upper) / 2);
			if (envelope(serialized.slice(0, midpoint)).length <= maximum) lower = midpoint;
			else upper = midpoint - 1;
		}
		return envelope(serialized.slice(0, lower));
	} catch {
		return null;
	}
}
