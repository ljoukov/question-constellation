export function questionAssetPublicPath(
	publicPath: string | null | undefined,
	r2Key: string | null | undefined
) {
	const rawPath = publicPath || (r2Key ? `/${r2Key}` : '');
	if (!rawPath) return '';
	if (/^(?:https?:|data:|blob:)/i.test(rawPath)) return rawPath;
	if (rawPath.startsWith('/images/')) return rawPath;
	if (rawPath.startsWith('images/')) return `/${rawPath}`;
	if (rawPath.startsWith('/papers/')) return `/images${rawPath}`;
	if (rawPath.startsWith('papers/')) return `/images/${rawPath}`;

	const localAssetPrefix = 'data/aqa-combined-science-trilogy-higher/assets/question-papers/';
	const normalizedPath = rawPath.replace(/^\//, '');
	if (normalizedPath.startsWith(localAssetPrefix)) {
		return `/images/papers/${normalizedPath.slice(localAssetPrefix.length)}`;
	}

	return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}
