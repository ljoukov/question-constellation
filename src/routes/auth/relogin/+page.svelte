<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import { authStartHref } from '$lib/authReturn';
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
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
		<p>Sign in to sync your learning and use answer checking.</p>
		{#if data.authFailure}
			<RequestFailureNotice failure={data.authFailure} compact />
		{/if}
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
		<GoogleSignInButton
			href={authStartHref(data.next)}
			label={data.authFailure ? 'Try Google again' : 'Sign in with Google'}
		/>
	</section>
</main>
