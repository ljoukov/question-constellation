<script lang="ts">
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import { tick } from 'svelte';

	let {
		open,
		href,
		onDismiss,
		onSignIn,
		title = 'Sign in to check your answer'
	}: {
		open: boolean;
		href: string;
		onDismiss: () => void;
		onSignIn?: (event: MouseEvent) => void;
		title?: string;
	} = $props();

	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!open) return;
		void tick().then(() => panel?.focus());
	});

	function handleKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') onDismiss();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="auth-dialog-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && onDismiss()}
	>
		<div
			class="auth-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-dialog-title"
			tabindex="-1"
			bind:this={panel}
		>
			<p class="auth-dialog-kicker">Your work is safe</p>
			<h2 id="auth-dialog-title">{title}</h2>
			<p>
				Your answer stays on this device. Sign in only when you are ready for the coach to check it;
				we will bring you back here and start the check automatically.
			</p>
			<div class="auth-dialog-actions">
				<GoogleSignInButton {href} onclick={onSignIn} />
				<button type="button" onclick={onDismiss}>Keep editing</button>
			</div>
			<small
				>Browsing, choosing your course and writing answers remain available without an account.</small
			>
		</div>
	</div>
{/if}

<style>
	.auth-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: color-mix(in srgb, var(--qc-ui-canvas) 38%, rgb(2 6 23 / 0.72));
		backdrop-filter: blur(8px);
	}

	.auth-dialog {
		display: grid;
		gap: 0.8rem;
		width: min(100%, 30rem);
		padding: clamp(1.25rem, 4vw, 2rem);
		border: 1px solid var(--qc-ui-border);
		border-radius: 1rem;
		background: var(--qc-ui-surface);
		box-shadow: 0 24px 80px rgb(2 6 23 / 0.28);
		color: var(--qc-ui-text);
	}

	.auth-dialog-kicker {
		margin: 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.auth-dialog h2 {
		margin: 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(1.65rem, 5vw, 2.1rem);
		font-weight: 500;
		letter-spacing: -0.035em;
	}

	.auth-dialog > p:not(.auth-dialog-kicker),
	.auth-dialog small {
		margin: 0;
		color: var(--qc-ui-text-muted);
		line-height: 1.55;
	}

	.auth-dialog-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.35rem;
	}

	.auth-dialog-actions button {
		min-height: 40px;
		padding: 0.55rem 0.8rem;
		border: 0;
		background: transparent;
		color: var(--qc-ui-text-muted);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.auth-dialog-actions button:hover {
		color: var(--qc-ui-text);
	}

	.auth-dialog small {
		font-size: 0.78rem;
	}
</style>
