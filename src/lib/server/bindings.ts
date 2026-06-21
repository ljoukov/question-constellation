let questionDb: D1Database | undefined;
let questionR2: R2Bucket | undefined;

export function setQuestionDb(db: D1Database) {
	questionDb = db;
}

export function getQuestionDb(): D1Database | undefined {
	return questionDb;
}

export function setQuestionR2(bucket: R2Bucket) {
	questionR2 = bucket;
}

export function getQuestionR2(): R2Bucket | undefined {
	return questionR2;
}

export function clearQuestionBindings() {
	questionDb = undefined;
	questionR2 = undefined;
}
