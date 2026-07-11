import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(adminRoot, '..');
const localEnv = await readLocalEnv(path.join(repoRoot, '.env.local'));
const cookieSecret = process.env.AUTH_COOKIE_SECRET || localEnv.AUTH_COOKIE_SECRET;

if (!cookieSecret) {
	throw new Error('AUTH_COOKIE_SECRET is required to derive the constellation-admin password.');
}

const password = createHmac('sha256', cookieSecret)
	.update('constellation-admin/basic-auth/v1')
	.digest('base64url');

process.stdout.write(`${password}\n`);

async function readLocalEnv(filePath) {
	const values = {};
	const source = await readFile(filePath, 'utf8').catch(() => '');
	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		values[match[1]] = value;
	}
	return values;
}
