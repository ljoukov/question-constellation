import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { challengeCatalog } from './catalog';
import { biologyExpansion } from './expansions/biology';
import { chemistryExpansion } from './expansions/chemistry';
import { physicsExpansion } from './expansions/physics';
import { generatedScienceChallengeVisuals } from './generatedRuntime';
import {
	allChallengeVisualIds,
	assertFinalChallengeArtOwnership,
	challengeVisual,
	type ChallengeCardArt,
	type ChallengeVisualDefinition
} from './visuals';

const targetAspectRatio = 16 / 9;
const aspectRatioTolerance = 0.015;

type WebpMetadata = {
	width: number;
	height: number;
	hasAlpha: boolean;
};

function readUint24LE(buffer: Buffer, offset: number) {
	return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readWebpMetadata(filePath: string): WebpMetadata {
	const buffer = readFileSync(filePath);
	if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
		throw new Error(`${filePath} is not a WebP file.`);
	}

	let width: number | undefined;
	let height: number | undefined;
	let hasAlpha = false;

	for (let offset = 12; offset + 8 <= buffer.length; ) {
		const chunk = buffer.toString('ascii', offset, offset + 4);
		const chunkSize = buffer.readUInt32LE(offset + 4);
		const dataOffset = offset + 8;

		if (dataOffset + chunkSize > buffer.length) {
			throw new Error(`${filePath} contains a truncated ${chunk} chunk.`);
		}

		if (chunk === 'VP8X') {
			hasAlpha ||= Boolean(buffer[dataOffset] & 0x10);
			width = readUint24LE(buffer, dataOffset + 4) + 1;
			height = readUint24LE(buffer, dataOffset + 7) + 1;
		} else if (chunk === 'VP8 ' && width === undefined) {
			if (buffer.toString('hex', dataOffset + 3, dataOffset + 6) !== '9d012a') {
				throw new Error(`${filePath} contains an invalid VP8 frame header.`);
			}
			width = buffer.readUInt16LE(dataOffset + 6) & 0x3fff;
			height = buffer.readUInt16LE(dataOffset + 8) & 0x3fff;
		} else if (chunk === 'VP8L' && width === undefined) {
			if (buffer[dataOffset] !== 0x2f) {
				throw new Error(`${filePath} contains an invalid VP8L frame header.`);
			}
			const bits = buffer.readUInt32LE(dataOffset + 1);
			width = (bits & 0x3fff) + 1;
			height = ((bits >>> 14) & 0x3fff) + 1;
			hasAlpha ||= Boolean((bits >>> 28) & 1);
		} else if (chunk === 'ALPH') {
			hasAlpha = true;
		}

		offset = dataOffset + chunkSize + (chunkSize % 2);
	}

	if (!width || !height) {
		throw new Error(`${filePath} does not contain readable WebP dimensions.`);
	}

	return { width, height, hasAlpha };
}

function staticAssetPath(source: string) {
	const sourcePath = source.split('?')[0] ?? source;
	const productPathIndex = sourcePath.indexOf('/product/');
	if (productPathIndex < 0) {
		throw new Error(`Challenge art must use the static /product/ tree: ${source}`);
	}
	return join(process.cwd(), 'static', sourcePath.slice(productPathIndex + 1));
}

function fixtureCardArt(id: string, revision = ''): ChallengeCardArt {
	return {
		src: `/product/challenges/cards/${id}-light-v1.webp${revision}`,
		darkSrc: `/product/challenges/cards/${id}-dark-v1.webp${revision}`,
		alt: `${id} fixture art`,
		width: 1600,
		height: 900
	};
}

function fixtureVisual(cardArt: ChallengeCardArt): ChallengeVisualDefinition {
	return {
		segments: ['Observe', 'Connect', 'Apply'],
		decisiveIndex: 1,
		decisiveLabel: 'Connect the evidence.',
		cardArt
	};
}

