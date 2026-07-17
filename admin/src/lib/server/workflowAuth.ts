function toHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signAnalyticsWorkflow(summaryId: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return toHex(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`analytics-summary:${summaryId}`))
	);
}

export function signaturesMatch(expected: string, provided: string): boolean {
	if (expected.length !== provided.length) return false;
	let difference = 0;
	for (let index = 0; index < expected.length; index += 1) {
		difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
	}
	return difference === 0;
}
