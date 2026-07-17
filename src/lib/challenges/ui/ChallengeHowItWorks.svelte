<script lang="ts">
	import ChallengePanel from './ChallengePanel.svelte';

	let {
		eyebrow,
		title,
		headingId
	}: {
		eyebrow: string;
		title: string;
		headingId: string;
	} = $props();

	const steps = [
		{
			label: 'Compare',
			description: 'Compare two plausible answers against the exact command word.'
		},
		{
			label: 'Find the gap',
			description: 'Identify the one omission, wrong claim or wrong value that matters.'
		},
		{
			label: 'Fix it',
			description: 'Add the smallest link that makes the answer complete.'
		},
		{
			label: 'New case',
			description: 'Recognise the same Question Chain in a different exam context.'
		}
	] as const;
</script>

<ChallengePanel>
	<section class="how-it-works" aria-labelledby={headingId}>
		<header>
			<p>{eyebrow}</p>
			<h2 id={headingId}>{title}</h2>
		</header>
		<ol aria-label="How each challenge works">
			{#each steps as step, index (step.label)}
				<li>
					<span aria-hidden="true">{index + 1}</span>
					<div>
						<strong>{step.label}</strong>
						<small>{step.description}</small>
					</div>
				</li>
			{/each}
		</ol>
	</section>
</ChallengePanel>

<style>
	.how-it-works {
		display: grid;
		grid-template-columns: minmax(13rem, 0.48fr) minmax(0, 1fr);
		gap: clamp(1rem, 3vw, 2rem);
		align-items: start;
	}

	header {
		display: grid;
		gap: 0.2rem;
	}

	header p {
		margin: 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	h2 {
		max-width: 21ch;
		margin: 0;
		color: var(--qc-ui-text);
		font-size: clamp(1.45rem, 3vw, 1.9rem);
		font-weight: 560;
		line-height: 1.12;
		letter-spacing: 0;
	}

	ol {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 2.35rem minmax(0, 1fr);
		gap: 0.75rem;
		align-items: center;
		min-width: 0;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	li > span {
		display: grid;
		width: 2.35rem;
		height: 2.35rem;
		place-items: center;
		border: 1px solid var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		font-weight: 700;
	}

	li div {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	strong {
		color: var(--qc-ui-text);
		font-size: 0.95rem;
		font-weight: 650;
	}

	small {
		color: var(--qc-ui-text-muted);
		font-size: 0.8rem;
		line-height: 1.45;
	}

	@media (max-width: 760px) {
		.how-it-works {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 520px) {
		ol {
			grid-template-columns: 1fr;
		}
	}
</style>