describe('challenge visual definitions', () => {
	it('gives every challenge one decisive visual gap', () => {
		expect(allChallengeVisualIds().sort()).toEqual(challengeCatalog.map((item) => item.id).sort());

		for (const challenge of challengeCatalog) {
			const visual = challengeVisual(challenge);
			expect(visual, challenge.id).toBeDefined();
			expect(visual?.segments.length, challenge.id).toBeGreaterThanOrEqual(3);
			expect(visual?.decisiveIndex, challenge.id).toBeGreaterThanOrEqual(0);
			expect(visual?.decisiveIndex, challenge.id).toBeLessThan(visual?.segments.length ?? 0);
			expect(visual?.decisiveLabel.trim(), challenge.id).not.toBe('');
		}
	});

	it('ships complete theme pairs for every earned illustration', () => {
		for (const challenge of challengeCatalog) {
			const visual = challengeVisual(challenge);
			const illustration = visual?.earnedIllustration;
			if (!illustration) continue;

			expect(illustration.src).toMatch(/-dark-v1\.webp$/);
			expect(illustration.lightSrc).toMatch(/-light-v1\.webp$/);
			expect(illustration.width / illustration.height).toBeCloseTo(16 / 9, 2);

			if (visual.mobilePanels) {
				expect(visual.mobilePanels.map((panel) => panel.label)).toEqual(visual.segments);
				expect(new Set(visual.mobilePanels.map((panel) => panel.position)).size).toBe(
					visual.mobilePanels.length
				);
			}
		}
	});

	it('gives every final primary pair one challenge owner', () => {
		const expansionIds = new Set(
			[...biologyExpansion, ...chemistryExpansion, ...physicsExpansion].map(
				(challenge) => challenge.id
			)
		);
		expect(expansionIds.size).toBe(60);

		const hasEveryExpansionOverride = [...expansionIds].every((id) =>
			Object.hasOwn(generatedScienceChallengeVisuals, id)
		);
		const finalPrimaryArtCatalog = hasEveryExpansionOverride
			? challengeCatalog
			: challengeCatalog.filter((challenge) => !expansionIds.has(challenge.id));
		const ownership = assertFinalChallengeArtOwnership(
			finalPrimaryArtCatalog.map((challenge) => ({
				id: challenge.id,
				visual: challengeVisual(challenge)
			}))
		);

		expect(ownership.filter((pair) => pair.roles.includes('primary'))).toHaveLength(
			finalPrimaryArtCatalog.length
		);
		if (hasEveryExpansionOverride) {
			expect(finalPrimaryArtCatalog).toHaveLength(challengeCatalog.length);
		}
	});

	it('keeps targeted authored catalogue corrections on their reviewed art', () => {
		if (!Object.hasOwn(generatedScienceChallengeVisuals, 'chemistry-equilibrium-pressure')) {
			expect(challengeVisual({ id: 'chemistry-equilibrium-pressure' })?.cardArt?.src).toContain(
				'/product/challenges/cards/chemistry-equilibrium-pressure-light-v3.webp'
			);
		}
		if (!Object.hasOwn(generatedScienceChallengeVisuals, 'physics-half-range')) {
			expect(challengeVisual({ id: 'physics-half-range' })?.transferArt).toBeUndefined();
		}
	});

	it('rejects cross-challenge pair reuse without rejecting same-challenge reuse or extra art', () => {
		const sharedPrimary = fixtureCardArt('shared-primary', '?rev=one');
		const sameFilesWithAnotherRevision = fixtureCardArt('shared-primary', '?rev=two');
		const ownedExtra = fixtureCardArt('owned-extra');
		const firstVisual = {
			...fixtureVisual(sharedPrimary),
			transferArt: sameFilesWithAnotherRevision,
			earnedIllustration: {
				id: 'owned-extra',
				src: ownedExtra.darkSrc!,
				lightSrc: ownedExtra.src,
				alt: ownedExtra.alt,
				caption: 'An explicitly owned extra functional diagram.',
				width: ownedExtra.width,
				height: ownedExtra.height
			}
		};

		expect(() =>
			assertFinalChallengeArtOwnership([{ id: 'challenge-one', visual: firstVisual }])
		).not.toThrow();
		expect(() =>
			assertFinalChallengeArtOwnership([
				{ id: 'challenge-one', visual: firstVisual },
				{ id: 'challenge-two', visual: fixtureVisual(sameFilesWithAnotherRevision) }
			])
		).toThrow(/shared across challenge-one and challenge-two/);
		expect(() =>
			assertFinalChallengeArtOwnership([
				{
					id: 'missing-primary',
					visual: {
						segments: ['Observe', 'Connect', 'Apply'],
						decisiveIndex: 1,
						decisiveLabel: 'Connect the evidence.'
					}
				}
			])
		).toThrow(/exactly one primary light\/dark art pair/);
	});

	it('ships every challenge with an opaque 16:9 light/dark card-art pair', () => {
		const mappedPairs: Array<{
			id: string;
			kind: 'card' | 'hero' | 'transfer';
			lightSource: string;
			darkSource: string;
			declaredWidth: number;
			declaredHeight: number;
		}> = [];

		for (const challenge of challengeCatalog) {
			const visual = challengeVisual(challenge);
			expect(visual?.cardArt, `${challenge.id} card art`).toBeDefined();
			expect(visual?.cardArt?.alt.trim(), `${challenge.id} card art alt text`).not.toBe('');
			expect(visual?.cardArt?.darkSrc, `${challenge.id} card art dark source`).toBeDefined();
			mappedPairs.push({
				id: challenge.id,
				kind: 'card',
				lightSource: visual!.cardArt!.src,
				darkSource: visual!.cardArt!.darkSrc!,
				declaredWidth: visual!.cardArt!.width,
				declaredHeight: visual!.cardArt!.height
			});

			if (visual?.transferArt) {
				expect(visual.transferArt.alt.trim(), `${challenge.id} transfer art alt`).not.toBe('');
				expect(
					visual.transferArt.darkSrc,
					`${challenge.id} transfer art dark source`
				).toBeDefined();
				mappedPairs.push({
					id: challenge.id,
					kind: 'transfer',
					lightSource: visual.transferArt.src,
					darkSource: visual.transferArt.darkSrc!,
					declaredWidth: visual.transferArt.width,
					declaredHeight: visual.transferArt.height
				});
			}

			if (visual?.earnedIllustration) {
				mappedPairs.push({
					id: challenge.id,
					kind: 'hero',
					lightSource: visual.earnedIllustration.lightSrc,
					darkSource: visual.earnedIllustration.src,
					declaredWidth: visual.earnedIllustration.width,
					declaredHeight: visual.earnedIllustration.height
				});
			}
		}

		expect(mappedPairs.filter((pair) => pair.kind === 'card')).toHaveLength(
			challengeCatalog.length
		);

		for (const pair of mappedPairs) {
			expect(pair.lightSource, `${pair.id} ${pair.kind} light source`).toMatch(
				/-light-v\d+\.webp(?:\?rev=[a-z0-9-]+)?$/
			);
			expect(pair.darkSource, `${pair.id} ${pair.kind} dark source`).toMatch(
				/-dark-v\d+\.webp(?:\?rev=[a-z0-9-]+)?$/
			);
			expect(pair.lightSource.replace('-light-', '-theme-'), `${pair.id} ${pair.kind} pair`).toBe(
				pair.darkSource.replace('-dark-', '-theme-')
			);
			expect(pair.lightSource, `${pair.id} ${pair.kind} sources`).not.toBe(pair.darkSource);

			for (const [theme, source] of [
				['light', pair.lightSource],
				['dark', pair.darkSource]
			] as const) {
				const metadata = readWebpMetadata(staticAssetPath(source));
				const label = `${pair.id} ${pair.kind} ${theme}`;

				expect(metadata.width, `${label} width`).toBe(pair.declaredWidth);
				expect(metadata.height, `${label} height`).toBe(pair.declaredHeight);
				expect(metadata.hasAlpha, `${label} must have an opaque background`).toBe(false);
				expect(
					Math.abs(metadata.width / metadata.height - targetAspectRatio),
					`${label} aspect ratio`
				).toBeLessThanOrEqual(aspectRatioTolerance);
			}
		}
	});
});
