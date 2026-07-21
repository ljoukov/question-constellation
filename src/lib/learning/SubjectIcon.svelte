<script lang="ts">
	import {
		Atom,
		BookOpen,
		Code2,
		Dna,
		FlaskConical,
		Globe2,
		Landmark,
		Languages
	} from '@lucide/svelte';

	let {
		subject,
		size = 18,
		strokeWidth = 2.1
	}: {
		subject: string;
		size?: number;
		strokeWidth?: number;
	} = $props();

	const Icon = $derived.by(() => {
		const normalized = subject.trim().toLowerCase();
		if (normalized === 'biology') return Dna;
		if (normalized === 'chemistry') return FlaskConical;
		if (normalized === 'physics') return Atom;
		if (normalized === 'computer science') return Code2;
		if (normalized === 'geography') return Globe2;
		if (normalized === 'history') return Landmark;
		if (normalized === 'english language') return Languages;
		return BookOpen;
	});
</script>

<Icon {size} {strokeWidth} aria-hidden="true" />
