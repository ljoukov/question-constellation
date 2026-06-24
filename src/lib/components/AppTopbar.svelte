<script lang="ts">
	import { ChevronDown, Search } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import {
		setThemePreference,
		themePreference,
		type ThemePreference
	} from '$lib/themePreference';

	let { subject = 'Physics' }: { subject?: string } = $props();

	let theme = $state<ThemePreference>('auto');
	const unsubscribe = themePreference.subscribe((value) => {
		theme = value;
	});
	onDestroy(unsubscribe);

	const themeOptions: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	function chooseTheme(event: MouseEvent, value: ThemePreference) {
		setThemePreference(value);
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.closest('details')?.removeAttribute('open');
		}
	}
</script>

<header class="qc-topbar" aria-label="Site header">
	<a href="/" class="qc-topbar-brand" aria-label="Question Constellation home">
		<img src="/brand/question-constellation-icon.png" alt="" width="32" height="32" />
		<span>Question Constellation</span>
	</a>

	<form class="qc-topbar-search" role="search" onsubmit={(event) => event.preventDefault()}>
		<Search size={17} aria-hidden="true" strokeWidth={2} />
		<input type="search" name="q" autocomplete="off" placeholder="Search questions" />
	</form>

	<button type="button" class="qc-topbar-search-button" aria-label="Search questions">
		<Search size={19} aria-hidden="true" strokeWidth={2} />
	</button>

	<label class="qc-topbar-subject">
		<span class="sr-only">Subject</span>
		<select aria-label="Subject">
			<option selected={subject === 'All subjects'}>All subjects</option>
			<option selected={subject === 'Physics'}>Physics</option>
			<option selected={subject === 'Chemistry'}>Chemistry</option>
			<option selected={subject === 'Biology'}>Biology</option>
		</select>
		<ChevronDown size={15} aria-hidden="true" strokeWidth={2.4} />
	</label>

	<details class="qc-avatar-menu">
		<summary aria-label="Account menu">
			<span class="qc-avatar-pixel" aria-hidden="true">
				<svg viewBox="0 0 32 32" role="img">
					<rect width="32" height="32" rx="9" fill="#102033" />
					<path d="M16 4l2.1 7.5L26 10l-5.8 5.5L24 23l-8-3.6L8 23l3.8-7.5L6 10l7.9 1.5L16 4z" fill="#f7c24d" />
					<path d="M16 9l1.1 4 4.1-.8-3 3 2 3.8-4.2-1.9-4.2 1.9 2-3.8-3-3 4.1.8L16 9z" fill="#ffffff" opacity="0.92" />
					<rect x="6" y="25" width="4" height="3" fill="#48c78e" />
					<rect x="22" y="25" width="4" height="3" fill="#48c78e" />
				</svg>
			</span>
		</summary>
		<div class="qc-avatar-popover">
			<p class="qc-avatar-popover-title">Appearance</p>
			<div class="qc-theme-options" role="group" aria-label="Appearance">
				{#each themeOptions as option}
					<button
						type="button"
						class:active={theme === option.value}
						aria-pressed={theme === option.value}
						onclick={(event) => chooseTheme(event, option.value)}
					>
						<span>{option.label}</span>
						{#if theme === option.value}
							<span aria-hidden="true">✓</span>
						{/if}
					</button>
				{/each}
			</div>
			<button type="button" class="qc-login-button">Log in...</button>
		</div>
	</details>
</header>
