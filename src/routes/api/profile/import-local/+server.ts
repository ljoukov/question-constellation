import {
	mergeAnonymousProfileIntoAccount,
	parseAnonymousLearnerProfile
} from '$lib/anonymousLearnerProfile';
import {
	getLearnerProfileSettingsForLocalImport,
	updateEnglishLiteratureSelections,
	updateLearnerSubjects
} from '$lib/server/personalLearning';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const body = (await request.json().catch(() => null)) as { profile?: unknown } | null;
	const profile = parseAnonymousLearnerProfile(body?.profile);
	if (!profile) return json({ error: 'invalid_profile' }, { status: 400 });

	const { settings, persistedSubjectNames, localProfileImportPending } =
		await getLearnerProfileSettingsForLocalImport(locals.user);
	const initializePrimaryProfile = localProfileImportPending;
	const establishedSubjectNames = initializePrimaryProfile
		? persistedSubjectNames
		: [...new Set([...persistedSubjectNames, settings.profile.selectedSubject])];
	const merge = mergeAnonymousProfileIntoAccount(settings, profile, establishedSubjectNames);
	const writes: Promise<void>[] = [];

	if (merge.subjectsChanged || initializePrimaryProfile) {
		writes.push(
			updateLearnerSubjects({
				userId: locals.user.uid,
				subjects: merge.subjects,
				updatePrimaryProfile: initializePrimaryProfile,
				// Keep the provenance marker intact until every subject row has
				// landed. A retry can then reconstruct the exact guest merge
				// instead of treating a synthetic primary as established data.
				updatePrimaryProfileBeforeSubjects: false,
				expectedPrimaryProfile: initializePrimaryProfile
					? {
							board: settings.profile.selectedBoard,
							subject: settings.profile.selectedSubject,
							tier: settings.profile.selectedTier
						}
					: null,
				preserveExistingRows: true
			})
		);
	}
	if (merge.englishLiteratureSelectionsChanged) {
		writes.push(
			updateEnglishLiteratureSelections({
				userId: locals.user.uid,
				selections: merge.englishLiteratureSelections,
				preserveExistingSelections: true
			})
		);
	}
	await Promise.all(writes);

	return json({
		status: 'ok',
		importedAt: new Date().toISOString(),
		snapshotChanged:
			initializePrimaryProfile || merge.subjectsChanged || merge.englishLiteratureSelectionsChanged
	});
};
