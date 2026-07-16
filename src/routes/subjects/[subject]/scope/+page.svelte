<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import ControlSection from '$lib/components/ui/ControlSection.svelte';
	import { AlertTriangle, ExternalLink } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const curriculumGroups = $derived(data.curriculum.groups);
	const scopeNoun = $derived(data.subject.scope.unitPlural);
	const choosesCourseOptions = $derived(
		curriculumGroups.some((group) => group.kind === 'option_group')
	);
	const validTopicIds = $derived(new Set(data.curriculum.topics.map((topic) => topic.id)));
	const requiredOptionCount = $derived(
		curriculumGroups.reduce((total, group) => total + (group.selectionMin ?? 0), 0)
	);

	const savedMode = untrack<'all' | 'selected'>(() =>
		choosesCourseOptions ? 'selected' : data.subject.scope.status === 'all' ? 'all' : 'selected'
	);
	const savedIds = untrack(() =>
		data.subject.scope.includedTopicIds.filter((id) => validTopicIds.has(id))
	);
	const initialMode = untrack(() => {
		const failedMode = form && 'mode' in form && typeof form.mode === 'string' ? form.mode : null;
		return choosesCourseOptions ? 'selected' : (failedMode ?? savedMode);
	});
	const initialIds = untrack(() => {
		const failedTopicIds =
			form && 'selectedTopicIds' in form && Array.isArray(form.selectedTopicIds)
				? form.selectedTopicIds.map(String)
				: null;
		return (failedTopicIds ?? savedIds).filter((id) => validTopicIds.has(id));
	});
	let scopeMode = $state<'all' | 'selected'>(initialMode === 'all' ? 'all' : 'selected');
	let selectedIds = $state<string[]>([...initialIds]);
	const remainingRequiredOptionCount = $derived(
		curriculumGroups.reduce((total, group) => {
			const selectedCount = group.components.filter((component) =>
				selectedIds.includes(component.id)
			).length;
			return total + Math.max(0, (group.selectionMin ?? 0) - selectedCount);
		}, 0)
	);

	const specificationLabel = $derived(data.curriculum.label);
	const backHref = $derived(
		data.subject.scope.status === 'not_set' ? resolve('/') : data.subject.href
	);
	const backLabel = $derived(
		data.subject.scope.status === 'not_set' ? 'Back home' : `Back to ${data.subject.subject}`
	);
	const selectionChanged = $derived(
		scopeMode !== savedMode ||
			selectedIds.length !== savedIds.length ||
			selectedIds.some((id) => !savedIds.includes(id))
	);
	const selectionComplete = $derived(
		scopeMode === 'all'
			? !choosesCourseOptions
			: selectedIds.length > 0 &&
					selectedIds.every((id) => validTopicIds.has(id)) &&
					curriculumGroups.every((group) => {
						const selectedCount = group.components.filter((component) =>
							selectedIds.includes(component.id)
						).length;
						return (
							selectedCount >= (group.selectionMin ?? 0) &&
							(group.selectionMax == null || selectedCount <= group.selectionMax)
						);
					})
	);

	function groupLabel(group: (typeof curriculumGroups)[number]) {
		if (!choosesCourseOptions && curriculumGroups.length === 1) {
			return `Select covered ${scopeNoun}`;
		}
		return group.title;
	}

	function groupHasSelection(group: (typeof curriculumGroups)[number]) {
		return group.components.some((topic) => selectedIds.includes(topic.id));
	}

	function showGroupAction(group: (typeof curriculumGroups)[number]) {
		if (group.selectionMax === 1) {
			return !groupHasSelection(group) || (group.selectionMin ?? 0) === 0;
		}
		if (group.selectionMax == null) return curriculumGroups.length > 1;
		return true;
	}

	function toggleGroup(groupId: string) {
		const ids =
			curriculumGroups.find((group) => group.id === groupId)?.components.map((item) => item.id) ??
			[];
		const allSelected = ids.every((id) => selectedIds.includes(id));
		selectedIds = allSelected
			? selectedIds.filter((id) => !ids.includes(id))
			: [...new Set([...selectedIds, ...ids])];
		scopeMode = 'selected';
	}

	function clearGroup(groupId: string) {
		const ids = new Set(
			curriculumGroups.find((group) => group.id === groupId)?.components.map((item) => item.id) ??
				[]
		);
		selectedIds = selectedIds.filter((id) => !ids.has(id));
		scopeMode = 'selected';
	}

	function toggleTopic(groupId: string, topicId: string, checked: boolean) {
		const group = curriculumGroups.find((entry) => entry.id === groupId);
		if (checked && group?.selectionMax === 1) {
			const siblingIds = new Set(group.components.map((component) => component.id));
			selectedIds = [...selectedIds.filter((id) => !siblingIds.has(id)), topicId];
		} else if (checked) {
			selectedIds = [...new Set([...selectedIds, topicId])];
		} else {
			selectedIds = selectedIds.filter((id) => id !== topicId);
		}
		scopeMode = 'selected';
	}
</script>

