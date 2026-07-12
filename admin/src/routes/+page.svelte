<script lang="ts">
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Activity,
		BrainCircuit,
		Clock3,
		ExternalLink,
		Filter,
		Gauge,
		Globe2,
		Images,
		Laptop2,
		LogOut,
		MousePointerClick,
		Network,
		PanelLeft,
		Route,
		RefreshCw,
		Search,
		Sparkles,
		UserRound,
		UsersRound
	} from '@lucide/svelte';

	let { data }: PageProps = $props();
	let activeTab = $state<'journeys' | 'models'>('journeys');
	let sessionOpen = $state(untrack(() => Boolean(data.selectedSession)));
	let runOpen = $state(untrack(() => Boolean(data.selectedRun)));
	let environmentFilter = $state(untrack(() => data.filters.environment));
	let identityFilter = $state(untrack(() => data.filters.identity));
	let aiSummary = $state<Record<string, string | number | null> | null>(
		untrack(() => data.latestSummary)
	);
	let summaryBusy = $state(
		untrack(() => aiSummary?.status === 'queued' || aiSummary?.status === 'running')
	);
	const metrics = $derived([
		{ label: 'Sessions', value: data.summary.sessions, icon: Activity },
		{ label: 'Known users', value: data.summary.authenticated_users, icon: UserRound },
		{ label: 'Visitors', value: data.summary.anonymous_visitors, icon: UsersRound },
		{ label: 'Page views', value: data.summary.page_views, icon: Globe2 },
		{ label: 'Events', value: data.summary.events, icon: MousePointerClick },
		{ label: 'Engaged time', value: duration(data.summary.engaged_ms), icon: Clock3 }
	]);

	$effect(() => {
		if (data.selectedSession) sessionOpen = true;
		if (data.selectedRun) runOpen = true;
	});

	function duration(value: unknown): string {
		const milliseconds = Number(value || 0);
		if (milliseconds < 1_000) return `${milliseconds}ms`;
		const totalSeconds = Math.round(milliseconds / 1_000);
		if (totalSeconds < 60) return `${totalSeconds}s`;
		const minutes = Math.floor(totalSeconds / 60);
		return `${minutes}m ${totalSeconds % 60}s`;
	}

	function date(value: unknown): string {
		return typeof value === 'string' ? new Date(value).toLocaleString() : '—';
	}

	function short(value: unknown, length = 12): string {
		const text = String(value || '');
		return text.length > length ? `${text.slice(0, length)}…` : text || '—';
	}

	function queryUrl(overrides: Record<string, string | null>): string {
		const params = new URLSearchParams();
		params.set('days', String(data.filters.days));
		if (data.filters.search) params.set('q', data.filters.search);
		if (data.filters.path) params.set('path', data.filters.path);
		if (data.filters.eventType) params.set('type', data.filters.eventType);
		if (data.filters.environment !== 'all') params.set('environment', data.filters.environment);
		if (data.filters.identity !== 'all') params.set('identity', data.filters.identity);
		for (const [key, value] of Object.entries(overrides)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		return `/?${params}`;
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

	function environmentLabel(value: string): string {
		return value === 'all' ? 'All traffic' : value === 'production' ? 'Production' : 'Development';
	}

	function summaryLines(value: unknown) {
		return String(value || '')
			.split('\n')
			.map((line) => {
				if (line.startsWith('## ')) return { kind: 'heading', text: line.slice(3) };
				if (/^[-*] /.test(line)) return { kind: 'bullet', text: line.slice(2) };
				return { kind: line.trim() ? 'text' : 'space', text: line };
			});
	}

	async function pollSummary(summaryId: string) {
		for (let attempt = 0; attempt < 180; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 2_000));
			const response = await fetch(`/api/summaries/${summaryId}`);
			if (!response.ok) break;
			aiSummary = (await response.json()) as Record<string, string | number | null>;
			if (aiSummary?.status === 'complete' || aiSummary?.status === 'error') {
				summaryBusy = false;
				return;
			}
		}
		summaryBusy = false;
	}

	async function generateSummary() {
		if (summaryBusy) return;
		summaryBusy = true;
		const response = await fetch('/api/summaries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ environment: data.filters.environment, days: data.filters.days })
		});
		if (!response.ok) {
			summaryBusy = false;
			return;
		}
		const job = (await response.json()) as { summaryId: string; status: string };
		aiSummary = { summary_id: job.summaryId, status: job.status };
		void pollSummary(job.summaryId);
	}

	onMount(() => {
		if (
			aiSummary?.summary_id &&
			(aiSummary.status === 'queued' || aiSummary.status === 'running')
		) {
			void pollSummary(String(aiSummary.summary_id));
		}
	});
