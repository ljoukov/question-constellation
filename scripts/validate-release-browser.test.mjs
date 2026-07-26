import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	captureScreenshot,
	createExclusiveEvidenceOutput,
	describeChromeBinary,
	parseArgs,
	resolveChromeBinary,
	safeUrl,
	sanitizeEvidenceValue,
	sanitizeFatalError,
	sanitizeText
} from './validate-release-browser.mjs';

const MACOS_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('browser evidence output is repo-contained and created exactly once', async () => {
	const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'release-browser-output-'));
	const repositoryRoot = path.join(fixtureRoot, 'repository');
	mkdirSync(repositoryRoot);
	try {
		const created = await createExclusiveEvidenceOutput(
			repositoryRoot,
			'tmp/browser-evidence-cycle-01'
		);
		assert.equal(created.outputLabel, 'tmp/browser-evidence-cycle-01');
		assert.equal(lstatSync(created.outputDir).isDirectory(), true);

		await assert.rejects(
			createExclusiveEvidenceOutput(repositoryRoot, 'tmp/browser-evidence-cycle-01'),
			(error) => {
				assert.match(error.message, /already exists/);
				assert.equal(error.message.includes(repositoryRoot), false);
				return true;
			}
		);
		for (const invalid of [path.join(repositoryRoot, 'absolute-output'), '../escaped-output']) {
			await assert.rejects(createExclusiveEvidenceOutput(repositoryRoot, invalid), (error) => {
				assert.match(error.message, /new repo-relative directory/);
				assert.equal(error.message.includes(repositoryRoot), false);
				return true;
			});
		}
		assert.equal(existsSync(path.join(fixtureRoot, 'escaped-output')), false);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test('browser evidence creation rejects symlink outputs and screenshot writes are exclusive', async () => {
	const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'release-browser-symlink-'));
	const repositoryRoot = path.join(fixtureRoot, 'repository');
	const outsideRoot = path.join(fixtureRoot, 'outside');
	mkdirSync(repositoryRoot);
	mkdirSync(outsideRoot);
	try {
		const danglingDirectoryTarget = path.join(outsideRoot, 'missing-directory');
		symlinkSync(danglingDirectoryTarget, path.join(repositoryRoot, 'dangling-output'));
		await assert.rejects(
			createExclusiveEvidenceOutput(repositoryRoot, 'dangling-output'),
			/already exists/
		);
		assert.equal(existsSync(danglingDirectoryTarget), false);

		symlinkSync(outsideRoot, path.join(repositoryRoot, 'linked-parent'));
		await assert.rejects(
			createExclusiveEvidenceOutput(repositoryRoot, 'linked-parent/evidence'),
			/non-symlink directories/
		);
		assert.equal(existsSync(path.join(outsideRoot, 'evidence')), false);

		const screenshotPath = path.join(repositoryRoot, 'screenshot.jpg');
		const danglingScreenshotTarget = path.join(outsideRoot, 'missing-screenshot.jpg');
		symlinkSync(danglingScreenshotTarget, screenshotPath);
		await assert.rejects(
			captureScreenshot(
				{
					async send() {
						return { data: Buffer.from('screenshot').toString('base64') };
					}
				},
				screenshotPath,
				'viewport'
			),
			/already exists or is a symbolic link/
		);
		assert.equal(existsSync(danglingScreenshotTarget), false);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test('release browser validation uses automatic discovery by default', () => {
	assert.equal(parseArgs([]).chromeBin, null);
	assert.equal(parseArgs(['--chrome-bin=/custom/chrome']).chromeBin, '/custom/chrome');
});

test('automatic discovery finds the standard macOS Chrome app bundle', async () => {
	const checked = [];
	const binary = await resolveChromeBinary(null, {
		platform: 'darwin',
		env: { PATH: '/missing/bin' },
		homeDir: '/synthetic-home',
		isExecutable: async (candidate) => {
			checked.push(candidate);
			return candidate === MACOS_CHROME;
		}
	});

	assert.equal(binary, MACOS_CHROME);
	assert.ok(checked.includes(MACOS_CHROME));
});

test('an explicit chrome binary remains authoritative', async () => {
	const checked = [];
	const binary = await resolveChromeBinary('/custom/chromium', {
		platform: 'linux',
		env: { PATH: '/usr/bin' },
		isExecutable: async (candidate) => {
			checked.push(candidate);
			return candidate === '/custom/chromium';
		}
	});

	assert.equal(binary, '/custom/chromium');
	assert.deepEqual(checked, ['/custom/chromium']);
});

test('failed automatic discovery explains how to select a browser', async () => {
	await assert.rejects(
		resolveChromeBinary(null, {
			platform: 'darwin',
			env: { PATH: '' },
			homeDir: '/synthetic-home',
			isExecutable: async () => false
		}),
		(error) => {
			assert.match(error.message, /Unable to find a Chrome or Chromium executable/);
			assert.match(error.message, /common macOS install locations/);
			assert.match(error.message, /--chrome-bin=/);
			assert.match(error.message, /Google Chrome\.app/);
			return true;
		}
	);
});

test('a missing explicit browser reports that exact selection', async () => {
	await assert.rejects(
		resolveChromeBinary('/missing/chrome', {
			platform: 'linux',
			env: { PATH: '/usr/bin' },
			isExecutable: async () => false
		}),
		(error) => {
			assert.match(error.message, /supplied via --chrome-bin/);
			assert.match(error.message, /\/missing\/chrome/);
			assert.match(error.message, /not found or is not executable/);
			return true;
		}
	);
});

test('browser evidence redacts adversarial credentials, identity, and operator paths', () => {
	const basicSecret = ['dXNl', 'cjpzZWNyZXQ='].join('');
	const bearerSecret = ['eyJhbGci', '.operator-token'].join('');
	const cookieSecret = ['session-', 'cookie-value'].join('');
	const apiSecret = ['sk-proj-', 'synthetic-value'].join('');
	const passwordSecret = ['database-', 'password-value'].join('');
	const credentialUser = ['release-', 'operator'].join('');
	const credentialPassword = ['url-', 'password'].join('');
	const email = ['operator', '@', 'example.test'].join('');
	const macHome = ['/Users/', 'operator', '/project/release.mjs:17:4'].join('');
	const linuxHome = ['/home/', 'operator', '/project/release.mjs:18:5'].join('');
	const windowsHome = [
		'C:',
		'\\',
		'Users',
		'\\',
		'operator',
		'\\',
		'project',
		'\\',
		'release.mjs:19:6'
	].join('');
	const rootPath = ['/root', '/project/release.mjs:20:7'].join('');
	const privatePath = ['/private', '/var/db/operator/release.mjs:21:8'].join('');
	const tempPath = ['/tmp', '/qc-release-browser-operator/release.mjs:22:9'].join('');
	const macTempPath = ['/private/var/folders/', 'aa/operator/T/release.mjs:23:10'].join('');
	const windowsTempPath = [
		'C:',
		'\\',
		'Users',
		'\\',
		'operator',
		'\\',
		'AppData',
		'\\',
		'Local',
		'\\',
		'Temp',
		'\\',
		'release.mjs:24:11'
	].join('');
	const credentialedUrl = [
		'https://',
		credentialUser,
		':',
		credentialPassword,
		'@example.test/private'
	].join('');
	const sensitiveApiAssignment = ['CHATGPT_CODEX_PROXY_', 'API_', 'KEY=', apiSecret].join('');
	const sensitivePasswordAssignment = ['DATABASE_', 'PASS', 'WORD="', passwordSecret, '"'].join('');
	const standaloneToken = ['sk-', 'abcdefghijklmnop'].join('');
	const input = [
		['Author', 'ization: Basic ', basicSecret].join(''),
		['author', 'ization=Bearer ', bearerSecret].join(''),
		['Coo', 'kie: session=', cookieSecret, '; Path=/; HttpOnly'].join(''),
		['Set-', 'Coo', 'kie: refresh=', cookieSecret, '; Secure'].join(''),
		sensitiveApiAssignment,
		sensitivePasswordAssignment,
		`standalone token ${standaloneToken}`,
		'smoking-risk-data-conclusions remains useful',
		`connect ${credentialedUrl}`,
		`contact ${email}`,
		`at mac (${macHome})`,
		`at linux (${linuxHome})`,
		`at windows (${windowsHome})`,
		`at root (${rootPath})`,
		`at private (${privatePath})`,
		`at temp (${tempPath})`,
		`at macTemp (${macTempPath})`,
		`at windowsTemp (${windowsTempPath})`,
		'Useful failure context remains visible.'
	].join('\n');

	const sanitized = sanitizeText(input);
	for (const sensitiveValue of [
		basicSecret,
		bearerSecret,
		cookieSecret,
		apiSecret,
		passwordSecret,
		standaloneToken,
		credentialUser,
		credentialPassword,
		email,
		macHome,
		linuxHome,
		windowsHome,
		rootPath,
		privatePath,
		tempPath,
		macTempPath,
		windowsTempPath
	]) {
		assert.ok(!sanitized.includes(sensitiveValue), `did not redact ${sensitiveValue}`);
	}

	assert.match(sanitized, /Authorization: <redacted>/);
	assert.match(sanitized, /Cookie: <redacted>/);
	assert.match(sanitized, /Set-Cookie: <redacted>/);
	assert.match(sanitized, /CHATGPT_CODEX_PROXY_API_KEY=<redacted>/);
	assert.match(sanitized, /DATABASE_PASSWORD="<redacted>"/);
	assert.match(sanitized, /standalone token <redacted-token>/);
	assert.match(sanitized, /smoking-risk-data-conclusions remains useful/);
	assert.match(sanitized, /https:\/\/<redacted>@example\.test\/private/);
	assert.match(sanitized, /<redacted-email>/);
	assert.match(sanitized, /<user-home>\/project\/release\.mjs:17:4/);
	assert.match(sanitized, /<temp-path>[\\/]release\.mjs:24:11/);
	assert.match(sanitized, /Useful failure context remains visible\./);
});

test('the final evidence pass recursively sanitizes page-derived strings and keys', () => {
	const operatorPath = ['/home/', 'operator', '/release/page.mjs:12:3'].join('');
	const email = ['signed-in-user', '@', 'school.example'].join('');
	const token = ['ghp_', 'abcdefghijklmnop'].join('');
	const sharedRoute = { name: 'challenge', pathname: '/challenge' };
	const reportLikeValue = {
		configuration: {
			routes: [sharedRoute]
		},
		cases: [
			{
				route: sharedRoute,
				dom: { controls: { labels: [`Account ${email}`] } },
				layout: { clippedContent: [{ textSample: `stack at ${operatorPath}` }] },
				interaction: {
					feedback: {
						[`source ${operatorPath}`]: `credential ${token}`
					}
				}
			}
		]
	};

	const sanitized = sanitizeEvidenceValue(reportLikeValue);
	const serialized = JSON.stringify(sanitized);
	for (const sensitiveValue of [operatorPath, email, token]) {
		assert.equal(serialized.includes(sensitiveValue), false);
	}
	assert.match(serialized, /<user-home>/);
	assert.match(serialized, /<redacted-email>/);
	assert.match(serialized, /<redacted-token>|<redacted>/);
	assert.deepEqual(sanitized.configuration.routes[0], sharedRoute);
	assert.deepEqual(sanitized.cases[0].route, sharedRoute);

	const cyclic = {};
	cyclic.self = cyclic;
	assert.equal(sanitizeEvidenceValue(cyclic).self, '[circular evidence]');
});

test('nested credential fields, private keys, and portable stack paths are redacted', () => {
	const authValue = ['opaque-', 'authorization-value'].join('');
	const cookieValue = ['opaque-', 'cookie-value'].join('');
	const clientSecret = ['client-', 'secret-value'].join('');
	const workspacePath = ['/workspace/', 'operator', '/project/release.mjs:8:2'].join('');
	const arbitraryWindowsPath = [
		'D:',
		'\\',
		'operator',
		'\\',
		'project',
		'\\',
		'release.mjs:9:3'
	].join('');
	const networkPath = ['', '', 'build-host', 'private-share', 'release.mjs:10:4'].join('\\');
	const escapedPath = ['\\/', 'Users', '\\/', 'operator', '\\/', 'release.mjs:11:5'].join('');
	const privateKey = [
		'-----BEGIN ',
		'PRIVATE KEY-----',
		'\nsynthetic-key-body\n',
		'-----END ',
		'PRIVATE KEY-----'
	].join('');
	const error = new Error(`failed at ${workspacePath}`);
	error.cause = {
		clientSecret,
		[arbitraryWindowsPath]: networkPath
	};
	const evidence = {
		[['Author', 'ization'].join('')]: authValue,
		[['Coo', 'kie'].join('')]: cookieValue,
		refreshToken: clientSecret,
		error,
		notes: privateKey,
		escapedPath
	};

	const serialized = JSON.stringify(sanitizeEvidenceValue(evidence));
	for (const sensitiveValue of [
		authValue,
		cookieValue,
		clientSecret,
		workspacePath,
		arbitraryWindowsPath,
		networkPath,
		escapedPath,
		privateKey
	]) {
		assert.equal(serialized.includes(sensitiveValue), false);
	}
	assert.match(serialized, /<redacted>/);
	assert.match(serialized, /<filesystem-path>/);
	assert.match(serialized, /<redacted-private-key>/);
});

test('fatal stacks are sanitized once before they can be logged or reported', () => {
	const secret = ['fatal-', 'bearer-value'].join('');
	const operatorPath = ['/Users/', 'operator', '/project/validator.mjs:42:7'].join('');
	const error = new Error('release validation failed');
	error.stack = [
		'Error: release validation failed',
		['Author', 'ization: Bearer ', secret].join(''),
		`    at validate (${operatorPath})`
	].join('\n');

	const fatal = sanitizeFatalError(error);
	assert.ok(!fatal.includes(secret));
	assert.ok(!fatal.includes(operatorPath));
	assert.match(fatal, /Authorization: <redacted>/);
	assert.match(fatal, /at validate \(<user-home>\/project\/validator\.mjs:42:7\)/);
});

test('safe URLs redact userinfo and sensitive query values', () => {
	const user = ['browser-', 'operator'].join('');
	const password = ['url-', 'secret'].join('');
	const querySecret = ['query-', 'secret-value'].join('');
	const url = ['https://', user, ':', password, '@example.test/release?api_key=', querySecret].join(
		''
	);

	const safe = safeUrl(url);
	assert.ok(!safe.includes(user));
	assert.ok(!safe.includes(password));
	assert.ok(!safe.includes(querySecret));
	assert.match(safe, /^https:\/\/example\.test\/release\?/);

	const benign = safeUrl(
		'https://example.test/release?monkey=capuchin&keyboard=qwerty&postcode=AB12'
	);
	assert.match(benign, /monkey=capuchin/);
	assert.match(benign, /keyboard=qwerty/);
	assert.match(benign, /postcode=AB12/);

	const fragmentSecret = ['oauth-', 'code-value'].join('');
	const sensitiveFragment = safeUrl(`https://example.test/callback#code=${fragmentSecret}`);
	assert.equal(sensitiveFragment.includes(fragmentSecret), false);
	assert.match(sensitiveFragment, /#code=<redacted>/);
});

test('Chrome evidence records a useful non-absolute binary descriptor', () => {
	assert.equal(
		describeChromeBinary(
			'/Users/example/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
		),
		'Google Chrome'
	);
	assert.equal(
		describeChromeBinary(
			['C:', '\\', 'Users', '\\', 'example', '\\', 'Chrome', '\\', 'chrome.exe'].join('')
		),
		'chrome.exe'
	);
	assert.equal(describeChromeBinary('/usr/bin/google-chrome'), 'google-chrome');

	for (const descriptor of [
		describeChromeBinary('/Users/example/bin/chrome'),
		describeChromeBinary('/usr/bin/google-chrome'),
		describeChromeBinary(['C:', '\\', 'Users', '\\', 'example', '\\', 'chrome.exe'].join(''))
	]) {
		assert.ok(!descriptor.includes('/'));
		assert.ok(!descriptor.includes('\\'));
		assert.ok(!/^[A-Za-z]:/.test(descriptor));
	}
});
