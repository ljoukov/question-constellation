import type { ChainIllustration } from '$lib/chains/chainIllustration';
import { queryFirst } from './db';

type ChainIllustrationRow = {
	id: string;
	public_path: string;
	light_public_path: string;
	alt_text: string;
	caption: string | null;
	width: number;
	height: number;
};

export function illustrationFromRow(row: ChainIllustrationRow): ChainIllustration {
	return {
		id: row.id,
		src: row.public_path,
		lightSrc: row.light_public_path,
		alt: row.alt_text,
		caption: row.caption ?? '',
		width: row.width,
		height: row.height
	};
}

export async function getPublishedChainIllustration(
	answerChainId: string
): Promise<ChainIllustration | null> {
	const row = await queryFirst<ChainIllustrationRow>(
		`SELECT id, public_path, light_public_path, alt_text, caption, width, height
		 FROM answer_chain_illustrations
		 WHERE answer_chain_id = ?
		   AND status = 'published'
		   AND needs_human_review = 0
		   AND is_primary = 1
		   AND light_r2_key IS NOT NULL
		   AND light_public_path IS NOT NULL
		   AND light_asset_sha256 IS NOT NULL
		 ORDER BY updated_at DESC, id
		 LIMIT 1`,
		[answerChainId]
	);

	if (!row) return null;

	return illustrationFromRow(row);
}
