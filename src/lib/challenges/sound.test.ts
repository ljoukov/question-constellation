import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import {
	createChallengeSoundController,
	type ChallengeAudioHandle,
	type ChallengeSoundRuntime
} from './sound';

function createHarness(initialPreference: string | null = null) {
	let now = 1_000;
	let persisted = initialPreference;
	const created: Array<
		ChallengeAudioHandle & { pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }
	> = [];
	const sources: Array<{ oggUrl: string; mp3Url: string; volume: number }> = [];

	const runtime: ChallengeSoundRuntime = {
		createAudio(source) {
			sources.push(source);
			const audio = {
				currentTime: 0,
				volume: 1,
				pause: vi.fn(),
				play: vi.fn(() => Promise.resolve())
			};
			created.push(audio);
			return audio;
		},
		now: () => now,
		readPreference: () => persisted,
		writePreference: (value) => {
			persisted = value;
		}
	};

	return {
		controller: createChallengeSoundController(runtime),
		created,
		get persisted() {
			return persisted;
		},
		setNow(value: number) {
			now = value;
		},
		sources
	};
}

describe('challenge sound controller', () => {
	it('defaults to muted without constructing or playing audio', () => {
		const harness = createHarness();

		expect(get(harness.controller.enabled)).toBe(false);
		expect(harness.created).toHaveLength(0);
	});

	it('honours and persists an off preference', async () => {
		const harness = createHarness('off');

		expect(get(harness.controller.enabled)).toBe(false);
		expect(await harness.controller.play('select')).toBe(false);
		expect(harness.created).toHaveLength(0);

		harness.controller.setEnabled(true);

		expect(get(harness.controller.enabled)).toBe(true);
		expect(harness.persisted).toBe('on');
	});

	it('constructs the requested cue lazily with OGG and MP3 sources', async () => {
		const harness = createHarness('on');

		expect(await harness.controller.play('correct')).toBe(true);
		expect(harness.created).toHaveLength(1);
		expect(harness.created[0]?.play).toHaveBeenCalledOnce();
		expect(harness.sources[0]?.oggUrl).toMatch(/confirmation_001\.ogg$/);
		expect(harness.sources[0]?.mp3Url).toMatch(/confirmation_001\.mp3$/);
		expect(harness.created[0]?.volume).toBeLessThanOrEqual(0.2);
	});

	it('suppresses rapid duplicate requests but allows a later replay', async () => {
		const harness = createHarness('on');

		expect(await harness.controller.play('incorrect')).toBe(true);
		harness.setNow(1_050);
		expect(await harness.controller.play('incorrect')).toBe(false);
		harness.setNow(1_100);
		expect(await harness.controller.play('incorrect')).toBe(true);

		expect(harness.created).toHaveLength(1);
		expect(harness.created[0]?.play).toHaveBeenCalledTimes(2);
	});

	it('stops the previous cue and all cached audio when disabled', async () => {
		const harness = createHarness('on');

		await harness.controller.play('select');
		harness.setNow(1_200);
		await harness.controller.play('reveal');
		harness.controller.setEnabled(false);

		expect(harness.created).toHaveLength(2);
		expect(harness.created[0]?.pause).toHaveBeenCalledTimes(2);
		expect(harness.created[1]?.pause).toHaveBeenCalledOnce();
		expect(harness.persisted).toBe('off');
	});
});
