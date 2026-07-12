import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(adminDir, '..');
const wrangler = path.join(adminDir, 'node_modules', '.bin', 'wrangler');
const bucket = 'question-constellation';
const prefix = 'admin/experiments/gallery';

const sources = [
	['docs/product-flow-mocks-v3/concept-one/01-home.png', 'living-paper-home'],
	['docs/product-flow-mocks-v3/concept-one/02-attempt.png', 'living-paper-attempt'],
	['docs/product-flow-mocks-v3/concept-one/03-checked.png', 'living-paper-checked'],
	['docs/product-flow-mocks-v3/concept-one/04-progress.png', 'living-paper-progress'],
	['docs/product-flow-mocks-v3/concept-one/05-recall.png', 'living-paper-recall'],
	['docs/product-flow-mocks-v3/concept-two/01-home-final.png', 'electric-paper-home'],
	['docs/product-flow-mocks-v3/concept-two/02-attempt-final.png', 'electric-paper-attempt'],
	['docs/product-flow-mocks-v3/concept-two/03-improve-recheck-final.png', 'electric-paper-improve'],
	[
		'docs/product-flow-mocks-v3/concept-two/03b-recheck-passed-final.png',
		'electric-paper-recheck-passed'
	],
	['docs/product-flow-mocks-v3/concept-two/04-progress-final.png', 'electric-paper-progress'],
	['docs/product-flow-mocks-v3/concept-two/05-recall-final.png', 'electric-paper-recall'],
	['docs/product-flow-mocks-v3/concept-three/home.png', 'afterglow-home'],
	['docs/product-flow-mocks-v3/concept-three/attempt.png', 'afterglow-attempt'],
	['docs/product-flow-mocks-v3/concept-three/checked-improve.png', 'afterglow-checked'],
	['docs/product-flow-mocks-v3/concept-three/papers.png', 'afterglow-papers'],
	['docs/product-flow-mocks-v3/concept-three/recall.png', 'afterglow-recall']
];

const variants = [
	{ name: 'full', quality: '88', resize: null },
	{ name: 'thumb', quality: '80', resize: '724x543' }
];

function run(command, args, cwd = repoDir) {
	const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'constellation-gallery-'));

try {
	for (const [source, slug] of sources) {
		for (const variant of variants) {
			const output = path.join(tempDir, `${variant.name}-${slug}.webp`);
			const convertArgs = [path.join(repoDir, source), '-strip'];
			if (variant.resize) convertArgs.push('-resize', variant.resize);
			convertArgs.push('-define', 'webp:method=6', '-quality', variant.quality, output);
			run('convert', convertArgs);

			run(
				wrangler,
				[
					'r2',
					'object',
					'put',
					`${bucket}/${prefix}/${variant.name}/${slug}.webp`,
					'--file',
					output,
					'--content-type',
					'image/webp',
					'--cache-control',
					'private, no-store',
					'--remote',
					'--force'
				],
				adminDir
			);
		}
	}
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
