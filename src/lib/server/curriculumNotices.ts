import { queryRows } from './db';

type CurriculumNoticeRow = {
	id: string;
	board: string;
	qualification: string;
	subject: string;
	specification_code: string | null;
	content_area: string | null;
	title: string;
	body: string;
	evidence_json: string;
	source: string;
};

export type CurriculumNoticeEvidence = {
	sourceType?: string;
	label?: string;
	sourceDocumentId?: string;
	sourceUrl?: string;
};

export type CurriculumNotice = {
	id: string;
	board: string;
	qualification: string;
	subject: string;
	specificationCode: string | null;
	contentArea: string | null;
	title: string;
	body: string;
	evidence: CurriculumNoticeEvidence[];
	source: string;
};

export async function getCurriculumNotices({
	board,
	qualification,
	subject,
	specificationCode
}: {
	board: string;
	qualification: string;
	subject: string;
	specificationCode: string;
}): Promise<CurriculumNotice[]> {
	const rows = await queryRows<CurriculumNoticeRow>(
		`SELECT
			 id,
			 board,
			 qualification,
			 subject,
			 specification_code,
			 content_area,
			 title,
			 body,
			 evidence_json,
			 source
		 FROM curriculum_notices
		 WHERE active = 1
		   AND board = ?
		   AND qualification = ?
		   AND subject = ?
		   AND (specification_code IS NULL OR specification_code = ?)
		 ORDER BY display_order, id`,
		[board, qualification, subject, specificationCode]
	);

	return rows.map((row) => ({
		id: row.id,
		board: row.board,
		qualification: row.qualification,
		subject: row.subject,
		specificationCode: row.specification_code,
		contentArea: row.content_area,
		title: row.title,
		body: row.body,
		evidence: parseEvidence(row.evidence_json),
		source: row.source
	}));
}

function parseEvidence(raw: string): CurriculumNoticeEvidence[] {
	try {
		const evidence = JSON.parse(raw);
		if (!Array.isArray(evidence)) return [];
		return evidence.filter(
			(item): item is CurriculumNoticeEvidence =>
				typeof item === 'object' &&
				item !== null &&
				(typeof item.sourceType === 'string' || item.sourceType === undefined) &&
				(typeof item.label === 'string' || item.label === undefined) &&
				(typeof item.sourceDocumentId === 'string' || item.sourceDocumentId === undefined) &&
				(typeof item.sourceUrl === 'string' || item.sourceUrl === undefined) &&
				(typeof item.sourceDocumentId === 'string' || typeof item.sourceUrl === 'string')
		);
	} catch {
		return [];
	}
}
