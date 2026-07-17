<script module lang="ts">
	export type CountryMapRow = {
		[key: string]: unknown;
		country?: string | null;
		profiles?: number | string | null;
		sessions?: number | string | null;
	};

	export type CountryMapProps = {
		rows?: readonly CountryMapRow[];
		countryHref?: (countryCode: string) => string;
		title?: string;
		description?: string;
		class?: string;
	};
</script>

<script lang="ts">
	import {
		BORDER_PATH,
		LAND_PATH,
		MAP_HEIGHT,
		MAP_VIEW_BOX,
		MAP_WIDTH,
		resolveCountry
	} from './country-map-geometry';

	type CountryTotal = {
		code: string;
		name: string;
		profiles: number;
		sessions: number;
		x: number | null;
		y: number | null;
		href?: string;
	};

	type MapPoint = Omit<CountryTotal, 'x' | 'y'> & {
		x: number;
		y: number;
		radius: number;
		showCode: boolean;
	};

	let {
		rows = [],
		countryHref,
		title = 'Profiles by country',
		description = 'Bubble area shows profiles; the list gives exact session totals.',
		class: className = ''
	}: CountryMapProps = $props();

	const componentId = $props.id();
	const titleId = `${componentId}-title`;
	const descriptionId = `${componentId}-description`;
	const mapDescriptionId = `${componentId}-map-description`;
	const numberFormat = new Intl.NumberFormat();
	const specialCountryNames: Record<string, string> = {
		T1: 'Tor network',
		XX: 'Unknown country'
	};

	let hoveredCode = $state<string | null>(null);
	let focusedCode = $state<string | null>(null);

	let countryTotals = $derived.by(() => {
		const totals = new Map<string, CountryTotal>();

		for (const row of rows) {
			const rawCountry = String(row.country ?? '').trim();
			if (!rawCountry) continue;

			const resolved = resolveCountry(rawCountry);
			const rawCode = rawCountry.toUpperCase();
			const code = resolved?.code ?? rawCode;
			const existing = totals.get(code);
			const profiles = count(row.profiles);
			const sessions = count(row.sessions);

			if (existing) {
				existing.profiles += profiles;
				existing.sessions += sessions;
				continue;
			}

			const href =
				countryHref && resolved
					? countryHref(resolved.code)
					: countryHref && /^[A-Z]{2}$/.test(rawCode) && !specialCountryNames[rawCode]
						? countryHref(rawCode)
						: undefined;

			totals.set(code, {
				code,
				name: resolved?.name ?? specialCountryNames[rawCode] ?? rawCountry,
				profiles,
				sessions,
				x: resolved?.x ?? null,
				y: resolved?.y ?? null,
				href: href || undefined
			});
		}

		return [...totals.values()].sort(
			(left, right) =>
				right.profiles - left.profiles ||
				right.sessions - left.sessions ||
				left.name.localeCompare(right.name)
		);
	});

	let totalProfiles = $derived(countryTotals.reduce((sum, country) => sum + country.profiles, 0));
	let totalSessions = $derived(countryTotals.reduce((sum, country) => sum + country.sessions, 0));
	let maximumProfiles = $derived(Math.max(1, ...countryTotals.map((country) => country.profiles)));
	let mapPoints = $derived(
		countryTotals
			.filter(
				(country): country is CountryTotal & { x: number; y: number } =>
					country.x !== null && country.y !== null && country.profiles > 0
			)
			.map<MapPoint>((country, index) => {
				const radius = Math.max(4, 25 * Math.sqrt(country.profiles / maximumProfiles));
				return {
					...country,
					radius,
					showCode: index < 8 && radius >= 10
				};
			})
	);
	let activeCode = $derived(focusedCode ?? hoveredCode);
	let activePoint = $derived(mapPoints.find((country) => country.code === activeCode));

	function count(value: number | string | null | undefined): number {
		const parsed = Number(value ?? 0);
		return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
	}

	function formatCount(value: number): string {
		return numberFormat.format(value);
	}

	function plural(value: number, singular: string): string {
		return value === 1 ? singular : `${singular}s`;
	}

	function accessibleLabel(country: CountryTotal): string {
		const action = country.href ? '. Filter to this country' : '';
		return `${country.name}: ${formatCount(country.profiles)} ${plural(country.profiles, 'profile')}, ${formatCount(country.sessions)} ${plural(country.sessions, 'session')}${action}`;
	}

	function tooltipX(x: number): number {
		return Math.max(8, Math.min(MAP_WIDTH - 228, x - 110));
	}

	function tooltipY(y: number): number {
		return y < 86 ? y + 22 : Math.max(8, y - 78);
	}
