<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import { ArrowLeft, BookOpen, CheckCircle2 } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type LearnerSubject = PageProps['data']['settings']['subjects'][number];

	const scienceSubjects = new Set(['Biology', 'Chemistry', 'Physics']);
	const englishSubjects = new Set(['English Language', 'English Literature']);

	let subjects = $state<LearnerSubject[]>(
		untrack(() =>
			data.settings.subjects.map((subject) => ({
				...subject,
				course:
					scienceSubjects.has(subject.subject) && subject.course === 'GCSE Subject'
						? 'Combined Science'
						: subject.course
			}))
		)
	);

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
	type ToastTone = 'success' | 'error';

	const autosaveDelayMs = 550;
	const autosaveTimeoutMs = 8000;

	let profileForm = $state<HTMLFormElement | null>(null);
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	let saveTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	let activeSaveController: AbortController | null = null;
	let changeRevision = 0;
	let lastSavedSubjects = untrack(() => cloneSubjects(subjects));
	let saveStatus = $state<SaveStatus>('idle');
	let saveToastMessage = $state('');
	let saveToastTone = $state<ToastTone>('success');

	const enabledCount = $derived(subjects.filter((subject) => subject.enabled).length);
	const saveLabel = $derived(
		saveStatus === 'saving'
			? 'Saving profile...'
			: saveStatus === 'saved'
				? 'Profile saved'
				: saveStatus === 'error'
					? 'Could not save profile'
					: 'Changes save automatically'
	);

	const enhanceProfile: SubmitFunction = ({ controller }) => {
		activeSaveController?.abort();
		activeSaveController = controller;
		saveStatus = 'saving';
		const submittedRevision = changeRevision;
		const submittedSubjects = cloneSubjects(subjects);
		saveTimeoutTimer = setTimeout(() => {
			if (activeSaveController !== controller) return;
			controller.abort();
			failAutosave(submittedRevision, 'Could not reach the network. Restored previous profile.');
		}, autosaveTimeoutMs);

		return async ({ result }) => {
			if (saveTimeoutTimer) {
				clearTimeout(saveTimeoutTimer);
				saveTimeoutTimer = null;
			}
			if (activeSaveController === controller) activeSaveController = null;

			if (result.type === 'success') {
				lastSavedSubjects = submittedSubjects;
				if (changeRevision === submittedRevision) {
					saveStatus = 'saved';
					showSaveToast('Profile saved', 'success');
				}
				return;
			}

			failAutosave(submittedRevision, 'Could not save. Restored previous profile.');
		};
	};

	$effect(() => {
		if (!browser) return;
		const handleOffline = () => {
			if (autosaveTimer || activeSaveController || saveStatus === 'saving') {
				failAutosave(changeRevision, 'You are offline. Restored previous profile.');
			}
		};
		window.addEventListener('offline', handleOffline);
		return () => {
			window.removeEventListener('offline', handleOffline);
			if (autosaveTimer) clearTimeout(autosaveTimer);
			if (toastTimer) clearTimeout(toastTimer);
			if (saveTimeoutTimer) clearTimeout(saveTimeoutTimer);
			activeSaveController?.abort();
		};
	});

	function cloneSubjects(nextSubjects: LearnerSubject[]) {
		return nextSubjects.map((subject) => ({ ...subject }));
	}

	function queueAutosave() {
		changeRevision += 1;
		if (browser && !navigator.onLine) {
			failAutosave(changeRevision, 'You are offline. Restored previous profile.');
			return;
		}
		saveStatus = 'saving';
		if (autosaveTimer) clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => {
			autosaveTimer = null;
			if (browser && !navigator.onLine) {
				failAutosave(changeRevision, 'You are offline. Restored previous profile.');
				return;
			}
			profileForm?.requestSubmit();
		}, autosaveDelayMs);
	}

	function failAutosave(revision: number, message: string) {
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		if (saveTimeoutTimer) {
			clearTimeout(saveTimeoutTimer);
			saveTimeoutTimer = null;
		}
		activeSaveController?.abort();
		activeSaveController = null;
		if (changeRevision === revision) {
			subjects = cloneSubjects(lastSavedSubjects);
		}
		saveStatus = 'error';
		showSaveToast(message, 'error');
	}

	function showSaveToast(message: string, tone: ToastTone) {
		saveToastMessage = message;
		saveToastTone = tone;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(
			() => {
				saveToastMessage = '';
			},
			tone === 'error' ? 4600 : 2400
		);
	}

	function examProfileFor(subject: string) {
		return data.examProfile.subjects.find((entry) => entry.subject === subject);
	}

	function boardOptionsFor(subject: LearnerSubject) {
		return examProfileFor(subject.subject)?.boardOptions ?? [];
	}

	function paperPagesFor(subject: LearnerSubject) {
		const profile = examProfileFor(subject.subject);
		const boardPages = profile?.paperPages.filter((page) => page.boardName === subject.board) ?? [];
		if (!scienceSubjects.has(subject.subject)) return boardPages;
		return boardPages.filter(
			(page) => page.course === subject.course && page.tier === subject.tier
		);
	}

	function subjectMeta(subject: LearnerSubject) {
		if (scienceSubjects.has(subject.subject)) {
			return `${subject.board} GCSE · ${subject.course} · ${subject.tier}`;
		}
		return `${subject.board} GCSE · ${paperStructureLabel(subject.subject)}`;
	}

	function scienceRouteHelp(course: LearnerSubject['course']) {
		return course === 'Combined Science'
			? 'Biology, Chemistry and Physics components in one double-award qualification.'
			: 'Separate Biology, Chemistry and Physics GCSE qualifications.';
	}

	function paperStructureLabel(subject: string) {
		if (subject === 'English Language') return 'Language papers';
		if (subject === 'English Literature') return 'Literature papers';
		if (subject === 'History') return 'Paper and option based';
		if (subject === 'Geography') return 'Papers 1, 2 and 3';
		if (subject === 'Computer Science') return 'Papers 1 and 2';
		return 'Subject papers';
	}

	function paperStructureHelp(subject: string) {
		if (englishSubjects.has(subject)) return 'No Foundation/Higher tier for GCSE English.';
		if (subject === 'History') return 'School-taught period and depth options vary by class.';
		if (subject === 'Geography') return 'Physical, human and geographical applications papers.';
		if (subject === 'Computer Science') return 'Programming skills and computing concepts papers.';
		return 'Tier is not used for this AQA practice subject.';
	}

	function paperLinkText(subject: LearnerSubject, pageLabel: string) {
		if (scienceSubjects.has(subject.subject)) return 'Past papers';
		if (subject.subject === 'English Language') return 'Language papers';
		if (subject.subject === 'English Literature') return 'Literature papers';
		return 'Past papers';
	}
