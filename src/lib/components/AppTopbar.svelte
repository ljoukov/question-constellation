<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { Check, ChevronDown, ChevronRight, Search } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { setThemePreference, themePreference, type ThemePreference } from '$lib/themePreference';

	let {
		subject = 'Physics',
		subjects = ['All subjects', 'Physics', 'Chemistry', 'Biology'],
		searchValue = '',
		searchPlaceholder = 'Search questions',
		onSearchChange,
		onSubjectChange
	}: {
		subject?: string;
		subjects?: string[];
		searchValue?: string;
		searchPlaceholder?: string;
		onSearchChange?: (value: string) => void;
		onSubjectChange?: (value: string) => void;
	} = $props();

	let theme = $state<ThemePreference>('auto');
	let mobileSearchOpen = $state(false);
	const unsubscribe = themePreference.subscribe((value) => {
		theme = value;
	});
	onDestroy(unsubscribe);

	const themeOptions: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	function closeAccountMenu(target: EventTarget | null) {
		if (target instanceof HTMLElement) {
			const menu = target.closest('.qc-avatar-menu');
			menu?.querySelector('.qc-menu-submenu')?.removeAttribute('open');
			menu?.removeAttribute('open');
		}
	}

	function chooseTheme(event: MouseEvent, value: ThemePreference) {
		setThemePreference(value);
		closeAccountMenu(event.currentTarget);
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
		const params = new URLSearchParams();
		const trimmedQuery = q.trim();
		if (trimmedQuery) params.set('q', trimmedQuery);
		if (nextSubject && nextSubject !== 'All subjects') params.set('subject', nextSubject);
		const suffix = params.toString();
		window.location.assign(`${resolve('/')}${suffix ? `?${suffix}` : ''}`);
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		if (onSearchChange) return;
		const form = event.currentTarget as HTMLFormElement;
		const input = form.elements.namedItem('q') as HTMLInputElement | null;
		navigateToBrowse({ q: input?.value ?? '', subject });
	}
</script>

<header class="qc-topbar" class:search-open={mobileSearchOpen} aria-label="Site header">
	<a href="/" class="qc-topbar-brand" aria-label="Question Constellation home">
		<img src="/brand/question-constellation-icon.png" alt="" width="32" height="32" />
		<span>Question Constellation</span>
	</a>

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

	<label class="qc-topbar-subject">
		<span class="sr-only">Subject</span>
		<select aria-label="Subject" value={subject} onchange={updateSubject}>
			{#each subjects as option}
				<option value={option}>{option}</option>
			{/each}
		</select>
		<ChevronDown size={15} aria-hidden="true" strokeWidth={2.4} />
	</label>

	<details class="qc-avatar-menu">
		<summary aria-label="Account menu">
			<span class="qc-avatar-pixel" aria-hidden="true">
				<svg viewBox="0 0 32 32" role="img">
					<rect width="32" height="32" rx="9" fill="#102033" />
					<path
						d="M16 4l2.1 7.5L26 10l-5.8 5.5L24 23l-8-3.6L8 23l3.8-7.5L6 10l7.9 1.5L16 4z"
						fill="#f7c24d"
					/>
					<path
						d="M16 9l1.1 4 4.1-.8-3 3 2 3.8-4.2-1.9-4.2 1.9 2-3.8-3-3 4.1.8L16 9z"
						fill="#ffffff"
						opacity="0.92"
					/>
					<rect x="6" y="25" width="4" height="3" fill="#48c78e" />
					<rect x="22" y="25" width="4" height="3" fill="#48c78e" />
				</svg>
			</span>
		</summary>
		<div class="qc-avatar-popover" role="menu">
			<p class="qc-avatar-popover-title">Account</p>
			<button
				type="button"
				class="qc-menu-item"
				role="menuitem"
				onclick={(event) => closeAccountMenu(event.currentTarget)}
			>
				Log in...
			</button>
			<div class="qc-menu-separator" role="separator"></div>
			<details class="qc-menu-submenu">
				<summary class="qc-menu-item" role="menuitem" aria-haspopup="menu">
					<span>Appearance</span>
					<ChevronRight size={15} aria-hidden="true" strokeWidth={2.2} />
				</summary>
				<div class="qc-appearance-submenu" role="menu" aria-label="Appearance">
					{#each themeOptions as option}
						<button
							type="button"
							class="qc-menu-item qc-appearance-item"
							class:active={theme === option.value}
							role="menuitemradio"
							aria-checked={theme === option.value}
							onclick={(event) => chooseTheme(event, option.value)}
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
			</details>
		</div>
	</details>
</header>
