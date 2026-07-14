import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'data', 'curricula', 'source-manifest.json');

function pageCount(filePath) {
	const output = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
	const match = output.match(/^Pages:\s+(\d+)/m);
	if (!match) throw new Error(`pdfinfo did not report a page count for ${filePath}`);
	return Number(match[1]);
}

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

for (const source of manifest.sources) {
	const absolutePath = path.join(repoRoot, source.localPath);
	const temporaryPath = `${absolutePath}.download`;
	await mkdir(path.dirname(absolutePath), { recursive: true });

	const response = await fetch(source.pdfUrl, {
		headers: { 'user-agent': 'Question Constellation official curriculum importer/1.0' },
		redirect: 'follow'
	});
	if (!response.ok) throw new Error(`${source.id}: download failed (${response.status})`);

	const contentType = response.headers.get('content-type') ?? '';
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
		throw new Error(`${source.id}: source is not a PDF (${contentType || 'no content type'})`);
	}

	await writeFile(temporaryPath, buffer);
	const downloadedHash = sha256(buffer);
	if (source.sha256 && source.sha256 !== downloadedHash) {
		await rm(temporaryPath, { force: true });
		throw new Error(
			`${source.id}: sha256 changed (expected ${source.sha256}, got ${downloadedHash})`
		);
	}

	const downloadedPages = pageCount(temporaryPath);
	if (source.pageCount && source.pageCount !== downloadedPages) {
		await rm(temporaryPath, { force: true });
		throw new Error(
			`${source.id}: page count changed (expected ${source.pageCount}, got ${downloadedPages})`
		);
	}

	await rename(temporaryPath, absolutePath);
	source.sha256 = downloadedHash;
	source.pageCount = downloadedPages;
	source.downloadedAt = today;
	console.log(`${source.id}: ${downloadedPages} pages, ${downloadedHash}`);
}

manifest.generatedAt = today;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
console.log(`Wrote ${path.relative(repoRoot, manifestPath)}`);
