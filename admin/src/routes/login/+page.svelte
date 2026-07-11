<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { ShieldCheck, Sparkles } from '@lucide/svelte';
</script>

<svelte:head><title>Sign in · Constellation Admin</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
	<Card.Root class="w-full max-w-md border-primary/15 shadow-2xl shadow-black/20">
		<Card.Header class="space-y-4 text-center">
			<div
				class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
			>
				<Sparkles class="size-5" />
			</div>
			<div>
				<Card.Title class="text-xl">Constellation Admin</Card.Title>
				<Card.Description class="mt-2"
					>Restricted product analytics and model evidence.</Card.Description
				>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Button href="/auth/start" size="lg" class="w-full">Continue with Google</Button>
			<p class="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
				<ShieldCheck class="size-3.5" />Only explicitly approved Firebase users can continue.
			</p>
		</Card.Content>
	</Card.Root>
</main>
