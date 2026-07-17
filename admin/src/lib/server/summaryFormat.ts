function limitWords(value: string, maximum: number): string {
	const words = value
		.replace(/^[-*]\s+/gm, '')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);
	if (words.length <= maximum) return words.join(' ');
	return `${words.slice(0, maximum).join(' ')}…`;
}

export function conciseSummary(value: string): string {
	const headings = ['Signal', 'Inspect next', 'Limitation'] as const;
	const sections = new Map<string, string>();
	const matches = [
		...value.matchAll(
			/^##\s+(Signal|Inspect next|Limitation)\s*$\n?([\s\S]*?)(?=^##\s+(?:Signal|Inspect next|Limitation)\s*$|(?![\s\S]))/gim
		)
	];
	for (const match of matches) sections.set(match[1].toLowerCase(), match[2]);
	if (!sections.size && value.trim()) sections.set('signal', value);
	return headings
		.map((heading) => {
			const text = limitWords(sections.get(heading.toLowerCase()) || '', 45);
			return text ? `## ${heading}\n- ${text}` : '';
		})
		.filter(Boolean)
		.join('\n\n');
}
