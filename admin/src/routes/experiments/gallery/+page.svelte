<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		galleryConcepts,
		galleryScreenCount,
		galleryUrl,
		type GalleryConcept,
		type GalleryScreen
	} from '$lib/experiments/gallery';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		ChevronLeft,
		ChevronRight,
		Copy,
		Expand,
		Images,
		Info,
		LogOut,
		X
	} from '@lucide/svelte';

	let lightboxOpen = $state(false);
	let linkCopied = $state(false);
	let mainImageButton = $state<HTMLButtonElement>();

	const activeConcept = $derived(
		galleryConcepts.find((concept) => concept.slug === page.url.searchParams.get('concept')) ?? null
	);
	const activeScreen = $derived(
		activeConcept
			? (activeConcept.screens.find(
					(screen) => screen.slug === page.url.searchParams.get('screen')
				) ?? activeConcept.screens[0])
			: null
	);
	const activeScreenIndex = $derived(
		activeConcept && activeScreen ? activeConcept.screens.indexOf(activeScreen) : -1
	);

	$effect(() => {
		if (!lightboxOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});

	$effect(() => {
		page.url.href;
		linkCopied = false;
	});

	function screenUrl(concept: GalleryConcept, screen: GalleryScreen): string {
		return galleryUrl(concept, screen);
	}

	function moveScreen(offset: number): void {
		if (!activeConcept || activeScreenIndex < 0) return;
		const nextIndex =
			(activeScreenIndex + offset + activeConcept.screens.length) % activeConcept.screens.length;
		void goto(screenUrl(activeConcept, activeConcept.screens[nextIndex]), {
			keepFocus: true,
			noScroll: true
		});
	}

	function moveConcept(offset: number): void {
		if (!activeConcept) return;
		const currentIndex = galleryConcepts.indexOf(activeConcept);
		const nextIndex = (currentIndex + offset + galleryConcepts.length) % galleryConcepts.length;
		void goto(galleryUrl(galleryConcepts[nextIndex]), { keepFocus: true, noScroll: true });
	}

	function closeLightbox(): void {
		lightboxOpen = false;
		requestAnimationFrame(() => mainImageButton?.focus());
	}

	function handleKeydown(event: KeyboardEvent): void {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
		) {
			return;
		}
		if (event.key === 'Escape' && lightboxOpen) {
			event.preventDefault();
			closeLightbox();
			return;
		}
		if (!activeConcept) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const offset = event.key === 'ArrowLeft' ? -1 : 1;
			if (event.shiftKey) moveConcept(offset);
			else moveScreen(offset);
		}
		if (event.key.toLowerCase() === 'f') {
			event.preventDefault();
			lightboxOpen = !lightboxOpen;
		}
	}

	async function copyLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(window.location.href);
			linkCopied = true;
			window.setTimeout(() => (linkCopied = false), 1_600);
		} catch {
			linkCopied = false;
		}
	}
</script>

