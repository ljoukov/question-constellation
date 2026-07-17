<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import QuestionBankQuestionCard from '$lib/components/QuestionBankQuestionCard.svelte';
	import type { OcrLiteratureArea } from '$lib/englishLiteratureHub';
	import { ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR } from '$lib/profileNavigation';
	import { recallSessionHref } from '$lib/recall/routes';
	import { BookOpenCheck, ChevronRight } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;

	const initialVisibleCount = 4;
	let visibleCounts = $state<Record<OcrLiteratureArea, number>>({
		modern: initialVisibleCount,
		novel: initialVisibleCount,
		poetry: initialVisibleCount,
		shakespeare: initialVisibleCount
	});

	const courseTextsProfileHref = resolve(`/profile#${ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR}`);
	const literatureCardsHref = resolveInternalPath(
		recallSessionHref({
			subject: 'English Literature',
			activity: 'flashcards',
			size: 10,
			returnTo: '/english-literature'
		})
	);

	function questionHref(question: (typeof data.hub.sections)[number]['questions'][number]) {
		return resolve('/questions/[questionId]', { questionId: question.slug || question.id });
	}

	function seriesLabel(series: string | null, year: number | null) {
		if (series && (!year || series.includes(String(year)))) return series;
		return [series, year].filter(Boolean).join(' ') || 'Past paper';
	}

	function metaLine(parts: Array<string | number | null | undefined>) {
		return parts
			.map((part) => (typeof part === 'number' ? String(part) : part))
			.filter((part): part is string => Boolean(part && part.trim()))
			.join(' · ');
	}

	function showMore(sectionId: OcrLiteratureArea, total: number) {
		visibleCounts[sectionId] = Math.min(total, visibleCounts[sectionId] + 6);
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

<main class="qc-real-app qc-browse-app">
	<AppTopbar
		user={data.user}
		subject="English Literature"
		showSearch={false}
		showSubject={false}
		showNavigation
	/>

	<div class="qc-browse-layout">
		<aside class="qc-context-rail qc-browse-intro">
			<IconBackLink href={resolve('/')} label="Back home" />
			<p class="qc-real-kicker">OCR J352 · your course</p>
			<h1>Your English Literature questions.</h1>
			<p>
				Only questions for the texts your school teaches, grouped by the task format you will meet
				in each paper.
			</p>

			<div class="qc-topic-card-meta" aria-label="Course question count">
				<span>{data.hub.availableQuestionCount} ready to practise</span>
				<span>Paper 1 and Paper 2</span>
			</div>

			{#if data.user}
				<a
					class="qc-dashboard-profile-link"
					href={literatureCardsHref}
					data-analytics-label="English Literature plot and quotation cards"
				>
					<span>Plot and quotations</span>
					<strong>Review study cards</strong>
					<ChevronRight size={18} aria-hidden="true" />
				</a>
			{/if}

			<nav class="qc-real-chain-list" aria-label="Jump to your course section">
				{#each data.hub.sections as section (section.id)}
					<a href={`#${section.id}`}>
						<span>{section.paperNumber}</span>
						<span>{section.selection ?? section.category}</span>
						<small
							>{section.category} · {section.questions.filter(
								(question) => question.practiceAvailable
							).length} ready</small
						>
					</a>
				{/each}
			</nav>

			<a class="qc-action-button compact" href={courseTextsProfileHref}>Change course texts</a>
		</aside>

		<section class="qc-browse-feed" aria-label="Your English Literature question bank">
			<div class="qc-browse-heading qc-bank-heading">
				<div>
					<h2>Choose an essay task.</h2>
					<p>Questions are organised by your taught texts and OCR task format.</p>
				</div>
				<BookOpenCheck size={22} aria-hidden="true" strokeWidth={2.1} />
			</div>

			{#each data.hub.sections as section (section.id)}
				<article id={section.id} class="qc-dashboard-panel qc-topic-card">
					<header class="qc-topic-card-head">
						<div>
							<p class="qc-real-kicker">{section.paperLabel} · {section.category}</p>
							<h3>{section.selection ?? 'Choose this course option'}</h3>
							<p>{section.taskSummary}</p>
							<div class="qc-topic-card-meta" aria-label={`${section.category} metadata`}>
								<span>{section.markShape}</span>
								<span
									>{section.questions.filter((question) => question.practiceAvailable).length}
									ready · {section.questions.length} imported</span
								>
							</div>
						</div>
					</header>

					<div class="qc-topic-question-list">
						{#each section.questions.slice(0, visibleCounts[section.id]) as question (question.id)}
							<QuestionBankQuestionCard
								href={questionHref(question)}
								meta={metaLine([
									seriesLabel(question.series, question.year),
									question.componentCode,
									question.marks ? `${question.marks} marks` : 'Essay task',
									question.sourceRef
								])}
								title={promptHeading(question)}
								detail={promptDetail(question)}
								tag={metaLine([question.questionType, question.formatNote])}
								unavailableReason={question.practiceUnavailableReason}
							/>
						{/each}
					</div>

					{#if visibleCounts[section.id] < section.questions.length}
						<button
							type="button"
							class="qc-show-more-chains"
							onclick={() => showMore(section.id, section.questions.length)}
						>
							Show older {section.selection} questions ({section.questions.length -
								visibleCounts[section.id]} remaining)
						</button>
					{/if}
				</article>
			{/each}
		</section>
	</div>
</main>
