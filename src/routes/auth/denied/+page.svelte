<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Access Denied | Question Constellation</title>
</svelte:head>

<main class="auth-page">
	<section class="auth-card">
		<h1>Access denied</h1>
		<p>The sign-in response did not include a verified email address.</p>
		<a class="btn blue" href={resolve('/auth/start')}>Use another account</a>
	</section>
</main>
