import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'data', 'aqa-science-specifications');

const sources = [
	{
		subject: 'Biology',
		specificationCode: '8461',
		title: 'GCSE Biology Specification for first teaching in 2016',
		specificationPageUrl: 'https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification',
		pdfUrl:
			'https://cdn.sanity.io/files/p28bar15/green/510eb7c76df13be23292df4392de95eb32b0d30f.pdf',
		localPath: 'data/aqa-science-specifications/aqa-gcse-biology-8461-specification.pdf'
	},
	{
		subject: 'Chemistry',
		specificationCode: '8462',
		title: 'GCSE Chemistry Specification for first teaching in 2016',
		specificationPageUrl:
			'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification',
		pdfUrl:
			'https://cdn.sanity.io/files/p28bar15/green/9e1579c8cdada254bf7726b794379cf4c1a56036.pdf',
		localPath: 'data/aqa-science-specifications/aqa-gcse-chemistry-8462-specification.pdf'
	},
	{
		subject: 'Physics',
		specificationCode: '8463',
		title: 'GCSE Physics Specification for first teaching in 2016',
		specificationPageUrl: 'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification',
		pdfUrl:
			'https://cdn.sanity.io/files/p28bar15/green/e96b2cef624c0970b0f90d9678a438580aed0f65.pdf',
		localPath: 'data/aqa-science-specifications/aqa-gcse-physics-8463-specification.pdf'
	}
];

function getPdfPageCount(filePath) {
	try {
		const info = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
		const match = info.match(/^Pages:\s+(\d+)/m);
		return match ? Number(match[1]) : null;
	} catch {
		return null;
	}
}

await mkdir(outputRoot, { recursive: true });

const manifestSources = [];

for (const source of sources) {
	const response = await fetch(source.pdfUrl);
	if (!response.ok) {
		throw new Error(`Failed to download ${source.subject} specification: ${response.status}`);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	const absolutePath = path.join(repoRoot, source.localPath);
	await writeFile(absolutePath, buffer);

	manifestSources.push({
		...source,
		sha256: createHash('sha256').update(buffer).digest('hex'),
		pages: getPdfPageCount(absolutePath)
	});

	console.log(`Downloaded ${source.subject} specification to ${source.localPath}`);
}

await writeFile(
	path.join(outputRoot, 'source-manifest.json'),
	`${JSON.stringify(
		{
			board: 'AQA',
			qualification: 'GCSE',
			downloadedAt: new Date().toISOString().slice(0, 10),
			sources: manifestSources
		},
		null,
		'\t'
	)}\n`
);

console.log('Wrote data/aqa-science-specifications/source-manifest.json');
