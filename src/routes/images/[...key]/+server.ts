import { getR2ImageResponse } from '$lib/server/r2';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) =>
	getR2ImageResponse(params.key, request);

export const HEAD: RequestHandler = async ({ params, request }) =>
	getR2ImageResponse(params.key, request, true);
