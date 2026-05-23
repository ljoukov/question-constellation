<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		Atom,
		BookOpen,
		Brain,
		ChevronDown,
		Crown,
		Diamond,
		FlaskConical,
		Leaf,
		LogOut
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const subjectIcons = {
		leaf: Leaf,
		flask: FlaskConical,
		atom: Atom,
		book: BookOpen,
		crown: Crown
	} satisfies Record<string, Component>;

	const initials = $derived(
		data.user?.name
			?.split(/\s+/)
			.filter(Boolean)
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase() ??
			data.user?.email
				?.split('@')[0]
				.split(/[._-]+/)
				.map((part) => part[0])
				.join('')
				.slice(0, 2)
				.toUpperCase() ??
			'LS'
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.url.pathname.startsWith('/auth/')}
	{@render children()}
{:else}
	<div class="app-shell">
		<header class="topbar">
			<a class="brand" href={resolve('/')} aria-label="Question Constellation home">
				<span class="brand-mark" aria-hidden="true"></span>
				<span class="brand-text"><span>Question</span><span>Constellation</span></span>
			</a>

			<nav class="topnav" aria-label="Subjects">
				{#each data.subjects as subject (subject.id)}
					{@const Icon = subjectIcons[subject.icon]}
					<a
						class={[
							'nav-item',
							`tone-${subject.tone}`,
							page.url.pathname === '/' && subject.id === 'biology' && 'active'
						]}
						href={resolve('/')}
					>
						<Icon size={20} strokeWidth={2.4} />
						<span>{subject.name}</span>
					</a>
				{/each}
				<a
					class={[
						'nav-item',
						'memory-tab',
						page.url.pathname.startsWith('/thinking-memory') && 'active'
					]}
					href={resolve('/thinking-memory')}
				>
					<Brain size={22} strokeWidth={2.5} />
					<span>Thinking Memory</span>
				</a>
			</nav>

			<div class="account-strip">
				<span class="gem-pill"><Diamond size={21} fill="#0b69ff" color="#0b69ff" />1,250</span>
				<span class="user-pill">{initials}</span>
				<ChevronDown size={18} />
				<a class="logout-link" href={resolve('/auth/logout')} aria-label="Sign out">
					<LogOut size={18} />
				</a>
			</div>
		</header>
		{@render children()}
	</div>
{/if}
