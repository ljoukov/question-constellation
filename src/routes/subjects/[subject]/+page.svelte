<script lang="ts">
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import SubjectHub from '$lib/learning/SubjectHub.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.subject.subject} Practice | Question Constellation</title>
	<meta
		name="description"
		content={`Your ${data.subject.subject} progress, official curriculum scope, and recommended next practice.`}
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="qc-real-app qc-dashboard-page">
	<AppTopbar user={data.user} showSearch={false} showNavigation />
	<SubjectHub subject={data.subject} />
</main>
