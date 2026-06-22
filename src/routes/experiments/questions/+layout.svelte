<script lang="ts">
	let { children } = $props();
</script>

<div class="question-experiment-route">
	{@render children()}
</div>

<style>
	.question-experiment-route {
		flex: 1 1 100%;
		min-width: 0;
		width: 100%;
	}
</style>
