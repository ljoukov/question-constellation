<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import type { OcrLiteratureArea } from '$lib/englishLiteratureHub';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpenCheck,
		FileText,
		PenLine,
		Settings2
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const initialVisibleCount = 4;
	let visibleCounts = $state<Record<OcrLiteratureArea, number>>({
		modern: initialVisibleCount,
		novel: initialVisibleCount,
		poetry: initialVisibleCount,
		shakespeare: initialVisibleCount
	});

	const paperOneSections = $derived(
		data.hub.sections.filter((section) => section.paperNumber === '01')
	);
	const paperTwoSections = $derived(
		data.hub.sections.filter((section) => section.paperNumber === '02')
	);
	const incompleteProfile = $derived(data.hub.selectionCount < 4);
	const earlierAnthologyCount = $derived(
		data.hub.sections
			.find((section) => section.id === 'poetry')
			?.questions.filter((question) => question.formatTone === 'anthology').length ?? 0
	);

	function questionHref(question: (typeof data.hub.sections)[number]['questions'][number]) {
		return resolve('/questions/[questionId]', { questionId: question.slug || question.id });
	}

	function seriesLabel(series: string | null, year: number | null) {
		if (series && (!year || series.includes(String(year)))) return series;
		return [series, year].filter(Boolean).join(' ') || 'Past paper';
	}

	function showMore(sectionId: OcrLiteratureArea, total: number) {
		visibleCounts[sectionId] = Math.min(total, visibleCounts[sectionId] + 6);
	}

	function sectionIcon(sectionId: OcrLiteratureArea) {
		return sectionId === 'poetry' || sectionId === 'shakespeare' ? PenLine : BookOpenCheck;
	}

	function promptHeading(question: (typeof data.hub.sections)[number]['questions'][number]) {
		const title = question.title.trim();
		const preview = question.preview.trim();
		if (!title || /^[a-z]/.test(title) || title.endsWith('...')) return preview || title;
		return title;
	}

	function promptDetail(question: (typeof data.hub.sections)[number]['questions'][number]) {
		const heading = promptHeading(question);
		const preview = question.preview.trim();
		return preview && preview !== heading ? preview : null;
	}
</script>

