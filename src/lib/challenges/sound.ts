import { browser } from '$app/environment';
import { base } from '$app/paths';
import { writable, type Readable } from 'svelte/store';

export type ChallengeSoundEvent = 'select' | 'correct' | 'incorrect' | 'reveal' | 'complete';

type ChallengeSoundSource = {
	oggUrl: string;
	mp3Url: string;
	volume: number;
};

export type ChallengeAudioHandle = {
	currentTime: number;
	volume: number;
	pause: () => void;
	play: () => Promise<void> | void;
};

export type ChallengeSoundRuntime = {
	createAudio: (source: ChallengeSoundSource) => ChallengeAudioHandle | null;
	now: () => number;
	readPreference: () => string | null;
	writePreference: (value: 'on' | 'off') => void;
};

export type ChallengeSoundController = {
	enabled: Readable<boolean>;
	play: (event: ChallengeSoundEvent) => Promise<boolean>;
	setEnabled: (enabled: boolean) => void;
	stop: () => void;
	toggle: () => boolean;
};

const STORAGE_KEY = 'question-constellation-challenge-sound';
const ASSET_ROOT = `${base}/audio/challenges/kenney-interface-sounds`;
const DUPLICATE_WINDOW_MS = 90;

const SOUND_SOURCES: Record<ChallengeSoundEvent, ChallengeSoundSource> = {
	select: soundSource('select_001', 0.14),
	correct: soundSource('confirmation_001', 0.2),
	incorrect: soundSource('error_004', 0.15),
	reveal: soundSource('open_001', 0.17),
	complete: soundSource('confirmation_002', 0.2)
};

function soundSource(fileName: string, volume: number): ChallengeSoundSource {
	return {
		oggUrl: `${ASSET_ROOT}/${fileName}.ogg`,
		mp3Url: `${ASSET_ROOT}/${fileName}.mp3`,
		volume
	};
}

function readInitialPreference(runtime: ChallengeSoundRuntime | null): boolean {
	if (!runtime) return false;

	try {
		return runtime.readPreference() === 'on';
	} catch {
		return false;
	}
}

/**
 * Creates an isolated controller. The public singleton below is used by the app;
 * the factory keeps the audio policy deterministic and testable without a DOM.
 */
export function createChallengeSoundController(
	runtime: ChallengeSoundRuntime | null
): ChallengeSoundController {
	let enabledValue = readInitialPreference(runtime);
	const enabledStore = writable(enabledValue);
	const audioCache = new Map<ChallengeSoundEvent, ChallengeAudioHandle>();
	let currentAudio: ChallengeAudioHandle | null = null;
	let lastEvent: ChallengeSoundEvent | null = null;
	let lastPlayedAt = Number.NEGATIVE_INFINITY;

	function resetAudio(audio: ChallengeAudioHandle) {
		try {
			audio.pause();
			audio.currentTime = 0;
		} catch {
			// A detached or not-yet-loaded media element is already effectively stopped.
		}
	}

	function stop() {
		for (const audio of audioCache.values()) {
			resetAudio(audio);
		}
		currentAudio = null;
	}

	function setEnabled(enabled: boolean) {
		enabledValue = enabled;
		enabledStore.set(enabled);

		try {
			runtime?.writePreference(enabled ? 'on' : 'off');
		} catch {
			// Storage may be unavailable in private browsing; the in-memory choice still works.
		}

		if (!enabled) stop();
	}

	function toggle() {
		const nextValue = !enabledValue;
		setEnabled(nextValue);
		return nextValue;
	}

	function getAudio(event: ChallengeSoundEvent): ChallengeAudioHandle | null {
		const cached = audioCache.get(event);
		if (cached) return cached;

		const audio = runtime?.createAudio(SOUND_SOURCES[event]) ?? null;
		if (!audio) return null;
		audio.volume = SOUND_SOURCES[event].volume;
		audioCache.set(event, audio);
		return audio;
	}

	function play(event: ChallengeSoundEvent): Promise<boolean> {
		if (!enabledValue || !runtime) return Promise.resolve(false);

		const now = runtime.now();
		if (lastEvent === event && now - lastPlayedAt < DUPLICATE_WINDOW_MS) {
			return Promise.resolve(false);
		}

		const audio = getAudio(event);
		if (!audio) return Promise.resolve(false);

		lastEvent = event;
		lastPlayedAt = now;

		if (currentAudio && currentAudio !== audio) resetAudio(currentAudio);
		currentAudio = audio;

		try {
			audio.currentTime = 0;
			// This call intentionally happens synchronously. Call play() from the learner's
			// click/tap handler so iOS can grant playback from that first user gesture.
			const playback = audio.play();
			if (!playback) return Promise.resolve(true);
			return playback.then(
				() => true,
				() => false
			);
		} catch {
			return Promise.resolve(false);
		}
	}

	return {
		enabled: { subscribe: enabledStore.subscribe },
		play,
		setEnabled,
		stop,
		toggle
	};
}

function createBrowserRuntime(): ChallengeSoundRuntime | null {
	if (!browser || typeof window === 'undefined' || typeof Audio === 'undefined') return null;

	let supportsOgg: boolean | null = null;

	return {
		createAudio(source) {
			if (supportsOgg === null) {
				const probe = document.createElement('audio');
				supportsOgg = probe.canPlayType('audio/ogg; codecs="vorbis"') !== '';
			}

			const audio = new Audio();
			audio.preload = 'auto';
			audio.src = supportsOgg ? source.oggUrl : source.mp3Url;
			audio.volume = source.volume;
			return audio;
		},
		now: () => Date.now(),
		readPreference: () => window.localStorage.getItem(STORAGE_KEY),
		writePreference: (value) => window.localStorage.setItem(STORAGE_KEY, value)
	};
}

const challengeSounds = createChallengeSoundController(createBrowserRuntime());

export const challengeSoundEnabled = challengeSounds.enabled;

export function playChallengeSound(event: ChallengeSoundEvent) {
	return challengeSounds.play(event);
}

export function setChallengeSoundEnabled(enabled: boolean) {
	challengeSounds.setEnabled(enabled);
}

export function toggleChallengeSound() {
	return challengeSounds.toggle();
}

export function stopChallengeSounds() {
	challengeSounds.stop();
}
