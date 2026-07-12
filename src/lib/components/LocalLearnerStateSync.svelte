<script lang="ts">
	import {
		markAnonymousLearnerProfileSynced,
		readAnonymousLearnerProfile
	} from '$lib/anonymousLearnerProfile';
	import type { AdminUser } from '$lib/server/auth/session';
	import { onMount } from 'svelte';

	let { user }: { user: AdminUser | null } = $props();

	onMount(() => {
		if (!user) return;
		const profile = readAnonymousLearnerProfile();
		if (!profile?.pendingSync) return;
		void fetch('/api/profile/import-local', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ profile }),
			keepalive: true
		})
			.then((response) => {
				if (!response.ok) throw new Error(`Local profile import failed with ${response.status}`);
				markAnonymousLearnerProfileSynced(profile);
			})
			.catch((error) => console.warn('[local-profile-sync] import deferred', error));
	});
</script>
