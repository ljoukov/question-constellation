<script lang="ts">
	import { attachHaptic } from '$lib/haptics';
	import type { Snippet } from 'svelte';

	let {
		block = false,
		children
	}: {
		block?: boolean;
		children: Snippet;
	} = $props();
</script>

<span class:block class="haptic-surface" {@attach attachHaptic}>
	{@render children()}
</span>

<style>
	.haptic-surface {
		display: inline-grid;
		min-width: 0;
	}

	.haptic-surface.block {
		display: grid;
		width: 100%;
	}

	.haptic-surface :global(button[data-haptic-control]) {
		width: 100%;
		height: 100%;
	}
</style>
