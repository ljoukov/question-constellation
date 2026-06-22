<script lang="ts">
	import type { ExamPaperAsset, ExamResponse } from '../types';
	import MathText from './MathText.svelte';

	type MatchSide = 'left' | 'right';

	const matchPalette = [
		{ background: '#e8f2ff', line: '#007aff' },
		{ background: '#eaf8ef', line: '#34c759' },
		{ background: '#fff3e0', line: '#ff9500' },
		{ background: '#f4edff', line: '#af52de' },
		{ background: '#ffeef3', line: '#ff2d55' },
		{ background: '#e9f8fb', line: '#30b0c7' },
		{ background: '#fff8d6', line: '#b88a00' },
		{ background: '#eef0ff', line: '#5856d6' }
	];

	let {
		response,
		assets = {}
	}: {
		response: ExamResponse;
		assets?: Record<string, ExamPaperAsset>;
	} = $props();

	let textAnswer = $state('');
	let labeledAnswers = $state<Record<string, string>>({});
	let numberAnswer = $state('');
	let selectedChoice = $state<number | null>(null);
	let selectedChoiceTableRow = $state<number | null>(null);
	let matchingAnswers = $state<Record<string, string>>({});
	let selectedMatchSide = $state<MatchSide | ''>('');
	let selectedMatchValue = $state('');
	let equationBlankAnswers = $state<Record<string, string>>({});
	let activeGraphicLabel = $state('');
	let graphicAnswers = $state<Record<string, string>>({});

	function setLabeledAnswer(label: string, value: string) {
		labeledAnswers = { ...labeledAnswers, [label]: value };
	}

	function toggleChoice(index: number) {
		selectedChoice = selectedChoice === index ? null : index;
	}

	function toggleChoiceTableRow(index: number) {
		selectedChoiceTableRow = selectedChoiceTableRow === index ? null : index;
	}

	function matchingRowCount(left: string[], right: string[]) {
		return Math.max(1, left.length, right.length);
	}

	function matchStyleForIndex(index: number) {
		const color = matchPalette[index % matchPalette.length];
		return `--match-bg: ${color.background}; --match-color: ${color.line};`;
	}

	function leftForRight(right: string) {
		return Object.entries(matchingAnswers).find(([, answer]) => answer === right)?.[0] ?? '';
	}

	function matchStyleForLeft(left: string, leftOptions: string[]) {
		const leftIndex = leftOptions.indexOf(left);
		return leftIndex >= 0 ? matchStyleForIndex(leftIndex) : '';
	}

	function matchPath(leftIndex: number, rightIndex: number) {
		const startY = leftIndex * 100 + 50;
		const endY = rightIndex * 100 + 50;
		const sameRow = startY === endY;
		const direction = Math.sign(endY - startY);
		const bend = sameRow ? 14 : Math.min(36, Math.abs(endY - startY) * 0.18);
		const firstControlY = sameRow ? startY - bend : startY + direction * bend;
		const secondControlY = sameRow ? endY + bend : endY - direction * bend;

		return `M 0 ${startY} C 30 ${firstControlY} 70 ${secondControlY} 100 ${endY}`;
	}

	function selectedMatchIs(side: MatchSide, value: string) {
		return selectedMatchSide === side && selectedMatchValue === value;
	}

	function clearSelectedMatch() {
		selectedMatchSide = '';
		selectedMatchValue = '';
	}

	function connectMatchPair(left: string, right: string) {
		if (!left || !right) return;

		const nextAnswers = { ...matchingAnswers };
		for (const [candidateLeft, answer] of Object.entries(nextAnswers)) {
			if (candidateLeft === left || answer === right) {
				delete nextAnswers[candidateLeft];
			}
		}

		if (matchingAnswers[left] !== right) {
			nextAnswers[left] = right;
		}

		matchingAnswers = nextAnswers;
		clearSelectedMatch();
	}

	function selectMatch(side: MatchSide, value: string) {
		if (!value) return;

		if (!selectedMatchSide) {
			selectedMatchSide = side;
			selectedMatchValue = value;
			return;
		}

		if (selectedMatchSide === side) {
			if (selectedMatchValue === value) {
				clearSelectedMatch();
			} else {
				selectedMatchValue = value;
			}
			return;
		}

		if (selectedMatchSide === 'left') {
			connectMatchPair(selectedMatchValue, value);
		} else {
			connectMatchPair(value, selectedMatchValue);
		}
	}

	function handleMatchClick(event: MouseEvent, side: MatchSide, value: string) {
		selectMatch(side, value);

		if (event.detail > 0 && event.currentTarget instanceof HTMLButtonElement) {
			event.currentTarget.blur();
		}
	}

	function removeMatch(left: string) {
		const right = matchingAnswers[left];
		const nextAnswers = { ...matchingAnswers };
		delete nextAnswers[left];
		matchingAnswers = nextAnswers;

		if (
			(selectedMatchSide === 'left' && selectedMatchValue === left) ||
			(selectedMatchSide === 'right' && selectedMatchValue === right)
		) {
			clearSelectedMatch();
		}
	}

	function handleRemoveMatchClick(event: MouseEvent, left: string) {
		removeMatch(left);

		if (event.detail > 0 && event.currentTarget instanceof HTMLButtonElement) {
			event.currentTarget.blur();
		}
	}

	function matchOptionLabel(side: MatchSide, value: string) {
		if (!selectedMatchSide) return `Select ${value}`;

		if (selectedMatchSide === side) {
			return selectedMatchValue === value ? `Deselect ${value}` : `Select ${value}`;
		}

		return side === 'left'
			? `Match ${value} to ${selectedMatchValue}`
			: `Match ${selectedMatchValue} to ${value}`;
	}

	function setEquationBlank(id: string, value: string) {
		equationBlankAnswers = { ...equationBlankAnswers, [id]: value };
	}

	function usedGraphicLabels() {
		return new Set(Object.values(graphicAnswers).filter(Boolean));
	}

	function selectGraphicLabel(label: string) {
		activeGraphicLabel = activeGraphicLabel === label ? '' : label;
	}

	function placeGraphicLabel(zoneId: string) {
		if (!activeGraphicLabel) {
			if (graphicAnswers[zoneId]) {
				graphicAnswers = { ...graphicAnswers, [zoneId]: '' };
			}
			return;
		}

		const nextAnswers: Record<string, string> = {};
		for (const [id, label] of Object.entries(graphicAnswers)) {
			nextAnswers[id] =
				response.kind === 'image-label-zones' && response.allowRepeats
					? label
					: label === activeGraphicLabel
						? ''
						: label;
		}
		nextAnswers[zoneId] = activeGraphicLabel;
		graphicAnswers = nextAnswers;
		activeGraphicLabel = '';
	}
