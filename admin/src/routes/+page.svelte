<script lang="ts">
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ActivityChart from '$lib/components/analytics/ActivityChart.svelte';
	import CountryMap from '$lib/components/analytics/CountryMap.svelte';
	import {
		Activity,
		AlertTriangle,
		ArrowRight,
		BookOpenCheck,
		Bot,
		BrainCircuit,
		CheckCircle2,
		ChevronRight,
		CircleHelp,
		CircleX,
		Clock3,
		ExternalLink,
		Filter,
		FlaskConical,
		Gauge,
		Globe2,
		LayoutDashboard,
		Laptop2,
		LogOut,
		MapPin,
		MousePointerClick,
		Network,
		RefreshCw,
		Route,
		Search,
		ShieldCheck,
		Sparkles,
		UserRound,
		UsersRound
	} from '@lucide/svelte';

	type Row = Record<string, string | number | null>;
	type SemanticItem = {
		id: string;
		kind: 'page' | 'action' | 'edit' | 'error' | 'model';
		title: string;
		detail: string;
		time: unknown;
		meta?: string;
	};

	let { data }: PageProps = $props();
	let sessionOpen = $state(untrack(() => Boolean(data.selectedSession)));
	let personOpen = $state(untrack(() => Boolean(data.selectedPerson)));
	let runOpen = $state(untrack(() => Boolean(data.selectedRun)));
	let filtersOpen = $state(false);
	let filterDays = $state(untrack(() => String(data.filters.days)));
	let filterEnvironment = $state(untrack(() => data.filters.environment));
	let filterTraffic = $state(untrack(() => data.filters.traffic));
	let filterIdentity = $state(untrack(() => data.filters.identity));
	let filterCountry = $state(untrack(() => data.filters.country));
	let analystNote = $state<Row | null>(untrack(() => data.latestSummary as Row | null));
	let noteBusy = $state(
		untrack(() => analystNote?.status === 'queued' || analystNote?.status === 'running')
	);
	let noteError = $state('');
	let pollingEpoch = 0;

	const numberFormatter = new Intl.NumberFormat();
	const compactFormatter = new Intl.NumberFormat(undefined, { notation: 'compact' });
	const currencyFormatter = new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	});
	const dayOptions = [
		{ value: '7', label: '7 days' },
		{ value: '30', label: '30 days' },
		{ value: '90', label: '90 days' },
		{ value: '365', label: '1 year' }
	];
	const environmentOptions = [
		{ value: 'production', label: 'Production' },
		{ value: 'development', label: 'Development' },
		{ value: 'all', label: 'All environments' }
	];
	const trafficOptions = [
		{ value: 'human', label: 'People' },
		{ value: 'bots', label: 'Bots & crawlers' },
		{ value: 'internal_test', label: 'Internal & test' },
		{ value: 'unknown', label: 'Unknown' },
		{ value: 'all', label: 'All traffic' }
	];
	const identityOptions = [
		{ value: 'all', label: 'Everyone' },
		{ value: 'authenticated', label: 'Signed in' },
		{ value: 'anonymous', label: 'Anonymous' }
	];
	const regionNames =
		typeof Intl.DisplayNames === 'function'
			? new Intl.DisplayNames(undefined, { type: 'region' })
			: null;

	let milestoneItems = $derived([
		{ label: 'Question', value: Number(data.milestones?.question || 0) },
		{ label: 'Answer chain', value: Number(data.milestones?.answer_chain || 0) },
		{ label: 'Constellation', value: Number(data.milestones?.constellation || 0) },
		{ label: 'Practice', value: Number(data.milestones?.practice || 0) },
		{ label: 'Checked', value: Number(data.milestones?.checked || 0) }
	]);
	let semanticJourney = $derived(buildSemanticJourney((data.journey ?? []) as Row[]));
	let sessionRoute = $derived(
		semanticJourney
			.filter((item) => item.kind === 'page')
			.map((item) => item.title)
			.filter((step, index, steps) => steps[index - 1] !== step)
			.slice(0, 8)
	);
	let noteScopeKey = $derived(
		[
			data.filters.environment,
			data.filters.days,
			data.filters.traffic,
			data.filters.identity,
			data.filters.country,
			data.filters.path,
			data.filters.search
		].join('\u0000')
	);

	$effect(() => {
		sessionOpen = Boolean(data.selectedSession);
		personOpen = Boolean(data.selectedPerson);
		runOpen = Boolean(data.selectedRun);
		filterDays = String(data.filters.days);
		filterEnvironment = data.filters.environment;
		filterTraffic = data.filters.traffic;
		filterIdentity = data.filters.identity;
		filterCountry = data.filters.country;
	});

	$effect(() => {
		const scopeKey = noteScopeKey;
		const note = data.latestSummary as Row | null;
		const epoch = ++pollingEpoch;
		analystNote = note;
		noteBusy = note?.status === 'queued' || note?.status === 'running';
		noteError = '';
		if (noteBusy && note?.summary_id) {
			void pollSummary(String(note.summary_id), epoch, scopeKey);
		}
	});

	let countryFilterOptions = $derived([
		{ value: '', label: 'All countries' },
		...data.countryOptions.map((country) => ({
			value: String(country.country),
			label: `${countryName(country.country)} · ${count(country.profiles)}`
		}))
	]);

	function n(value: unknown): number {
		return Number(value || 0);
	}

	function count(value: unknown): string {
		return numberFormatter.format(n(value));
	}

	function compact(value: unknown): string {
		return compactFormatter.format(n(value));
	}

	function money(value: unknown): string {
		return currencyFormatter.format(n(value));
	}

	function optionLabel(options: Array<{ value: string; label: string }>, value: string): string {
		return options.find((option) => option.value === value)?.label || value;
	}

	function duration(value: unknown): string {
		const milliseconds = n(value);
		if (milliseconds < 1_000) return milliseconds ? `${milliseconds}ms` : '0s';
		const seconds = Math.round(milliseconds / 1_000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ${minutes % 60}m`;
	}

	function date(value: unknown, includeYear = false): string {
		if (typeof value !== 'string') return '—';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return '—';
		return parsed.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			...(includeYear ? { year: 'numeric' } : {}),
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function percent(value: unknown, denominator: unknown): string {
		const total = n(denominator);
		return total ? `${Math.round((n(value) / total) * 100)}%` : '—';
	}

	function short(value: unknown, length = 12): string {
		const text = String(value || '');
		return text.length > length ? `${text.slice(0, length)}…` : text || '—';
	}

	function pretty(value: unknown): string {
		if (!value) return '';
		try {
			const parsed = typeof value === 'string' ? JSON.parse(value) : value;
			return JSON.stringify(parsed, null, 2);
		} catch {
			return String(value);
		}
	}

	function countryName(code: unknown): string {
		const value = String(code || '');
		if (!value) return 'Unknown';
		try {
			return regionNames?.of(value) || value;
		} catch {
			return value;
		}
	}

	function environmentLabel(value: string): string {
		return value === 'all' ? 'All environments' : value === 'production' ? 'Production' : 'Development';
	}

	function trafficLabel(value: string): string {
		return (
			{
				human: 'People',
				bots: 'Bots & crawlers',
				internal_test: 'Internal & test',
				unknown: 'Unknown',
				all: 'All traffic'
			}[value] || value
		);
	}

	function classificationLabel(value: unknown): string {
		return (
			{
				human: 'Person-like',
				verified_bot: 'Verified crawler',
				suspected_bot: 'Automation',
				internal_test: 'Internal / test',
				unknown: 'Unknown'
			}[String(value)] || String(value || 'Unknown')
		);
	}

	function routeStage(pathValue: unknown): string {
		const path = String(pathValue || '/');
		if (path === '/') return 'Home';
		if (/\/questions\/[^/]+\/practice\/[^/]+(?:\/|$)/.test(path)) return 'Guided practice';
		if (/\/questions\/[^/]+\/practice(?:\/|$)/.test(path)) return 'Practice';
		if (/\/questions\/[^/]+\/answer-chain(?:\/|$)/.test(path)) return 'Answer chain';
		if (path.startsWith('/constellations/')) return 'Constellation';
		if (path === '/questions') return 'Questions';
		if (path === '/challenges' || path.startsWith('/challenges/')) return 'Challenges';
		if (path.startsWith('/subjects/')) return 'Subject';
		if (path.startsWith('/recall')) return 'Recall';
		if (path.startsWith('/past-papers')) return 'Past papers';
		if (path.startsWith('/questions/')) return 'Question';
		if (path.startsWith('/blog')) return 'Blog';
		if (path.startsWith('/profile')) return 'Profile';
		if (path.startsWith('/auth/')) return 'Sign in';
		return path;
	}

	function personName(row: Row | null | undefined): string {
		if (!row) return 'Unknown profile';
		if (row.effective_user_name || row.user_name)
			return String(row.effective_user_name || row.user_name);
		if (row.effective_user_email || row.user_email)
			return String(row.effective_user_email || row.user_email);
		return 'Anonymous browser';
	}

	function personDetail(row: Row): string {
		const userId = row.effective_user_id || row.user_id;
		if (userId) return `UID ${short(userId, 24)}`;
		const key = row.actor_key || row.anonymous_id || row.effective_user_id || row.user_id;
		return row.actor_kind === 'user' ? `User ${short(key, 18)}` : `Browser ${short(key, 18)}`;
	}

	function modelActivityLabel(feature: unknown): string {
		const value = String(feature || '');
		if (
			value === 'question_answer_grading' ||
			value === 'english_step_grading' ||
			value === 'experiment_question_grading'
		) {
			return 'Answer check';
		}
		if (value === 'subject_next_action_recommendation') return 'Next-action suggestion';
		return 'Model run';
	}

	function viewTitle(): string {
		return (
			{
				overview: 'Real learner activity',
				people: 'People',
				journeys: 'Journeys',
				models: 'Model health'
			}[data.filters.view] || 'Analytics'
		);
	}

	function viewDescription(): string {
		return (
			{
				overview: 'See whether people reach the question → chain → practice loop.',
				people: 'Logged-in learners by stable user ID; anonymous browsers stay separate.',
				journeys: 'Follow one visit from entry to its last meaningful action.',
				models: 'Check learner-facing model reliability without mixing it into product usage.'
			}[data.filters.view] || ''
		);
	}

	function queryUrl(overrides: Record<string, string | number | null> = {}): string {
		const values: Record<string, string> = {
			view: data.filters.view,
			days: String(data.filters.days),
			environment: data.filters.environment,
			traffic: data.filters.traffic
		};
		if (data.filters.identity !== 'all') values.identity = data.filters.identity;
		if (data.filters.country) values.country = data.filters.country;
		if (data.filters.search) values.q = data.filters.search;
		if (data.filters.path) values.path = data.filters.path;
		for (const [key, value] of Object.entries(overrides)) {
			if (value === null || value === '') delete values[key];
			else values[key] = String(value);
		}
		return `/?${new URLSearchParams(values)}`;
	}

	function countryHref(code: string): string {
		return queryUrl({ view: 'people', country: code, person: null, session: null, run: null });
	}

	function buildSemanticJourney(rows: Row[]): SemanticItem[] {
		const result: SemanticItem[] = [];
		for (const row of rows) {
			if (row.journey_kind === 'model') {
				result.push({
					id: String(row.run_id),
					kind: 'model',
					title: `${modelActivityLabel(row.feature)} · ${row.feature || 'unknown feature'}`,
					detail: `${row.status || 'unknown'} · ${row.model || 'model'}`,
					time: row.started_at,
					meta: duration(row.duration_ms)
				});
				continue;
			}
			if (row.event_type === 'page_view') {
				const detail = `${row.path || '/'}${row.query_string || ''}`;
				const previous = result.at(-1);
				if (previous?.kind === 'page' && previous.detail === detail) continue;
				result.push({
					id: String(row.event_id),
					kind: 'page',
					title: routeStage(row.path),
					detail,
					time: row.occurred_at
				});
			} else if (row.event_type === 'click' && (row.element_text || row.element_name)) {
				const label = String(row.element_text || row.element_name).replace(/\s+/g, ' ').trim();
				if (label) {
					result.push({
						id: String(row.event_id),
						kind: 'action',
						title: label.slice(0, 120),
						detail: 'Action',
						time: row.occurred_at
					});
				}
			} else if (row.event_type === 'form_submit') {
				result.push({
					id: String(row.event_id),
					kind: 'action',
					title: 'Submitted form',
					detail: String(row.path || ''),
					time: row.occurred_at
				});
			} else if (row.event_type === 'input_change') {
				let length = '';
				try {
					const properties = JSON.parse(String(row.properties_json || '{}')) as { length?: number };
					if (typeof properties.length === 'number') length = `${properties.length} characters`;
				} catch {
					// The label remains useful without the optional length.
				}
				result.push({
					id: String(row.event_id),
					kind: 'edit',
					title: `Edited ${row.input_name || 'answer'}`,
					detail: length || 'Input changed',
					time: row.occurred_at
				});
			} else if (row.event_type === 'client_error') {
				result.push({
					id: String(row.event_id),
					kind: 'error',
					title: 'Browser error',
					detail: pretty(row.properties_json),
					time: row.occurred_at
				});
			}
		}
		return result;
	}

	function summaryLines(value: unknown) {
		return String(value || '')
			.split('\n')
			.map((line) => {
				if (line.startsWith('## ')) return { kind: 'heading', text: line.slice(3) };
				if (/^[-*] /.test(line)) return { kind: 'bullet', text: line.slice(2) };
				return { kind: line.trim() ? 'text' : 'space', text: line.trim() };
			})
			.filter((line) => line.kind !== 'space')
			.slice(0, 12);
	}

	async function pollSummary(summaryId: string, epoch: number, scopeKey: string) {
		for (let attempt = 0; attempt < 180; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 2_000));
			if (epoch !== pollingEpoch || scopeKey !== noteScopeKey) return;
			const response = await fetch(`/api/summaries/${summaryId}`);
			if (!response.ok) {
				noteBusy = false;
				noteError = 'The note could not be refreshed. Try again in a moment.';
				return;
			}
			const nextNote = (await response.json()) as Row;
			if (epoch !== pollingEpoch || scopeKey !== noteScopeKey) return;
			analystNote = nextNote;
			if (analystNote?.status === 'complete' || analystNote?.status === 'error') {
				noteBusy = false;
				return;
			}
		}
		if (epoch === pollingEpoch && scopeKey === noteScopeKey) {
			noteBusy = false;
			noteError = 'The note is still taking longer than expected. Refresh this scope to check again.';
		}
	}

	async function generateSummary() {
		if (noteBusy) return;
		if (data.filters.search) {
			noteError = 'Clear the person or session search before generating a cohort note.';
			return;
		}
		const scopeKey = noteScopeKey;
		const epoch = ++pollingEpoch;
		noteBusy = true;
		noteError = '';
		const response = await fetch('/api/summaries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				environment: data.filters.environment,
				days: data.filters.days,
				traffic: data.filters.traffic,
				identity: data.filters.identity,
				country: data.filters.country,
				path: data.filters.path
			})
		});
		if (epoch !== pollingEpoch || scopeKey !== noteScopeKey) return;
		if (!response.ok) {
			noteBusy = false;
			noteError = 'The note could not be started. Check the service configuration and try again.';
			return;
		}
		const job = (await response.json()) as { summaryId: string; status: string };
		analystNote = { summary_id: job.summaryId, status: job.status };
		void pollSummary(job.summaryId, epoch, scopeKey);
	}

	function closeSession(open: boolean) {
		sessionOpen = open;
		if (!open && data.selectedSession)
			void goto(queryUrl({ session: null }), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function closePerson(open: boolean) {
		personOpen = open;
		if (!open && data.selectedPerson)
			void goto(queryUrl({ person: null }), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function closeRun(open: boolean) {
		runOpen = open;
		if (!open && data.selectedRun)
			void goto(queryUrl({ run: null }), { replaceState: true, noScroll: true, keepFocus: true });
	}

</script>

<svelte:head><title>{viewTitle()} · Question Constellation analytics</title></svelte:head>

{#snippet navigation()}
	<a
		class:active-nav={data.filters.view === 'overview'}
		class="nav-item"
		href={queryUrl({ view: 'overview', session: null, person: null, run: null })}
		><LayoutDashboard />Overview</a
	>
	<a
		class:active-nav={data.filters.view === 'people'}
		class="nav-item"
		href={queryUrl({ view: 'people', session: null, person: null, run: null })}
		><UsersRound />People</a
	>
	<a
		class:active-nav={data.filters.view === 'journeys'}
		class="nav-item"
		href={queryUrl({ view: 'journeys', session: null, person: null, run: null })}
		><Route />Journeys</a
	>
	<a
		class:active-nav={data.filters.view === 'models'}
		class="nav-item"
		href={queryUrl({ view: 'models', session: null, person: null, run: null })}
		><BrainCircuit />Models</a
	>
{/snippet}

{#snippet journeyRow(session: Row)}
	<a
		class="journey-card"
		href={queryUrl({
			view: 'journeys',
			session: String(session.session_id),
			person: null,
			run: null
		})}
		aria-label={`Open journey for ${personName(session)}`}
	>
		<div class="journey-person">
			<Avatar.Root>
				<Avatar.Fallback class={session.actor_kind === 'user' ? 'bg-primary/10 text-primary' : ''}
					>{session.actor_kind === 'user'
						? String(personName(session)).slice(0, 1).toUpperCase()
						: 'A'}</Avatar.Fallback
				>
			</Avatar.Root>
			<div class="min-w-0">
				<strong>{personName(session)}</strong>
				<span>{personDetail(session)}</span>
			</div>
		</div>
		<div class="journey-path">
			<span>{session.path_sequence || routeStage(session.initial_path)}</span>
			<small>{session.initial_path || '/'}</small>
		</div>
		<div class="journey-context">
			<span>{date(session.last_seen_at)}</span>
			<small
				>{count(session.page_view_count)} views · {duration(session.engaged_ms)} visible</small
			>
		</div>
		<div class="journey-place">
			<span>{[session.region, session.country].filter(Boolean).join(', ') || 'Unknown place'}</span>
			<small>{session.device_type || 'device'} · {session.browser_name || 'browser'}</small>
		</div>
		<ChevronRight class="journey-arrow" />
	</a>
{/snippet}

{#snippet personCard(person: Row)}
	<a
		class="person-card"
		href={queryUrl({ view: 'people', person: String(person.actor_key), session: null, run: null })}
		aria-label={`Open profile for ${personName(person)}`}
	>
		<div class="flex min-w-0 items-center gap-3">
			<Avatar.Root size="lg">
				<Avatar.Fallback class={person.actor_kind === 'user' ? 'bg-primary/10 text-primary' : ''}
					>{person.actor_kind === 'user'
						? String(personName(person)).slice(0, 1).toUpperCase()
						: 'A'}</Avatar.Fallback
				>
			</Avatar.Root>
			<div class="min-w-0">
				<strong class="block truncate">{personName(person)}</strong>
				<span class="block truncate text-xs text-muted-foreground">{personDetail(person)}</span>
			</div>
		</div>
		<div class="person-stat">
			<strong>{count(person.sessions)}</strong><span>visits</span>
		</div>
		<div class="person-stat">
			<strong>{duration(person.engaged_ms)}</strong><span>visible</span>
		</div>
		<div class="min-w-0 text-sm">
			<strong class="block truncate font-medium"
				>{[person.region, person.country].filter(Boolean).join(', ') || 'Unknown place'}</strong
			>
			<span class="block truncate text-xs text-muted-foreground">{date(person.last_seen_at)}</span>
		</div>
		<div class="flex items-center justify-end gap-2">
			{#if person.actor_kind === 'user'}<Badge variant="secondary">Signed in</Badge>{/if}
			<Badge variant={person.traffic_class === 'human' ? 'outline' : 'secondary'}
				>{classificationLabel(person.traffic_class)}</Badge
			>
			<ChevronRight class="size-4 text-muted-foreground" />
		</div>
	</a>
{/snippet}

<div class="analytics-app">
	<aside class="desktop-sidebar">
		<div class="brand-block">
			<div class="brand-mark"><Sparkles /></div>
			<div>
				<p>Constellation</p>
				<span>Product analytics</span>
			</div>
		</div>
		<nav class="sidebar-nav" aria-label="Analytics sections">
			{@render navigation()}
		</nav>
		<div class="sidebar-scope">
			<span class="eyebrow">Current scope</span>
			<strong>{trafficLabel(data.filters.traffic)}</strong>
			<span>{environmentLabel(data.filters.environment)} · {data.filters.days} days</span>
			{#if data.excludedSessions}
				<span>{count(data.excludedSessions)} sessions hidden</span>
			{/if}
		</div>
		<div class="sidebar-account">
			<div class="status-line"><i></i>Live analytics database</div>
			<span class="truncate">{data.adminUser?.name || data.adminIdentity}</span>
			<a href="/auth/logout"><LogOut />Sign out</a>
		</div>
	</aside>

	<div class="app-main">
		<header class="mobile-header">
			<div class="brand-mark"><Sparkles /></div>
			<div class="min-w-0 flex-1">
				<strong>Constellation analytics</strong>
				<span>{trafficLabel(data.filters.traffic)} · {data.filters.days} days</span>
			</div>
			<Button variant="ghost" size="icon-sm" href="/auth/logout" aria-label="Sign out"><LogOut /></Button>
		</header>
		<nav class="mobile-nav" aria-label="Analytics sections">
			{@render navigation()}
		</nav>
		{#if navigating.to}
			<div class="navigation-progress" role="status" aria-live="polite">
				<RefreshCw class="animate-spin" />
				<span>Updating analytics…</span>
				<Skeleton class="h-1 flex-1" />
			</div>
		{/if}

		<main class="content-shell">
			<section class="page-heading">
				<div>
					<p class="eyebrow">{environmentLabel(data.filters.environment)} analytics</p>
					<h1>{viewTitle()}</h1>
					<p>{viewDescription()}</p>
				</div>
				<div class="scope-badges">
					<Badge variant="secondary">{trafficLabel(data.filters.traffic)}</Badge>
					<Badge variant="outline">{data.filters.days} days</Badge>
					{#if data.filters.country}<Badge variant="outline"
							>{countryName(data.filters.country)}</Badge
						>{/if}
				</div>
			</section>

			{#if data.excludedSessions > 0}
				<section class="quality-banner">
					<div class="quality-icon"><ShieldCheck /></div>
					<div>
						<strong>{count(data.excludedSessions)} out-of-scope sessions are hidden</strong>
						<p>
							The page is calculated only from {trafficLabel(data.filters.traffic).toLowerCase()}
							in this scope. Crawler and test records remain available for audit.
						</p>
					</div>
					<a href={queryUrl({ view: 'journeys', traffic: 'all' })}
						>Inspect all traffic <ArrowRight /></a
					>
				</section>
			{/if}

			<details class="filter-disclosure" bind:open={filtersOpen}>
				<summary>
					<span><Filter />Filters</span>
					<small
						>{environmentLabel(data.filters.environment)} · {trafficLabel(
							data.filters.traffic
						)} · {data.filters.days} days</small
					>
					<ChevronRight />
				</summary>
				<Card.Root size="sm" class="filter-card">
					<Card.Content>
					<form method="GET" class="filter-form">
						<input type="hidden" name="view" value={data.filters.view} />
						<div class="field-label">
							<span>Window</span>
							<Select.Root
								type="single"
								name="days"
								bind:value={filterDays}
								items={dayOptions}
							>
								<Select.Trigger class="filter-select" aria-label="Time window"
									>{optionLabel(dayOptions, filterDays)}</Select.Trigger
								>
								<Select.Content>
									{#each dayOptions as option}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="field-label">
							<span>Environment</span>
							<Select.Root
								type="single"
								name="environment"
								bind:value={filterEnvironment}
								items={environmentOptions}
							>
								<Select.Trigger class="filter-select" aria-label="Environment"
									>{optionLabel(environmentOptions, filterEnvironment)}</Select.Trigger
								>
								<Select.Content>
									{#each environmentOptions as option}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="field-label">
							<span>Audience</span>
							<Select.Root
								type="single"
								name="traffic"
								bind:value={filterTraffic}
								items={trafficOptions}
							>
								<Select.Trigger class="filter-select" aria-label="Audience"
									>{optionLabel(trafficOptions, filterTraffic)}</Select.Trigger
								>
								<Select.Content>
									{#each trafficOptions as option}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="field-label">
							<span>Identity</span>
							<Select.Root
								type="single"
								name="identity"
								bind:value={filterIdentity}
								items={identityOptions}
							>
								<Select.Trigger class="filter-select" aria-label="Identity"
									>{optionLabel(identityOptions, filterIdentity)}</Select.Trigger
								>
								<Select.Content>
									{#each identityOptions as option}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="field-label">
							<span>Country</span>
							<Select.Root
								type="single"
								name="country"
								bind:value={filterCountry}
								items={countryFilterOptions}
							>
								<Select.Trigger class="filter-select" aria-label="Country"
									>{optionLabel(countryFilterOptions, filterCountry)}</Select.Trigger
								>
								<Select.Content>
									{#each countryFilterOptions as option}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="filter-actions">
							<Button type="submit"><Filter />Apply</Button>
							<Button variant="ghost" href={`/?view=${data.filters.view}`}>Reset</Button>
						</div>
						<details class="advanced-filters" open={Boolean(data.filters.search || data.filters.path)}>
							<summary><Search />Search & route filters</summary>
							<div class="advanced-filter-grid">
								<label class="field-label">
									<span>Person, browser or session</span>
									<Input
										class="filter-input"
										name="q"
										value={data.filters.search}
										placeholder="Name, email, UID…"
									/>
								</label>
								<label class="field-label">
									<span>Path contains</span>
									<Input
										class="filter-input"
										name="path"
										value={data.filters.path}
										placeholder="/questions/…"
									/>
								</label>
							</div>
						</details>
					</form>
					</Card.Content>
				</Card.Root>
			</details>

			{#if data.filters.view === 'overview'}
				<section class="metric-grid" aria-label="Usage summary">
					<article class="metric-card metric-primary">
						<div><UsersRound /></div>
						<span>Profiles</span>
						<strong>{count(data.summary.profiles)}</strong>
						<p>
							{count(data.summary.authenticated_users)} signed in · {count(
								data.summary.anonymous_browsers
							)} anonymous browsers
						</p>
					</article>
					<article class="metric-card">
						<div><Activity /></div>
						<span>Visits</span>
						<strong>{count(data.summary.sessions)}</strong>
						<p>{count(data.summary.page_views)} page views in scoped visits</p>
					</article>
					<article class="metric-card">
						<div><Clock3 /></div>
						<span>Engaged visits</span>
						<strong>{count(data.summary.engaged_sessions)}</strong>
						<p>{percent(data.summary.engaged_sessions, data.summary.sessions)} of scoped visits</p>
					</article>
					<article class="metric-card">
						<div><BookOpenCheck /></div>
						<span>Reached practice</span>
						<strong>{count(data.summary.practice_sessions)}</strong>
						<p>{percent(data.summary.practice_sessions, data.summary.sessions)} of scoped visits</p>
					</article>
				</section>

				<section class="overview-grid">
					<Card.Root class="panel-card">
						<Card.Header>
							<Card.Title>Activity by day</Card.Title>
							<Card.Description
								>Visits and distinct profiles on days where analytics was collected.</Card.Description
							>
						</Card.Header>
						<Card.Content>
							<ActivityChart rows={data.dailyTrend} label="Daily visits and profiles" />
						</Card.Content>
					</Card.Root>

					<Card.Root class="panel-card">
						<Card.Header>
							<Card.Title>Core journey reach</Card.Title>
							<Card.Description
								>Visits that touched each milestone. Direct landings can skip earlier
								steps.</Card.Description
							>
						</Card.Header>
						<Card.Content class="space-y-4">
							{#each milestoneItems as milestone}
								<div class="reach-row">
									<div>
										<span>{milestone.label}</span>
										<strong
											>{milestone.value} of {count(data.milestones?.scoped_sessions)}</strong
										>
									</div>
									<div class="reach-track">
										<i
											style={`width: ${Math.min(
												100,
												n(data.milestones?.scoped_sessions)
													? (milestone.value / n(data.milestones?.scoped_sessions)) * 100
													: 0
											)}%`}
										></i>
									</div>
								</div>
							{/each}
						</Card.Content>
					</Card.Root>
				</section>

				<section class="overview-grid map-grid">
					<Card.Root class="panel-card map-panel">
						<Card.Content class="map-card-content">
							<CountryMap
								rows={data.locations}
								{countryHref}
								description="Country-level aggregates only; no learner-level pins or exact coordinates."
							/>
						</Card.Content>
					</Card.Root>

					<Card.Root class="panel-card">
						<Card.Header>
							<Card.Title>Entry pages</Card.Title>
							<Card.Description>Where scoped visits first arrived.</Card.Description>
						</Card.Header>
						<Card.Content class="rank-list">
							{#each data.topEntries as entry, index}
								<a href={queryUrl({ view: 'journeys', path: String(entry.path) })}>
									<span class="rank">{index + 1}</span>
									<div><strong>{entry.path}</strong><small>{entry.profiles} profiles</small></div>
									<Badge variant="secondary">{entry.sessions}</Badge>
								</a>
							{/each}
							{#if data.topEntries.length === 0}<div class="empty-small">No entry pages.</div>{/if}
						</Card.Content>
					</Card.Root>
				</section>

				<section class="overview-grid">
					<Card.Root class="panel-card">
						<Card.Header>
							<Card.Title>Common paths</Card.Title>
							<Card.Description
								>Consecutive page types collapsed into readable sequences.</Card.Description
							>
						</Card.Header>
						<Card.Content class="pattern-list">
							{#each data.topJourneyPatterns as pattern}
								<div>
									<Route />
									<span>{pattern.pattern}</span>
									<Badge variant="secondary">{pattern.sessions}</Badge>
								</div>
							{/each}
							{#if data.topJourneyPatterns.length === 0}<div class="empty-small"
									>No paths in this scope.</div
								>{/if}
						</Card.Content>
					</Card.Root>

					<Card.Root class="panel-card traffic-panel">
						<Card.Header>
							<Card.Title>Traffic quality</Card.Title>
							<Card.Description
								>Everything is retained, but only the selected audience drives the
								dashboard.</Card.Description
							>
						</Card.Header>
						<Card.Content class="traffic-list">
							{#each data.trafficBreakdown as traffic}
								<a
									href={queryUrl({
										view: 'journeys',
										traffic:
											traffic.traffic_class === 'human'
												? 'human'
												: traffic.traffic_class === 'internal_test'
													? 'internal_test'
													: traffic.traffic_class === 'unknown'
														? 'unknown'
														: 'bots'
									})}
								>
									{#if traffic.traffic_class === 'human'}<UserRound />{:else if traffic.traffic_class ===
										'internal_test'}<FlaskConical />{:else if traffic.traffic_class ===
										'unknown'}<CircleHelp />{:else}<Bot />{/if}
									<div>
										<strong>{classificationLabel(traffic.traffic_class)}</strong>
										<span>{traffic.profiles} profiles</span>
									</div>
									<b>{count(traffic.sessions)}</b>
								</a>
							{/each}
						</Card.Content>
					</Card.Root>
				</section>

				<Card.Root class="panel-card">
					<Card.Header class="section-heading">
						<div>
							<Card.Title>Recent real journeys</Card.Title>
							<Card.Description>Open a visit to see its meaningful path before raw evidence.</Card.Description>
						</div>
						<Button variant="outline" href={queryUrl({ view: 'journeys' })}
							>View all <ArrowRight /></Button
						>
					</Card.Header>
					<Card.Content class="journey-list">
						{#each data.sessions as session (session.session_id)}
							{@render journeyRow(session)}
						{/each}
						{#if data.sessions.length === 0}<div class="empty-state">
								<Route />
								<strong>No journeys match this scope</strong>
								<p>Try a longer window or inspect another traffic class.</p>
							</div>{/if}
					</Card.Content>
				</Card.Root>

				<details class="analyst-note">
					<summary>
						<div>
							<Sparkles />
							<span><strong>Optional cohort note</strong><small>Short, on-demand, and secondary to the evidence</small></span>
						</div>
						<ChevronRight />
					</summary>
					<div class="analyst-note-body">
						<div class="analyst-note-heading">
							<p>
								Summarize only this filtered cohort. When the sample is thin, the note should say
								so.
							</p>
							<Button
								onclick={generateSummary}
								disabled={noteBusy || Boolean(data.filters.search)}
								variant="outline"
							>
								{#if noteBusy}<RefreshCw class="animate-spin" />Working…{:else}<Sparkles />{analystNote
											?.summary_markdown
											? 'Refresh note'
											: 'Generate note'}{/if}
							</Button>
						</div>
						{#if data.filters.search}
							<div class="note-error">
								<ShieldCheck />Clear the person or session search to keep direct identifiers out of
								AI notes.
							</div>
						{:else if noteError}
							<div class="note-error"><CircleX />{noteError}</div>
						{:else if analystNote?.status === 'error'}
							<div class="note-error"><CircleX />{analystNote.error_message}</div>
						{:else if analystNote?.summary_markdown}
							<div class="note-copy">
								{#each summaryLines(analystNote.summary_markdown) as line}
									{#if line.kind === 'heading'}<h3>{line.text}</h3>
									{:else if line.kind === 'bullet'}<p><span>•</span>{line.text}</p>
									{:else}<p>{line.text}</p>{/if}
								{/each}
							</div>
							<small class="note-meta"
								>{analystNote.model} · {duration(analystNote.duration_ms)} · {date(
									analystNote.completed_at
								)}</small
							>
						{:else if !noteBusy}
							<div class="empty-small">No note has been generated for this exact scope.</div>
						{/if}
					</div>
				</details>
			{:else if data.filters.view === 'people'}
				<section class="people-map-grid">
					<Card.Root class="panel-card map-panel">
						<Card.Content class="map-card-content">
							<CountryMap
								rows={data.countryOptions}
								{countryHref}
								title="People on the map"
								description="Aggregated by country. Select a country to filter the profile list."
							/>
						</Card.Content>
					</Card.Root>
				</section>

				<Card.Root class="panel-card">
					<Card.Header class="section-heading">
						<div>
							<Card.Title>Profiles</Card.Title>
							<Card.Description
								>UID is the key for signed-in learners; browser ID is the anonymous
								fallback.</Card.Description
							>
						</div>
						<Badge variant="secondary">{data.people.length} shown</Badge>
					</Card.Header>
					<Card.Content class="person-list">
						{#each data.people as person (person.actor_key)}
							{@render personCard(person)}
						{/each}
						{#if data.people.length === 0}<div class="empty-state">
								<UsersRound />
								<strong>No profiles match this scope</strong>
								<p>Clear a country or identity filter, or inspect another audience.</p>
							</div>{/if}
					</Card.Content>
				</Card.Root>
			{:else if data.filters.view === 'journeys'}
				{#if data.topJourneyPatterns.length}
					<section class="pattern-strip" aria-label="Most common paths">
						{#each data.topJourneyPatterns.slice(0, 4) as pattern}
							<div><Route /><span>{pattern.pattern}</span><strong>{pattern.sessions}</strong></div>
						{/each}
					</section>
				{/if}
				<Card.Root class="panel-card">
					<Card.Header class="section-heading">
						<div>
							<Card.Title>Visit history</Card.Title>
							<Card.Description
								>Newest first. Paths collapse repeated page types; raw actions stay in the
								drill-down.</Card.Description
							>
						</div>
						<Badge variant="secondary">{data.sessions.length} shown</Badge>
					</Card.Header>
					<Card.Content class="journey-list journey-list-full">
						{#each data.sessions as session (session.session_id)}
							{@render journeyRow(session)}
						{/each}
						{#if data.sessions.length === 0}<div class="empty-state">
								<Route />
								<strong>No journeys match this scope</strong>
								<p>Try a longer window or include another traffic type.</p>
							</div>{/if}
					</Card.Content>
				</Card.Root>
			{:else}
				<section class="metric-grid model-metrics">
					<article class="metric-card">
						<div><BrainCircuit /></div><span>Runs</span><strong>{count(
								data.modelSummary.runs
							)}</strong><p>learner-facing checks in scope</p>
					</article>
					<article class="metric-card">
						<div><CheckCircle2 /></div><span>Successful</span><strong
							>{count(data.modelSummary.successes)}</strong
						><p>{percent(data.modelSummary.successes, data.modelSummary.runs)} success rate</p>
					</article>
					<article class="metric-card">
						<div><Gauge /></div><span>Average latency</span><strong
							>{duration(data.modelSummary.average_duration_ms)}</strong
						><p>mean across completed and failed runs</p>
					</article>
					<article class="metric-card">
						<div><CircleX /></div><span>Failures</span><strong
							>{count(data.modelSummary.failures)}</strong
						><p>{money(data.modelSummary.cost_usd)} total cost</p>
					</article>
				</section>

				<section class="models-grid">
					<Card.Root class="panel-card">
						<Card.Header>
							<Card.Title>Health by feature</Card.Title>
							<Card.Description>Volume, failures, and latency—not generated commentary.</Card.Description>
						</Card.Header>
						<Card.Content class="feature-list">
							{#each data.modelFeatures as feature}
								<div>
									<div>
										<strong>{feature.feature}</strong>
										<span>{feature.runs} runs · {feature.failures} failed</span>
									</div>
									<b>{duration(feature.average_duration_ms)}</b>
								</div>
							{/each}
							{#if data.modelFeatures.length === 0}<div class="empty-small"
									>No model features in scope.</div
								>{/if}
						</Card.Content>
					</Card.Root>
					<Card.Root class="panel-card">
						<Card.Header>
							<Card.Title>How to read this</Card.Title>
							<Card.Description>Model evidence is operational, not the product overview.</Card.Description>
						</Card.Header>
						<Card.Content class="reading-list">
							<p><CheckCircle2 />Start with failures and latency by feature.</p>
							<p><UsersRound />Open the linked visit to see what the learner did around a check.</p>
							<p><ShieldCheck />Prompt, output, and reasoning remain collapsed until requested.</p>
						</Card.Content>
					</Card.Root>
				</section>

				<Card.Root class="panel-card">
					<Card.Header class="section-heading">
						<div>
							<Card.Title>Recent model runs</Card.Title>
							<Card.Description>Open one run for raw prompt, response, and audit evidence.</Card.Description>
						</div>
						<Badge variant="secondary">{data.modelRuns.length} shown</Badge>
					</Card.Header>
					<Card.Content class="run-list">
						{#each data.modelRuns as run (run.run_id)}
							<a href={queryUrl({ run: String(run.run_id), session: null, person: null })}>
								<div class="run-status" class:run-failed={run.status !== 'success'}>
									{#if run.status === 'success'}<CheckCircle2 />{:else}<AlertTriangle />{/if}
								</div>
								<div class="min-w-0">
									<strong>{run.feature}</strong>
									<span>{run.model} · {run.path}</span>
								</div>
								<div>
									<strong>{duration(run.duration_ms)}</strong>
									<span>{date(run.started_at)}</span>
								</div>
								<Badge variant={run.status === 'success' ? 'secondary' : 'destructive'}
									>{run.status}</Badge
								>
								<ChevronRight />
							</a>
						{/each}
						{#if data.modelRuns.length === 0}<div class="empty-state">
								<BrainCircuit />
								<strong>No model runs match this scope</strong>
								<p>Try a longer window or another audience.</p>
							</div>{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</main>
	</div>
</div>

<Sheet.Root bind:open={personOpen} onOpenChange={closePerson}>
	<Sheet.Content class="detail-sheet" side="right">
		{#if data.selectedPerson}
			<Sheet.Header>
				<div class="sheet-kicker">Person history</div>
				<Sheet.Title>{personName(data.selectedPerson)}</Sheet.Title>
				<Sheet.Description>{personDetail(data.selectedPerson)}</Sheet.Description>
			</Sheet.Header>
			<div class="sheet-body">
				<section class="detail-summary-grid">
					<div><Activity /><span>Visits</span><strong>{count(data.selectedPerson.sessions)}</strong></div>
					<div><Clock3 /><span>Visible</span><strong>{duration(data.selectedPerson.engaged_ms)}</strong></div>
					<div><MousePointerClick /><span>Page views</span><strong
							>{count(data.selectedPerson.page_views)}</strong
						></div>
					<div><UserRound /><span>Identity</span><strong
							>{data.selectedPerson.actor_kind === 'user' ? 'Signed in' : 'Anonymous browser'}</strong
						></div>
				</section>

				<section class="classification-control">
					<div>
						<strong>Traffic classification</strong>
						<p>
							{classificationLabel(data.selectedPerson.traffic_class)} · {data.selectedPerson
								.traffic_source || 'automatic'}
						</p>
					</div>
					<div>
						{#if data.selectedPerson.traffic_class === 'internal_test'}
							<form method="POST" action={`${queryUrl({})}&/classifyActor`}>
								<input type="hidden" name="actorKey" value={data.selectedPerson.actor_key} />
								<input type="hidden" name="classification" value="human" />
								<Button type="submit" variant="outline"><UserRound />Treat as person</Button>
							</form>
						{:else}
							<form method="POST" action={`${queryUrl({})}&/classifyActor`}>
								<input type="hidden" name="actorKey" value={data.selectedPerson.actor_key} />
								<input type="hidden" name="classification" value="internal_test" />
								<Button type="submit" variant="outline"><FlaskConical />Mark internal/test</Button>
							</form>
						{/if}
						{#if data.selectedPerson.traffic_source === 'manual_override'}
							<form method="POST" action={`${queryUrl({})}&/classifyActor`}>
								<input type="hidden" name="actorKey" value={data.selectedPerson.actor_key} />
								<input type="hidden" name="classification" value="clear" />
								<Button type="submit" variant="ghost">Clear override</Button>
							</form>
						{/if}
					</div>
				</section>

				<section>
					<div class="detail-section-heading">
						<div><span class="eyebrow">Visit history</span><h3>Sessions in this window</h3></div>
						<Badge variant="secondary">{data.personSessions.length}</Badge>
					</div>
					<div class="person-session-list">
						{#each data.personSessions as session}
							<a
								href={queryUrl({
									view: 'journeys',
									session: String(session.session_id),
									person: null
								})}
							>
								<div><strong>{date(session.started_at, true)}</strong><span
										>{session.path_sequence}</span
									></div>
								<div><strong>{duration(session.engaged_ms)}</strong><span
										>{session.page_view_count} views</span
									></div>
								<ChevronRight />
							</a>
						{/each}
					</div>
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={sessionOpen} onOpenChange={closeSession}>
	<Sheet.Content class="detail-sheet journey-sheet" side="right">
		{#if data.selectedSession}
			<Sheet.Header>
				<div class="sheet-kicker">Journey</div>
				<Sheet.Title>{personName(data.selectedSession)}</Sheet.Title>
				<Sheet.Description
					>{date(data.selectedSession.started_at, true)} · {duration(
						data.selectedSession.engaged_ms
					)} visible</Sheet.Description
				>
			</Sheet.Header>
			<div class="sheet-body">
				{#if sessionRoute.length}
					<div class="route-ribbon">
						{#each sessionRoute as step, index}
							<span>{step}</span>{#if index < sessionRoute.length - 1}<ChevronRight />{/if}
						{/each}
					</div>
				{/if}
				<section class="detail-summary-grid">
					<div><UserRound /><span>Identity</span><strong>{personDetail(data.selectedSession)}</strong></div>
					<div><Laptop2 /><span>Device</span><strong
							>{data.selectedSession.device_type || 'device'} · {data.selectedSession.browser_name ||
								'browser'}</strong
						></div>
					<div><MapPin /><span>Location</span><strong
							>{[data.selectedSession.region, data.selectedSession.country]
								.filter(Boolean)
								.join(', ') || 'Unknown'}</strong
						></div>
					<div><Activity /><span>Activity</span><strong
							>{data.selectedSession.page_view_count} views · {duration(
								data.selectedSession.engaged_ms
							)}</strong
						></div>
				</section>

				<div class="detail-actions">
					<Button
						variant="outline"
						href={queryUrl({
							view: 'people',
							person: String(data.selectedSession.actor_key),
							session: null
						})}
						><UsersRound />Open person history</Button
					>
					<Badge variant="outline"
						>{classificationLabel(data.selectedSession.effective_traffic_class)}</Badge
					>
				</div>
				<Separator />
				<section>
					<div class="detail-section-heading">
						<div><span class="eyebrow">Meaningful activity</span><h3>Journey timeline</h3></div>
						<Badge variant="secondary">{semanticJourney.length} milestones</Badge>
					</div>
					<div class="semantic-timeline">
						{#each semanticJourney as item}
							<article class:timeline-error={item.kind === 'error'} class:timeline-model={item.kind === 'model'}>
								<div class="semantic-icon">
									{#if item.kind === 'page'}<Globe2 />{:else if item.kind === 'edit'}<MousePointerClick
										/>{:else if item.kind === 'model'}<BrainCircuit />{:else if item.kind === 'error'}<AlertTriangle
										/>{:else}<ChevronRight />{/if}
								</div>
								<div>
									<div><strong>{item.title}</strong><time>{date(item.time)}</time></div>
									<p>{item.detail}</p>
									{#if item.meta}<small>{item.meta}</small>{/if}
								</div>
							</article>
						{/each}
						{#if semanticJourney.length === 0}<div class="empty-small"
								>No semantic events recorded.</div
							>{/if}
					</div>
				</section>

				<details class="raw-evidence">
					<summary><Network />Raw events and request evidence <Badge variant="outline"
							>{data.events.length}</Badge
						></summary>
					<div>
						{#each data.events as event}
							<details>
								<summary
									><span>{event.event_type}</span><code>{event.path}</code><time
										>{date(event.occurred_at)}</time
									></summary
								>
								<pre>{pretty(event)}</pre>
							</details>
						{/each}
					</div>
				</details>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={runOpen} onOpenChange={closeRun}>
	<Sheet.Content class="detail-sheet" side="right">
		{#if data.selectedRun}
			<Sheet.Header>
				<div class="sheet-kicker">Model run</div>
				<Sheet.Title>{data.selectedRun.feature}</Sheet.Title>
				<Sheet.Description
					>{data.selectedRun.model} · {date(data.selectedRun.started_at, true)} · {duration(
						data.selectedRun.duration_ms
					)}</Sheet.Description
				>
			</Sheet.Header>
			<div class="sheet-body">
				<section class="detail-summary-grid">
					<div><Gauge /><span>Status</span><strong>{data.selectedRun.status}</strong></div>
					<div><Clock3 /><span>Latency</span><strong>{duration(data.selectedRun.duration_ms)}</strong></div>
					<div><BrainCircuit /><span>Reasoning</span><strong
							>{data.selectedRun.thinking_level || 'Default'}</strong
						></div>
					<div><UserRound /><span>Person</span><strong
							>{data.selectedRun.user_email || short(data.selectedRun.anonymous_id, 20)}</strong
						></div>
				</section>
				{#if data.selectedRun.session_id}
					<Button
						variant="outline"
						href={queryUrl({
							view: 'journeys',
							session: String(data.selectedRun.session_id),
							run: null
						})}
						>Open linked journey <ExternalLink /></Button
					>
				{/if}
				{#if data.selectedRun.error_message}
					<div class="model-error"><AlertTriangle /><div><strong>{data.selectedRun.error_name}</strong><p
								>{data.selectedRun.error_message}</p
							></div></div
					>
				{/if}
				<details class="model-evidence">
					<summary>Model response</summary>
					<pre>{data.selectedRun.output_text || 'No response recorded.'}</pre>
				</details>
				<details class="model-evidence">
					<summary>Raw prompt</summary>
					<pre>{data.selectedRun.prompt_text || 'No prompt recorded.'}</pre>
				</details>
				<details class="model-evidence">
					<summary>Provider reasoning</summary>
					<pre>{data.selectedRun.reasoning_text || 'No reasoning was returned.'}</pre>
				</details>
				<details class="model-evidence">
					<summary>Usage and metadata</summary>
					<pre>{pretty({
							usage: data.selectedRun.usage_json,
							costUsd: data.selectedRun.cost_usd,
							modelInput: data.selectedRun.model_input_json,
							metadata: data.selectedRun.metadata_json,
							cloudflare: data.selectedRun.cf_json
						})}</pre>
				</details>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
