<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, LogIn } from '@lucide/svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let selectedEmail = $derived(form?.email ?? data.defaultEmail);
</script>

<svelte:head>
	<title>Sign In | Question Constellation</title>
</svelte:head>

<main class="auth-page">
	<section class="auth-card">
		<div class="brand" aria-label="Question Constellation">
			<span class="brand-mark" aria-hidden="true"></span>
			<span class="brand-text"><span>Question</span><span>Constellation</span></span>
		</div>
		<h1>Sign in required</h1>
		<p>Use an authorized Google account to access your learning memory.</p>
		{#if data.devLoginEnabled}
			<form class="auth-form" method="POST">
				<input type="hidden" name="next" value={form?.next ?? data.next} />
				<label for="dev-email">Local dev email</label>
				<input id="dev-email" name="email" type="email" required bind:value={selectedEmail} />
				{#if form?.message}
					<p class="error-text">{form.message}</p>
				{/if}
				<button class="btn primary" type="submit">
					Continue with email
					<ArrowRight size={20} />
				</button>
			</form>
		{/if}
		<a class="btn blue" href={resolve('/auth/start')}>
			<LogIn size={20} />
			Sign in with Google
		</a>
	</section>
</main>
