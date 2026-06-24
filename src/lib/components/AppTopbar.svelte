<script lang="ts">
	import { ChevronDown, Search } from '@lucide/svelte';

	let { subject = 'Physics' }: { subject?: string } = $props();
</script>

<header class="qc-topbar" aria-label="Site header">
	<a href="/" class="qc-topbar-brand" aria-label="Question Constellation home">
		<img src="/brand/question-constellation-icon.png" alt="" width="32" height="32" />
		<span>Question Constellation</span>
	</a>

	<form class="qc-topbar-search" role="search" onsubmit={(event) => event.preventDefault()}>
		<Search size={17} aria-hidden="true" strokeWidth={2} />
		<input type="search" name="q" autocomplete="off" placeholder="Search questions" />
	</form>

	<button type="button" class="qc-topbar-search-button" aria-label="Search questions">
		<Search size={19} aria-hidden="true" strokeWidth={2} />
	</button>

	<label class="qc-topbar-subject">
		<span class="sr-only">Subject</span>
		<select aria-label="Subject">
			<option selected={subject === 'Physics'}>Physics</option>
			<option selected={subject === 'Chemistry'}>Chemistry</option>
			<option selected={subject === 'Biology'}>Biology</option>
		</select>
		<ChevronDown size={15} aria-hidden="true" strokeWidth={2.4} />
	</label>

	<details class="qc-avatar-menu">
		<summary aria-label="Account menu">
			<span>YV</span>
		</summary>
		<div class="qc-avatar-popover">
			<button type="button">Log in...</button>
		</div>
	</details>
</header>
