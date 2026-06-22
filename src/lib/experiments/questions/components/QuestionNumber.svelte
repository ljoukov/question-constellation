<script lang="ts">
	let { ref }: { ref: string } = $props();

	function mainDigits(reference: string) {
		return reference.split('.')[0].padStart(2, '0').split('');
	}

	function partDigits(reference: string) {
		return reference.includes('.') ? (reference.split('.')[1] ?? '').split('') : [];
	}
</script>

<span class="question-number" aria-label={`Question ${ref}`}>
	<span class="digit-group">
		{#each mainDigits(ref) as digit}
			<span class="digit-box">{digit}</span>
		{/each}
	</span>
	{#if partDigits(ref).length > 0}
		<span class="question-dot">.</span>
		<span class="digit-group">
			{#each partDigits(ref) as digit}
				<span class="digit-box">{digit}</span>
			{/each}
		</span>
	{/if}
</span>

<style>
	.question-number {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: #000000;
		font-family: Arial, Helvetica, sans-serif;
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1;
		white-space: nowrap;
	}

	.digit-group {
		display: inline-flex;
	}

	.digit-box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.55rem;
		height: 1.55rem;
		border: 1.5px solid #000000;
		background: #ffffff;
	}

	.digit-box + .digit-box {
		border-left: 0;
	}

	.question-dot {
		font-weight: 700;
		transform: translateY(0.08rem);
	}

	@media (max-width: 720px) {
		.question-number {
			gap: 0.16rem;
			font-size: 0.98rem;
		}

		.digit-box {
			width: 1.38rem;
			height: 1.38rem;
			border-width: 1.3px;
		}
	}
</style>