</script>

<svelte:head><title>Journey explorer · Question Constellation</title></svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<aside class="fixed inset-y-0 left-0 z-20 hidden w-60 border-r bg-card lg:flex lg:flex-col">
		<div class="flex h-16 items-center gap-3 border-b px-5">
			<div
				class="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
			>
				<Sparkles class="size-4" />
			</div>
			<div>
				<p class="text-sm font-semibold">Constellation</p>
				<p class="text-xs text-muted-foreground">Internal analytics</p>
			</div>
		</div>
		<nav class="space-y-1 p-3">
			<button
				class:active-nav={activeTab === 'journeys'}
				class="nav-item"
				onclick={() => (activeTab = 'journeys')}><Route />Journeys</button
			>
			<button
				class:active-nav={activeTab === 'models'}
				class="nav-item"
				onclick={() => (activeTab = 'models')}
				><BrainCircuit />Model runs <Badge variant="secondary" class="ml-auto"
					>{data.modelRunCount}</Badge
				></button
			>
			<a class="nav-item" href="/experiments/gallery"><Images />Flow gallery</a>
		</nav>
		<div class="mt-auto space-y-3 border-t p-4 text-xs text-muted-foreground">
			<div class="flex items-center gap-2">
				<span class="size-2 rounded-full bg-emerald-500"></span>Live D1 connection
			</div>
			<div class="truncate">Signed in as {data.adminUser?.name || data.adminIdentity}</div>
			<a class="flex items-center gap-2 hover:text-foreground" href="/auth/logout"
				><LogOut class="size-3.5" />Sign out</a
			>
		</div>
	</aside>

	<div class="lg:pl-60">
		<header
			class="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:px-6"
		>
			<div class="flex items-center gap-3">
				<PanelLeft class="size-5 lg:hidden" />
				<div>
					<h1 class="text-base font-semibold">Journey explorer</h1>
					<p class="text-xs text-muted-foreground">
						Understand what one person actually experienced
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon-sm"
					href="/experiments/gallery"
					aria-label="Open flow gallery"
					class="lg:hidden"><Images /></Button
				>
				<Badge variant={data.filters.environment === 'production' ? 'default' : 'secondary'}
					>{environmentLabel(data.filters.environment)}</Badge
				><Badge variant="outline">Last {data.filters.days} days</Badge><Button
					variant="ghost"
					size="icon-sm"
					href="/auth/logout"
					aria-label="Sign out"><LogOut /></Button
				>
			</div>
		</header>

		<main class="mx-auto max-w-[1680px] space-y-6 p-4 md:p-6">
			<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
				{#each metrics as metric}
					<Card.Root size="sm"
						><Card.Header class="!flex flex-row items-center justify-between"
							><Card.Description>{metric.label}</Card.Description><metric.icon
								class="size-4 text-muted-foreground"
							/></Card.Header
						><Card.Content
							><p class="text-2xl font-semibold tracking-tight">{metric.value}</p></Card.Content
						></Card.Root
					>
				{/each}
			</section>

			<Card.Root size="sm">
				<Card.Content>
					<form
						method="GET"
						class="grid gap-3 md:grid-cols-2 xl:grid-cols-[130px_150px_minmax(180px,1fr)_minmax(160px,1fr)_190px_auto_auto]"
					>
						<label class="field-label"
							>Window<select class="native-select" name="days" value={data.filters.days}
								><option value="1">24 hours</option><option value="7">7 days</option><option
									value="30">30 days</option
								><option value="90">90 days</option><option value="365">1 year</option></select
							></label
						>
						<label class="field-label"
							>Traffic<Select.Root type="single" name="environment" bind:value={environmentFilter}
								><Select.Trigger class="mt-1 w-full"
									>{environmentLabel(environmentFilter)}</Select.Trigger
								><Select.Content
									><Select.Item value="all">All traffic</Select.Item><Select.Item value="production"
										>Production</Select.Item
									><Select.Item value="development">Development</Select.Item></Select.Content
								></Select.Root
							></label
						>
						<label class="field-label"
							>Identity, IP or session
							<div class="relative mt-1">
								<Search class="absolute top-2.5 left-2.5 size-4 text-muted-foreground" /><Input
									class="pl-8"
									name="q"
									value={data.filters.search}
									placeholder="Email, uid, IP…"
								/>
							</div></label
						>
						<label class="field-label"
							>Path contains<Input
								class="mt-1"
								name="path"
								value={data.filters.path}
								placeholder="/questions/…"
							/></label
						>
						<label class="field-label"
							>People<Select.Root type="single" name="identity" bind:value={identityFilter}
								><Select.Trigger class="mt-1 w-full"
									>{identityFilter === 'all'
										? 'Everyone'
										: identityFilter === 'authenticated'
											? 'Logged in'
											: 'Anonymous'}</Select.Trigger
								><Select.Content
									><Select.Item value="all">Everyone</Select.Item><Select.Item value="authenticated"
										>Logged in</Select.Item
									><Select.Item value="anonymous">Anonymous</Select.Item></Select.Content
								></Select.Root
							></label
						>
						<Button type="submit" class="self-end"><Filter />Apply</Button>
						<Button variant="ghost" href="/" class="self-end">Reset</Button>
					</form>
				</Card.Content>
			</Card.Root>

			<Card.Root class="border-primary/15 bg-gradient-to-br from-card to-primary/[0.025]">
				<Card.Header class="!flex flex-row items-start justify-between gap-4">
					<div class="flex gap-3">
						<div
							class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
						>
							<BrainCircuit class="size-5" />
						</div>
						<div>
							<Card.Title>AI overview</Card.Title><Card.Description
								>GPT-5.6 Sol reviews this exact traffic window and separates evidence from
								inference.</Card.Description
							>
						</div>
					</div>
					<Button onclick={generateSummary} disabled={summaryBusy}
						>{#if summaryBusy}<RefreshCw class="animate-spin" />Working…{:else}<Sparkles
							/>{aiSummary?.summary_markdown ? 'Regenerate' : 'Generate overview'}{/if}</Button
					>
				</Card.Header>
				<Card.Content>
					{#if summaryBusy}<div class="space-y-3 rounded-lg border bg-muted/30 p-5">
							<div class="h-4 w-2/3 animate-pulse rounded bg-muted"></div>
							<div class="h-3 w-full animate-pulse rounded bg-muted"></div>
							<div class="h-3 w-5/6 animate-pulse rounded bg-muted"></div>
							<p class="pt-2 text-xs text-muted-foreground">
								The job is running after the request under Cloudflare waitUntil. This page will
								refresh the card automatically.
							</p>
						</div>
					{:else if aiSummary?.status === 'error'}<div
							class="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
						>
							<p class="font-medium text-destructive">Summary failed</p>
							<p class="mt-1 text-sm text-muted-foreground">{aiSummary.error_message}</p>
						</div>
					{:else if aiSummary?.summary_markdown}<div class="ai-summary">
							{#each summaryLines(aiSummary.summary_markdown) as line}{#if line.kind === 'heading'}<h3
									>
										{line.text}
									</h3>{:else if line.kind === 'bullet'}<li>
										{line.text}
									</li>{:else if line.kind === 'space'}<div class="h-1"></div>{:else}<p>
										{line.text}
									</p>{/if}{/each}
						</div>
						<div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<Badge variant="outline">{aiSummary.model}</Badge><span
								>{duration(aiSummary.duration_ms)}</span
							><span>{date(aiSummary.completed_at)}</span><span
								>{aiSummary.environment} · {aiSummary.window_days} days</span
							>
						</div>
						<details class="mt-3">
							<summary>Summary prompt, reasoning and source snapshot</summary>
							<pre>{pretty({
									prompt: aiSummary.prompt_text,
									reasoning: aiSummary.reasoning_text,
									usage: aiSummary.usage_json,
									source: aiSummary.source_snapshot_json
								})}</pre>
						</details>
					{:else}<div class="rounded-lg border border-dashed p-6 text-center">
							<p class="text-sm font-medium">No overview for this scope yet</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Generate one after collecting a representative journey. The source snapshot is
								stored with the result for auditability.
							</p>
						</div>{/if}
				</Card.Content>
			</Card.Root>

			<Tabs.Root bind:value={activeTab}>
				<Tabs.List class="lg:hidden"
					><Tabs.Trigger value="journeys">Journeys</Tabs.Trigger><Tabs.Trigger value="models"
						>Model runs</Tabs.Trigger
					></Tabs.List
				>

				<Tabs.Content value="journeys" class="space-y-4">
					<div class="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
						<Card.Root class="min-w-0">
							<Card.Header class="!flex flex-row items-center justify-between"
								><div>
									<Card.Title>Sessions</Card.Title><Card.Description
										>Newest activity first · select a row for the complete story</Card.Description
									>
								</div>
								<Badge variant="secondary">{data.sessions.length} shown</Badge></Card.Header
							>
							<Card.Content class="px-0"
								><Table.Root
									><Table.Header
										><Table.Row
											><Table.Head>Last seen</Table.Head><Table.Head>Person</Table.Head><Table.Head
												>Landing</Table.Head
											><Table.Head>Context</Table.Head><Table.Head class="text-right"
												>Activity</Table.Head
											></Table.Row
										></Table.Header
									><Table.Body>
										{#each data.sessions as session (session.session_id)}
											<Table.Row
												class="cursor-pointer"
												onclick={() =>
													goto(queryUrl({ session: String(session.session_id), run: null }))}
											>
												<Table.Cell
													><p class="font-medium">{date(session.last_seen_at)}</p>
													<p class="mono-muted" title={String(session.session_id)}>
														{short(session.session_id)}
													</p>
													<Badge
														class="mt-2"
														variant={session.environment === 'production' ? 'default' : 'outline'}
														>{session.environment}</Badge
													></Table.Cell
												>
												<Table.Cell
													><p class="font-medium">{session.user_email || 'Anonymous visitor'}</p>
													<p class="mono-muted">
														{session.user_id
															? short(session.user_id, 24)
															: `anon ${short(session.anonymous_id)}`}
													</p>
													<p class="mono-muted">
														{session.ip_address || 'IP unavailable'}
													</p></Table.Cell
												>
												<Table.Cell
													><p class="max-w-64 truncate font-medium">
														{session.initial_path || '/'}
													</p>
													<p class="max-w-64 truncate text-xs text-muted-foreground">
														{session.initial_referrer || 'Direct / unknown'}
													</p></Table.Cell
												>
												<Table.Cell
													><p>
														{[session.city, session.region, session.country]
															.filter(Boolean)
															.join(', ') || 'Unknown place'}
													</p>
													<p class="text-xs text-muted-foreground">
														{session.browser_name || 'Browser'} · {session.operating_system || 'OS'} ·
														{session.device_type || 'device'}
													</p>
													<p class="text-xs text-muted-foreground">
														{session.connection_effective_type || 'network unknown'} · {session.connection_rtt_ms ??
															'?'}ms RTT
													</p></Table.Cell
												>
												<Table.Cell class="text-right"
													><p class="font-medium">
														{session.page_view_count} views · {session.event_count} events
													</p>
													<p class="text-xs text-muted-foreground">
														{duration(session.engaged_ms)} engaged
													</p></Table.Cell
												>
											</Table.Row>
										{/each}
										{#if data.sessions.length === 0}<Table.Row
												><Table.Cell colspan={5} class="h-32 text-center text-muted-foreground"
													>No sessions match these filters.</Table.Cell
												></Table.Row
											>{/if}
									</Table.Body></Table.Root
								></Card.Content
							>
						</Card.Root>

						<Card.Root>
							<Card.Header
								><Card.Title>Top pages</Card.Title><Card.Description
									>Where people spent this window</Card.Description
								></Card.Header
							>
							<Card.Content class="space-y-1"
								>{#each data.topPages as page, index}<div
										class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
									>
										<span class="flex size-6 items-center justify-center rounded bg-muted text-xs"
											>{index + 1}</span
										>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{page.path}</p>
											<p class="text-xs text-muted-foreground">{page.visitors} visitors</p>
										</div>
										<Badge variant="secondary">{page.views}</Badge>
									</div>{/each}</Card.Content
							>
						</Card.Root>
					</div>
				</Tabs.Content>

				<Tabs.Content value="models">
					<Card.Root>
						<Card.Header class="!flex flex-row items-center justify-between"
							><div>
								<Card.Title>Model rollout</Card.Title><Card.Description
									>Prompt, reasoning, response, latency, usage and failure context</Card.Description
								>
							</div>
							<Badge variant="secondary">{data.modelRuns.length} runs</Badge></Card.Header
						>
						<Card.Content class="px-0"
							><Table.Root
								><Table.Header
									><Table.Row
										><Table.Head>Started</Table.Head><Table.Head>Feature / person</Table.Head
										><Table.Head>Model</Table.Head><Table.Head>Status</Table.Head><Table.Head
											class="text-right">Latency / cost</Table.Head
										></Table.Row
									></Table.Header
								><Table.Body>
									{#each data.modelRuns as run (run.run_id)}<Table.Row
											class="cursor-pointer"
											onclick={() => goto(queryUrl({ run: String(run.run_id), session: null }))}
											><Table.Cell
												><p class="font-medium">{date(run.started_at)}</p>
												<p class="mono-muted">{short(run.run_id)}</p>
												<Badge
													class="mt-2"
													variant={run.environment === 'production' ? 'default' : 'outline'}
													>{run.environment}</Badge
												></Table.Cell
											><Table.Cell
												><p class="font-medium">{run.feature}</p>
												<p class="text-xs text-muted-foreground">
													{run.user_email ||
														(run.anonymous_id
															? `anon ${short(run.anonymous_id)}`
															: 'Unlinked request')}
												</p>
												<p class="text-xs text-muted-foreground">{run.path}</p></Table.Cell
											><Table.Cell
												><p class="font-medium">{run.model}</p>
												<p class="text-xs text-muted-foreground">
													{run.model_version || 'Version unavailable'} · reasoning {run.thinking_level ||
														'default'}
												</p></Table.Cell
											><Table.Cell
												><Badge variant={run.status === 'success' ? 'secondary' : 'destructive'}
													>{run.status}</Badge
												>{#if run.error_message}<p
														class="mt-2 max-w-72 truncate text-xs text-destructive"
													>
														{run.error_message}
													</p>{/if}</Table.Cell
											><Table.Cell class="text-right"
												><p class="font-medium">{duration(run.duration_ms)}</p>
												<p class="text-xs text-muted-foreground">
													{run.cost_usd === null
														? 'cost unavailable'
														: `$${Number(run.cost_usd).toFixed(5)}`}
												</p></Table.Cell
											></Table.Row
										>{/each}
									{#if data.modelRuns.length === 0}<Table.Row
											><Table.Cell colspan={5} class="h-32 text-center text-muted-foreground"
												>No model runs recorded in this traffic window.</Table.Cell
											></Table.Row
										>{/if}
								</Table.Body></Table.Root
							></Card.Content
						>
					</Card.Root>
				</Tabs.Content>
			</Tabs.Root>
		</main>
	</div>
</div>

<Sheet.Root bind:open={sessionOpen}>
	<Sheet.Content class="!w-[min(94vw,1080px)] !max-w-none overflow-y-auto" side="right">
		{#if data.selectedSession}
			<Sheet.Header
				><Sheet.Title>{data.selectedSession.user_email || 'Anonymous visitor'}</Sheet.Title
				><Sheet.Description
					>Session {data.selectedSession.session_id} · {date(data.selectedSession.started_at)} to {date(
						data.selectedSession.last_seen_at
					)}</Sheet.Description
				></Sheet.Header
			>
			<div class="grid gap-3 px-4 sm:grid-cols-2 xl:grid-cols-4">
				<div class="context-card">
					<UserRound /><span>Identity</span><strong
						>{data.selectedSession.user_id ||
							`anon ${short(data.selectedSession.anonymous_id, 24)}`}</strong
					>
				</div>
				<div class="context-card">
					<Laptop2 /><span>Device</span><strong
						>{data.selectedSession.browser_name} · {data.selectedSession.operating_system}<br
						/>{data.selectedSession.viewport_width} × {data.selectedSession.viewport_height}</strong
					>
				</div>
				<div class="context-card">
					<Network /><span>Network</span><strong
						>{data.selectedSession.connection_effective_type || 'Unknown type'} · {data
							.selectedSession.connection_downlink_mbps ?? '?'} Mbps<br />{data.selectedSession
							.connection_rtt_ms ?? '?'}ms RTT</strong
					>
				</div>
				<div class="context-card">
					<Globe2 /><span>Request</span><strong
						>{data.selectedSession.ip_address || 'IP unavailable'}<br />{[
							data.selectedSession.city,
							data.selectedSession.region,
							data.selectedSession.country
						]
							.filter(Boolean)
							.join(', ') || 'Unknown place'}</strong
					>
				</div>
			</div>
			<Separator />
			<div class="px-4 pb-8">
				<h3 class="mb-4 text-sm font-semibold">Journey timeline</h3>
				<div class="space-y-0">
					{#each data.journey as item (item.event_id || item.run_id)}
						{#if item.journey_kind === 'event'}
							{@const event = item}
							<article class="timeline-row">
								<div
									class:event-click={event.event_type === 'click'}
									class:event-input={event.event_type === 'input_change'}
									class:event-leave={event.event_type === 'page_leave'}
									class="timeline-dot"
								></div>
								<div class="min-w-0 flex-1 pb-5">
									<div class="flex flex-wrap items-center gap-2">
										<Badge variant="outline">{event.event_type}</Badge><span
											class="text-xs text-muted-foreground">{date(event.occurred_at)}</span
										><code class="ml-auto">{event.path}</code>
									</div>
									{#if event.element_text || event.element_selector}<p class="mt-2 text-sm">
											<b>{event.element_text || event.element_name || event.element_tag}</b>
											<code>{event.element_selector}</code>
										</p>{/if}{#if event.input_value !== null}<div
											class="mt-2 grid gap-2 rounded-md bg-muted p-3 text-xs sm:grid-cols-[120px_1fr_auto_1fr]"
										>
											<span class="font-medium">{event.input_name || event.input_type}</span><del
												class="whitespace-pre-wrap text-destructive"
												>{event.previous_value || '∅'}</del
											><span>→</span><ins class="whitespace-pre-wrap text-emerald-600 no-underline"
												>{event.input_value}</ins
											>
										</div>{/if}
									<div class="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
										{#if event.duration_ms !== null}<span
												>{duration(event.duration_ms)} on page</span
											>{/if}{#if event.engaged_ms !== null}<span
												>{duration(event.engaged_ms)} visible</span
											>{/if}{#if event.scroll_depth_percent !== null}<span
												>{event.scroll_depth_percent}% scroll</span
											>{/if}
									</div>
									<details class="mt-2">
										<summary>Raw event + Cloudflare request</summary>
										<pre>{pretty({
												event,
												properties: event.properties_json,
												cloudflare: event.request_cf_json,
												headers: event.headers_json
											})}</pre>
									</details>
								</div>
							</article>
						{:else}
							{@const run = item}
							<article class="timeline-row">
								<div class="timeline-dot event-model"></div>
								<div class="min-w-0 flex-1 pb-5">
									<div class="flex items-center gap-2">
										<Badge>model run</Badge><strong class="text-sm">{run.feature}</strong><span
											class="text-xs text-muted-foreground">{duration(run.duration_ms)}</span
										><Button
											class="ml-auto"
											size="xs"
											variant="outline"
											href={queryUrl({ run: String(run.run_id), session: null })}
											>Inspect <ExternalLink /></Button
										>
									</div>
									<p class="mt-2 text-xs text-muted-foreground">{run.model} · {run.status}</p>
								</div>
							</article>
						{/if}
					{/each}
				</div>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={runOpen}>
	<Sheet.Content class="!w-[min(94vw,980px)] !max-w-none overflow-y-auto" side="right">
		{#if data.selectedRun}
			<Sheet.Header
				><Sheet.Title>{data.selectedRun.feature}</Sheet.Title><Sheet.Description
					>{data.selectedRun.model} · {date(data.selectedRun.started_at)} · {duration(
						data.selectedRun.duration_ms
					)}</Sheet.Description
				></Sheet.Header
			>
			<div class="grid gap-3 px-4 sm:grid-cols-3">
				<div class="context-card">
					<Gauge /><span>Status</span><strong>{data.selectedRun.status}</strong>
				</div>
				<div class="context-card">
					<BrainCircuit /><span>Reasoning</span><strong
						>{data.selectedRun.thinking_level || 'Default'}<br />{data.selectedRun.model_version ||
							'Unknown version'}</strong
					>
				</div>
				<div class="context-card">
					<UserRound /><span>Person</span><strong
						>{data.selectedRun.user_email || data.selectedRun.anonymous_id || 'Unlinked'}<br />{data
							.selectedRun.path}</strong
					>
				</div>
			</div>
			<div class="space-y-4 px-4 pb-8">
				<section class="model-block">
					<h3>Raw prompt</h3>
					<pre>{data.selectedRun.prompt_text || 'No prompt recorded.'}</pre>
				</section>
				<section class="model-block">
					<h3>Reasoning</h3>
					<pre>{data.selectedRun.reasoning_text ||
							'No reasoning was returned by the provider.'}</pre>
				</section>
				<section class="model-block">
					<h3>Model response</h3>
					<pre>{data.selectedRun.output_text || 'No response recorded.'}</pre>
				</section>
				<section class="model-block">
					<h3>Usage and metadata</h3>
					<pre>{pretty({
							usage: data.selectedRun.usage_json,
							costUsd: data.selectedRun.cost_usd,
							modelInput: data.selectedRun.model_input_json,
							metadata: data.selectedRun.metadata_json,
							error: data.selectedRun.error_message,
							cloudflare: data.selectedRun.cf_json
						})}</pre>
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
