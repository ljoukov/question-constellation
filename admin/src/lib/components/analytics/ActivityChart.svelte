<script lang="ts">
	type Row = { day?: string | null; sessions?: number | string | null; profiles?: number | string | null };

	let {
		rows = [],
		label = 'Daily visits'
	}: {
		rows?: Row[];
		label?: string;
	} = $props();

	const width = 720;
	const height = 220;
	const left = 38;
	const right = 12;
	const top = 18;
	const bottom = 38;
	const plotWidth = width - left - right;
	const plotHeight = height - top - bottom;

	let values = $derived(
		rows.map((row) => ({
			day: String(row.day || ''),
			sessions: Number(row.sessions || 0),
			profiles: Number(row.profiles || 0)
		}))
	);
	let maximum = $derived(Math.max(1, ...values.map((row) => row.sessions)));
	let slot = $derived(values.length ? plotWidth / values.length : plotWidth);
	let barWidth = $derived(Math.max(4, Math.min(24, slot * 0.52)));

	function x(index: number) {
		return left + index * slot + slot / 2;
	}

	function y(value: number) {
		return top + plotHeight - (value / maximum) * plotHeight;
	}

	function dayLabel(value: string) {
		const parsed = new Date(`${value}T12:00:00`);
		return Number.isNaN(parsed.getTime())
			? value
			: parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

{#if values.length}
	<div class="activity-chart">
		<table class="sr-only">
			<caption>{label}</caption>
			<thead><tr><th>Date</th><th>Visits</th><th>Profiles</th></tr></thead>
			<tbody>
				{#each values as row}
					<tr><th>{dayLabel(row.day)}</th><td>{row.sessions}</td><td>{row.profiles}</td></tr>
				{/each}
			</tbody>
		</table>
		<svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
			{#each [0.25, 0.5, 0.75, 1] as fraction}
				<line
					x1={left}
					x2={width - right}
					y1={top + plotHeight * (1 - fraction)}
					y2={top + plotHeight * (1 - fraction)}
					class="chart-grid"
				/>
			{/each}
			<text x={left - 8} y={top + 4} text-anchor="end" class="chart-axis">{maximum}</text>
			<text x={left - 8} y={top + plotHeight + 4} text-anchor="end" class="chart-axis">0</text>
			{#each values as row, index}
				<g>
					<title>{dayLabel(row.day)}: {row.sessions} visits, {row.profiles} profiles</title>
					<rect
						x={x(index) - barWidth / 2}
						y={y(row.sessions)}
						width={barWidth}
						height={Math.max(1, top + plotHeight - y(row.sessions))}
						rx="4"
						class="chart-bar"
					/>
					<circle cx={x(index)} cy={y(row.profiles)} r="3.5" class="chart-dot" />
					{#if values.length <= 10 || index === 0 || index === values.length - 1}
						<text x={x(index)} y={height - 13} text-anchor="middle" class="chart-axis">
							{dayLabel(row.day)}
						</text>
					{/if}
				</g>
			{/each}
		</svg>
		<div class="chart-legend" aria-hidden="true">
			<span><i class="legend-bar"></i>Visits</span>
			<span><i class="legend-dot"></i>Profiles</span>
		</div>
	</div>
{:else}
	<div class="empty-chart">
		<p>No activity in this scope</p>
		<span>Try a longer window or include another traffic type.</span>
	</div>
{/if}
