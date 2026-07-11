export async function responseErrorAsString(response: Response): Promise<string> {
	const bodyText = await response.text().catch(() => '<failed to read response body>');
	return `status=${response.status} ${response.statusText}; body=${bodyText}`;
}

export function clientSideRedirect(url: URL): Response {
	return new Response(
		`<!doctype html><html><head><meta http-equiv="refresh" content="0; url='${url.toString()}'"></head><body></body></html>`,
		{ headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
	);
}