<svelte:head>
	<title>Your OCR English Literature Questions | Question Constellation</title>
	<meta
		name="description"
		content="OCR GCSE English Literature questions matched to the texts, poetry cluster and Shakespeare play selected in your profile."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="literature-app">
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

	<div class="literature-layout">
		<nav class="literature-back-row" aria-label="Back and profile links">
			<a href={resolve('/')}>
				<ArrowLeft size={16} aria-hidden="true" />
				Home
			</a>
			<a href={resolve('/profile')}>
				<Settings2 size={16} aria-hidden="true" />
				Change course texts
			</a>
		</nav>

		<header class="literature-hero">
			<div class="literature-hero-copy">
				<p class="literature-kicker">OCR J352 · your course</p>
				<h1>Your English Literature questions.</h1>
				<p>
					Only questions for the texts your school teaches. No short-mark filters, no other novels,
					and no unrelated poetry clusters.
				</p>
				<div class="literature-total">
					<strong>{data.hub.questionCount}</strong>
					<span>matched past-paper questions</span>
				</div>
			</div>

			<div class="literature-paper-map" aria-label="Your OCR course choices">
				<section>
					<header>
						<span>01</span>
						<div>
							<strong>Paper 1</strong>
							<small>Modern and literary heritage texts</small>
						</div>
					</header>
					{#each paperOneSections as section (section.id)}
						<a href={`#${section.id}`}>
							<span>{section.category}</span>
							<strong>{section.selection ?? 'Not selected'}</strong>
						</a>
					{/each}
				</section>

				<section>
					<header>
						<span>02</span>
						<div>
							<strong>Paper 2</strong>
							<small>Poetry and Shakespeare</small>
						</div>
					</header>
					{#each paperTwoSections as section (section.id)}
						<a href={`#${section.id}`}>
							<span>{section.category}</span>
							<strong>{section.selection ?? 'Not selected'}</strong>
						</a>
					{/each}
				</section>
			</div>
		</header>

		{#if incompleteProfile}
			<aside class="literature-setup-note">
				<div>
					<strong>{data.hub.selectionCount}/4 course choices configured</strong>
					<span>Add the missing school choices to see every relevant question.</span>
				</div>
				<a href={resolve('/profile')}>Finish profile <ArrowRight size={16} aria-hidden="true" /></a>
			</aside>
		{/if}

		<nav class="literature-section-nav" aria-label="Jump to your course section">
			{#each data.hub.sections as section (section.id)}
				<a href={`#${section.id}`} class:missing={!section.selection}>
					<span>{section.paperLabel}</span>
					<strong>{section.selection ?? section.category}</strong>
					<small>{section.questions.length} questions</small>
				</a>
			{/each}
		</nav>

		<section class="literature-question-bank" aria-labelledby="course-question-title">
			<div class="literature-bank-heading">
				<div>
					<p class="literature-kicker">Past-paper practice</p>
					<h2 id="course-question-title">Choose an essay task.</h2>
					<p>
						Questions are organised by your taught texts and task format—not by tiny mark bands.
					</p>
				</div>
				<a href={resolve('/past-papers/gcse/ocr/english-literature')}>
					<FileText size={17} aria-hidden="true" />
					Full paper archive
				</a>
			</div>

			{#if earlierAnthologyCount > 0}
				<aside class="literature-anthology-note">
					<strong>Poetry anthology note</strong>
					<span>
						Pre-2024 poetry questions used an earlier version of the OCR anthology. They remain
						useful for essay practice and are labelled clearly below.
					</span>
				</aside>
			{/if}

			<div class="literature-sections">
				{#each data.hub.sections as section (section.id)}
					{@const SectionIcon = sectionIcon(section.id)}
					<section id={section.id} class="literature-section">
						<header class="literature-section-heading">
							<div class="literature-section-number">{section.paperNumber}</div>
							<div>
								<p>{section.paperLabel} · {section.category}</p>
								<h3>{section.selection ?? 'Choose this course option'}</h3>
								<span>{section.taskSummary}</span>
							</div>
							<div class="literature-mark-shape">
								<SectionIcon size={18} aria-hidden="true" />
								<strong>{section.markShape}</strong>
							</div>
						</header>

						{#if section.selection}
							<div class="literature-question-grid">
								{#each section.questions.slice(0, visibleCounts[section.id]) as question (question.id)}
									<a class="literature-question" href={questionHref(question)}>
										<div class="literature-question-meta">
											<span>{seriesLabel(question.series, question.year)}</span>
											<span>{question.componentCode}</span>
											<span>{question.marks ? `${question.marks} marks` : 'Essay task'}</span>
										</div>
										<div class="literature-question-type-row">
											<strong>{question.questionType}</strong>
											{#if question.formatNote}
												<em class={question.formatTone}>{question.formatNote}</em>
											{/if}
										</div>
										<h4>{promptHeading(question)}</h4>
										{#if promptDetail(question)}
											<p>{promptDetail(question)}</p>
										{/if}
										<span class="literature-question-open">
											Open question {question.sourceRef}
											<ArrowRight size={15} aria-hidden="true" />
										</span>
									</a>
								{/each}
							</div>

							{#if visibleCounts[section.id] < section.questions.length}
								<button
									type="button"
									class="literature-show-more"
									onclick={() => showMore(section.id, section.questions.length)}
								>
									Show older {section.selection} questions
									<span>{section.questions.length - visibleCounts[section.id]} remaining</span>
								</button>
							{/if}
						{:else}
							<div class="literature-empty-section">
								<span>This course choice has not been set.</span>
								<a href={resolve('/profile')}>Choose it in your profile</a>
							</div>
						{/if}
					</section>
				{/each}
			</div>
		</section>
	</div>
</main>

<style>
	.literature-app {
		min-height: var(--app-viewport-height, 100vh);
		background:
			radial-gradient(circle at 12% 4%, rgba(255, 226, 151, 0.2), transparent 28rem),
			radial-gradient(circle at 94% 12%, rgba(224, 111, 102, 0.12), transparent 30rem), #f7f4ec;
		color: #172521;
	}

	.literature-layout {
		display: grid;
		gap: 1.15rem;
		width: min(100%, 82rem);
		margin: 0 auto;
		padding: 1rem clamp(0.9rem, 2.5vw, 2.2rem) 4rem;
	}

	.literature-back-row {
		display: flex;
		gap: 0.6rem;
		justify-content: space-between;
	}

	.literature-back-row a,
	.literature-bank-heading > a {
		display: inline-flex;
		gap: 0.42rem;
		align-items: center;
		min-height: 2.35rem;
		padding: 0.45rem 0.68rem;
		border: 1px solid rgba(65, 91, 81, 0.22);
		background: rgba(255, 255, 255, 0.56);
		color: #315a4e;
		font-size: 0.83rem;
		font-weight: 720;
		text-decoration: none;
	}

	.literature-hero {
		display: grid;
		grid-template-columns: minmax(0, 0.82fr) minmax(34rem, 1.18fr);
		gap: clamp(1.4rem, 4vw, 3.8rem);
		align-items: center;
		padding: clamp(1.3rem, 3.5vw, 3rem);
		border: 1px solid rgba(51, 77, 68, 0.2);
		background:
			linear-gradient(rgba(49, 90, 78, 0.055) 1px, transparent 1px) 0 0 / 100% 2rem,
			rgba(255, 254, 249, 0.82);
		box-shadow: 0 20px 60px rgba(61, 69, 55, 0.08);
	}

	.literature-kicker {
		margin: 0 0 0.55rem;
		color: #168458;
		font-size: 0.72rem;
		font-weight: 850;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.literature-hero h1,
	.literature-bank-heading h2 {
		margin: 0;
		font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.literature-hero h1 {
		max-width: 10ch;
		font-size: clamp(2.4rem, 5.6vw, 5rem);
		line-height: 0.92;
	}

	.literature-hero-copy > p:not(.literature-kicker) {
		max-width: 33rem;
		margin: 1rem 0 0;
		color: #50635d;
		font-size: 1rem;
		line-height: 1.55;
	}

	.literature-total {
		display: flex;
		gap: 0.55rem;
		align-items: baseline;
		margin-top: 1.3rem;
	}

	.literature-total strong {
		color: #168458;
		font-family: 'Iowan Old Style', Georgia, serif;
		font-size: 2.2rem;
	}

	.literature-total span {
		color: #526778;
		font-size: 0.8rem;
		font-weight: 680;
	}

	.literature-paper-map {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.literature-paper-map > section {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
		border: 1px solid rgba(49, 90, 78, 0.18);
		background: rgba(255, 255, 255, 0.7);
	}

	.literature-paper-map header {
		display: flex;
		gap: 0.65rem;
		align-items: center;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid rgba(49, 90, 78, 0.15);
	}

	.literature-paper-map header > span,
	.literature-section-number {
		display: grid;
		width: 2.4rem;
		height: 2.4rem;
		place-items: center;
		background: #173f35;
		color: #fffdf7;
		font-size: 0.77rem;
		font-weight: 850;
	}

	.literature-paper-map header div,
	.literature-paper-map a {
		display: grid;
		gap: 0.1rem;
	}

	.literature-paper-map header strong {
		font-size: 0.92rem;
	}

	.literature-paper-map header small,
	.literature-paper-map a span {
		color: #687a74;
		font-size: 0.68rem;
	}

	.literature-paper-map a {
		padding: 0.62rem;
		border-left: 3px solid #d9a441;
		background: #f8f4e9;
		color: #172521;
		text-decoration: none;
	}

	.literature-paper-map a strong {
		font-size: 0.85rem;
	}

	.literature-setup-note,
	.literature-anthology-note {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.85rem 1rem;
		border: 1px solid rgba(181, 118, 20, 0.25);
		background: #fff6d9;
		color: #6c4a0c;
	}

	.literature-setup-note div,
	.literature-anthology-note {
		flex-wrap: wrap;
	}

	.literature-setup-note div {
		display: grid;
		gap: 0.12rem;
	}

	.literature-setup-note span,
	.literature-anthology-note span {
		font-size: 0.78rem;
		line-height: 1.35;
	}

	.literature-setup-note a {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: inherit;
		font-size: 0.78rem;
		font-weight: 800;
	}

	.literature-section-nav {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.literature-section-nav a {
		display: grid;
		gap: 0.16rem;
		min-width: 0;
		padding: 0.78rem;
		border: 1px solid rgba(49, 90, 78, 0.18);
		background: rgba(255, 255, 255, 0.7);
		color: #172521;
		text-decoration: none;
	}

	.literature-section-nav a:hover,
	.literature-section-nav a:focus-visible {
		border-color: rgba(22, 132, 88, 0.48);
		transform: translateY(-2px);
	}

	.literature-section-nav a.missing {
		opacity: 0.62;
	}

	.literature-section-nav span,
	.literature-section-nav small {
		color: #687a74;
		font-size: 0.66rem;
	}

	.literature-section-nav strong {
		overflow: hidden;
		font-size: 0.82rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.literature-question-bank {
		display: grid;
		gap: 1rem;
		padding-top: 1.2rem;
	}

	.literature-bank-heading {
		display: flex;
		gap: 1rem;
		align-items: end;
		justify-content: space-between;
	}

	.literature-bank-heading h2 {
		font-size: clamp(2rem, 4vw, 3.4rem);
	}

	.literature-bank-heading p:not(.literature-kicker) {
		margin: 0.45rem 0 0;
		color: #5c6f68;
	}

	.literature-sections {
		display: grid;
		gap: 1rem;
	}

	.literature-section {
		scroll-margin-top: 5rem;
		padding: 1rem;
		border: 1px solid rgba(49, 90, 78, 0.2);
		background: rgba(255, 254, 249, 0.82);
	}

	.literature-section-heading {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(11rem, auto);
		gap: 0.8rem;
		align-items: start;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid rgba(49, 90, 78, 0.16);
	}

	.literature-section-heading p,
	.literature-section-heading h3,
	.literature-section-heading span {
		margin: 0;
	}

	.literature-section-heading p {
		color: #168458;
		font-size: 0.67rem;
		font-weight: 820;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.literature-section-heading h3 {
		margin-top: 0.18rem;
		font-family: 'Iowan Old Style', Georgia, serif;
		font-size: clamp(1.4rem, 3vw, 2.2rem);
		font-weight: 620;
	}

	.literature-section-heading span {
		display: block;
		max-width: 43rem;
		margin-top: 0.25rem;
		color: #63746e;
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.literature-mark-shape {
		display: flex;
		gap: 0.45rem;
		align-items: center;
		justify-self: end;
		padding: 0.55rem 0.65rem;
		border: 1px solid rgba(49, 90, 78, 0.18);
		background: #f4f0e6;
		color: #315a4e;
		font-size: 0.73rem;
	}

	.literature-question-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		margin-top: 0.85rem;
	}

	.literature-question {
		display: grid;
		gap: 0.56rem;
		min-width: 0;
		padding: 0.9rem;
		border: 1px solid rgba(49, 90, 78, 0.16);
		background: #fffefb;
		color: #172521;
		text-decoration: none;
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease,
			transform 150ms ease;
	}

	.literature-question:hover,
	.literature-question:focus-visible {
		border-color: rgba(22, 132, 88, 0.5);
		box-shadow: 0 12px 30px rgba(55, 77, 65, 0.1);
		transform: translateY(-2px);
	}

	.literature-question-meta,
	.literature-question-type-row,
	.literature-question-open {
		display: flex;
		gap: 0.42rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.literature-question-meta span {
		padding: 0.2rem 0.34rem;
		background: #f1eee5;
		color: #61716b;
		font-size: 0.63rem;
		font-weight: 700;
	}

	.literature-question-type-row {
		justify-content: space-between;
	}

	.literature-question-type-row strong {
		color: #168458;
		font-size: 0.72rem;
	}

	.literature-question-type-row em {
		padding: 0.2rem 0.36rem;
		font-size: 0.62rem;
		font-style: normal;
		font-weight: 780;
	}

	.literature-question-type-row em.legacy {
		background: #e9edf0;
		color: #576773;
	}

	.literature-question-type-row em.anthology {
		background: #fff0ca;
		color: #80550a;
	}

	.literature-question h4 {
		margin: 0;
		font-family: 'Iowan Old Style', Georgia, serif;
		font-size: 1.12rem;
		font-weight: 650;
		line-height: 1.18;
	}

	.literature-question > p {
		display: -webkit-box;
		overflow: hidden;
		margin: 0;
		color: #63746e;
		font-size: 0.76rem;
		line-height: 1.4;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.literature-question-open {
		justify-content: flex-end;
		margin-top: auto;
		color: #315a4e;
		font-size: 0.7rem;
		font-weight: 780;
	}

	.literature-show-more {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: center;
		width: 100%;
		margin-top: 0.75rem;
		padding: 0.72rem;
		border: 1px dashed rgba(49, 90, 78, 0.34);
		background: transparent;
		color: #315a4e;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 760;
		cursor: pointer;
	}

	.literature-show-more span {
		color: #71817b;
		font-size: 0.67rem;
	}

	.literature-empty-section {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.85rem;
		padding: 0.9rem;
		background: #f1eee6;
		color: #66756f;
		font-size: 0.8rem;
	}

	.literature-empty-section a {
		color: #315a4e;
		font-weight: 780;
	}

	:global(:root[data-theme='dark']) .literature-app {
		background:
			radial-gradient(circle at 12% 4%, rgba(155, 109, 28, 0.14), transparent 28rem),
			radial-gradient(circle at 94% 12%, rgba(159, 65, 60, 0.12), transparent 30rem), #07131a;
		color: #edf7f1;
	}

	:global(:root[data-theme='dark']) .literature-hero,
	:global(:root[data-theme='dark']) .literature-section,
	:global(:root[data-theme='dark']) .literature-section-nav a,
	:global(:root[data-theme='dark']) .literature-paper-map > section,
	:global(:root[data-theme='dark']) .literature-question {
		border-color: rgba(148, 163, 184, 0.2);
		background: rgba(7, 25, 31, 0.84);
		color: #edf7f1;
	}

	:global(:root[data-theme='dark']) .literature-paper-map a,
	:global(:root[data-theme='dark']) .literature-mark-shape,
	:global(:root[data-theme='dark']) .literature-question-meta span,
	:global(:root[data-theme='dark']) .literature-empty-section {
		background: #10252b;
		color: #c4d3ce;
	}

	:global(:root[data-theme='dark']) .literature-hero-copy > p:not(.literature-kicker),
	:global(:root[data-theme='dark']) .literature-total span,
	:global(:root[data-theme='dark']) .literature-paper-map header small,
	:global(:root[data-theme='dark']) .literature-paper-map a span,
	:global(:root[data-theme='dark']) .literature-section-nav span,
	:global(:root[data-theme='dark']) .literature-section-nav small,
	:global(:root[data-theme='dark']) .literature-bank-heading p:not(.literature-kicker),
	:global(:root[data-theme='dark']) .literature-section-heading span,
	:global(:root[data-theme='dark']) .literature-question > p {
		color: #9fb3ae;
	}

	@media (max-width: 960px) {
		.literature-hero {
			grid-template-columns: minmax(0, 1fr);
		}

		.literature-hero h1 {
			max-width: 14ch;
		}

		.literature-section-nav {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 700px) {
		.literature-layout {
			padding-inline: 0.8rem;
		}

		.literature-back-row,
		.literature-bank-heading,
		.literature-setup-note,
		.literature-empty-section {
			align-items: stretch;
			flex-direction: column;
		}

		.literature-back-row a,
		.literature-bank-heading > a {
			justify-content: center;
		}

		.literature-hero {
			padding: 1rem;
		}

		.literature-hero h1 {
			font-size: clamp(2.5rem, 13vw, 4rem);
		}

		.literature-paper-map,
		.literature-section-nav,
		.literature-question-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.literature-section-heading {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.literature-mark-shape {
			grid-column: 1 / -1;
			justify-self: stretch;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.literature-section-nav a,
		.literature-question {
			transition: none;
		}
	}
</style>
