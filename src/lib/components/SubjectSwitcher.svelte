<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronDown } from '@lucide/svelte';

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
					href={resolve('/questions/[questionId]', { questionId: item.questionId })}
					aria-current={item.subject === currentSubject ? 'page' : undefined}
				>
					<span>{item.subject}</span>
					<small>{item.questionCount} chained</small>
				</a>
			{/each}
		</div>
	</details>
{/if}
