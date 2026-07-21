<script lang="ts">
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import EnglishLiteratureSubjectHub from '$lib/learning/EnglishLiteratureSubjectHub.svelte';
	import SubjectHub from '$lib/learning/SubjectHub.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.subject.subject} Practice | Question Constellation</title>
	<meta
		name="description"
		content={`Your ${data.subject.subject} progress, selected subject content, and recommended next practice.`}
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if data.literatureHub}
	<EnglishLiteratureSubjectHub hub={data.literatureHub} user={data.user} />
{:else}
	<main class="qc-real-app qc-dashboard-page">
		<AppTopbar user={data.user} showSearch={false} showNavigation />
		<SubjectHub
			subject={data.subject}
			challengeCatalog={data.challengeCatalog}
			challengeProgress={data.challengeProgress}
			challengeUserId={data.user.uid}
		/>
	</main>
{/if}
