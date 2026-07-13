import type { ChainIllustration } from '$lib/chains/chainIllustration';
import { queryFirst } from './db';

type ChainIllustrationRow = {
	id: string;
	public_path: string;
	alt_text: string;
	caption: string | null;
	width: number;
	height: number;
};

export async function getPublishedChainIllustration(
	answerChainId: string
): Promise<ChainIllustration | null> {
	const row = await queryFirst<ChainIllustrationRow>(
		`SELECT id, public_path, alt_text, caption, width, height
		 FROM answer_chain_illustrations
		 WHERE answer_chain_id = ?
		   AND status = 'published'
		   AND needs_human_review = 0
		   AND is_primary = 1
		 ORDER BY updated_at DESC, id
		 LIMIT 1`,
		[answerChainId]
	);

	if (!row) return null;

	return {
		id: row.id,
		src: row.public_path,
		alt: row.alt_text,
		caption: row.caption ?? '',
		width: row.width,
		height: row.height
	};
}
