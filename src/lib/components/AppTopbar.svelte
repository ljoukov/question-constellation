<script lang="ts">
	/* eslint-disable svelte/no-unused-props -- Keep the legacy topbar prop contract for existing callers while this compact header intentionally omits search and subject controls. */
	import { resolve } from '$app/paths';
	import { page as pageState } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import { authStartHref } from '$lib/authReturn';
	import { Check, ChevronRight } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { primaryNavigationLinks, type AppTopbarLink } from '$lib/navigation';
	import {
		classifyRequestFailure,
		requestErrorFromResponse,
		type RequestFailure
	} from '$lib/requestFailure';
	import { setThemePreference, themePreference, type ThemePreference } from '$lib/themePreference';
	import {
		setVisualEffectsPreference,
		visualEffectsPreference
	} from '$lib/visualEffectsPreference';
	import type { AdminUser } from '$lib/server/auth/session';

	type AppTopbarAction = {
		href: string;
		label: string;
		ariaLabel?: string;
	};

	type MobileTopbarLink = {
		href: string;
		label: string;
		ariaLabel?: string;
		variant: 'primary' | 'secondary';
	};

	let {
		showNavigation = false,
		showPrimaryAction = true,
		navLinks = primaryNavigationLinks,
		primaryAction,
		sticky = true,
		user: currentUserOverride = undefined
	}: {
		subject?: string;
		subjects?: string[];
		searchValue?: string;
		searchPlaceholder?: string;
		showSearch?: boolean;
		showSubject?: boolean;
		showNavigation?: boolean;
		showPrimaryAction?: boolean;
		navLinks?: AppTopbarLink[];
		primaryAction?: AppTopbarAction;
		sticky?: boolean;
		onSearchChange?: (value: string) => void;
		onSearchSubmit?: (value: string) => void;
		onSubjectChange?: (value: string) => void;
		user?: AdminUser | null;
	} = $props();

	let theme = $state<ThemePreference>('auto');
	let accountMenuOpen = $state(false);
	let appearanceMenuOpen = $state(false);
	let appearancePinnedByClick = $state(false);
	let confirmedTheme = $state<ThemePreference>('auto');
	let accountToastMessage = $state('');
	let accountToastTone = $state<'success' | 'error'>('success');
	let themeFailure = $state<RequestFailure | null>(null);
	let pendingTheme = $state<ThemePreference | null>(null);
	let visualEffectsEnabled = $state(true);
	let confirmedVisualEffectsEnabled = $state(true);
	let pendingVisualEffectsEnabled = $state<boolean | null>(null);
	let visualEffectsFailure = $state<RequestFailure | null>(null);
	let accountMenuRoot = $state<HTMLDivElement | null>(null);
	let themeSaveController = $state<AbortController | null>(null);
	let visualEffectsSaveController = $state<AbortController | null>(null);
	let appearanceCloseTimer: ReturnType<typeof setTimeout> | null = null;
	let accountToastTimer: ReturnType<typeof setTimeout> | null = null;
	const unsubscribe = themePreference.subscribe((value) => {
		theme = value;
		if (!themeSaveController) confirmedTheme = value;
	});
	const unsubscribeVisualEffects = visualEffectsPreference.subscribe((value) => {
		visualEffectsEnabled = value;
		if (!visualEffectsSaveController) confirmedVisualEffectsEnabled = value;
	});
	onDestroy(() => {
		unsubscribe();
		unsubscribeVisualEffects();
		themeSaveController?.abort();
		visualEffectsSaveController?.abort();
		clearAppearanceCloseTimer();
		clearAccountToastTimer();
	});

	const themeOptions: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;
	const currentUser = $derived(
		currentUserOverride === undefined
			? ((pageState.data.user ?? null) as AdminUser | null)
			: currentUserOverride
	);
	const accountName = $derived(currentUser?.name?.trim() || currentUser?.email || 'Account');
	const avatarSrc = $derived(currentUser?.photoUrl ?? '/brand/avatar-bottts.svg');
	const defaultSignInAction = $derived<AppTopbarAction>({
		href: authStartHref(`${pageState.url.pathname}${pageState.url.search}${pageState.url.hash}`),
		label: 'Sign up for free'
	});
	const effectiveShowNavigation = $derived(showNavigation);
	const effectivePrimaryAction = $derived(
		showPrimaryAction
			? (primaryAction ?? (!currentUser ? defaultSignInAction : undefined))
			: undefined
	);
	const visibleNavLinks = $derived.by(() => {
		if (!effectiveShowNavigation || currentUser) return [];
		return navLinks;
	});
	const mobileTopbarLinks = $derived.by((): MobileTopbarLink[] => {
		const links: MobileTopbarLink[] = [];
		links.push(
			...visibleNavLinks
				.filter((link) => link.mobilePriority)
				.map((link) => ({
					href: link.href,
					label: link.mobileLabel ?? link.label,
					variant: 'secondary' as const
				}))
		);
		if (effectivePrimaryAction) {
			links.push({
				href: effectivePrimaryAction.href,
				label: effectivePrimaryAction.label,
				ariaLabel: effectivePrimaryAction.ariaLabel,
				variant: 'primary'
			});
		}
		return links;
	});
	const topbarClass = $derived(
		[
			'qc-topbar',
			currentUser ? 'is-signed-in' : '',
			visibleNavLinks.length > 0 ? 'has-navigation' : '',
			effectivePrimaryAction ? 'has-primary-action' : '',
			sticky ? 'is-sticky' : 'is-static'
		]
			.filter(Boolean)
			.join(' ')
	);
	const appearanceFailure = $derived(visualEffectsFailure ?? themeFailure);
	const appearanceSaveInProgress = $derived(
		Boolean(themeSaveController || visualEffectsSaveController)
	);

	function clearAccountToastTimer() {
		if (!accountToastTimer) return;
		clearTimeout(accountToastTimer);
		accountToastTimer = null;
	}

	function clearAppearanceCloseTimer() {
		if (!appearanceCloseTimer) return;
		clearTimeout(appearanceCloseTimer);
		appearanceCloseTimer = null;
	}

	function showAccountToast(message: string, tone: 'success' | 'error' = 'success') {
		accountToastMessage = message;
		accountToastTone = tone;
		clearAccountToastTimer();
		accountToastTimer = setTimeout(() => {
			accountToastMessage = '';
			accountToastTimer = null;
		}, 2400);
	}

	function closeAccountMenu() {
		clearAppearanceCloseTimer();
		accountMenuOpen = false;
		appearanceMenuOpen = false;
		appearancePinnedByClick = false;
	}

	function toggleAccountMenu() {
		clearAppearanceCloseTimer();
		accountMenuOpen = !accountMenuOpen;
		if (!accountMenuOpen) {
			appearanceMenuOpen = false;
			appearancePinnedByClick = false;
		}
	}

	async function chooseTheme(value: ThemePreference) {
		if (value === theme) {
			closeAccountMenu();
			return;
		}

		if (!currentUser) {
			setThemePreference(value);
			confirmedTheme = value;
			closeAccountMenu();
			return;
		}

		themeSaveController?.abort();
		pendingTheme = value;
		themeFailure = null;
		const rollbackTheme = confirmedTheme;
		const controller = new AbortController();
		themeSaveController = controller;
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, 8000);
		setThemePreference(value);
		closeAccountMenu();

		try {
			const response = await fetch(resolve('/api/theme-preference'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ themePreference: value }),
				signal: controller.signal
			});

			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Appearance save request failed.');
			}
			confirmedTheme = value;
			pendingTheme = null;
			themeFailure = null;
			showAccountToast('Appearance saved.');
		} catch (error) {
			if (themeSaveController !== controller) return;
			console.warn('Theme preference could not be saved.', error);
			setThemePreference(rollbackTheme);
			themeFailure = classifyRequestFailure(error, {
				action: 'save this appearance setting',
				serverLabel: 'Appearance sync',
				timedOut
			});
			showAccountToast(`${themeFailure.title}. Restored the previous theme.`, 'error');
		} finally {
			clearTimeout(timeout);
			if (themeSaveController === controller) themeSaveController = null;
		}
	}

	async function chooseVisualEffects(value: boolean) {
		if (value === visualEffectsEnabled) {
			closeAccountMenu();
			return;
		}

		if (!currentUser) {
			setVisualEffectsPreference(value);
			confirmedVisualEffectsEnabled = value;
			closeAccountMenu();
			return;
		}

		visualEffectsSaveController?.abort();
		pendingVisualEffectsEnabled = value;
		visualEffectsFailure = null;
		const rollbackPreference = confirmedVisualEffectsEnabled;
		const controller = new AbortController();
		visualEffectsSaveController = controller;
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, 8000);
		setVisualEffectsPreference(value);
		closeAccountMenu();

		try {
			const response = await fetch(resolve('/api/theme-preference'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ visualEffectsEnabled: value }),
				signal: controller.signal
			});

			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Visual effects save request failed.');
			}
			confirmedVisualEffectsEnabled = value;
			pendingVisualEffectsEnabled = null;
			visualEffectsFailure = null;
			showAccountToast(`Visual effects ${value ? 'on' : 'off'}.`);
		} catch (error) {
			if (visualEffectsSaveController !== controller) return;
			console.warn('Visual effects preference could not be saved.', error);
			setVisualEffectsPreference(rollbackPreference);
			visualEffectsFailure = classifyRequestFailure(error, {
				action: 'save this visual effects setting',
				serverLabel: 'Appearance sync',
				timedOut
			});
			showAccountToast(
				`${visualEffectsFailure.title}. Restored the previous visual effects setting.`,
				'error'
			);
		} finally {
			clearTimeout(timeout);
			if (visualEffectsSaveController === controller) visualEffectsSaveController = null;
		}
	}

	function retryAppearanceSave() {
		if (appearanceFailure?.kind === 'auth') {
			window.location.assign(
				authStartHref(`${pageState.url.pathname}${pageState.url.search}${pageState.url.hash}`)
			);
			return;
		}
		if (visualEffectsFailure && pendingVisualEffectsEnabled !== null) {
			void chooseVisualEffects(pendingVisualEffectsEnabled);
			return;
		}
		if (!pendingTheme) return;
		void chooseTheme(pendingTheme);
	}

	function pointerSupportsHover(event: PointerEvent) {
		return event.pointerType === 'mouse' || event.pointerType === 'pen';
	}

	function openAppearanceMenu(event: PointerEvent) {
		if (!pointerSupportsHover(event)) return;
		clearAppearanceCloseTimer();
		appearanceMenuOpen = true;
	}

	function closeAppearanceMenu(event: PointerEvent) {
		if (!pointerSupportsHover(event)) return;
		if (appearancePinnedByClick) return;
		clearAppearanceCloseTimer();
		appearanceCloseTimer = setTimeout(() => {
			appearanceMenuOpen = false;
			appearanceCloseTimer = null;
		}, 260);
	}

	function closeAppearanceFromOtherItem(event: PointerEvent) {
		if (!pointerSupportsHover(event)) return;
		clearAppearanceCloseTimer();
		appearanceMenuOpen = false;
		appearancePinnedByClick = false;
	}

	function toggleAppearanceMenu(event: MouseEvent) {
		event.stopPropagation();
		clearAppearanceCloseTimer();
		if (appearanceMenuOpen && !appearancePinnedByClick) {
			appearancePinnedByClick = true;
			return;
		}
		const nextOpen = !appearanceMenuOpen;
		appearanceMenuOpen = nextOpen;
		appearancePinnedByClick = nextOpen;
	}

	function isNavLinkActive(href: string) {
		const currentPath = normalizeNavPath(pageState.url.pathname);
		const hrefPath = normalizeNavPath(href);
		if (hrefPath === '/') return currentPath === '/';
		return currentPath === hrefPath || currentPath.startsWith(`${hrefPath}/`);
	}

	function normalizeNavPath(href: string) {
		const path = href.split('?')[0].replace(/\/$/, '') || '/';
		if (path.startsWith('./')) return `/${path.slice(2)}`;
		if (!path.startsWith('/')) return `/${path}`;
		return path;
	}

	function handleWindowClick(event: MouseEvent) {
		if (!accountMenuOpen) return;
		if (event.target instanceof Node && accountMenuRoot?.contains(event.target)) return;
		closeAccountMenu();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeAccountMenu();
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<header class={topbarClass} aria-label="Site header">
	<a href={resolve('/')} class="qc-topbar-brand" aria-label="Question Constellation home">
		<img
			src="/brand/question-constellation-logo.svg"
			alt=""
			width="32"
			height="32"
			loading="eager"
			decoding="sync"
			fetchpriority="high"
		/>
		<span>Question Constellation</span>
	</a>

	{#if visibleNavLinks.length > 0}
		<nav class="qc-topbar-nav" aria-label="Primary navigation">
			{#each visibleNavLinks as link (link.href)}
				<a
					href={resolveInternalPath(link.href)}
					aria-current={isNavLinkActive(link.href) ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	{/if}

	{#if effectivePrimaryAction}
		<a
			class="qc-topbar-action"
			href={resolveInternalPath(effectivePrimaryAction.href)}
			aria-label={effectivePrimaryAction.ariaLabel ?? effectivePrimaryAction.label}
		>
			{effectivePrimaryAction.label}
		</a>
	{/if}

	{#if mobileTopbarLinks.length > 0}
		<nav class="qc-topbar-mobile-links" aria-label="Essential navigation">
			{#each mobileTopbarLinks as link (link.href)}
				<a
					href={resolveInternalPath(link.href)}
					aria-label={link.ariaLabel}
					aria-current={isNavLinkActive(link.href) ? 'page' : undefined}
					class:primary={link.variant === 'primary'}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	{/if}

	{#if currentUser}
		<div class="qc-avatar-menu" bind:this={accountMenuRoot}>
			<button
				type="button"
				class="qc-avatar-trigger"
				aria-label="Account menu"
				aria-haspopup="menu"
				aria-expanded={accountMenuOpen}
				onclick={toggleAccountMenu}
			>
				<span class="qc-avatar-pixel" aria-hidden="true">
					<img src={avatarSrc} alt="" width="32" height="32" referrerpolicy="no-referrer" />
				</span>
			</button>
			{#if accountMenuOpen}
				<div class="qc-avatar-popover" role="menu" aria-label="Account">
					<p class="qc-avatar-popover-title">Account</p>
					<div class="qc-menu-user" role="none">
						<strong>{accountName}</strong>
						<span>{currentUser.email}</span>
					</div>
					<a
						class="qc-menu-item"
						role="menuitem"
						href={resolve('/')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Home
					</a>
					<a
						class="qc-menu-item"
						role="menuitem"
						href={resolve('/questions')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Questions
					</a>
					<a
						class="qc-menu-item"
						role="menuitem"
						href={resolve('/challenges')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Challenges
					</a>
					<a
						class="qc-menu-item"
						role="menuitem"
						href={resolve('/profile')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Profile
					</a>
					<div class="qc-menu-separator" role="separator"></div>
					<div
						class="qc-menu-submenu"
						role="none"
						onpointerenter={openAppearanceMenu}
						onpointerleave={closeAppearanceMenu}
					>
						<button
							type="button"
							class="qc-menu-item qc-menu-submenu-trigger"
							role="menuitem"
							aria-haspopup="menu"
							aria-expanded={appearanceMenuOpen}
							onclick={toggleAppearanceMenu}
						>
							<span>Appearance</span>
							<ChevronRight size={15} aria-hidden="true" strokeWidth={2.2} />
						</button>
						{#if appearanceMenuOpen}
							<div class="qc-appearance-submenu" role="menu" aria-label="Appearance">
								{#each themeOptions as option (option.value)}
									<button
										type="button"
										class="qc-menu-item qc-appearance-item"
										class:active={theme === option.value}
										role="menuitemradio"
										aria-checked={theme === option.value}
										onclick={() => chooseTheme(option.value)}
									>
										<Check
											size={15}
											aria-hidden="true"
											strokeWidth={2.3}
											class={theme === option.value ? 'visible' : undefined}
										/>
										<span>{option.label}</span>
									</button>
								{/each}
								<div class="qc-menu-separator qc-appearance-separator" role="separator"></div>
								<button
									type="button"
									class="qc-menu-item qc-appearance-item"
									class:active={visualEffectsEnabled}
									role="menuitemcheckbox"
									aria-checked={visualEffectsEnabled}
									onclick={() => chooseVisualEffects(!visualEffectsEnabled)}
								>
									<Check
										size={15}
										aria-hidden="true"
										strokeWidth={2.3}
										class={visualEffectsEnabled ? 'visible' : undefined}
									/>
									<span>Visual effects</span>
									<span class="qc-appearance-state" aria-hidden="true">
										{visualEffectsEnabled ? 'On' : 'Off'}
									</span>
								</button>
							</div>
						{/if}
					</div>
					<div class="qc-menu-separator" role="separator"></div>
					<a
						class="qc-menu-item danger"
						role="menuitem"
						href={resolve('/auth/logout')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Sign out
					</a>
				</div>
			{/if}
		</div>
	{/if}
	{#if currentUser && accountToastMessage}
		<div
			class="qc-account-toast"
			class:error={accountToastTone === 'error'}
			role="status"
			aria-live="polite"
		>
			{accountToastMessage}
		</div>
	{/if}
	{#if currentUser && appearanceFailure}
		<div class="qc-topbar-request-failure">
			<RequestFailureNotice
				failure={appearanceFailure}
				onRetry={retryAppearanceSave}
				retrying={appearanceSaveInProgress}
				retryLabel={appearanceFailure.kind === 'auth' ? 'Sign in again' : 'Retry save'}
				compact
			/>
		</div>
	{/if}
</header>

<style>
	.qc-appearance-separator {
		margin: 0.28rem 0.35rem;
	}

	.qc-appearance-state {
		margin-left: auto;
		color: var(--qc-spark-muted-foreground);
		font-size: 0.72rem;
		font-weight: 650;
	}

	.qc-topbar-request-failure {
		position: fixed;
		z-index: 90;
		top: 4.75rem;
		right: clamp(0.85rem, 2.4vw, 1.5rem);
		width: min(31rem, calc(100vw - 1.7rem));
	}

	@media (max-width: 560px) {
		.qc-topbar-request-failure {
			left: 0.75rem;
			right: 0.75rem;
			width: auto;
		}
	}
</style>
