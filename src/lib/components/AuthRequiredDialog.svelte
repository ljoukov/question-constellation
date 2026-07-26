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
	let closeButton = $state<HTMLButtonElement | null>(null);

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
			if (closeButton) closeButton.focus();
			else panel.focus();
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
				<span class="auth-dialog-close">
					<IconButton label="Close sign-in dialog" onclick={onDismiss} bind:element={closeButton}>
						<X size={18} strokeWidth={2.3} aria-hidden="true" />
					</IconButton>
				</span>
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
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		background: color-mix(in srgb, var(--qc-ui-text) 34%, transparent);
		backdrop-filter: blur(6px);
	}

	.auth-dialog {
		position: relative;
		display: grid;
		gap: 0.7rem;
		width: min(100%, 28rem);
		max-height: calc(100dvh - 2rem);
		box-sizing: border-box;
		padding: clamp(1.15rem, 3vw, 1.5rem);
		overflow-y: auto;
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 1.5rem 4rem var(--qc-ui-shadow);
		color: var(--qc-ui-text);
	}

	.auth-dialog:focus,
	.auth-dialog:focus-visible {
		outline: none;
	}

	.auth-dialog-header {
		padding-right: 2.7rem;
	}

	.auth-dialog h2 {
		margin: 0;
		font-family: inherit;
		font-size: clamp(1.45rem, 4vw, 1.9rem);
		font-weight: 720;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.auth-dialog-close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		display: inline-flex;
	}

	.auth-dialog > p {
		margin: 0;
		max-width: 41ch;
		color: var(--qc-ui-text-secondary);
		line-height: 1.5;
	}

	.auth-dialog-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 0.35rem;
	}

	.auth-dialog-actions button {
		display: inline-flex;
		min-height: 3rem;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 680;
		text-align: center;
		white-space: nowrap;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease;
	}

	.auth-dialog-actions button:hover {
		border-color: var(--qc-ui-border-control);
		background: var(--qc-ui-surface-muted);
	}

	.auth-dialog-actions button:focus-visible,
	.auth-dialog-actions :global(.google-sign-in:focus-visible) {
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 2px;
	}

	.auth-dialog-actions :global(.google-sign-in) {
		width: 100%;
		min-width: 0;
		height: auto;
		min-height: 3rem;
		justify-content: center;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 0;
		background: var(--qc-ui-accent-muted);
		box-shadow: none;
		color: var(--qc-ui-accent-text);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 680;
		white-space: nowrap;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease;
	}

	.auth-dialog-actions :global(.google-sign-in:hover) {
		border-color: var(--qc-ui-accent);
		background: color-mix(in srgb, var(--qc-ui-accent) 22%, var(--qc-ui-surface-raised));
		box-shadow: none;
	}

	.auth-dialog-actions :global(.google-sign-in img) {
		box-sizing: border-box;
		padding: 2px;
		background: #fff;
	}

	.auth-dialog-actions :global(.google-sign-in span) {
		padding-right: 0;
	}

	@media (max-width: 480px) {
		.auth-dialog-actions {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.auth-dialog-actions button,
		.auth-dialog-actions :global(.google-sign-in) {
			transition: none;
		}
	}
</style>
