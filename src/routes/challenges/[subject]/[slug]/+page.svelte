<script lang="ts">
	import { resolve } from '$app/paths';
	import ChallengeGame from '$lib/challenges/ChallengeGame.svelte';
	import { challengePath } from '$lib/challenges/catalog';
	import {
		challengeSocialImage,
		challengeSocialImageAlt,
		challengeSocialImageHeight,
		challengeSocialImageWidth
	} from '$lib/challenges/seo';
	import ChallengeButton from '$lib/challenges/ui/ChallengeButton.svelte';
	import ChallengeHowItWorks from '$lib/challenges/ui/ChallengeHowItWorks.svelte';
	import ChallengePanel from '$lib/challenges/ui/ChallengePanel.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import {
		BookOpenCheck,
		CalendarCheck2,
		ExternalLink,
		FileCheck2,
		ShieldCheck
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const subjectLabel = $derived(
		data.challenge.subject === 'biology' ? 'GCSE Biology' : 'GCSE Physics'
	);
	const subjectCanonicalPath = $derived(`/challenges/${data.challenge.subject}`);
	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const questionCanonicalPath = $derived(`/questions/${data.question.id}`);
	const chainHref = $derived(resolve('/constellations/[chainId]', { chainId: data.chain.id }));
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com${challengePath(data.challenge)}`
	);
	const pageTitle = $derived(`${data.challenge.title} | ${subjectLabel}`);
	const contextLine = $derived(
		[
			data.question.meta.board,
			data.question.meta.qualification,
			data.question.meta.subject,
			data.question.meta.tier,
			data.question.sourceRef
		]
			.filter(Boolean)
			.join(' · ')
	);
	const reviewedDate = $derived(
		new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${data.challenge.lastReviewed}T00:00:00Z`))
	);
	const jsonLd = $derived.by(() =>
		JSON.stringify([
			{
				'@context': 'https://schema.org',
				'@type': 'BreadcrumbList',
				itemListElement: [
					{
						'@type': 'ListItem',
						position: 1,
						name: 'Question Constellation',
						item: 'https://constellation.eviworld.com/'
					},
					{
						'@type': 'ListItem',
						position: 2,
						name: 'GCSE Science Challenges',
						item: 'https://constellation.eviworld.com/challenges'
					},
					{
						'@type': 'ListItem',
						position: 3,
						name: subjectLabel,
						item: `https://constellation.eviworld.com${subjectCanonicalPath}`
					},
					{
						'@type': 'ListItem',
						position: 4,
						name: data.challenge.title,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'LearningResource',
				name: data.challenge.title,
				description: data.challenge.metaDescription,
				url: canonicalUrl,
				learningResourceType: 'Interactive challenge',
				educationalLevel: 'GCSE',
				about: [subjectLabel, data.challenge.topic, 'Exam answer reasoning'],
				teaches: data.challenge.memoryHandle,
				timeRequired: `PT${data.challenge.estimatedMinutes}M`,
				isAccessibleForFree: true,
				dateModified: data.challenge.lastReviewed,
				inLanguage: 'en-GB',
				provider: {
					'@type': 'Organization',
					name: 'Question Constellation',
					url: 'https://constellation.eviworld.com/'
				},
				isBasedOn: {
					'@type': 'LearningResource',
					name: data.question.sourceRef,
					...(data.questionStandaloneAvailable
						? { url: `https://constellation.eviworld.com${questionCanonicalPath}` }
						: {})
				}
			}
		]).replace(/</g, '\\u003c')
	);
	const jsonLdScript = $derived(`<script type="application/ld+json">${jsonLd}</` + 'script>');
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={data.challenge.metaDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Question Constellation" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={data.challenge.metaDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={challengeSocialImage} />
	<meta property="og:image:width" content={challengeSocialImageWidth} />
	<meta property="og:image:height" content={challengeSocialImageHeight} />
	<meta property="og:image:alt" content={challengeSocialImageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={data.challenge.metaDescription} />
	<meta name="twitter:image" content={challengeSocialImage} />
	<meta name="twitter:image:alt" content={challengeSocialImageAlt} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<ChallengeRouteShell user={data.user} wide immersive>
	<div class="challenge-leaf-shell">
		<ChallengeGame
			challenge={data.challenge}
			question={data.question}
			transferQuestion={data.transferQuestion}
			chain={data.chain}
			nextChallenge={data.nextChallenge}
		/>

		<ChallengePanel>
			<section class="worked-explanation" aria-labelledby="worked-explanation-title">
				<div>
					<p>Worked answer guide · spoiler</p>
					<h2 id="worked-explanation-title">
						{data.challenge.topic}: why one answer loses the mark
					</h2>
				</div>
				<details>
					<summary>Show the answer comparison</summary>
					<p>{data.challenge.showdownExplanation}</p>
					<p><strong>Command-word check:</strong> {data.challenge.commandWordLesson}</p>
				</details>
				{#if data.nextChallenge}
					<ChallengeButton
						variant="secondary"
						href={challengePath(data.nextChallenge)}
						analyticsLabel={`Challenge ${data.challenge.id}: related next challenge ${data.nextChallenge.id}`}
					>
						Next question: {data.nextChallenge.title}
					</ChallengeButton>
				{/if}
			</section>
		</ChallengePanel>

		<ChallengeHowItWorks
			eyebrow="How this round works"
			title="Evidence before explanation"
			headingId="challenge-method-title"
		/>

		<ChallengePanel>
			<section class="challenge-provenance" aria-labelledby="source-title">
				<div class="provenance-icon" aria-hidden="true"><ShieldCheck size={25} /></div>
				<div>
					<p>Source and review</p>
					<h2 id="source-title">Know what you are practising</h2>
					<p>
						Question Constellation is an independent revision resource and is not affiliated with or
						endorsed by {data.question.meta.board}. The compact focus is our adaptation and the
						expanded card is our reconstruction of the question cited from {contextLine}. We checked
						this challenge against the associated marking guidance. The sample answers, comparison,
						feedback and Question Chain are our teaching interpretation, not an official mark. Other
						scientifically valid wording may also earn credit.
					</p>
					<ul>
						<li><FileCheck2 size={16} aria-hidden="true" /> {data.question.sourceRef}</li>
						<li>
							<CalendarCheck2 size={16} aria-hidden="true" /> Last checked against cited marking points:
							{reviewedDate}
						</li>
						<li>
							<BookOpenCheck size={16} aria-hidden="true" /> Content version {data.challenge
								.version}
						</li>
					</ul>
				</div>
				<nav aria-label="Challenge sources">
					{#if data.questionStandaloneAvailable}
						<a href={questionHref}>
							View this question in Question Constellation
							<ExternalLink size={15} aria-hidden="true" />
						</a>
					{:else}
						<span
							>The reviewed source reconstruction is shown above; no standalone page is published.</span
						>
					{/if}
					<a href={chainHref}>
						View our Question Chain
						<ExternalLink size={15} aria-hidden="true" />
					</a>
				</nav>
			</section>
		</ChallengePanel>
	</div>
</ChallengeRouteShell>

<style>
	.challenge-leaf-shell {
		display: grid;
		gap: clamp(2rem, 5vw, 4rem);
		min-width: 0;
	}

	.worked-explanation {
		display: grid;
		gap: 1rem;
	}

	.worked-explanation p,
	.worked-explanation h2 {
		margin: 0;
	}

	.worked-explanation > div > p {
		margin-bottom: 0.45rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.worked-explanation h2 {
		font-size: clamp(1.35rem, 3vw, 1.8rem);
		font-weight: 560;
		line-height: 1.2;
	}

	.worked-explanation details {
		display: grid;
		gap: 0.75rem;
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border-subtle);
	}

	.worked-explanation summary {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--qc-ui-accent-text);
		font-weight: 650;
		cursor: pointer;
	}

	.worked-explanation details p {
		margin-top: 0.75rem;
		color: var(--qc-ui-text-secondary);
		line-height: 1.55;
	}

	.challenge-provenance > div > p:first-child {
		margin: 0 0 0.55rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.challenge-provenance h2 {
		margin: 0;
		color: var(--qc-ui-text);
		font-size: clamp(1.4rem, 3vw, 2rem);
		font-weight: 560;
		letter-spacing: 0;
	}

	.challenge-provenance {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: start;
	}

	.provenance-icon {
		display: grid;
		width: 3rem;
		height: 3rem;
		place-items: center;
		border-radius: 0;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.challenge-provenance h2 + p {
		max-width: 43rem;
		margin: 0.7rem 0 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.challenge-provenance ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 0.9rem;
		margin: 0.8rem 0 0;
		padding: 0;
		list-style: none;
	}

	.challenge-provenance li {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.challenge-provenance nav {
		display: grid;
		gap: 0.5rem;
		min-width: 11rem;
	}

	.challenge-provenance nav a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.45rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.78rem;
		font-weight: 650;
	}

	.challenge-provenance nav > span {
		max-width: 14rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.75rem;
		line-height: 1.45;
	}

	@media (max-width: 700px) {
		.challenge-provenance {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.challenge-provenance nav {
			grid-column: 2;
			min-width: 0;
		}
	}

	@media (max-width: 420px) {
		.challenge-provenance {
			grid-template-columns: 1fr;
		}

		.provenance-icon {
			width: 2.6rem;
			height: 2.6rem;
		}

		.challenge-provenance nav {
			grid-column: 1;
		}
	}
</style>
