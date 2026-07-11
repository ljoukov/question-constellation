import { z, type ZodType } from 'zod';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
	const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
	return await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealJson(value: unknown, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(secret);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			textEncoder.encode(JSON.stringify(value))
		)
	);
	return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

export async function openJson<T>(sealed: string, secret: string, schema: ZodType<T>): Promise<T> {
	const parts = sealed.split('.');
	if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Unsupported sealed payload format');
	const key = await deriveKey(secret);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64UrlToBytes(z.string().min(1).parse(parts[1])) },
		key,
		base64UrlToBytes(z.string().min(1).parse(parts[2]))
	);
	return schema.parse(JSON.parse(textDecoder.decode(plaintext)));
}
