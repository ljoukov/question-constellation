import { getRequestEvent } from '$app/server';

export type QuestionDbBinding = D1Database | D1DatabaseSession;

let fallbackQuestionDb: QuestionDbBinding | undefined;
let questionR2: R2Bucket | undefined;

export function setQuestionDb(db: QuestionDbBinding) {
	fallbackQuestionDb = db;
}

export function getQuestionDb(): QuestionDbBinding | undefined {
	try {
		return getRequestEvent().locals.questionDb ?? fallbackQuestionDb;
	} catch {
		return fallbackQuestionDb;
	}
}

export function setQuestionR2(bucket: R2Bucket) {
	questionR2 = bucket;
}

export function getQuestionR2(): R2Bucket | undefined {
	return questionR2;
}

export function clearQuestionBindings() {
	fallbackQuestionDb = undefined;
	questionR2 = undefined;
}
