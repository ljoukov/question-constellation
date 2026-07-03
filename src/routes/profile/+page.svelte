<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import { ArrowLeft, CheckCircle2, Save } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
	let saveStatus = $state<SaveStatus>('idle');

	const enabledCount = $derived(data.settings.subjects.filter((subject) => subject.enabled).length);
	const saveLabel = $derived(
		saveStatus === 'saving'
			? 'Saving...'
			: saveStatus === 'saved'
				? 'Saved'
				: saveStatus === 'error'
					? 'Could not save'
				: 'Save profile'
	);
	const scienceSubjects = new Set(['Biology', 'Chemistry', 'Physics']);

	const enhanceProfile: SubmitFunction = () => {
		saveStatus = 'saving';
		return async ({ result, update }) => {
			await update({ reset: false });
			saveStatus =
				result.type === 'success' ? 'saved' : result.type === 'failure' ? 'error' : 'idle';
		};
	};
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
					Choose the subjects you want on your home screen. Science subjects also use course and
					tier for question suggestions.
				</p>
			</div>
			<div class="qc-profile-summary" aria-label="Selected subjects">
				<CheckCircle2 size={19} aria-hidden="true" strokeWidth={2.2} />
				<strong>{enabledCount}</strong>
				<span>{enabledCount === 1 ? 'subject selected' : 'subjects selected'}</span>
			</div>
		</section>

		<form
			class="qc-profile-form"
			method="POST"
			action="?/saveProfile"
			use:enhance={enhanceProfile}
		>
			<input type="hidden" name="subjectCount" value={data.settings.subjects.length} />

			<div class="qc-profile-subject-list" aria-label="GCSE subjects">
				{#each data.settings.subjects as subject, index (subject.subject)}
					<section class="qc-profile-subject-row" aria-labelledby={`profile-subject-${index}`}>
						<input type="hidden" name={`subject-${index}`} value={subject.subject} />
						<div class="qc-profile-subject-name">
							<label class="qc-profile-toggle">
								<input
									type="checkbox"
									name={`enabled-${index}`}
									checked={subject.enabled}
									aria-describedby={`profile-subject-meta-${index}`}
								/>
								<span></span>
							</label>
							<div>
								<h2 id={`profile-subject-${index}`}>{subject.subject}</h2>
								<p id={`profile-subject-meta-${index}`}>{subject.board} GCSE</p>
							</div>
						</div>

						<label>
							<span>Board</span>
							<select name={`board-${index}`} value={subject.board}>
								<option value="AQA">AQA</option>
							</select>
						</label>

						{#if scienceSubjects.has(subject.subject)}
							<label>
								<span>Course</span>
								<select name={`course-${index}`} value={subject.course}>
									<option value="Separate Science">Separate Science</option>
									<option value="Combined Science">Combined Science</option>
								</select>
							</label>

							<label>
								<span>Tier</span>
								<select name={`tier-${index}`} value={subject.tier}>
									<option value="Higher">Higher</option>
									<option value="Foundation">Foundation</option>
								</select>
							</label>
						{:else}
							<input type="hidden" name={`course-${index}`} value="GCSE Subject" />
							<input type="hidden" name={`tier-${index}`} value={subject.tier} />
							<div class="qc-profile-subject-note">
								<span>Course</span>
								<strong>GCSE</strong>
							</div>
							<div class="qc-profile-subject-note">
								<span>Practice</span>
								<strong>Question bank</strong>
							</div>
						{/if}
					</section>
				{/each}
			</div>

			<div class="qc-profile-footer">
				<p data-state={saveStatus}>{saveLabel}</p>
				<button type="submit" class="qc-profile-save" disabled={saveStatus === 'saving'}>
					<Save size={17} aria-hidden="true" strokeWidth={2.2} />
					Save profile
				</button>
			</div>
		</form>
	</div>
</main>
