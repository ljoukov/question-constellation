import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { challengeCatalog } from './catalog';
import {
	subjectArtForChallenge,
	subjectArtThemeForChallenge,
	subjectArtThemes
} from './subjectVisuals';

type WebpMetadata = {
	width: number;
	height: number;
	hasAlpha: boolean;
};

function readUint24LE(buffer: Buffer, offset: number) {
	return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readWebpMetadata(source: string): WebpMetadata {
	const sourcePath = source.split('?')[0] ?? source;
	const productPathIndex = sourcePath.indexOf('/product/');
	if (productPathIndex < 0) {
		throw new Error(`Subject art must use the static /product/ tree: ${source}`);
	}
	const filePath = join(process.cwd(), 'static', sourcePath.slice(productPathIndex + 1));
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

describe('challenge subject-card visuals', () => {
	it('offers four rotating topic clusters for every science subject', () => {
		expect(subjectArtThemes.biology).toHaveLength(4);
		expect(subjectArtThemes.chemistry).toHaveLength(4);
		expect(subjectArtThemes.physics).toHaveLength(4);
	});

	it('requires a compatible authored theme on every current challenge', () => {
		const seenBySubject = {
			biology: new Set<string>(),
			chemistry: new Set<string>(),
			physics: new Set<string>()
		};

		for (const challenge of challengeCatalog) {
			const theme = subjectArtThemeForChallenge(challenge);
			expect(theme).toBe(challenge.subjectArtTheme);
			expect(subjectArtThemes[challenge.subject]).toContain(theme);
			seenBySubject[challenge.subject].add(theme);
			const art = subjectArtForChallenge(challenge);
			expect(art.src).toContain(`/${challenge.subject}-${theme}-light-v1.webp`);
			expect(art.darkSrc).toContain(`/${challenge.subject}-${theme}-dark-v1.webp`);
			expect(art.alt.length).toBeGreaterThan(30);
		}

		for (const subject of ['biology', 'chemistry', 'physics'] as const) {
			expect([...seenBySubject[subject]].sort()).toEqual([...subjectArtThemes[subject]].sort());
		}
	});

	it('authors the smoking-risk context as regulation and immunity, not a generic practical', () => {
		const smokingRisk = challengeCatalog.find(
			(challenge) => challenge.id === 'biology-data-conclusions'
		);
		expect(smokingRisk?.subjectArtTheme).toBe('regulation-immunity');
	});

	it('ships every authored subject theme as an opaque, matched 1672 by 941 pair', () => {
		const uniquePairs = new Map<
			string,
			{ src: string; darkSrc?: string; width: number; height: number }
		>();

		for (const challenge of challengeCatalog) {
			const art = subjectArtForChallenge(challenge);
			uniquePairs.set(`${challenge.subject}:${challenge.subjectArtTheme}`, art);
		}

		expect(uniquePairs.size).toBe(12);
		for (const [label, art] of uniquePairs) {
			expect(art.darkSrc, `${label} dark source`).toBeDefined();
			for (const [theme, source] of [
				['light', art.src],
				['dark', art.darkSrc!]
			] as const) {
				const metadata = readWebpMetadata(source);
				expect(metadata.width, `${label} ${theme} width`).toBe(art.width);
				expect(metadata.height, `${label} ${theme} height`).toBe(art.height);
				expect(metadata.hasAlpha, `${label} ${theme} must be opaque`).toBe(false);
			}
		}
	});
});
