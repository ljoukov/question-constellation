<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';

	let { href, label = 'Back' }: { href: string; label?: string } = $props();
</script>

<a class="qc-icon-back" {href} aria-label={label} title={label}>
	<ArrowLeft size={22} strokeWidth={2.2} aria-hidden="true" />
</a>
