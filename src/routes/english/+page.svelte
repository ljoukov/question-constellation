<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>English Questions | Question Constellation</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="qc-real-app qc-browse-app">
	<section class="qc-browse-feed">
		<a class="qc-browse-start" href={`${resolve('/chains')}?subject=English%20Language`}>
			Open English questions
		</a>
	</section>
</main>
