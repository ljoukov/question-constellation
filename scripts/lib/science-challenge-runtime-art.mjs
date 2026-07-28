/**
 * Build the learner-facing runtime art record from independently reviewed bytes.
 *
 * The reviewer's visibleTakeaway is grounded in the exact dark/light pair and is therefore the
 * canonical runtime alt text. Source art briefs are generation inputs; their altText may be stale,
 * generic or describe a rejected composition and must never silently override the reviewed pixels.
 */
export function buildReviewedRuntimeArtRecord({ spec, deliveryById, reviewById }) {
	if (!spec || typeof spec.id !== 'string' || !spec.id.trim()) {
		throw new Error('Runtime art requires a valid art spec.');
	}
	const dark = deliveryById.get(`${spec.id}-dark`);
	const light = deliveryById.get(`${spec.id}-light`);
	if (!dark || !light) throw new Error(`Missing R2 delivery paths for ${spec.id}.`);
	const review = reviewById.get(spec.id);
	if (
		!review?.accepted ||
		typeof review.visibleTakeaway !== 'string' ||
		!review.visibleTakeaway.trim()
	) {
		throw new Error(`Missing accepted literal runtime art description for ${spec.id}.`);
	}
	return {
		src: light.publicPath,
		darkSrc: dark.publicPath,
		alt: review.visibleTakeaway.trim(),
		width: 960,
		height: 540
	};
}
