<script lang="ts">
	import katex from 'katex';
	import 'katex/dist/katex.min.css';

	let {
		text,
		display = false
	}: {
		text: string;
		display?: boolean;
	} = $props();

	type Segment =
		| {
				kind: 'text';
				text: string;
				strong?: boolean;
		  }
		| {
				kind: 'math';
				html: string;
				strong?: boolean;
		  }
		| {
				kind: 'display-math';
				html: string;
				strong?: boolean;
		  }
		| {
				kind: 'nowrap';
				html: string;
				strong?: boolean;
		  };

	function escapeHtml(value: string) {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function stripMathDelimiters(value: string) {
		const trimmed = value.trim();
		if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
			return trimmed.slice(2, -2).trim();
		}
		if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 4) {
			return trimmed.slice(2, -2).trim();
		}
		if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
			return trimmed.slice(1, -1).trim();
		}
		if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length > 4) {
			return trimmed.slice(2, -2).trim();
		}
		return value;
	}

	function latexSymbol(command: string) {
		const normalized = command.toLowerCase();
		if ('lambda'.startsWith(normalized)) return 'λ';
		if ('theta'.startsWith(normalized)) return 'θ';
		if ('alpha'.startsWith(normalized)) return 'α';
		if ('beta'.startsWith(normalized)) return 'β';
		if ('gamma'.startsWith(normalized)) return 'γ';
		if ('delta'.startsWith(normalized)) return 'δ';
		if ('omega'.startsWith(normalized)) return 'ω';
		if ('times'.startsWith(normalized)) return '×';
		if ('div'.startsWith(normalized)) return '÷';
		return command;
	}

	function cleanText(value: string) {
		return value
			.replace(/\s*<=>\s*/g, ' ⇌ ')
			.replace(/\s*(?:->|⟶|⇒|)\s*/g, ' → ')
			.replace(/\$(\(?\s*)\\([A-Za-z]{2,})(?:\.{3}|…)/g, (_, prefix, command) => {
				return `${prefix}${latexSymbol(command)}...`;
			});
	}

	function renderMath(tex: string, displayMode: boolean) {
		return katex.renderToString(tex, {
			displayMode,
			throwOnError: false
		});
	}

	function joinAdjacentMathRuns(segments: Segment[]) {
		const joined: Segment[] = [];

		for (let index = 0; index < segments.length; index += 1) {
			const segment = segments[index];

			if (segment.kind !== 'math') {
				if (segment.kind === 'text' && !segment.text) continue;
				joined.push(segment);
				continue;
			}

			let html = segment.html;
			let shouldWrap = false;
			const previous = joined[joined.length - 1];

			if (previous?.kind === 'text' && previous.strong === segment.strong && /\S$/.test(previous.text)) {
				const trailingToken = previous.text.match(/(\S+)$/)?.[0] ?? '';
				previous.text = previous.text.slice(0, -trailingToken.length);
				if (!previous.text) joined.pop();
				html = `${escapeHtml(trailingToken)}${html}`;
				shouldWrap = true;
			}

			const next = segments[index + 1];
			if (next?.kind === 'text' && next.strong === segment.strong && /^\S/.test(next.text)) {
				const leadingToken = next.text.match(/^(\S+)/)?.[0] ?? '';
				next.text = next.text.slice(leadingToken.length);
				html = `${html}${escapeHtml(leadingToken)}`;
				shouldWrap = true;
			}

			joined.push(shouldWrap ? { kind: 'nowrap', html, strong: segment.strong } : segment);
		}

		return joined;
	}

	function inlineSegments(value: string, strong = false): Segment[] {
		const segments: Segment[] = [];
		const pattern =
			/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+)\$|\\\(([^)\n]+?)\\\)|\*\*([^*\n]+?)\*\*/g;
		let cursor = 0;
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(value))) {
			if (match.index > cursor) {
				segments.push({ kind: 'text', text: cleanText(value.slice(cursor, match.index)), strong });
			}
			if (match[1] !== undefined || match[2] !== undefined) {
				const tex = (match[1] ?? match[2] ?? '').trim();
				segments.push({
					kind: 'display-math',
					html: tex ? renderMath(tex, true) : escapeHtml(match[0]),
					strong
				});
			} else if (match[3] !== undefined || match[4] !== undefined) {
				const tex = (match[3] ?? match[4] ?? '').trim();
				segments.push({
					kind: 'math',
					html: tex ? renderMath(tex, false) : escapeHtml(match[0]),
					strong
				});
			} else {
				segments.push(...inlineSegments(match[5] ?? '', true));
			}
			cursor = match.index + match[0].length;
		}

		if (cursor < value.length) {
			segments.push({ kind: 'text', text: cleanText(value.slice(cursor)), strong });
		}

		return joinAdjacentMathRuns(segments.length ? segments : [{ kind: 'text', text: value, strong }]);
	}

	const displayHtml = $derived(renderMath(stripMathDelimiters(text), true));
	const segments = $derived(inlineSegments(text));
</script>

{#if display}
	<span class="math-display">{@html displayHtml}</span>
{:else}
	<span class="math-text">
		{#each segments as segment}
			{#if segment.kind === 'text' && segment.strong}
				<strong>{segment.text}</strong>
			{:else if segment.kind === 'text'}
				{segment.text}
			{:else if segment.kind === 'math' && segment.strong}
				<strong><span class="inline-math">{@html segment.html}</span></strong>
			{:else if segment.kind === 'math'}
				<span class="inline-math">{@html segment.html}</span>
			{:else if segment.kind === 'display-math' && segment.strong}
				<strong><span class="inline-display-math">{@html segment.html}</span></strong>
			{:else if segment.kind === 'display-math'}
				<span class="inline-display-math">{@html segment.html}</span>
			{:else if segment.strong}
				<strong><span class="nowrap-math">{@html segment.html}</span></strong>
			{:else}
				<span class="nowrap-math">{@html segment.html}</span>
			{/if}
		{/each}
	</span>
{/if}

<style>
	.math-text,
	.inline-math {
		display: inline;
	}

	.inline-math,
	.nowrap-math {
		white-space: nowrap;
	}

	.nowrap-math {
		display: inline-block;
	}

	.math-display {
		display: block;
		text-align: center;
	}

	.inline-display-math {
		display: block;
		margin: 0.18rem 0;
		text-align: center;
		overflow-x: auto;
	}

	:global(.katex) {
		font-size: 1em;
	}

	:global(.katex-display) {
		margin: 0;
	}
</style>
