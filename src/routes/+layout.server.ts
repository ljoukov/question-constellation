import type { LayoutServerLoad } from './$types';
import { queryRows } from '$lib/server/db';

type SubjectNavigationItem = {
	subject: string;
	questionId: string;
	questionCount: number;
};

async function getSubjectNavigation(): Promise<SubjectNavigationItem[]> {
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
			WHERE q.subject_area IS NOT NULL AND q.subject_area != ''
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
