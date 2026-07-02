#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/audit-aqa-manifest-source-identity.mjs \\
  --manifest=data/aqa-gcse-history-geography-computer-science/manifest.json \\
  --output=tmp/aqa-manifest-source-identity-audit.json

Options:
  --data-root=data/aqa-gcse-history-geography-computer-science
  --output-valid-manifest=tmp/manifest.identity-safe.json
  --fail-on-error

The audit reads the visible first pages of each question paper and mark scheme with pdftotext and
compares visible series/component evidence against the manifest metadata. It does not call any LLM
or API.`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const dataRoot = path.resolve(
	rootDir,
	stringArg('data-root', 'data/aqa-gcse-history-geography-computer-science')
);
const manifestPath = path.resolve(
	rootDir,
	stringArg('manifest', path.join(dataRoot, 'manifest.json'))
);
const outputPath = stringArg('output', '');
const validManifestPath = stringArg('output-valid-manifest', '');
const failOnError = hasArg('fail-on-error');

if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${relative(manifestPath)}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const auditedRows = (manifest.rows ?? []).map(auditRow);
const errorRows = auditedRows.filter((row) => row.sourceIdentity.status === 'failed');
const warningRows = auditedRows.filter((row) => row.sourceIdentity.status === 'warning');
const passedRows = auditedRows.filter((row) => row.sourceIdentity.status === 'passed');

const report = {
	status: errorRows.length ? 'failed' : warningRows.length ? 'warning' : 'passed',
	generatedAt: new Date().toISOString(),
	manifest: relative(manifestPath),
	totalRows: auditedRows.length,
	counts: {
		passed: passedRows.length,
		warning: warningRows.length,
		failed: errorRows.length
	},
	bySubject: countBy(auditedRows, (row) => row.subject ?? 'Unknown'),
	issuesByCode: countIssues(auditedRows),
	rows: auditedRows
};

if (outputPath) writeJson(path.resolve(rootDir, outputPath), report);
if (validManifestPath) {
	const validManifest = {
		...manifest,
		generated_at: new Date().toISOString(),
		source_identity_audit: {
			source_manifest: relative(manifestPath),
			audit_output: outputPath ? relative(path.resolve(rootDir, outputPath)) : null,
			total_rows: auditedRows.length,
			included_rows: passedRows.length,
			excluded_rows: errorRows.length + warningRows.length
		},
		counts: {
			...(manifest.counts ?? {}),
			rows: passedRows.length,
			question_papers: passedRows.length,
			mark_schemes: passedRows.length
		},
		rows: passedRows.map((row) => row.originalRow)
	};
	writeJson(path.resolve(rootDir, validManifestPath), validManifest);
}

console.log(JSON.stringify(stripOriginalRows(report), null, 2));
if (failOnError && errorRows.length > 0) process.exit(1);

function auditRow(row) {
	const questionPaperPath = resolveDocumentPath(row.question_paper, 'question-papers');
	const markSchemePath = resolveDocumentPath(row.mark_scheme, 'mark-schemes');
	const questionPaper = inspectPdfSource(questionPaperPath);
	const markScheme = inspectPdfSource(markSchemePath);
	const issues = [];
	const expectedSeries = row.series ?? '';
	const expectedComponent = row.component ?? '';
	const visibleSeries = firstNonEmpty([questionPaper.series, markScheme.series]);
	const visibleComponent = firstNonEmpty([questionPaper.component, markScheme.component]);
	if (
		normalizeSeries(expectedSeries) &&
		normalizeSeries(visibleSeries) &&
		normalizeSeries(expectedSeries) !== normalizeSeries(visibleSeries)
	) {
		issues.push({
			code: 'visible_series_mismatch',
			severity: 'error',
			expected: expectedSeries,
			visible: visibleSeries,
			evidence: {
				questionPaper: questionPaper.seriesEvidence,
				markScheme: markScheme.seriesEvidence
			}
		});
	}
	if (
		normalizeSeries(questionPaper.series) &&
		normalizeSeries(markScheme.series) &&
		normalizeSeries(questionPaper.series) !== normalizeSeries(markScheme.series)
	) {
		issues.push({
			code: 'question_paper_mark_scheme_series_mismatch',
			severity: 'error',
			questionPaper: questionPaper.series,
			markScheme: markScheme.series,
			evidence: {
				questionPaper: questionPaper.seriesEvidence,
				markScheme: markScheme.seriesEvidence
			}
		});
	}
	if (
		normalizeComponent(expectedComponent) &&
		normalizeComponent(visibleComponent) &&
		!componentCodesCompatible(expectedComponent, visibleComponent)
	) {
		issues.push({
			code: 'visible_component_mismatch',
			severity: 'error',
			expected: expectedComponent,
			visible: visibleComponent,
			evidence: {
				questionPaper: questionPaper.componentEvidence,
				markScheme: markScheme.componentEvidence
			}
		});
	}
	if (
		normalizeComponent(questionPaper.component) &&
		normalizeComponent(markScheme.component) &&
		!componentCodesCompatible(questionPaper.component, markScheme.component)
	) {
		issues.push({
			code: 'question_paper_mark_scheme_component_mismatch',
			severity: 'error',
			questionPaper: questionPaper.component,
			markScheme: markScheme.component,
			evidence: {
				questionPaper: questionPaper.componentEvidence,
				markScheme: markScheme.componentEvidence
			}
		});
	}
	if (!visibleSeries) {
		issues.push({
			code: 'visible_series_not_detected',
			severity: 'warning',
			expected: expectedSeries || null
		});
	}
	return {
		sourceDocumentId: row.source_document_id,
		subject: row.subject,
		paper: row.paper,
		expected: {
			series: expectedSeries || null,
			componentCode: expectedComponent || null
		},
		visible: {
			series: visibleSeries || null,
			componentCode: visibleComponent || null
		},
		sourceIdentity: {
			status: issues.some((issue) => issue.severity === 'error')
				? 'failed'
				: issues.length
					? 'warning'
					: 'passed',
			issues
		},
		questionPaper,
		markScheme,
		originalRow: row
	};
}

function resolveDocumentPath(doc, fallbackDir) {
	const localPath = doc?.local_path;
	if (!localPath) return path.join(dataRoot, fallbackDir, doc?.filename ?? '');
	return path.resolve(rootDir, localPath);
}

function inspectPdfSource(filePath) {
	if (!filePath || !existsSync(filePath)) {
		return {
			path: filePath ? relative(filePath) : null,
			missing: true,
			series: null,
			seriesEvidence: null,
			component: null,
			componentEvidence: null
		};
	}
	const firstPagesText = pdfTextFirstPages(filePath, 2);
	const seriesMatch = findSeries(firstPagesText);
	const componentMatch = findComponent(firstPagesText);
	return {
		path: relative(filePath),
		missing: false,
		series: seriesMatch?.series ?? null,
		seriesEvidence: seriesMatch?.evidence ?? null,
		component: componentMatch?.component ?? null,
		componentEvidence: componentMatch?.evidence ?? null
	};
}

function pdfTextFirstPages(filePath, pages) {
	const result = spawnSync('pdftotext', ['-f', '1', '-l', String(pages), filePath, '-'], {
		cwd: rootDir,
		encoding: 'utf8',
		maxBuffer: 4 * 1024 * 1024
	});
	if (result.status !== 0) return '';
	return result.stdout;
}

function findSeries(text) {
	const longMatch = text.match(/\b(January|June|November)\s+(20\d{2})\b/i);
	if (longMatch) {
		return {
			series: `${titleCase(longMatch[1])} ${longMatch[2]}`,
			evidence: trimEvidence(longMatch[0])
		};
	}
	const compactMatch = text.match(/\b(Jan|Jun|Nov)(\d{2})\b/i);
	if (compactMatch) {
		const month = { jan: 'January', jun: 'June', nov: 'November' }[
			compactMatch[1].toLowerCase()
		];
		return {
			series: `${month} 20${compactMatch[2]}`,
			evidence: trimEvidence(compactMatch[0])
		};
	}
	return null;
}

function findComponent(text) {
	const match = text.match(/\b(\d{4})\/([0-9A-Z]+(?:\/[A-Z]+)*)\b/i);
	if (!match) return null;
	return {
		component: `${match[1]}/${match[2].toUpperCase()}`,
		evidence: trimEvidence(match[0])
	};
}

function normalizeSeries(value) {
	const match = String(value ?? '').match(/\b(january|jan|june|jun|november|nov)\s*(20)?(\d{2})\b/i);
	if (!match) return '';
	const monthMap = {
		jan: 'january',
		january: 'january',
		jun: 'june',
		june: 'june',
		nov: 'november',
		november: 'november'
	};
	return `${monthMap[match[1].toLowerCase()]}-20${match[3]}`;
}

function normalizeComponent(value) {
	return String(value ?? '')
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '');
}

function componentCodesCompatible(expected, visible) {
	const expectedKey = normalizeComponent(expected);
	const visibleKey = normalizeComponent(visible);
	if (!expectedKey || !visibleKey) return true;
	if (expectedKey === visibleKey) return true;
	if (expectedKey.startsWith(visibleKey) && /^[A-Z]+$/.test(expectedKey.slice(visibleKey.length))) {
		return true;
	}
	if (visibleKey.startsWith(expectedKey) && /^[A-Z]+$/.test(visibleKey.slice(expectedKey.length))) {
		return true;
	}
	return false;
}

function countBy(rows, keyFn) {
	return rows.reduce((counts, row) => {
		const key = keyFn(row);
		counts[key] ??= { passed: 0, warning: 0, failed: 0, total: 0 };
		counts[key][row.sourceIdentity.status] += 1;
		counts[key].total += 1;
		return counts;
	}, {});
}

function countIssues(rows) {
	return rows.reduce((counts, row) => {
		for (const issue of row.sourceIdentity.issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
		return counts;
	}, {});
}

function stripOriginalRows(report) {
	return {
		...report,
		rows: report.rows.map(({ originalRow, ...row }) => row)
	};
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function firstNonEmpty(values) {
	return values.find((value) => String(value ?? '').trim()) ?? '';
}

function titleCase(value) {
	const lower = String(value ?? '').toLowerCase();
	return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : '';
}

function trimEvidence(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function relative(filePath) {
	return path.relative(rootDir, filePath);
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}
