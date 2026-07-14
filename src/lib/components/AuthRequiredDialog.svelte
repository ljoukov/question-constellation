<script lang="ts">
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import { X } from '@lucide/svelte';
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

	let backdrop = $state<HTMLElement | null>(null);
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!open || typeof document === 'undefined') return;
		const focusOrigin =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const inerted: Array<{
			element: HTMLElement;
			inert: boolean;
			ariaHidden: string | null;
		}> = [];
		let cancelled = false;

		void tick().then(() => {
			if (cancelled || !open || !panel || !backdrop) return;
			for (const sibling of Array.from(backdrop.parentElement?.children ?? [])) {
				if (!(sibling instanceof HTMLElement) || sibling === backdrop) continue;
				inerted.push({
					element: sibling,
					inert: sibling.inert,
					ariaHidden: sibling.getAttribute('aria-hidden')
				});
				sibling.inert = true;
				sibling.setAttribute('aria-hidden', 'true');
			}
			focusableElements()[0]?.focus() ?? panel.focus();
		});

		return () => {
			cancelled = true;
			for (const snapshot of inerted) {
				snapshot.element.inert = snapshot.inert;
				if (snapshot.ariaHidden === null) snapshot.element.removeAttribute('aria-hidden');
				else snapshot.element.setAttribute('aria-hidden', snapshot.ariaHidden);
			}
			void tick().then(() => {
				if (!open && focusOrigin?.isConnected) focusOrigin.focus();
			});
		};
	});

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			onDismiss();
			return;
		}
		if (event.key !== 'Tab' || !panel) return;
		const focusable = focusableElements();
		if (focusable.length === 0) {
			event.preventDefault();
			panel.focus();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (
			event.shiftKey &&
			(document.activeElement === first || !panel.contains(document.activeElement))
		) {
			event.preventDefault();
			last.focus();
		} else if (
			!event.shiftKey &&
			(document.activeElement === last || !panel.contains(document.activeElement))
		) {
			event.preventDefault();
			first.focus();
		}
	}

	function focusableElements(): HTMLElement[] {
		if (!panel) return [];
		return Array.from(
			panel.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="auth-dialog-backdrop"
		role="presentation"
		bind:this={backdrop}
		onclick={(event) => event.target === event.currentTarget && onDismiss()}
	>
		<div
			class="auth-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="auth-dialog-title"
			aria-describedby="auth-dialog-description"
			tabindex="-1"
			bind:this={panel}
		>
			<header class="auth-dialog-header">
				<h2 id="auth-dialog-title">{title}</h2>
				<IconButton label="Close sign-in dialog" onclick={onDismiss}>
					<X size={19} strokeWidth={2.3} aria-hidden="true" />
				</IconButton>
			</header>
			<p id="auth-dialog-description">
				Your answer stays here. After sign-in, you will return and the check will start.
			</p>
			<div class="auth-dialog-actions">
				<GoogleSignInButton {href} onclick={onSignIn} />
				<button type="button" onclick={onDismiss}>Keep editing</button>
			</div>
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

	.auth-dialog-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: start;
	}

	.auth-dialog h2 {
		margin: 0;
		font-family: inherit;
		font-size: clamp(1.65rem, 5vw, 2.1rem);
		font-weight: 750;
		letter-spacing: -0.025em;
	}

	.auth-dialog > p {
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

</style>