<svelte:head>
	<title>{data.subject.subject} Scope | Question Constellation</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="qc-real-app qc-profile-page">
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

	<div class="qc-learning-layout">
		<aside class="qc-learning-sidebar">
			<IconBackLink href={backHref} label={backLabel} />

			<header class="qc-learning-heading" aria-labelledby="scope-title">
				<p class="qc-real-kicker">{specificationLabel}</p>
				<h1 id="scope-title">
					{choosesCourseOptions ? 'Course options' : 'Course coverage'}
				</h1>
				<p>
					{choosesCourseOptions
						? 'Choose what your school teaches. Practice will stay within those choices.'
						: `Include only the ${scopeNoun} your class has covered. Untaught material stays out of practice and progress.`}
				</p>
			</header>
		</aside>

		<form class="qc-learning-main qc-profile-form" method="POST">
			{#each selectedIds as selectedId (selectedId)}
				<input type="hidden" name="topicId" value={selectedId} />
			{/each}

			<div class="qc-dashboard-panel wide">
				{#if choosesCourseOptions}
					<input type="hidden" name="scopeMode" value="selected" />
				{:else}
					<ControlSection label="Practice range">
						<ul class="qc-checklist" role="radiogroup" aria-label="Curriculum scope mode">
							<li class="qc-scope-option-row">
								<label class="qc-scope-option">
									<input type="radio" name="scopeMode" value="all" bind:group={scopeMode} />
									<div>
										<strong>Whole course</strong>
										<p>Use the full official specification.</p>
									</div>
								</label>
							</li>

							<li class="qc-scope-option-row">
								<label class="qc-scope-option">
									<input type="radio" name="scopeMode" value="selected" bind:group={scopeMode} />
									<div>
										<strong>Specific {scopeNoun}</strong>
										<p>Use only the {scopeNoun} your class has covered.</p>
									</div>
								</label>
							</li>
						</ul>
					</ControlSection>
				{/if}

				{#if selectionChanged || !selectionComplete}
					<footer class="qc-profile-footer qc-scope-save-bar">
						<p>
							{choosesCourseOptions
								? `${selectedIds.length} of ${requiredOptionCount} required ${scopeNoun} selected`
								: scopeMode === 'all'
									? `Whole course included`
									: `${selectedIds.length} ${selectedIds.length === 1 ? scopeNoun.replace(/s$/, '') : scopeNoun} included`}
						</p>
						<button type="submit" class="qc-profile-save" disabled={!selectionComplete}>
							{!selectionComplete
								? choosesCourseOptions
									? remainingRequiredOptionCount > 0
										? `Choose ${remainingRequiredOptionCount} more`
										: 'Review your selections'
									: `Choose at least one ${scopeNoun.replace(/s$/, '')}`
								: choosesCourseOptions
									? 'Save course options'
									: 'Save coverage'}
						</button>
					</footer>
				{/if}

				{#if scopeMode === 'selected'}
					{#each curriculumGroups as group (group.id)}
						<ControlSection label={groupLabel(group)}>
							{#if showGroupAction(group)}
								<div class="qc-action-row">
									{#if group.selectionMax === 1}
										{#if groupHasSelection(group)}
											<button
												type="button"
												class="qc-action-button compact"
												aria-label={`Clear the selected option for ${group.title}`}
												onclick={() => clearGroup(group.id)}
											>
												Clear selection
											</button>
										{:else}
											<p>{group.selectionMin === 1 ? 'Choose one.' : 'Choose up to one.'}</p>
										{/if}
									{:else if group.selectionMax == null}
										<button
											type="button"
											class="qc-action-button compact"
											aria-label={`${group.components.every((topic) => selectedIds.includes(topic.id)) ? 'Clear' : 'Select'} all in ${group.title}`}
											onclick={() => toggleGroup(group.id)}
										>
											{group.components.every((topic) => selectedIds.includes(topic.id))
												? 'Clear all'
												: 'Select all'}
										</button>
									{:else}
										<p>
											{group.selectionMin === group.selectionMax
												? `Choose ${group.selectionMax}.`
												: group.selectionMin
													? `Choose ${group.selectionMin}–${group.selectionMax}.`
													: `Choose up to ${group.selectionMax}.`}
										</p>
									{/if}
								</div>
							{/if}

							<ul class="qc-checklist">
								{#each group.components as topic (topic.id)}
									<li class="qc-scope-option-row">
										<label class="qc-scope-option" for={`scope-topic-${topic.id}`}>
											<input
												id={`scope-topic-${topic.id}`}
												type={group.selectionMax === 1 ? 'radio' : 'checkbox'}
												name={`visible-${group.id}`}
												checked={selectedIds.includes(topic.id)}
												onchange={(event) =>
													toggleTopic(group.id, topic.id, event.currentTarget.checked)}
											/>
											<div>
												<strong>{topic.title}</strong>
											</div>
										</label>
									</li>
								{/each}
							</ul>
						</ControlSection>
					{/each}
				{/if}
			</div>

			{#if form?.message}
				<div class="qc-warning-panel" role="alert">
					<AlertTriangle size={19} aria-hidden="true" />
					<div>
						<p class="qc-panel-label">Could not save this scope</p>
						<p>{form.message}</p>
					</div>
				</div>
			{/if}
		</form>

		<nav class="qc-subject-actions qc-learning-resources" aria-label="Curriculum source">
			<a
				class="qc-action-button compact"
				href={data.curriculum.specificationUrl}
				target="_blank"
				rel="noreferrer"
			>
				View the official {data.curriculum.board} specification
				<ExternalLink size={14} aria-hidden="true" />
			</a>
		</nav>
	</div>
</main>
