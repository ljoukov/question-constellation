<script lang="ts">
	import EnglishGuidedPractice from '$lib/components/EnglishGuidedPractice.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<EnglishGuidedPractice
	practice={data.englishPractice}
	stepId={data.stepId}
	savedDraft={data.savedDraft}
	userId={data.user?.uid ?? null}
	user={data.user}
/>
