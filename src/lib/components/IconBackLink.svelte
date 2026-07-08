<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';

	let { href, label = 'Back' }: { href: string; label?: string } = $props();

	function shouldUseBrowserHistory(event: MouseEvent) {
		if (event.defaultPrevented) return false;
		if (event.button !== 0) return false;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
		if (typeof window === 'undefined') return false;

		return window.history.length > 1;
	}

	function handleClick(event: MouseEvent) {
		if (!shouldUseBrowserHistory(event)) return;
		event.preventDefault();
		window.history.back();
	}
</script>

<a class="qc-icon-back" {href} aria-label={label} title={label} onclick={handleClick}>
	<ArrowLeft size={22} strokeWidth={2.2} aria-hidden="true" />
</a>
