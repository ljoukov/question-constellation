<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { Check, ChevronDown, ChevronRight, Search } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { setThemePreference, themePreference, type ThemePreference } from '$lib/themePreference';

	let {
		subject = 'Physics',
		subjects = [
			'All subjects',
			'Science',
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History'
		],
		searchValue = '',
		searchPlaceholder = 'Search questions',
		showSearch = true,
		showSubject = true,
		onSearchChange,
		onSearchSubmit,
		onSubjectChange
	}: {
		subject?: string;
		subjects?: string[];
		searchValue?: string;
		searchPlaceholder?: string;
		showSearch?: boolean;
		showSubject?: boolean;
		onSearchChange?: (value: string) => void;
		onSearchSubmit?: (value: string) => void;
		onSubjectChange?: (value: string) => void;
	} = $props();

	let theme = $state<ThemePreference>('auto');
	let mobileSearchOpen = $state(false);
	let accountMenuOpen = $state(false);
	let appearanceMenuOpen = $state(false);
	let appearancePinnedByClick = $state(false);
	let accountMenuRoot: HTMLDivElement | null = null;
	let appearanceCloseTimer: ReturnType<typeof setTimeout> | null = null;
	const unsubscribe = themePreference.subscribe((value) => {
		theme = value;
	});
	onDestroy(() => {
		unsubscribe();
		clearAppearanceCloseTimer();
	});

	const themeOptions: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	function clearAppearanceCloseTimer() {
		if (!appearanceCloseTimer) return;
		clearTimeout(appearanceCloseTimer);
		appearanceCloseTimer = null;
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

	function chooseTheme(value: ThemePreference) {
		setThemePreference(value);
		closeAccountMenu();
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

	function updateSearch(event: Event) {
		onSearchChange?.((event.currentTarget as HTMLInputElement).value);
	}

	function updateSubject(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (onSubjectChange) {
			onSubjectChange(value);
			return;
		}
		navigateToBrowse({ subject: value });
	}

	function navigateToBrowse({ q = searchValue, subject: nextSubject = subject } = {}) {
		if (!browser) return;
		if (nextSubject === 'English') {
			window.location.assign(resolve('/english'));
			return;
		}
		const params = new SvelteURLSearchParams();
		const trimmedQuery = q.trim();
		if (trimmedQuery) params.set('q', trimmedQuery);
		if (nextSubject && nextSubject !== 'All subjects') params.set('subject', nextSubject);
		const suffix = params.toString();
		window.location.assign(`${resolve('/')}${suffix ? `?${suffix}` : ''}`);
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
		navigateToBrowse({ q: input?.value ?? '', subject });
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

<header class="qc-topbar" class:search-open={mobileSearchOpen} aria-label="Site header">
	<a href={resolve('/')} class="qc-topbar-brand" aria-label="Question Constellation home">
		<img src="/brand/question-constellation-icon.png" alt="" width="32" height="32" />
		<span>Question Constellation</span>
	</a>

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

	{#if showSubject}
		<label class="qc-topbar-subject">
			<span class="sr-only">Subject</span>
			<select aria-label="Subject" value={subject} onchange={updateSubject}>
				{#each subjects as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
			<ChevronDown size={15} aria-hidden="true" strokeWidth={2.4} />
		</label>
	{/if}

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
				<img src="/brand/avatar-bottts.svg" alt="" width="32" height="32" />
			</span>
		</button>
		{#if accountMenuOpen}
			<div class="qc-avatar-popover" role="menu" aria-label="Account">
				<p class="qc-avatar-popover-title">Account</p>
				<button
					type="button"
					class="qc-menu-item"
					role="menuitem"
					onclick={closeAccountMenu}
					onpointerenter={closeAppearanceFromOtherItem}
				>
					Log in...
				</button>
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
			</div>
		{/if}
	</div>
</header>
