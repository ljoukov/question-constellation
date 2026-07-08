<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as pageState } from '$app/state';
	import { Check, Search } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { BROWSE_SUBJECTS } from '$lib/englishSubjects';
	import { primaryNavigationLinks, type AppTopbarLink } from '$lib/navigation';
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
		searchValue = '',
		searchPlaceholder = 'Search questions',
		showSearch = true,
		showSubject: _showSubject = true,
		showNavigation = false,
		navLinks = primaryNavigationLinks,
		primaryAction,
		sticky = true,
		onSearchChange,
		onSearchSubmit,
		onSubjectChange: _onSubjectChange
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
	} = $props();

	let theme = $state<ThemePreference>('auto');
	let mobileSearchOpen = $state(false);
	let accountMenuOpen = $state(false);
	let confirmedTheme = $state<ThemePreference>('auto');
	let accountToastMessage = $state('');
	let accountToastTone = $state<'success' | 'error'>('success');
	let accountMenuRoot: HTMLDivElement | null = null;
	let themeSaveController: AbortController | null = null;
	let accountToastTimer: ReturnType<typeof setTimeout> | null = null;
	const unsubscribe = themePreference.subscribe((value) => {
		theme = value;
		if (!themeSaveController) confirmedTheme = value;
	});
	onDestroy(() => {
		unsubscribe();
		themeSaveController?.abort();
		clearAccountToastTimer();
	});

	const themeOptions: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
	const currentUser = $derived((pageState.data.user ?? null) as AdminUser | null);
	const avatarSrc = $derived(currentUser?.photoUrl ?? '/brand/avatar-bottts.svg');
	const defaultSignInAction: AppTopbarAction = {
		href: resolve('/auth/start'),
		label: 'Sign In For Free'
	};
	const effectivePrimaryAction = $derived(
		primaryAction ?? (!currentUser && showNavigation ? defaultSignInAction : undefined)
	);
	const visibleNavLinks = $derived(showNavigation ? navLinks : []);
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
			mobileSearchOpen ? 'search-open' : '',
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
		accountMenuOpen = false;
	}

	function toggleAccountMenu() {
		accountMenuOpen = !accountMenuOpen;
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
		const rollbackTheme = confirmedTheme;
		const controller = new AbortController();
		themeSaveController = controller;
		const timeout = setTimeout(() => controller.abort(), 8000);
		setThemePreference(value);
		closeAccountMenu();

		try {
			const response = await fetch(resolve('/api/theme-preference'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ themePreference: value }),
				signal: controller.signal
			});

			if (!response.ok) throw new Error(`Theme save failed with ${response.status}.`);
			confirmedTheme = value;
			showAccountToast('Appearance saved.');
		} catch (error) {
			if (themeSaveController !== controller) return;
			console.warn('Theme preference could not be saved.', error);
			setThemePreference(rollbackTheme);
			showAccountToast('Could not save appearance. Restored previous theme.', 'error');
		} finally {
			clearTimeout(timeout);
			if (themeSaveController === controller) themeSaveController = null;
		}
	}

	function updateSearch(event: Event) {
		onSearchChange?.((event.currentTarget as HTMLInputElement).value);
	}

	function navigateToBrowse({ q = searchValue } = {}) {
		if (!browser) return;
		const trimmedQuery = q.trim();
		const params = new SvelteURLSearchParams();
		if (trimmedQuery) params.set('q', trimmedQuery);
		const suffix = params.toString();
		void goto(`${resolve('/chains')}${suffix ? `?${suffix}` : ''}`);
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const input = form.elements.namedItem('q') as HTMLInputElement | null;
		if (onSearchSubmit) {
			onSearchSubmit(input?.value ?? '');
			return;
		}
		if (onSearchChange) return;
		navigateToBrowse({ q: input?.value ?? '' });
	}

	function isNavLinkActive(href: string) {
		const currentPath = pageState.url.pathname.replace(/\/$/, '') || '/';
		const hrefPath = href.split('?')[0].replace(/\/$/, '') || '/';
		if (hrefPath === '/') return currentPath === '/';
		return currentPath === hrefPath || currentPath.startsWith(`${hrefPath}/`);
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

	{#if showSearch}
		<form class="qc-topbar-search" role="search" onsubmit={submitSearch}>
			<Search size={17} aria-hidden="true" strokeWidth={2} />
			<input
				type="search"
				name="q"
				autocomplete="off"
				placeholder={searchPlaceholder}
				value={searchValue}
				oninput={updateSearch}
			/>
		</form>

		<button
			type="button"
			class="qc-topbar-search-button"
			aria-label="Search questions"
			aria-expanded={mobileSearchOpen}
			onclick={() => (mobileSearchOpen = !mobileSearchOpen)}
		>
			<Search size={19} aria-hidden="true" strokeWidth={2} />
		</button>
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

	<div class="qc-avatar-menu" bind:this={accountMenuRoot}>
		<button
			type="button"
			class="qc-avatar-trigger"
			aria-label="Appearance"
			aria-haspopup="menu"
			aria-expanded={accountMenuOpen}
			onclick={toggleAccountMenu}
		>
			<span class="qc-avatar-pixel" aria-hidden="true">
				<img src={avatarSrc} alt="" width="32" height="32" referrerpolicy="no-referrer" />
			</span>
		</button>
		{#if accountMenuOpen}
			<div class="qc-avatar-popover" role="menu" aria-label="Appearance">
				<p class="qc-avatar-popover-title">Appearance</p>
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
	{#if accountToastMessage}
		<div class="qc-account-toast" class:error={accountToastTone === 'error'} role="status">
			{accountToastMessage}
		</div>
	{/if}
</header>