</script>

{#snippet marker(point: MapPoint)}
	<title>{accessibleLabel(point)}</title>
	<circle class="bubble-target" cx={point.x} cy={point.y} r={Math.max(16, point.radius + 5)} />
	<circle class="bubble-halo" cx={point.x} cy={point.y} r={point.radius + 4} />
	<circle class="bubble" cx={point.x} cy={point.y} r={point.radius} />
	{#if point.showCode}
		<text class="bubble-code" x={point.x} y={point.y + 0.5}>{point.code}</text>
	{/if}
{/snippet}

{#snippet rowContent(country: CountryTotal)}
	<span class="country-name">
		<strong>{country.name}</strong>
		<span>{country.code}</span>
	</span>
	<span class="country-metric">
		<strong>{formatCount(country.profiles)}</strong>
		<span>{plural(country.profiles, 'profile')}</span>
	</span>
	<span class="country-metric">
		<strong>{formatCount(country.sessions)}</strong>
		<span>{plural(country.sessions, 'session')}</span>
	</span>
{/snippet}

<section
	class={`country-map ${className}`}
	aria-labelledby={titleId}
	aria-describedby={descriptionId}
>
	<header class="map-header">
		<div>
			<h3 id={titleId}>{title}</h3>
			<p id={descriptionId}>{description}</p>
		</div>
		{#if countryTotals.length}
			<div
				class="map-totals"
				aria-label={`${formatCount(countryTotals.length)} ${plural(countryTotals.length, 'country')}, ${formatCount(totalProfiles)} ${plural(totalProfiles, 'profile')}, ${formatCount(totalSessions)} ${plural(totalSessions, 'session')}`}
			>
				<span>{formatCount(countryTotals.length)} {plural(countryTotals.length, 'country')}</span>
				<span>{formatCount(totalProfiles)} {plural(totalProfiles, 'profile')}</span>
			</div>
		{/if}
	</header>

	{#if countryTotals.length === 0}
		<div class="empty-state">
			<strong>No country data for this view</strong>
			<span>Try a wider date range or remove a filter.</span>
		</div>
	{:else}
		<div class="map-layout">
			<figure class="map-figure">
				<div class="map-panel">
					<svg
						viewBox={MAP_VIEW_BOX}
						role="img"
						aria-labelledby={`${titleId} ${mapDescriptionId}`}
						preserveAspectRatio="xMidYMid meet"
					>
						<desc id={mapDescriptionId}>
							A country-level bubble map. Bubble area represents profiles. Exact profile and session
							totals are listed beside the map.
						</desc>
						<rect class="ocean" width={MAP_WIDTH} height={MAP_HEIGHT} rx="16" />
						<path class="land" d={LAND_PATH} />
						<path class="borders" d={BORDER_PATH} />

						{#each mapPoints as point (point.code)}
							{#if point.href}
								<a
									class="marker"
									href={point.href}
									aria-label={accessibleLabel(point)}
									onpointerenter={() => (hoveredCode = point.code)}
									onpointerleave={() => (hoveredCode = null)}
									onfocus={() => (focusedCode = point.code)}
									onblur={() => (focusedCode = null)}
								>
									{@render marker(point)}
								</a>
							{:else}
								<g
									class="marker"
									role="img"
									aria-label={accessibleLabel(point)}
									onpointerenter={() => (hoveredCode = point.code)}
									onpointerleave={() => (hoveredCode = null)}
								>
									{@render marker(point)}
								</g>
							{/if}
						{/each}

						{#if activePoint}
							<foreignObject
								class="map-tooltip"
								x={tooltipX(activePoint.x)}
								y={tooltipY(activePoint.y)}
								width="220"
								height="70"
								aria-hidden="true"
							>
								<div>
									<strong>{activePoint.name}</strong>
									<span>
										{formatCount(activePoint.profiles)}
										{plural(activePoint.profiles, 'profile')} ·
										{formatCount(activePoint.sessions)}
										{plural(activePoint.sessions, 'session')}
									</span>
								</div>
							</foreignObject>
						{/if}
					</svg>
				</div>
				<figcaption>
					Country-level only — bubbles use country reference points, never exact user locations.
				</figcaption>
			</figure>

			<div class="country-list-panel">
				<div class="country-list-heading">
					<strong>Country totals</strong>
					<span>Profiles · sessions</span>
				</div>
				<ol class="country-list">
					{#each countryTotals as country (country.code)}
						<li>
							{#if country.href}
								<a href={country.href} aria-label={accessibleLabel(country)}>
									{@render rowContent(country)}
									<span class="row-arrow" aria-hidden="true">→</span>
								</a>
							{:else}
								<div>
									{@render rowContent(country)}
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		</div>
	{/if}
</section>

<style>
	.country-map {
		min-width: 0;
		color: var(--foreground);
	}

	.map-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.map-header h3 {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.map-header p {
		max-width: 42rem;
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.8125rem;
		line-height: 1.45;
	}

	.map-totals {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.35rem;
	}

	.map-totals span {
		border: 1px solid var(--border);
		border-radius: 999px;
		background: color-mix(in oklab, var(--muted) 52%, transparent);
		padding: 0.25rem 0.55rem;
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.map-layout {
		display: grid;
		grid-template-columns: minmax(0, 2.5fr) minmax(15rem, 0.9fr);
		gap: 0.875rem;
		align-items: stretch;
	}

	.map-figure {
		min-width: 0;
		margin: 0;
	}

	.map-panel {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) + 0.25rem);
		background: color-mix(in oklab, var(--muted) 35%, var(--background));
	}

	.map-panel svg {
		display: block;
		width: 100%;
		height: auto;
		font-family: inherit;
	}

	.ocean {
		fill: color-mix(in oklab, var(--muted) 38%, var(--background));
	}

	.land {
		fill: color-mix(in oklab, var(--muted) 84%, var(--background));
		stroke: color-mix(in oklab, var(--border) 88%, var(--foreground));
		stroke-width: 0.7;
		vector-effect: non-scaling-stroke;
	}

	.borders {
		fill: none;
		stroke: color-mix(in oklab, var(--border) 82%, var(--foreground));
		stroke-width: 0.65;
		vector-effect: non-scaling-stroke;
	}

	.marker {
		cursor: default;
		outline: none;
	}

	a.marker {
		cursor: pointer;
	}

	.bubble-target {
		fill: transparent;
		stroke: none;
	}

	.bubble-halo {
		fill: transparent;
		stroke: white;
		stroke-width: 2.5;
		opacity: 0.86;
		vector-effect: non-scaling-stroke;
	}

	.bubble {
		fill: oklch(0.59 0.17 242 / 78%);
		stroke: oklch(0.42 0.16 242);
		stroke-width: 1.25;
		vector-effect: non-scaling-stroke;
		transition:
			fill 120ms ease,
			stroke-width 120ms ease;
	}

	.marker:hover .bubble,
	.marker:focus .bubble {
		fill: oklch(0.55 0.19 242 / 92%);
		stroke-width: 2.5;
	}

	.marker:focus .bubble-halo {
		stroke: var(--foreground);
		stroke-width: 2;
		opacity: 1;
	}

	.bubble-code {
		fill: white;
		font-size: 9px;
		font-weight: 750;
		text-anchor: middle;
		dominant-baseline: middle;
		pointer-events: none;
	}

	.map-tooltip {
		overflow: visible;
		pointer-events: none;
	}

	.map-tooltip div {
		box-sizing: border-box;
		display: flex;
		height: 64px;
		flex-direction: column;
		justify-content: center;
		border: 1px solid color-mix(in oklab, var(--border) 65%, var(--foreground));
		border-radius: 10px;
		background: var(--popover);
		box-shadow: 0 8px 24px oklch(0 0 0 / 18%);
		padding: 0.55rem 0.7rem;
		color: var(--popover-foreground);
	}

	.map-tooltip strong {
		overflow: hidden;
		font-size: 0.75rem;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.map-tooltip span {
		margin-top: 0.22rem;
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}

	figcaption {
		margin-top: 0.45rem;
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		line-height: 1.4;
	}

	.country-list-panel {
		display: flex;
		min-width: 0;
		max-height: 31rem;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) + 0.25rem);
		background: color-mix(in oklab, var(--card) 94%, var(--muted));
	}

	.country-list-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--border);
		padding: 0.7rem 0.8rem;
	}

	.country-list-heading strong {
		font-size: 0.75rem;
	}

	.country-list-heading span {
		color: var(--muted-foreground);
		font-size: 0.625rem;
		white-space: nowrap;
	}

	.country-list {
		margin: 0;
		padding: 0.25rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
	}

	.country-list li + li {
		border-top: 1px solid color-mix(in oklab, var(--border) 68%, transparent);
	}

	.country-list li > a,
	.country-list li > div {
		display: grid;
		min-height: 3rem;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.7rem;
		border-radius: calc(var(--radius) - 0.15rem);
		padding: 0.5rem 0.55rem;
		color: inherit;
		text-decoration: none;
	}

	.country-list li > a {
		grid-template-columns: minmax(0, 1fr) auto auto 0.8rem;
	}

	.country-list li > a:hover {
		background: var(--muted);
	}

	.country-list li > a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.country-name,
	.country-metric {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}

	.country-name strong {
		overflow: hidden;
		font-size: 0.75rem;
		font-weight: 580;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.country-name span,
	.country-metric span {
		margin-top: 0.1rem;
		color: var(--muted-foreground);
		font-size: 0.5625rem;
		text-transform: uppercase;
		letter-spacing: 0.055em;
	}

	.country-metric {
		align-items: flex-end;
	}

	.country-metric strong {
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}

	.row-arrow {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.empty-state {
		display: flex;
		min-height: 12rem;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		border: 1px dashed var(--border);
		border-radius: calc(var(--radius) + 0.25rem);
		background: color-mix(in oklab, var(--muted) 26%, transparent);
		padding: 2rem;
		text-align: center;
	}

	.empty-state strong {
		font-size: 0.8125rem;
	}

	.empty-state span {
		margin-top: 0.3rem;
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	:global(.dark) .bubble {
		fill: oklch(0.68 0.14 236 / 78%);
		stroke: oklch(0.82 0.1 226);
	}

	:global(.dark) .bubble-halo {
		stroke: oklch(0.16 0.02 240);
	}

	@media (max-width: 900px) {
		.map-layout {
			grid-template-columns: 1fr;
		}

		.country-list-panel {
			max-height: 20rem;
		}
	}

	@media (max-width: 560px) {
		.map-header {
			flex-direction: column;
		}

		.map-totals {
			justify-content: flex-start;
		}

		.map-panel {
			border-radius: var(--radius);
		}

		.bubble-code {
			display: none;
		}

		.country-list li > a,
		.country-list li > div {
			min-height: 3.25rem;
			gap: 0.5rem;
			padding-inline: 0.45rem;
		}

		.country-list-heading span {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble {
			transition: none;
		}
	}
</style>
