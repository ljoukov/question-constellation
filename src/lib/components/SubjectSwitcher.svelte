<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronDown } from '@lucide/svelte';
	import { canonicalEnglishSubject, isEnglishSubject } from '$lib/englishSubjects';

	type SubjectNavigationItem = {
		subject: string;
		questionId: string;
		questionCount: number;
	};

	let {
		subjects = [],
		currentSubject = ''
	}: {
		subjects?: SubjectNavigationItem[];
		currentSubject?: string;
	} = $props();

	function subjectHref(item: SubjectNavigationItem) {
		if (!isEnglishSubject(item.subject)) {
			return resolve('/questions/[questionId]', { questionId: item.questionId });
		}

		const course = canonicalEnglishSubject(item.subject);
		return course
			? `${resolve('/english')}?course=${encodeURIComponent(course)}`
			: resolve('/english');
	}
</script>

{#if subjects.length > 0}
	<details class="subject-switcher">
		<summary aria-label="Switch subject">
			<span>Subject</span>
			<strong>{currentSubject || 'Choose'}</strong>
			<ChevronDown size={17} strokeWidth={2.2} />
		</summary>
		<div class="subject-switcher-menu">
			{#each subjects as item (item.subject)}
				<a
					href={subjectHref(item)}
					aria-current={item.subject === currentSubject ? 'page' : undefined}
				>
					<span>{item.subject}</span>
					<small>{item.questionCount} chained</small>
				</a>
			{/each}
		</div>
	</details>
{/if}
