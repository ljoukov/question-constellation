export type RestorableGapFieldResult<TFailure = unknown> = {
	status: 'idle' | 'checking' | 'correct' | 'partial' | 'incorrect' | 'error';
	feedback: string;
	failure?: TFailure | null;
};

/** A network check cannot survive navigation, so never restore its transient state. */
export function restorableGapFieldResults<TFailure>(
	results: Record<string, RestorableGapFieldResult<TFailure>> | null | undefined
) {
	if (!results) return {};
	return Object.fromEntries(
		Object.entries(results).map(([id, result]) => [
			id,
			result.status === 'checking'
				? ({
						status: 'idle',
						feedback: '',
						failure: null
					} satisfies RestorableGapFieldResult<TFailure>)
				: result
		])
	);
}
