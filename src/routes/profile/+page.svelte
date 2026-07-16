<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { authStartHref } from '$lib/authReturn';
	import { CheckCircle2, ExternalLink, Info } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import {
		markAnonymousLearnerProfileSynced,
		saveAnonymousLearnerProfile,
		type AnonymousLearnerProfile
	} from '$lib/anonymousLearnerProfile';
	import { ocrEnglishLiteratureOptions } from '$lib/englishLiteratureProfile';
	import {
		ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR,
		PROFILE_SUBJECTS_ANCHOR,
		englishLiteratureChoiceAnchor,
		profileSubjectAnchor
	} from '$lib/profileNavigation';
	import {
		classifyRequestFailure,
		ResponseRequestError,
		type RequestFailure
	} from '$lib/requestFailure';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type LearnerSubject = PageProps['data']['settings']['subjects'][number];

	const scienceSubjects = new Set(['Biology', 'Chemistry', 'Physics']);

	let subjects = $state<LearnerSubject[]>(
		untrack(() => data.settings.subjects.map((subject) => normalizeLearnerSubject(subject)))
	);
	let englishLiteratureSelections = $state(
		untrack(() => ({
			modernText: data.settings.englishLiteratureSelections.modernText ?? '',
			nineteenthCenturyNovel:
				data.settings.englishLiteratureSelections.nineteenthCenturyNovel ?? '',
			poetryCluster: data.settings.englishLiteratureSelections.poetryCluster ?? '',
			shakespearePlay: data.settings.englishLiteratureSelections.shakespearePlay ?? ''
		}))
	);
	const ocrPoetryNotices = $derived(
		data.curriculumNotices.filter((notice) => notice.contentArea === 'poetry')
	);
	const officialNoticeSource = (notice: (typeof ocrPoetryNotices)[number]) =>
		notice.evidence.find(
			(evidence) => evidence.sourceType === 'official_board_update' && evidence.sourceUrl
		);

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
	type ToastTone = 'success' | 'error';

	const autosaveDelayMs = 550;
	const autosaveTimeoutMs = 8000;
	const literatureRevealDurationMs =
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;

	let profileForm = $state<HTMLFormElement | null>(null);
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	let saveTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	let activeSaveController: AbortController | null = null;
	let changeRevision = 0;
	let saveStatus = $state<SaveStatus>('idle');
	let saveToastMessage = $state('');
	let saveToastTone = $state<ToastTone>('success');
	let saveFailure = $state<RequestFailure | null>(null);
	let pendingLocalProfile = $state<AnonymousLearnerProfile | null>(null);

	const enabledCount = $derived(subjects.filter((subject) => subject.enabled).length);
	const englishLiteratureSelectionCount = $derived(
		Object.values(englishLiteratureSelections).filter(Boolean).length
	);
	const saveLabel = $derived(
		saveStatus === 'saving'
			? 'Saving profile...'
			: saveStatus === 'saved'
				? data.user
					? 'Profile saved'
					: 'Profile saved on this device'
				: saveStatus === 'error'
					? 'Could not save profile'
					: 'Changes save automatically'
	);

	const enhanceProfile: SubmitFunction = ({ controller, cancel }) => {
		if (!data.user) {
			cancel();
			saveLocalProfile();
			return;
		}
		activeSaveController?.abort();
		activeSaveController = controller;
		saveStatus = 'saving';
		const submittedRevision = changeRevision;
		saveTimeoutTimer = setTimeout(() => {
			if (activeSaveController !== controller) return;
			controller.abort();
			handleAutosaveFailure(
				submittedRevision,
				new DOMException('Profile save timed out.', 'AbortError'),
				true
			);
		}, autosaveTimeoutMs);

		return async ({ result }) => {
			if (activeSaveController !== controller) return;
			if (saveTimeoutTimer) {
				clearTimeout(saveTimeoutTimer);
				saveTimeoutTimer = null;
			}
			if (activeSaveController === controller) activeSaveController = null;

			if (result.type === 'success') {
				if (changeRevision === submittedRevision) {
					saveStatus = 'saved';
					saveFailure = null;
					if (pendingLocalProfile) markAnonymousLearnerProfileSynced(pendingLocalProfile);
					showSaveToast('Profile saved', 'success');
				}
				return;
			}

			const resultError =
				result.type === 'error' && !result.status
					? result.error
					: new ResponseRequestError('Profile save request failed.', {
							status: result.status || 500
						});
			handleAutosaveFailure(submittedRevision, resultError);
		};
	};

	$effect(() => {
		if (!browser) return;
		const handleOffline = () => {
			if (autosaveTimer || activeSaveController || saveStatus === 'saving') {
				handleAutosaveFailure(changeRevision, new TypeError('Browser is offline.'));
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

	function cloneEnglishLiteratureSelections(selections: typeof englishLiteratureSelections) {
		return { ...selections };
	}

	function queueAutosave() {
		changeRevision += 1;
		persistCurrentProfileLocally();
		if (!data.user) {
			saveStatus = 'saving';
			if (autosaveTimer) clearTimeout(autosaveTimer);
			autosaveTimer = setTimeout(() => {
				autosaveTimer = null;
				saveLocalProfile();
			}, autosaveDelayMs);
			return;
		}
		if (browser && !navigator.onLine) {
			handleAutosaveFailure(changeRevision, new TypeError('Browser is offline.'));
			return;
		}
		saveStatus = 'saving';
		if (autosaveTimer) clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => {
			autosaveTimer = null;
			if (browser && !navigator.onLine) {
				handleAutosaveFailure(changeRevision, new TypeError('Browser is offline.'));
				return;
			}
			profileForm?.requestSubmit();
		}, autosaveDelayMs);
	}

	function saveLocalProfile() {
		persistCurrentProfileLocally();
		saveFailure = null;
		saveStatus = 'saved';
		showSaveToast('Profile saved on this device', 'success');
	}

	function persistCurrentProfileLocally() {
		pendingLocalProfile = saveAnonymousLearnerProfile({
			subjects: cloneSubjects(subjects),
			englishLiteratureSelections: {
				board: 'OCR',
				specificationCode: 'J352',
				...cloneEnglishLiteratureSelections(englishLiteratureSelections)
			}
		});
		return pendingLocalProfile;
	}

	function handleAutosaveFailure(revision: number, error: unknown, timedOut = false) {
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		if (saveTimeoutTimer) {
			clearTimeout(saveTimeoutTimer);
			saveTimeoutTimer = null;
		}
		const controller = activeSaveController;
		activeSaveController = null;
		controller?.abort();
		if (changeRevision !== revision) return;
		saveStatus = 'error';
		saveFailure = classifyRequestFailure(error, {
			action: 'save this profile',
			serverLabel: 'Profile sync',
			timedOut
		});
		showSaveToast(`${saveFailure.title}. Changes remain on this device.`, 'error');
	}

	function retryProfileSave() {
		if (!data.user) {
			saveLocalProfile();
			return;
		}
		if (saveFailure?.kind === 'auth') {
			window.location.assign(
				authStartHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)
			);
			return;
		}
		if (browser && !navigator.onLine) {
			handleAutosaveFailure(changeRevision, new TypeError('Browser is offline.'));
			return;
		}
		saveFailure = null;
		saveStatus = 'saving';
		profileForm?.requestSubmit();
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
		return examProfileFor(subject.subject)?.boards ?? [];
	}

	function courseOptionsFor(subject: LearnerSubject) {
		return (
			boardOptionsFor(subject).find(
				(board) => board.name.toLowerCase() === subject.board.toLowerCase()
			)?.courses ?? []
		);
	}

	function tierOptionsFor(subject: LearnerSubject) {
		return courseOptionsFor(subject).find((course) => course.name === subject.course)?.tiers ?? [];
	}

	function normalizeLearnerSubject(subject: LearnerSubject): LearnerSubject {
		const profile = examProfileFor(subject.subject);
		const board =
			profile?.boards.find((option) => option.name.toLowerCase() === subject.board.toLowerCase()) ??
			profile?.boards[0];
		if (!board) return subject;
		const preferredCourse =
			scienceSubjects.has(subject.subject) && subject.course === 'GCSE Subject'
				? 'Combined Science'
				: subject.course;
		const course =
			board.courses.find((option) => option.name === preferredCourse) ?? board.courses[0];
		const tier = course?.tiers.find((option) => option.name === subject.tier) ?? course?.tiers[0];
		if (!course || !tier) return subject;
		return {
			...subject,
			board: board.name,
			course: course.name as LearnerSubject['course'],
			tier: tier.name as LearnerSubject['tier']
		};
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

<main class="qc-real-app qc-profile-page qc-profile-subjects-page">
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

	<div class="qc-profile-layout">
		<IconBackLink href="/" label="Back home" />

		<section class="qc-profile-hero" aria-labelledby="profile-title">
			<div>
				<p class="qc-real-kicker">Profile</p>
				<h1 id="profile-title">Subjects</h1>
				<p>Choose the subjects, exam board, route and tier your school uses.</p>
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

			<div id={PROFILE_SUBJECTS_ANCHOR} class="qc-profile-subject-list" aria-label="GCSE subjects">
				{#each subjects as subject, index (subject.subject)}
					<section
						id={profileSubjectAnchor(subject.subject)}
						class="qc-profile-subject-row"
						class:enabled={subject.enabled}
						aria-labelledby={`profile-subject-title-${index}`}
					>
						<input type="hidden" name={`subject-${index}`} value={subject.subject} />
						<input
							type="hidden"
							name={`currentGrade-${index}`}
							value={subject.currentGrade ?? ''}
						/>
						<input type="hidden" name={`targetGrade-${index}`} value={subject.targetGrade ?? ''} />
						<label class="qc-profile-subject-name">
							<span class="qc-profile-toggle">
								<input
									type="checkbox"
									name={`enabled-${index}`}
									bind:checked={subject.enabled}
									aria-labelledby={`profile-subject-title-${index}`}
								/>
								<span></span>
							</span>
							<div>
								<h2 id={`profile-subject-title-${index}`}>{subject.subject}</h2>
							</div>
						</label>

						{#if subject.enabled}
							<div
								class="qc-profile-subject-settings"
								transition:slide={{ duration: literatureRevealDurationMs }}
							>
								<label class="qc-profile-field">
									<span>Exam board</span>
									<select name={`board-${index}`} bind:value={subject.board}>
										{#each boardOptionsFor(subject) as board (board.id)}
											<option value={board.name}>{board.name}</option>
										{/each}
									</select>
								</label>

								{#if scienceSubjects.has(subject.subject)}
									<label class="qc-profile-field">
										<span>Science route</span>
										<select name={`course-${index}`} bind:value={subject.course}>
											{#each courseOptionsFor(subject) as course (course.name)}
												<option value={course.name}>{course.name}</option>
											{/each}
										</select>
									</label>

									<label class="qc-profile-field">
										<span>Tier</span>
										<select name={`tier-${index}`} bind:value={subject.tier}>
											{#each tierOptionsFor(subject) as tier (tier.name)}
												<option value={tier.name}>{tier.name}</option>
											{/each}
											{#if !tierOptionsFor(subject).some((tier) => tier.name === 'Foundation')}
												<option value="Foundation" disabled>Foundation — not available yet</option>
											{/if}
										</select>
									</label>
								{:else}
									<input type="hidden" name={`course-${index}`} value="GCSE Subject" />
									<input type="hidden" name={`tier-${index}`} value="Higher" />
								{/if}

								{#if subject.subject === 'English Literature' && subject.board === 'OCR'}
									<section
										id={ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR}
										class="qc-dashboard-panel primary wide"
										aria-labelledby="ocr-literature-title"
										transition:slide={{ duration: literatureRevealDurationMs }}
									>
										<header class="qc-dashboard-panel-head">
											<div>
												<p class="qc-panel-label">OCR J352</p>
												<h2 id="ocr-literature-title">Course texts</h2>
											</div>
											<span class="qc-subject-confidence">
												<strong>{englishLiteratureSelectionCount}</strong>/4 selected
											</span>
										</header>
										<p class="qc-dashboard-panel-intro">
											Choose the four options taught by your class.
										</p>

										<div class="qc-profile-form">
											<section class="qc-dashboard-preferences" aria-labelledby="ocr-paper-1-title">
												<div class="qc-dashboard-preferences-head">
													<strong id="ocr-paper-1-title">Paper 1</strong>
													<span>Modern and literary heritage texts</span>
												</div>

												<label
													id={englishLiteratureChoiceAnchor('modern')}
													class="qc-profile-field"
												>
													<span>Modern prose or drama</span>
													<select
														name="ocrEnglishLiteratureModernText"
														bind:value={englishLiteratureSelections.modernText}
													>
														<option value="">Select your class text</option>
														{#each ocrEnglishLiteratureOptions.modernTexts as text (text)}
															<option value={text}>{text}</option>
														{/each}
													</select>
												</label>

												<label id={englishLiteratureChoiceAnchor('novel')} class="qc-profile-field">
													<span>19th-century novel</span>
													<select
														name="ocrEnglishLiteratureNineteenthCenturyNovel"
														bind:value={englishLiteratureSelections.nineteenthCenturyNovel}
													>
														<option value="">Select your class novel</option>
														{#each ocrEnglishLiteratureOptions.nineteenthCenturyNovels as novel (novel)}
															<option value={novel}>{novel}</option>
														{/each}
													</select>
												</label>
											</section>

											<section class="qc-dashboard-preferences" aria-labelledby="ocr-paper-2-title">
												<div class="qc-dashboard-preferences-head">
													<strong id="ocr-paper-2-title">Paper 2</strong>
													<span>Poetry and Shakespeare</span>
												</div>

												<label
													id={englishLiteratureChoiceAnchor('poetry')}
													class="qc-profile-field"
												>
													<span>Poetry cluster</span>
													<select
														name="ocrEnglishLiteraturePoetryCluster"
														bind:value={englishLiteratureSelections.poetryCluster}
													>
														<option value="">Select your class cluster</option>
														{#each ocrEnglishLiteratureOptions.poetryClusters as cluster (cluster)}
															<option value={cluster}>{cluster}</option>
														{/each}
													</select>
													<small>All 15 poems in the selected cluster.</small>
												</label>

												<label
													id={englishLiteratureChoiceAnchor('shakespeare')}
													class="qc-profile-field"
												>
													<span>Shakespeare play</span>
													<select
														name="ocrEnglishLiteratureShakespearePlay"
														bind:value={englishLiteratureSelections.shakespearePlay}
													>
														<option value="">Select your class play</option>
														{#each ocrEnglishLiteratureOptions.shakespearePlays as play (play)}
															<option value={play}>{play}</option>
														{/each}
													</select>
												</label>

												{#each ocrPoetryNotices as notice (notice.id)}
													{@const source = officialNoticeSource(notice)}
													<details class="qc-inline-disclosure qc-dashboard-preferences-note">
														<summary>
															<Info size={15} strokeWidth={2.2} aria-hidden="true" />
															{notice.title}
														</summary>
														<p>
															{notice.body}
															{#if source?.sourceUrl}
																{' '}
																<a
																	class="qc-real-quiet-link"
																	href={source.sourceUrl}
																	target="_blank"
																	rel="noreferrer"
																>
																	{source.label ?? 'Official source'}
																	<ExternalLink size={11} strokeWidth={2.2} aria-hidden="true" />
																</a>
															{/if}
														</p>
													</details>
												{/each}
											</section>
										</div>
									</section>
								{/if}
							</div>
						{:else}
							<input type="hidden" name={`board-${index}`} value={subject.board} />
							<input type="hidden" name={`course-${index}`} value={subject.course} />
							<input type="hidden" name={`tier-${index}`} value={subject.tier} />
							{#if subject.subject === 'English Literature' && subject.board === 'OCR'}
								<input
									type="hidden"
									name="ocrEnglishLiteratureModernText"
									value={englishLiteratureSelections.modernText}
								/>
								<input
									type="hidden"
									name="ocrEnglishLiteratureNineteenthCenturyNovel"
									value={englishLiteratureSelections.nineteenthCenturyNovel}
								/>
								<input
									type="hidden"
									name="ocrEnglishLiteraturePoetryCluster"
									value={englishLiteratureSelections.poetryCluster}
								/>
								<input
									type="hidden"
									name="ocrEnglishLiteratureShakespearePlay"
									value={englishLiteratureSelections.shakespearePlay}
								/>
							{/if}
						{/if}
					</section>
				{/each}
			</div>
			{#if saveFailure}
				<div class="qc-profile-save-failure">
					<RequestFailureNotice
						failure={saveFailure}
						onRetry={retryProfileSave}
						retrying={saveStatus === 'saving'}
						retryLabel={saveFailure.kind === 'auth' ? 'Sign in again' : 'Retry save'}
					/>
				</div>
			{/if}
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
