<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { ShieldX } from '@lucide/svelte';
</script>

<svelte:head><title>Access denied · Constellation Admin</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
	<Card.Root class="w-full max-w-md border-destructive/20">
		<Card.Header class="text-center">
			<ShieldX class="mx-auto mb-4 size-10 text-destructive" />
			<Card.Title>Access denied</Card.Title>
			<Card.Description class="mt-2"
				>This Google account is not approved for Constellation Admin.</Card.Description
			>
		</Card.Header>
		<Card.Content
			><Button href="/auth/start" variant="outline" class="w-full">Use another account</Button
			></Card.Content
		>
	</Card.Root>
</main>