</script>

{#if response.kind === 'lines'}
	<textarea
		class="lined-textarea"
		rows={response.count}
		style={`--answer-line-count: ${response.count}`}
		aria-label={`${response.count} line answer`}
		bind:value={textAnswer}
	></textarea>
{:else if response.kind === 'labeled-lines'}
	<div class="labeled-lines">
		{#each response.labels as label}
			<label
				class="labeled-line"
				class:multiline={Boolean(response.lineCount && response.lineCount > 1)}
			>
				<span>{label}</span>
				{#if response.lineCount && response.lineCount > 1}
					<textarea
						class="lined-textarea labeled-textarea"
						rows={response.lineCount}
						style={`--answer-line-count: ${response.lineCount}`}
						value={labeledAnswers[label] ?? ''}
						aria-label={`${label} answer`}
						oninput={(event) => setLabeledAnswer(label, event.currentTarget.value)}
					></textarea>
				{:else}
					<input
						class="line-input"
						value={labeledAnswers[label] ?? ''}
						aria-label={`${label} answer`}
						oninput={(event) => setLabeledAnswer(label, event.currentTarget.value)}
					/>
				{/if}
			</label>
		{/each}
	</div>
{:else if response.kind === 'number-line'}
	<label class="number-line">
		<span><MathText text={response.label} /></span>
		{#if response.prefix}
			<span><MathText text={response.prefix} /></span>
		{/if}
		<input class="line-input" bind:value={numberAnswer} aria-label={`${response.label} answer`} />
		{#if response.unit}
			<span><MathText text={response.unit} /></span>
		{/if}
	</label>
{:else if response.kind === 'choice'}
	<div
		class="choice-list"
		class:horizontal={response.layout === 'horizontal'}
		role="radiogroup"
		aria-label="Multiple choice options"
	>
		{#each response.options as option, index}
			<button
				type="button"
				class="choice-row"
				class:selected={selectedChoice === index}
				role="radio"
				aria-checked={selectedChoice === index}
				onclick={() => toggleChoice(index)}
			>
				<span class="choice-label"><MathText text={option} /></span>
				<span class="tick-cell" aria-hidden="true">
					<span class="tick-mark">{selectedChoice === index ? '✓' : ''}</span>
				</span>
			</button>
		{/each}
	</div>
{:else if response.kind === 'choice-table'}
	<div
		class="choice-table-grid"
		role="radiogroup"
		aria-label="Tick one table row"
		style={`grid-template-columns: repeat(${response.columns.length}, minmax(0, 1fr)) var(--choice-table-gap) var(--choice-table-tick-width)`}
	>
		{#each response.columns as column, columnIndex}
			<div
				class="choice-grid-cell choice-grid-heading"
				class:first-column={columnIndex === 0}
				style={`grid-column: ${columnIndex + 1}; grid-row: 1`}
			>
				<MathText text={column} />
			</div>
		{/each}
		{#each response.rows as row, rowIndex}
			{#each row as cell, columnIndex}
				<div
					class="choice-grid-cell choice-grid-data"
					class:first-column={columnIndex === 0}
					class:selected={selectedChoiceTableRow === rowIndex}
					style={`grid-column: ${columnIndex + 1}; grid-row: ${rowIndex + 2}`}
				>
					<MathText text={cell} />
				</div>
			{/each}
			<button
				type="button"
				class="table-tick-button"
				class:selected={selectedChoiceTableRow === rowIndex}
				role="radio"
				aria-label={`Select row ${rowIndex + 1}`}
				aria-checked={selectedChoiceTableRow === rowIndex}
				style={`grid-column: ${response.columns.length + 2}; grid-row: ${rowIndex + 2}`}
				onclick={() => toggleChoiceTableRow(rowIndex)}
			>
				{selectedChoiceTableRow === rowIndex ? '✓' : ''}
			</button>
		{/each}
	</div>
{:else if response.kind === 'matching'}
	{@const rowCount = matchingRowCount(response.left, response.right)}
	<div class="matching-connectors" aria-label="Matching question">
		<div class="matching-connectors-heading">{response.leftTitle}</div>
		<div class="matching-connectors-heading matching-connectors-heading-right">
			{response.rightTitle}
		</div>
		<div class="matching-rows" style={`--match-row-count: ${rowCount}`}>
			<div class="match-line-layer" style={`grid-row: 1 / span ${rowCount}`}>
				<svg
					class="match-lines"
					viewBox={`0 0 100 ${rowCount * 100}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{#each response.left as left, leftIndex}
						{@const right = matchingAnswers[left]}
						{@const rightIndex = response.right.indexOf(right)}
						{#if rightIndex >= 0}
							<path style={matchStyleForIndex(leftIndex)} d={matchPath(leftIndex, rightIndex)} />
						{/if}
					{/each}
				</svg>
				{#each response.left as left, leftIndex}
					{@const right = matchingAnswers[left]}
					{@const rightIndex = response.right.indexOf(right)}
					{#if rightIndex >= 0}
						<button
							type="button"
							class="match-end match-end-left"
							style={`--match-row: ${leftIndex}; ${matchStyleForIndex(leftIndex)}`}
							aria-label={`Remove match for ${left}`}
							onclick={(event) => handleRemoveMatchClick(event, left)}
						></button>
						<button
							type="button"
							class="match-end match-end-right"
							style={`--match-row: ${rightIndex}; ${matchStyleForIndex(leftIndex)}`}
							aria-label={`Remove match for ${left}`}
							onclick={(event) => handleRemoveMatchClick(event, left)}
						></button>
					{/if}
				{/each}
			</div>
			{#each response.left as left, rowIndex}
				<button
					type="button"
					class="match-option match-option-left"
					class:active={selectedMatchIs('left', left)}
					class:connected={Boolean(matchingAnswers[left])}
					style={`grid-column: 1; grid-row: ${rowIndex + 1}; ${
						matchingAnswers[left] ? matchStyleForIndex(rowIndex) : ''
					}`}
					aria-pressed={selectedMatchIs('left', left)}
					aria-label={matchOptionLabel('left', left)}
					onclick={(event) => handleMatchClick(event, 'left', left)}
				>
					<MathText text={left} />
				</button>
			{/each}
			{#each response.right as right, rowIndex}
				{@const matchedLeft = leftForRight(right)}
				<button
					type="button"
					class="match-option match-option-right"
					class:active={selectedMatchIs('right', right)}
					class:connected={Boolean(matchedLeft)}
					style={`grid-column: 3; grid-row: ${rowIndex + 1}; ${
						matchedLeft ? matchStyleForLeft(matchedLeft, response.left) : ''
					}`}
					aria-pressed={selectedMatchIs('right', right)}
					aria-label={matchOptionLabel('right', right)}
					onclick={(event) => handleMatchClick(event, 'right', right)}
				>
					<MathText text={right} />
				</button>
			{/each}
		</div>
	</div>
{:else if response.kind === 'asset-canvas'}
	{@const asset = assets[response.assetId]}
	{#if asset}
		{#if response.labelBank?.length}
			<div class="graphic-label-bank" aria-label="Label choices">
				{#each response.labelBank as label}
					<button
						type="button"
						class="graphic-label-chip"
						class:active={activeGraphicLabel === label}
						class:used={usedGraphicLabels().has(label)}
						aria-pressed={activeGraphicLabel === label}
						onclick={() => selectGraphicLabel(label)}
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}
		<figure
			class="answer-canvas"
			style={`--canvas-width: ${response.width ?? asset.width ?? 420}px`}
		>
			<figcaption>{response.label ?? asset.label}</figcaption>
			<img src={asset.src} alt={asset.alt} />
		</figure>
	{:else}
		<p class="missing-asset">Missing answer canvas: {response.assetId}</p>
	{/if}
{:else if response.kind === 'equation-blanks'}
	<div class="equation-blanks" aria-label="Equation answer">
		{#each response.segments as segment}
			{#if segment.kind === 'blank'}
				<input
					class="equation-blank-input"
					style={`--blank-width: ${segment.width ?? 4.5}rem`}
					value={equationBlankAnswers[segment.id] ?? ''}
					aria-label={segment.label}
					oninput={(event) => setEquationBlank(segment.id, event.currentTarget.value)}
				/>
			{:else if segment.kind === 'math'}
				<span class="equation-blank-math"><MathText text={`$${segment.text}$`} /></span>
			{:else}
				<span><MathText text={segment.text} /></span>
			{/if}
		{/each}
	</div>
{:else if response.kind === 'image-label-zones'}
	{@const asset = assets[response.assetId]}
	{#if asset}
		<div class="graphic-label-response">
			<div class="graphic-label-bank" aria-label="Label choices">
				{#each response.labels as label}
					<button
						type="button"
						class="graphic-label-chip"
						class:active={activeGraphicLabel === label}
						class:used={usedGraphicLabels().has(label)}
						aria-pressed={activeGraphicLabel === label}
						onclick={() => selectGraphicLabel(label)}
					>
						{label}
					</button>
				{/each}
			</div>
			<figure
				class="graphic-label-figure"
				style={`--graphic-width: ${response.width ?? asset.width ?? 640}px`}
			>
				<figcaption>{asset.label}</figcaption>
				<div class="graphic-label-image-wrap">
					<img src={asset.src} alt={asset.alt} />
					{#each response.zones as zone}
						<button
							type="button"
							class="graphic-label-zone"
							class:filled={Boolean(graphicAnswers[zone.id])}
							style={`left: ${zone.x * 100}%; top: ${zone.y * 100}%; width: ${zone.width * 100}%; height: ${zone.height * 100}%`}
							aria-label={`${zone.label} label target${graphicAnswers[zone.id] ? `, ${graphicAnswers[zone.id]}` : ''}`}
							onclick={() => placeGraphicLabel(zone.id)}
						>
							{graphicAnswers[zone.id] || ''}
						</button>
					{/each}
				</div>
			</figure>
		</div>
	{:else}
		<p class="missing-asset">Missing label image: {response.assetId}</p>
	{/if}
{/if}

<style>
	.lined-textarea,
	.line-input {
		width: 100%;
		border: 0;
		border-radius: 0;
		background-color: transparent;
		color: #000000;
		font: inherit;
		outline: none;
	}

	.lined-textarea {
		--answer-line-height: 1.9rem;
		display: block;
		min-height: calc(var(--answer-line-count) * var(--answer-line-height));
		margin: 0.85rem 0 0.2rem;
		padding: 0 0.15rem 0.08rem;
		line-height: var(--answer-line-height);
		resize: vertical;
		background-image: linear-gradient(to bottom, transparent calc(100% - 1px), #000000 0);
		background-size: 100% var(--answer-line-height);
		background-attachment: local;
	}

	.line-input {
		min-width: 5rem;
		height: 1.7rem;
		padding: 0 0.2rem;
		border-bottom: 1px solid #000000;
	}

	.labeled-lines {
		display: grid;
		gap: 1.05rem;
		margin-top: 0.95rem;
	}

	.labeled-line,
	.number-line {
		display: grid;
		grid-template-columns: auto minmax(6rem, 1fr);
		gap: 0.65rem;
		align-items: end;
	}

	.labeled-line.multiline {
		grid-template-columns: minmax(7rem, max-content) minmax(0, 1fr);
		align-items: start;
	}

	.labeled-textarea {
		margin: -0.15rem 0 0;
	}

	.number-line {
		grid-template-columns: auto auto minmax(7rem, 1fr) auto;
		max-width: 31rem;
		margin: 1.15rem 0 0.2rem auto;
	}

	.number-line .line-input {
		min-width: 9rem;
	}

	.choice-list {
		display: grid;
		gap: 0.55rem;
		margin: 0.85rem 0 0.2rem;
	}

	.choice-list.horizontal {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
		align-items: start;
		margin-top: 1.05rem;
	}

	.choice-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.1rem;
		align-items: stretch;
		width: min(100%, 34rem);
		min-height: 2.1rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: #000000;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.choice-list.horizontal .choice-row {
		grid-template-columns: 3.6rem;
		grid-template-rows: auto 2.4rem;
		width: 3.6rem;
		min-height: 0;
		text-align: center;
	}

	.choice-label {
		display: flex;
		align-items: center;
		padding: 0.28rem 0.55rem 0.28rem 0;
	}

	.choice-list.horizontal .choice-label {
		justify-content: center;
		min-height: 1.4rem;
		padding: 0 0 0.25rem;
	}

	.choice-row .tick-cell {
		display: grid;
		place-items: center;
		border: 1px solid #000000;
		background: #ffffff;
		font-weight: 700;
	}

	.choice-row.selected .tick-cell,
	.table-tick-button.selected {
		background: #f1f1f1;
	}

	.choice-table-grid {
		--choice-table-gap: 1.15rem;
		--choice-table-tick-width: 2.5rem;
		display: grid;
		grid-auto-rows: minmax(2.55rem, auto);
		align-items: stretch;
		width: min(100%, 38rem);
		margin: 0.85rem 0 0.2rem;
		font-size: 0.95em;
	}

	.choice-grid-cell {
		display: flex;
		align-items: center;
		border: 1px solid #000000;
		border-left: 0;
		padding: 0.38rem 0.55rem;
		background: #ffffff;
		text-align: left;
		transition: background-color 140ms ease;
	}

	.choice-grid-cell.first-column {
		border-left: 1px solid #000000;
	}

	.choice-grid-data {
		border-top: 0;
	}

	.choice-grid-heading {
		justify-content: center;
		font-weight: 700;
		text-align: center;
	}

	.choice-grid-cell.selected {
		background: #f7f7f7;
	}

	.table-tick-button {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		min-height: 2.55rem;
		align-self: stretch;
		border: 1px solid #000000;
		background: #ffffff;
		color: #000000;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		transition: background-color 140ms ease;
	}

	.matching-connectors {
		--match-connector-width: 7.5rem;
		--match-row-step: 3.45rem;
		--match-option-height: 2.45rem;
		display: grid;
		grid-template-columns: minmax(8.5rem, 1fr) var(--match-connector-width) minmax(10rem, 1.25fr);
		width: min(100%, 38rem);
		margin: 0.95rem 0 0.2rem;
	}

	.matching-connectors-heading {
		grid-column: 1;
		margin-bottom: 0.45rem;
		font-weight: 700;
	}

	.matching-connectors-heading-right {
		grid-column: 3;
		text-align: center;
	}

	.matching-rows {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: minmax(8.5rem, 1fr) var(--match-connector-width) minmax(10rem, 1.25fr);
		grid-auto-rows: var(--match-row-step);
		align-items: center;
		column-gap: 0;
		position: relative;
	}

	.match-option {
		position: relative;
		z-index: 1;
		align-self: center;
		min-height: var(--match-option-height);
		padding: 0.35rem 0.55rem;
		border: 1px solid #000000;
		border-radius: 0;
		background: #ffffff;
		color: #000000;
		font: inherit;
		text-align: left;
		outline: none;
		cursor: pointer;
		transition:
			background-color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}

	.match-option.connected {
		background: var(--match-bg, #f1f1f1);
	}

	.match-option.active {
		box-shadow: inset 0 0 0 1.5px #000000;
	}

	.match-option:focus-visible {
		box-shadow: inset 0 0 0 1.5px #000000;
	}

	.match-option.active:not(.connected) {
		background: #f6f6f6;
	}

	.match-option-left {
		padding-right: 0.75rem;
	}

	.match-option-right {
		padding-left: 0.75rem;
	}

	.match-option:disabled {
		cursor: default;
		opacity: 0;
	}

	.match-line-layer {
		position: relative;
		z-index: 2;
		grid-column: 2;
		align-self: stretch;
		pointer-events: none;
	}

	.match-lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.match-lines path {
		fill: none;
		stroke: var(--match-color, #000000);
		stroke-width: 2.1;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
		animation: settle-match-line 160ms ease-out both;
	}

	.match-end {
		position: absolute;
		top: calc((var(--match-row) + 0.5) * var(--match-row-step));
		width: 0.9rem;
		height: 0.9rem;
		padding: 0;
		border: 1.5px solid var(--match-color, #000000);
		border-radius: 50%;
		background: var(--match-bg, #ffffff);
		transform: translate(var(--match-end-x, -50%), -50%);
		cursor: pointer;
		pointer-events: auto;
		transition:
			background-color 140ms ease,
			transform 140ms ease;
	}

	.match-end:hover,
	.match-end:focus-visible {
		background: #ffffff;
		transform: translate(var(--match-end-x, -50%), -50%) scale(1.12);
	}

	.match-end-left {
		--match-end-x: -50%;
		left: 0;
	}

	.match-end-right {
		--match-end-x: 50%;
		right: 0;
	}

	@keyframes settle-match-line {
		from {
			opacity: 0.35;
			stroke-width: 1.4;
		}

		to {
			opacity: 1;
			stroke-width: 2.1;
		}
	}

	.answer-canvas {
		width: min(100%, var(--canvas-width));
		margin: 0.65rem auto 0.2rem;
		text-align: center;
	}

	.answer-canvas figcaption {
		margin-bottom: 0.45rem;
		font-weight: 700;
	}

	.answer-canvas img {
		display: block;
		width: 100%;
		height: auto;
	}

	.equation-blanks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: baseline;
		justify-content: center;
		margin: 1.15rem 0 0.35rem;
		font-size: 1.05em;
	}

	.equation-blank-input {
		width: var(--blank-width);
		min-width: 2.8rem;
		border: 0;
		border-bottom: 1px solid #000000;
		border-radius: 0;
		background: transparent;
		color: #000000;
		font: inherit;
		text-align: center;
		outline: none;
	}

	.equation-blank-math {
		display: inline-block;
		min-width: 2.8rem;
		text-align: center;
	}

	.graphic-label-response {
		display: grid;
		gap: 0.8rem;
		margin-top: 0.9rem;
	}

	.graphic-label-bank {
		display: grid;
		grid-template-columns: repeat(3, minmax(5.5rem, 1fr));
		gap: 0.45rem;
		width: min(100%, 31rem);
		margin: 0 auto;
		padding: 0.55rem;
		border: 1px solid #000000;
	}

	.graphic-label-chip {
		min-height: 2rem;
		border: 1px solid #000000;
		border-radius: 0;
		background: #ffffff;
		color: #000000;
		font: inherit;
		cursor: pointer;
	}

	.graphic-label-chip.active,
	.graphic-label-chip.used {
		background: #f1f1f1;
	}

	.graphic-label-figure {
		width: min(100%, var(--graphic-width));
		margin: 0 auto;
	}

	.graphic-label-figure figcaption {
		margin-bottom: 0.45rem;
		font-weight: 700;
		text-align: center;
	}

	.graphic-label-image-wrap {
		position: relative;
	}

	.graphic-label-image-wrap img {
		display: block;
		width: 100%;
		height: auto;
	}

	.graphic-label-zone {
		position: absolute;
		display: grid;
		place-items: center;
		min-height: 1.8rem;
		padding: 0 0.25rem;
		border: 1px dashed #000000;
		border-radius: 0;
		background: #ffffff;
		color: #000000;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.graphic-label-zone:hover,
	.graphic-label-zone:focus-visible,
	.graphic-label-zone.filled {
		background: #ffffff;
	}

	.missing-asset {
		color: #7f1d1d;
	}

	@media (max-width: 720px) {
		.choice-table-grid {
			--choice-table-gap: 0.55rem;
			--choice-table-tick-width: 2rem;
			width: 100%;
			font-size: 0.84em;
		}

		.choice-grid-cell {
			padding: 0.3rem 0.32rem;
			overflow-wrap: anywhere;
		}

		.matching-connectors {
			--match-connector-width: 4.2rem;
			--match-row-step: 3.55rem;
			grid-template-columns: minmax(0, 1fr) var(--match-connector-width) minmax(0, 1fr);
			width: 100%;
			font-size: 0.92em;
		}

		.matching-rows {
			grid-template-columns: minmax(0, 1fr) var(--match-connector-width) minmax(0, 1fr);
		}

		.match-option {
			min-height: 2.35rem;
			padding: 0.32rem 0.38rem;
			overflow-wrap: anywhere;
		}

		.match-option-left {
			padding-right: 0.62rem;
		}

		.match-option-right {
			padding-left: 0.62rem;
		}

		.match-lines path {
			stroke-width: 1.8;
		}

		.graphic-label-bank {
			grid-template-columns: repeat(2, minmax(5.5rem, 1fr));
		}

		.labeled-line.multiline {
			grid-template-columns: minmax(6.4rem, max-content) minmax(0, 1fr);
		}

		.number-line {
			grid-template-columns: auto auto minmax(5rem, 1fr) auto;
		}
	}

	@media (max-width: 520px) {
		.labeled-line,
		.labeled-line.multiline {
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}

		.matching-connectors {
			--match-connector-width: 3.35rem;
			--match-row-step: 3.75rem;
			font-size: 0.86em;
		}

		.matching-connectors-heading {
			font-size: 0.92em;
		}

		.match-end {
			width: 0.78rem;
			height: 0.78rem;
		}
	}
</style>