<svelte:head>
	<title>Flow gallery · Question Constellation</title>
	<meta
		name="description"
		content="Internal gallery for Question Constellation iPad product-flow experiments."
	/>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-background text-foreground">
	<header
		class="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur md:px-5"
	>
		<div class="flex min-w-0 items-center gap-2">
			<Button href="/" variant="ghost" size="sm" aria-label="Back to analytics">
				<ArrowLeft />
				<span class="hidden sm:inline">Analytics</span>
			</Button>
			<div class="h-5 w-px bg-border"></div>
			<div class="flex min-w-0 items-center gap-2">
				<Images class="size-4 shrink-0 text-muted-foreground" />
				<span class="truncate text-sm font-semibold">Flow gallery</span>
				<Badge variant="secondary">{galleryScreenCount} screens</Badge>
			</div>
		</div>
		<div class="flex items-center gap-1">
			<span class="hidden text-xs text-muted-foreground lg:inline"
				>←/→ screens · ⇧←/→ concepts · F full</span
			>
			<Button href="/auth/logout" variant="ghost" size="icon-sm" aria-label="Sign out">
				<LogOut />
			</Button>
		</div>
	</header>

	<nav
		class="sticky top-14 z-20 flex h-12 items-center gap-1 overflow-x-auto border-b bg-background/95 px-3 backdrop-blur md:px-5"
		aria-label="Gallery concepts"
	>
		<a
			href="/experiments/gallery"
			class:gallery-tab-active={!activeConcept}
			class="gallery-tab"
			aria-current={!activeConcept ? 'page' : undefined}>Overview</a
		>
		{#each galleryConcepts as concept}
			<a
				href={galleryUrl(concept)}
				class:gallery-tab-active={activeConcept?.slug === concept.slug}
				class="gallery-tab"
				aria-current={activeConcept?.slug === concept.slug ? 'page' : undefined}
			>
				{concept.shortTitle}
				<span class="text-[11px] text-muted-foreground">{concept.screens.length}</span>
			</a>
		{/each}
	</nav>

	{#if !activeConcept}
		<main class="mx-auto max-w-[1680px] space-y-8 p-4 md:p-6 xl:p-8">
			<section class="max-w-3xl space-y-4 py-3 md:py-6">
				<Badge variant="outline">Internal experiment</Badge>
				<h1 class="text-3xl font-semibold tracking-tight md:text-5xl">
					Three ways the app could feel.
				</h1>
				<p class="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
					Independent 4:3 iPad directions for the same verified journey. These are operational UI
					screens: navigation, answer entry, checking, recheck, progress, papers, and recall.
				</p>
			</section>

			<section class="grid gap-5 lg:grid-cols-3" aria-label="Visual directions">
				{#each galleryConcepts as concept}
					<article class="overflow-hidden rounded-xl border bg-card shadow-sm">
						<a class="group block" href={galleryUrl(concept)}>
							<div class="relative aspect-4/3 overflow-hidden bg-black">
								<img
									src={concept.screens[0].thumb}
									alt={concept.screens[0].alt}
									width="724"
									height="543"
									decoding="async"
									class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none"
								/>
								<div
									class="absolute right-0 bottom-0 left-0 h-1"
									style:background={concept.accent}
								></div>
							</div>
							<div class="space-y-3 p-5">
								<div class="flex items-start justify-between gap-3">
									<div>
										<h2 class="font-semibold tracking-tight">{concept.title}</h2>
										<p class="mt-1 text-xs text-muted-foreground">{concept.recommendation}</p>
									</div>
									<ArrowRight class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								</div>
								<p class="text-sm leading-relaxed text-muted-foreground">{concept.summary}</p>
								<div class="flex items-center justify-between border-t pt-3 text-xs">
									<span>{concept.screens.length} reviewed screens</span>
									<span class="font-medium">Open flow</span>
								</div>
							</div>
						</a>
					</article>
				{/each}
			</section>

			<section class="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-[1.3fr_1fr] md:p-6">
				<div>
					<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						Recommendation
					</p>
					<h2 class="mt-2 text-xl font-semibold">One skin, selected mechanics.</h2>
					<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						Use Living Paper as the visual and spatial base. Borrow Electric Paper’s explicit state
						sequence and Afterglow Atlas’s dense-answer and protected-paper patterns. Do not average
						the three visual styles.
					</p>
				</div>
				<div class="grid gap-3 text-sm">
					{#each galleryConcepts as concept}
						<div class="rounded-lg border bg-background p-3">
							<p class="font-medium">{concept.shortTitle}</p>
							<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{concept.strongest}</p>
						</div>
					{/each}
				</div>
			</section>
		</main>
	{:else if activeScreen}
		<main class="mx-auto max-w-[1800px] space-y-4 p-3 md:p-5">
			<section
				class="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between"
			>
				<div class="min-w-0">
					<div class="mb-2 flex items-center gap-2">
						<span class="size-2 rounded-full" style:background={activeConcept.accent}></span>
						<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
							{activeConcept.recommendation}
						</p>
					</div>
					<h1 class="truncate text-2xl font-semibold tracking-tight">{activeConcept.title}</h1>
					<p class="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
						{activeConcept.summary}
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<Button variant="outline" size="sm" onclick={copyLink}>
						{#if linkCopied}<Check />Copied{:else}<Copy />Copy link{/if}
					</Button>
					<Button variant="outline" size="sm" onclick={() => (lightboxOpen = true)}>
						<Expand />Full screen
					</Button>
				</div>
			</section>

			<div
				class="grid gap-4 md:grid-cols-[184px_minmax(0,1fr)] 2xl:grid-cols-[184px_minmax(0,1fr)_300px]"
			>
				<aside
					class="flex gap-2 overflow-x-auto pb-2 md:max-h-[calc(100vh-13rem)] md:flex-col md:overflow-y-auto md:pr-1 md:pb-0"
					aria-label={`${activeConcept.title} screens`}
				>
					{#each activeConcept.screens as screen, index}
						<a
							href={screenUrl(activeConcept, screen)}
							class:screen-thumb-active={screen.slug === activeScreen.slug}
							class="screen-thumb"
							aria-current={screen.slug === activeScreen.slug ? 'page' : undefined}
						>
							<img
								src={screen.thumb}
								alt=""
								width="724"
								height="543"
								loading="lazy"
								decoding="async"
								class="aspect-4/3 w-32 rounded object-contain md:w-full"
							/>
							<span class="min-w-28 md:min-w-0">
								<small>{String(index + 1).padStart(2, '0')}</small>
								<strong>{screen.title}</strong>
							</span>
						</a>
					{/each}
				</aside>

				<section class="min-w-0 space-y-3" aria-labelledby="active-screen-title">
					<div class="overflow-hidden rounded-xl border bg-black shadow-sm">
						<button
							bind:this={mainImageButton}
							type="button"
							class="group relative block aspect-4/3 w-full cursor-zoom-in bg-black"
							onclick={() => (lightboxOpen = true)}
							aria-label={`Open ${activeScreen.title} full screen`}
						>
							<img
								src={activeScreen.full}
								alt={activeScreen.alt}
								width="1448"
								height="1086"
								decoding="async"
								class="h-full w-full object-contain"
							/>
							<span
								class="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-xs text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
								><Expand class="size-3.5" />Full screen</span
							>
						</button>
					</div>

					<div class="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
						<div class="min-w-0" aria-live="polite">
							<p class="text-xs text-muted-foreground">
								{activeScreenIndex + 1} of {activeConcept.screens.length}
							</p>
							<h2 id="active-screen-title" class="mt-0.5 font-semibold">{activeScreen.title}</h2>
							<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
								{activeScreen.description}
							</p>
						</div>
						<div class="flex shrink-0 gap-1">
							<Button
								variant="outline"
								size="icon-sm"
								onclick={() => moveScreen(-1)}
								aria-label="Previous screen"
							>
								<ChevronLeft />
							</Button>
							<Button
								variant="outline"
								size="icon-sm"
								onclick={() => moveScreen(1)}
								aria-label="Next screen"
							>
								<ChevronRight />
							</Button>
						</div>
					</div>
				</section>

				<aside class="hidden space-y-4 2xl:block">
					<div class="rounded-xl border bg-card p-4">
						<div class="flex items-center gap-2 text-sm font-semibold">
							<Info class="size-4" />Review notes
						</div>
						<dl class="mt-4 space-y-4 text-sm">
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Strongest contribution</dt>
								<dd class="mt-1 leading-relaxed">{activeConcept.strongest}</dd>
							</div>
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Main risk</dt>
								<dd class="mt-1 leading-relaxed">{activeConcept.risk}</dd>
							</div>
						</dl>
					</div>
					<div
						class="rounded-xl border bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground"
					>
						All screens are exact 4:3 iPad canvases. Use the full-screen view for typography and
						source-detail review.
					</div>
				</aside>
			</div>

			<details class="rounded-lg border bg-card p-4 text-sm 2xl:hidden">
				<summary class="font-medium text-foreground">Concept review notes</summary>
				<div class="mt-3 grid gap-3 sm:grid-cols-2">
					<div>
						<p class="text-xs font-medium text-muted-foreground">Strongest contribution</p>
						<p class="mt-1 leading-relaxed">{activeConcept.strongest}</p>
					</div>
					<div>
						<p class="text-xs font-medium text-muted-foreground">Main risk</p>
						<p class="mt-1 leading-relaxed">{activeConcept.risk}</p>
					</div>
				</div>
			</details>
		</main>
	{/if}
</div>

{#if lightboxOpen && activeConcept && activeScreen}
	<div
		class="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
		role="dialog"
		aria-modal="true"
		aria-label={`${activeConcept.title}: ${activeScreen.title}`}
	>
		<div class="flex h-14 items-center justify-between border-b border-white/15 px-3 md:px-5">
			<div class="min-w-0">
				<p class="truncate text-sm font-medium">{activeConcept.title} · {activeScreen.title}</p>
				<p class="text-xs text-white/55">
					{activeScreenIndex + 1} of {activeConcept.screens.length}
				</p>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={closeLightbox}
				aria-label="Close full-screen view"
				class="text-white hover:bg-white/10 hover:text-white"
			>
				<X />
			</Button>
		</div>
		<div class="relative min-h-0 flex-1 p-3 md:p-5">
			<img
				src={activeScreen.full}
				alt={activeScreen.alt}
				width="1448"
				height="1086"
				class="h-full w-full object-contain"
			/>
			<button
				class="lightbox-arrow left-3 md:left-5"
				type="button"
				onclick={() => moveScreen(-1)}
				aria-label="Previous screen"
			>
				<ChevronLeft />
			</button>
			<button
				class="lightbox-arrow right-3 md:right-5"
				type="button"
				onclick={() => moveScreen(1)}
				aria-label="Next screen"
			>
				<ChevronRight />
			</button>
		</div>
	</div>
{/if}

<style>
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
			transition-duration: 0s !important;
		}
	}
</style>
