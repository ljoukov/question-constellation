import type { LayoutServerLoad } from './$types';
import { queryRows } from '$lib/server/db';
import { getPublicRoutePayload } from '$lib/server/publicRoutePayloads';

type SubjectNavigationItem = {
	subject: string;
	questionId: string;
	questionCount: number;
};

async function getSubjectNavigation(): Promise<SubjectNavigationItem[]> {
	const materialized = await getPublicRoutePayload<SubjectNavigationItem[]>(
		'layout:subject-navigation'
	).catch(() => null);
	if (materialized && Array.isArray(materialized)) return materialized;

	return await queryRows<SubjectNavigationItem>(
		`WITH ranked_subject_questions AS (
			SELECT
				q.subject_area AS subject,
				q.id AS questionId,
				COUNT(*) OVER (PARTITION BY q.subject_area) AS questionCount,
				ROW_NUMBER() OVER (
					PARTITION BY q.subject_area
					ORDER BY
						CASE qac.transfer_distance
							WHEN 'start' THEN 0
							WHEN 'near' THEN 1
							WHEN 'stretch' THEN 2
							WHEN 'exam_transfer' THEN 3
							ELSE 4
						END,
						qac.needs_human_review ASC,
						COALESCE(qac.fit_confidence, 0) DESC,
						q.id
				) AS rowNumber
			FROM question_answer_chains qac
			JOIN questions q ON q.id = qac.question_id
			JOIN answer_chains ac ON ac.id = qac.answer_chain_id
			WHERE q.subject_area IS NOT NULL AND q.subject_area != ''
			  AND qac.needs_human_review = 0
			  AND q.needs_human_review = 0
			  AND q.status = 'published'
			  AND ac.needs_human_review = 0
			  AND ac.status = 'published'
		)
		SELECT subject, questionId, questionCount
		FROM ranked_subject_questions
		WHERE rowNumber = 1
		ORDER BY CASE subject
			WHEN 'Biology' THEN 0
			WHEN 'Chemistry' THEN 1
			WHEN 'Physics' THEN 2
			ELSE 3
		END, subject`
	);
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const subjectNavigation = await getSubjectNavigation().catch(() => []);

	return {
		user: locals.user,
		subjectNavigation
	};
};
