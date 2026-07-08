export function markLabel(marks: number | null | undefined) {
	if (typeof marks !== 'number') return '';
	return `${marks} ${marks === 1 ? 'mark' : 'marks'}`;
}

export function scoreFractionLabel(
	score: number | null | undefined,
	maxMarks: number | null | undefined
) {
	if (typeof score !== 'number' || typeof maxMarks !== 'number') return '';
	return `${score}/${maxMarks}`;
}
