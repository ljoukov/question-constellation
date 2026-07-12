<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page as pageState } from '$app/state';
	import { authStartHref } from '$lib/authReturn';
	import { Check, ChevronRight } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { BROWSE_SUBJECTS } from '$lib/englishSubjects';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { primaryNavigationLinks, type AppTopbarLink } from '$lib/navigation';
	import {
		classifyRequestFailure,
		requestErrorFromResponse,
		type RequestFailure
	} from '$lib/requestFailure';
	import { setThemePreference, themePreference, type ThemePreference } from '$lib/themePreference';
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
		subject: _subject = 'Physics',
		subjects: _subjects = [...BROWSE_SUBJECTS],
		searchValue: _searchValue = '',
		searchPlaceholder: _searchPlaceholder = 'Search questions',
		showSearch: _showSearch = true,
		showSubject: _showSubject = true,
		showNavigation = false,
		navLinks = primaryNavigationLinks,
		primaryAction,
		sticky = true,
		onSearchChange: _onSearchChange,
		onSearchSubmit: _onSearchSubmit,
		onSubjectChange: _onSubjectChange,
		user: currentUserOverride = undefined
	}: {
		subject?: string;
		subjects?: string[];
		searchValue?: string;
		searchPlaceholder?: string;
		showSearch?: boolean;
		showSubject?: boolean;
		showNavigation?: boolean;
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
	let accountMenuRoot = $state<HTMLDivElement | null>(null);
	let themeSaveController = $state<AbortController | null>(null);
	let appearanceCloseTimer: ReturnType<typeof setTimeout> | null = null;
	let accountToastTimer: ReturnType<typeof setTimeout> | null = null;
	const unsubscribe = themePreference.subscribe((value) => {
		theme = value;
		if (!themeSaveController) confirmedTheme = value;
	});
	onDestroy(() => {
		unsubscribe();
		themeSaveController?.abort();
		clearAppearanceCloseTimer();
		clearAccountToastTimer();
	});

	const themeOptions: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
	const currentUser = $derived(
		currentUserOverride === undefined
			? ((pageState.data.user ?? null) as AdminUser | null)
			: currentUserOverride
	);
	const accountName = $derived(currentUser?.name?.trim() || currentUser?.email || 'Account');
	const avatarSrc = $derived(currentUser?.photoUrl ?? '/brand/avatar-bottts.svg');
	const accountDetailsText = $derived(
		currentUser ? `${accountName}\n${currentUser.email}\nUser ID: ${currentUser.uid}` : ''
	);
	const defaultSignInAction: AppTopbarAction = {
		href: resolve('/auth/start'),
		label: 'Sign up for free'
	};
	const effectiveShowNavigation = $derived(showNavigation || !currentUser);
	const effectivePrimaryAction = $derived(
		primaryAction ?? (!currentUser ? defaultSignInAction : undefined)
	);
	const visibleNavLinks = $derived.by(() => {
		if (!effectiveShowNavigation) return [];
		if (!currentUser) return navLinks;
		return navLinks.filter((link) => !isSignedOutAcquisitionLink(link.href));
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
			visibleNavLinks.length > 0 ? 'has-navigation' : '',
			effectivePrimaryAction ? 'has-primary-action' : '',
			sticky ? 'is-sticky' : 'is-static'
		]
			.filter(Boolean)
			.join(' ')
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

	function retryThemeSave() {
		if (themeFailure?.kind === 'auth') {
			window.location.assign(
				authStartHref(`${pageState.url.pathname}${pageState.url.search}${pageState.url.hash}`)
			);
			return;
		}
		if (!pendingTheme) return;
		void chooseTheme(pendingTheme);
	}

	async function writeTextToClipboard(text: string): Promise<void> {
		if (!browser) throw new Error('Clipboard is only available in the browser.');

		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return;
			} catch {
				// Fall back to a temporary selection for browsers that block the async API.
			}
		}

		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		textarea.style.top = '0';
		document.body.appendChild(textarea);
		textarea.select();
		textarea.setSelectionRange(0, textarea.value.length);

		try {
			if (!document.execCommand('copy')) {
				throw new Error('Copy command was rejected.');
			}
		} finally {
			textarea.remove();
		}
	}

	async function copyUserDetails() {
		if (!currentUser || !accountDetailsText) return;

		try {
			await writeTextToClipboard(accountDetailsText);
			showAccountToast('Copied user details to clipboard.');
			closeAccountMenu();
		} catch (error) {
			console.warn('User details could not be copied.', error);
			showAccountToast('Could not copy user details.', 'error');
		}
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

	function isSignedOutAcquisitionLink(href: string) {
		const hrefPath = normalizeNavPath(href);
		const acquisitionPaths = ['/past-papers', '/blog'];
		return acquisitionPaths.some((path) => hrefPath === path || hrefPath.startsWith(`${path}/`));
	}

	function normalizeNavPath(href: string) {
		const path = href.split('?')[0].replace(/\/$/, '') || '/';
		if (path.startsWith('./')) return `/${path.slice(2)}` || '/';
		if (!path.startsWith('/')) return `/${path}` || '/';
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
				<a href={link.href} aria-current={isNavLinkActive(link.href) ? 'page' : undefined}>
					{link.label}
				</a>
			{/each}
		</nav>
	{/if}

	{#if effectivePrimaryAction}
		<a
			class="qc-topbar-action"
			href={effectivePrimaryAction.href}
			aria-label={effectivePrimaryAction.ariaLabel ?? effectivePrimaryAction.label}
		>
			{effectivePrimaryAction.label}
		</a>
	{/if}

	{#if mobileTopbarLinks.length > 0}
		<nav class="qc-topbar-mobile-links" aria-label="Essential navigation">
			{#each mobileTopbarLinks as link (link.href)}
				<a
					href={link.href}
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
					<button
						type="button"
						class="qc-menu-user qc-menu-user-copy"
						role="menuitem"
						aria-label="Copy signed-in user details"
						onclick={copyUserDetails}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						<strong>{accountName}</strong>
						<span>{currentUser.email}</span>
					</button>
					<a
						class="qc-menu-item"
						role="menuitem"
						href={resolve('/profile')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Profile
					</a>
					<a
						class="qc-menu-item"
						role="menuitem"
						href={resolve('/')}
						onclick={closeAccountMenu}
						onpointerenter={closeAppearanceFromOtherItem}
					>
						Home
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
	{#if currentUser && themeFailure}
		<div class="qc-topbar-request-failure">
			<RequestFailureNotice
				failure={themeFailure}
				onRetry={retryThemeSave}
				retrying={Boolean(themeSaveController)}
				retryLabel={themeFailure.kind === 'auth' ? 'Sign in again' : 'Retry save'}
				compact
			/>
		</div>
	{/if}
</header>

<style>
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