</script>

<svelte:head>
	<title>Profile | Question Constellation</title>
	<meta
		name="description"
		content="Choose the GCSE subjects and course details used for personalised practice."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/profile" />
</svelte:head>

<main class="qc-real-app qc-profile-page">
	<AppTopbar
		subject={data.settings.profile.selectedSubject}
		showSubject={false}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-profile-layout">
		<a class="qc-profile-back" href={resolve('/')}>
			<ArrowLeft size={17} aria-hidden="true" strokeWidth={2.2} />
			Home
		</a>

		<section class="qc-profile-hero" aria-labelledby="profile-title">
			<div>
				<p class="qc-real-kicker">Profile</p>
				<h1 id="profile-title">Subjects</h1>
				<p>
					Choose the GCSE exam entries that drive your home screen and paper links. Pick the board,
					route and tier your school uses.
				</p>
			</div>
			<div class="qc-profile-summary" aria-label="Selected subjects">
				<CheckCircle2 size={19} aria-hidden="true" strokeWidth={2.2} />
				<strong>{enabledCount}</strong>
				<span>{enabledCount === 1 ? 'subject selected' : 'subjects selected'}</span>
			</div>
		</section>

		<form
			bind:this={profileForm}
			class="qc-profile-form"
			method="POST"
			action="?/saveProfile"
			onchange={queueAutosave}
			use:enhance={enhanceProfile}
		>
			<input type="hidden" name="subjectCount" value={subjects.length} />

			<div class="qc-profile-subject-list" aria-label="GCSE subjects">
				{#each subjects as subject, index (subject.subject)}
					<section class="qc-profile-subject-row" aria-labelledby={`profile-subject-${index}`}>
						<input type="hidden" name={`subject-${index}`} value={subject.subject} />
						<div class="qc-profile-subject-name">
							<label class="qc-profile-toggle">
								<input
									type="checkbox"
									name={`enabled-${index}`}
									bind:checked={subject.enabled}
									aria-describedby={`profile-subject-meta-${index}`}
								/>
								<span></span>
							</label>
							<div>
								<h2 id={`profile-subject-${index}`}>{subject.subject}</h2>
								<p id={`profile-subject-meta-${index}`}>{subjectMeta(subject)}</p>
							</div>
						</div>

						<label class="qc-profile-field">
							<span>Exam board</span>
							<select name={`board-${index}`} bind:value={subject.board}>
								{#each boardOptionsFor(subject) as board (board.id)}
									<option value={board.name}>{board.name}</option>
								{/each}
							</select>
							{#if englishSubjects.has(subject.subject)}
								<small>Saved separately for Language and Literature.</small>
							{/if}
						</label>

						{#if scienceSubjects.has(subject.subject)}
							<label class="qc-profile-field">
								<span>Science route</span>
								<select name={`course-${index}`} bind:value={subject.course}>
									<option value="Combined Science">Combined Science</option>
									<option value="Separate Science">Separate Science</option>
								</select>
								<small>{scienceRouteHelp(subject.course)}</small>
							</label>

							<label class="qc-profile-field">
								<span>Tier</span>
								<select name={`tier-${index}`} bind:value={subject.tier}>
									<option value="Higher">Higher</option>
									<option value="Foundation">Foundation</option>
								</select>
								<small>Foundation/Higher tier from the school exam entry.</small>
							</label>
						{:else}
							<input type="hidden" name={`course-${index}`} value="GCSE Subject" />
							<input type="hidden" name={`tier-${index}`} value="Higher" />
							<div class="qc-profile-subject-readout qc-profile-paper-structure">
								<span>Paper structure</span>
								<strong>{paperStructureLabel(subject.subject)}</strong>
								<small>{paperStructureHelp(subject.subject)}</small>
							</div>
						{/if}

						<div class="qc-profile-paper-links" aria-label={`${subject.subject} paper pages`}>
							<span>Paper atlas</span>
							{#each paperPagesFor(subject) as page (page.href)}
								<a
									href={resolve('/past-papers/gcse/[board]/[subjectSlug]', {
										board: page.boardId,
										subjectSlug: page.subjectSlug
									})}
								>
									<BookOpen size={15} aria-hidden="true" strokeWidth={2.2} />
									{paperLinkText(subject, page.label)}
								</a>
							{:else}
								<strong>No paper page yet</strong>
							{/each}
						</div>
					</section>
				{/each}
			</div>
			<p class="sr-only" aria-live="polite">{saveLabel}</p>
		</form>
	</div>

	{#if saveToastMessage}
		<div
			class="qc-profile-toast"
			class:error={saveToastTone === 'error'}
			role="status"
			aria-live="polite"
		>
			{saveToastMessage}
		</div>
	{/if}
</main>
