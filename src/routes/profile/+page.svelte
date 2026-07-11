<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, Info } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import { ocrEnglishLiteratureOptions } from '$lib/englishLiteratureProfile';
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
	let lastSavedSubjects = untrack(() => cloneSubjects(subjects));
	let lastSavedEnglishLiteratureSelections = untrack(() =>
		cloneEnglishLiteratureSelections(englishLiteratureSelections)
	);
	let saveStatus = $state<SaveStatus>('idle');
	let saveToastMessage = $state('');
	let saveToastTone = $state<ToastTone>('success');

	const enabledCount = $derived(subjects.filter((subject) => subject.enabled).length);
	const englishLiteratureSelectionCount = $derived(
		Object.values(englishLiteratureSelections).filter(Boolean).length
	);
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
		const submittedEnglishLiteratureSelections = cloneEnglishLiteratureSelections(
			englishLiteratureSelections
		);
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
				lastSavedEnglishLiteratureSelections = submittedEnglishLiteratureSelections;
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

	function cloneEnglishLiteratureSelections(selections: typeof englishLiteratureSelections) {
		return { ...selections };
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
			englishLiteratureSelections = cloneEnglishLiteratureSelections(
				lastSavedEnglishLiteratureSelections
			);
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

	function paperLinkText(subject: LearnerSubject) {
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
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

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
							{#if subject.subject !== 'English Literature'}
								<div class="qc-profile-subject-readout qc-profile-paper-structure">
									<span>Paper structure</span>
									<strong>{paperStructureLabel(subject.subject)}</strong>
									<small>{paperStructureHelp(subject.subject)}</small>
								</div>
							{/if}
						{/if}

						{#if subject.subject === 'English Literature' && subject.board === 'OCR'}
							{#if !subject.enabled}
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

							{#if subject.enabled}
								<section
									class="ocr-literature-profile"
									aria-labelledby="ocr-literature-title"
									transition:slide={{ duration: literatureRevealDurationMs }}
								>
									<div class="ocr-literature-profile__heading">
										<div>
											<span class="ocr-literature-profile__eyebrow">OCR J352</span>
											<h3 id="ocr-literature-title">What is your school teaching?</h3>
											<p>
												Choose the four options taught by your class. These are normally fixed for
												your GCSE course, not chosen again on exam day.
											</p>
										</div>
										<span class="ocr-literature-profile__progress">
											<strong>{englishLiteratureSelectionCount}</strong>/4 selected
										</span>
									</div>

									<div class="ocr-literature-profile__papers">
										<section aria-labelledby="ocr-paper-1-title">
											<header>
												<span>01</span>
												<div>
													<h3 id="ocr-paper-1-title">Paper 1</h3>
													<p>Modern and literary heritage texts</p>
												</div>
											</header>

											<label>
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

											<label>
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

										<section aria-labelledby="ocr-paper-2-title">
											<header>
												<span>02</span>
												<div>
													<h3 id="ocr-paper-2-title">Paper 2</h3>
													<p>Poetry and Shakespeare</p>
												</div>
											</header>

											<label>
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
												{#each ocrPoetryNotices as notice (notice.id)}
													{@const source = officialNoticeSource(notice)}
													<span class="ocr-literature-profile__curriculum-note" role="note">
														<span
															class="ocr-literature-profile__curriculum-note-icon"
															aria-hidden="true"
														>
															<Info size={15} strokeWidth={2.2} />
														</span>
														<span>
															<strong>{notice.title}</strong>
															{notice.body}
															{#if source?.sourceUrl}
																<a
																	class="ocr-literature-profile__curriculum-source"
																	href={source.sourceUrl}
																	target="_blank"
																	rel="noreferrer"
																>
																	{source.label ?? 'Official source'}
																	<ExternalLink size={11} strokeWidth={2.2} aria-hidden="true" />
																</a>
															{/if}
														</span>
													</span>
												{/each}
											</label>

											<label>
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
										</section>
									</div>
								</section>
							{/if}
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
									{paperLinkText(subject)}
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

<style>
	.ocr-literature-profile {
		grid-column: 1 / -1;
		min-width: 0;
		margin: 0.2rem 0 0;
		padding: 1rem;
		border: 1px solid color-mix(in srgb, #168458 28%, transparent);
		background:
			linear-gradient(105deg, color-mix(in srgb, #e9f7ef 86%, transparent), transparent 58%),
			rgba(248, 252, 250, 0.72);
	}

	.ocr-literature-profile__heading {
		display: flex;
		gap: 1rem;
		align-items: start;
		justify-content: space-between;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid rgba(22, 132, 88, 0.16);
	}

	.ocr-literature-profile__eyebrow {
		display: block;
		margin-bottom: 0.25rem;
		color: #168458;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.ocr-literature-profile__heading h3 {
		margin: 0;
		padding: 0;
		color: #102033;
		font-size: 1.06rem;
		font-weight: 780;
		line-height: 1.2;
	}

	.ocr-literature-profile__heading h3 + p {
		max-width: 44rem;
		margin: 0.35rem 0 0;
		color: #526778;
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.ocr-literature-profile__progress {
		flex: 0 0 auto;
		padding: 0.42rem 0.6rem;
		border: 1px solid rgba(22, 132, 88, 0.2);
		background: rgba(255, 255, 255, 0.76);
		color: #526778;
		font-size: 0.75rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.ocr-literature-profile__progress strong {
		color: #126647;
	}

	.ocr-literature-profile__papers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
		margin-top: 0.8rem;
	}

	.ocr-literature-profile__papers > section {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		min-width: 0;
		padding: 0.85rem;
		border: 1px solid rgba(105, 129, 143, 0.18);
		background: rgba(255, 255, 255, 0.72);
	}

	.ocr-literature-profile__papers header {
		grid-column: 1 / -1;
		display: flex;
		gap: 0.65rem;
		align-items: center;
	}

	.ocr-literature-profile__papers header > span {
		display: grid;
		width: 2.25rem;
		height: 2.25rem;
		place-items: center;
		border: 1px solid rgba(22, 132, 88, 0.24);
		background: #e7f6ed;
		color: #126647;
		font-size: 0.78rem;
		font-weight: 850;
	}

	.ocr-literature-profile__papers h3,
	.ocr-literature-profile__papers p {
		margin: 0;
	}

	.ocr-literature-profile__papers h3 {
		color: #102033;
		font-size: 0.92rem;
		font-weight: 780;
	}

	.ocr-literature-profile__papers p {
		margin-top: 0.08rem;
		color: #66788b;
		font-size: 0.73rem;
	}

	.ocr-literature-profile__papers label {
		display: grid;
		align-content: start;
		gap: 0.3rem;
		min-width: 0;
		color: #405465;
		font-size: 0.76rem;
		font-weight: 700;
	}

	.ocr-literature-profile__papers small {
		color: #66788b;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.ocr-literature-profile__curriculum-note {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.42rem;
		align-items: start;
		margin-top: 0.2rem;
		padding-top: 0.55rem;
		border-top: 1px solid rgba(22, 132, 88, 0.16);
		color: #526778;
		font-size: 0.7rem;
		font-weight: 560;
		line-height: 1.4;
	}

	.ocr-literature-profile__curriculum-note-icon {
		display: flex;
		margin-top: 0.08rem;
		color: #168458;
	}

	.ocr-literature-profile__curriculum-note strong {
		display: block;
		margin-bottom: 0.1rem;
		color: #294557;
		font-weight: 760;
	}

	.ocr-literature-profile__curriculum-source {
		display: inline-flex;
		gap: 0.2rem;
		align-items: center;
		margin-top: 0.24rem;
		color: #0f704a;
		font-weight: 700;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.14rem;
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile {
		border-color: rgba(86, 216, 148, 0.28);
		background:
			linear-gradient(105deg, rgba(14, 83, 63, 0.24), transparent 58%), rgba(7, 20, 31, 0.78);
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__heading {
		border-bottom-color: rgba(86, 216, 148, 0.18);
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__heading h3,
	:global(:root[data-theme='dark']) .ocr-literature-profile__papers h3 {
		color: #eff6ff;
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__heading h3 + p,
	:global(:root[data-theme='dark']) .ocr-literature-profile__papers p,
	:global(:root[data-theme='dark']) .ocr-literature-profile__papers label,
	:global(:root[data-theme='dark']) .ocr-literature-profile__papers small,
	:global(:root[data-theme='dark']) .ocr-literature-profile__curriculum-note {
		color: #9fb2c7;
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__curriculum-note {
		border-top-color: rgba(86, 216, 148, 0.16);
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__curriculum-note strong {
		color: #d9e7f3;
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__curriculum-source {
		color: #78dbaa;
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__progress,
	:global(:root[data-theme='dark']) .ocr-literature-profile__papers > section {
		border-color: rgba(148, 163, 184, 0.2);
		background: rgba(7, 20, 31, 0.72);
	}

	:global(:root[data-theme='dark']) .ocr-literature-profile__papers header > span {
		border-color: rgba(86, 216, 148, 0.28);
		background: rgba(14, 83, 63, 0.42);
		color: #b8f7d5;
	}

	@media (max-width: 900px) {
		.ocr-literature-profile__papers,
		.ocr-literature-profile__papers > section {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 700px) {
		.ocr-literature-profile {
			grid-column: auto;
			padding: 0.8rem;
		}

		.ocr-literature-profile__heading {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
