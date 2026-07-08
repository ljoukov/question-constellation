import { aqaStemCurriculum, getAqaStemSubject, subjectTopicMatches } from '$lib/curriculum/aqaStem';
import {
	recallCards,
	recallCurriculumTopics,
	type RecallCard,
	type RecallSubject
} from '$lib/recall/aqaScienceRecall';
import type { QuestionGradeResult } from '$lib/server/answerGrading';
import {
	getPracticePageData,
	type ChainStep,
	type PracticePageData
} from '$lib/server/questionData';
import type { AdminUser } from '$lib/server/auth/session';
import { executeQuery, queryFirst, queryRows } from './db';

type UserProfileRow = {
	uid: string;
	email: string;
	name: string | null;
	photo_url: string | null;
	selected_board: string;
	selected_qualification: string;
	selected_subject: string;
	selected_tier: string;
	created_at: string;
	updated_at: string;
	last_seen_at: string;
};

type UserProfileSubjectRow = {
	user_id: string;
	subject: string;
	board: string;
	qualification: string;
	course: string;
	tier: string;
	enabled: number;
	current_grade: string | null;
	target_grade: string | null;
	created_at: string;
	updated_at: string;
};

type DashboardGapRow = {
	id: string;
	answer_chain_id: string;
	chain_step_id: string;
	source_question_id: string | null;
	gap_band: string;
	evidence_count: number;
	updated_at: string;
	chain_title: string;
	canonical_chain_text: string;
	step_text: string;
	step_order: number;
	question_title: string | null;
	source_question_ref: string | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	tier: string | null;
	paper: string | null;
	topic_path_json: string | null;
	marks: number | null;
};

type DashboardAttemptRow = {
	id: string;
	question_id: string;
	answer_chain_id: string | null;
	result: string;
	awarded_marks: number;
	max_marks: number;
	missing_step_ids_json: string;
	created_at: string;
	question_title: string | null;
	source_question_ref: string | null;
	subject: string | null;
	paper: string | null;
	chain_title: string | null;
};

type NextQuestionRow = {
	id: string;
	prompt_text: string;
	metadata_json: string;
	source_question_ref: string;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	tier: string | null;
	paper: string | null;
	marks: number | null;
	topic_path_json: string;
	answer_chain_id: string;
	chain_title: string;
};

type GapDetailRow = DashboardGapRow & {
	status: string;
	source_prompt_text: string | null;
	source_context_text: string | null;
	source_metadata_json: string | null;
	source_topic_path_json: string | null;
};

type ChainStepRow = {
	id: string;
	display_order: number;
	step_text: string;
	step_role: ChainStep['role'];
	explanation: string | null;
	common_omission: string | null;
	evidence_json: string;
};

export type UserProfile = {
	uid: string;
	email: string;
	name: string | null;
	photoUrl: string | null;
	selectedBoard: string;
	selectedQualification: string;
	selectedSubject: string;
	selectedTier: string;
};

export type LearnerSubject = {
	subject: string;
	board: string;
	qualification: string;
	course: 'Separate Science' | 'Combined Science' | 'GCSE Subject';
	tier: 'Higher' | 'Foundation';
	enabled: boolean;
	currentGrade: string | null;
	targetGrade: string | null;
};

export type DashboardGap = {
	id: string;
	href: string;
	chainId: string;
	chainTitle: string;
	stepId: string;
	stepText: string;
	stepOrder: number;
	gapBand: string;
	evidenceCount: number;
	updatedAt: string;
	questionId: string | null;
	questionTitle: string;
	questionHref: string | null;
	meta: string;
	topic: string;
};

export type DashboardAttempt = {
	id: string;
	questionId: string;
	questionTitle: string;
	questionHref: string;
	result: string;
	awardedMarks: number;
	maxMarks: number;
	missingCount: number;
	createdAt: string;
	meta: string;
	chainTitle: string | null;
};

export type DashboardNextQuestion = {
	id: string;
	href: string;
	title: string;
	meta: string;
	chainId: string;
	chainTitle: string;
};

export type DashboardCurriculumTopic = {
	id: string;
	code: string;
	title: string;
	paper: string;
	specUrl: string;
	questionCount: number;
	activeGapCount: number;
};

export type SubjectLearningLane = {
	subject: string;
	board: string;
	qualification: string;
	course: LearnerSubject['course'];
	tier: LearnerSubject['tier'];
	courseLabel: string;
	href: string;
	recallHref: string;
	practiceHref: string;
	gapsHref: string;
	attemptCount: number;
	activeGapCount: number;
	recallDueCount: number;
	recallReviewCount: number;
	averageMarkPercent: number | null;
	confidencePercent: number;
	confidenceLabel: string;
	confidenceDetail: string;
	nextQuestion: DashboardNextQuestion | null;
	openGap: DashboardGap | null;
	primaryAction: {
		label: string;
		href: string;
		kind: 'recall' | 'gap' | 'question' | 'browse';
	};
	supportsRecall: boolean;
};

export type PersonalDashboard = {
	profile: UserProfile;
	learnerSubjects: LearnerSubject[];
	subjectLanes: SubjectLearningLane[];
	stats: {
		attemptCount: number;
		activeGapCount: number;
		closedGapCount: number;
		recallDueCount: number;
		recallReviewCount: number;
		averageMarkPercent: number | null;
	};
	activeGaps: DashboardGap[];
	recentAttempts: DashboardAttempt[];
	nextQuestion: DashboardNextQuestion | null;
	curriculum: {
		subject: string;
		specificationCode: string;
		specificationUrl: string;
		localSpecificationPath: string;
		topics: DashboardCurriculumTopic[];
	};
	subjectOptions: string[];
};

export type LearnerProfileSettings = {
	profile: UserProfile;
	subjects: LearnerSubject[];
	subjectOptions: string[];
};

export type LearnerSubjectInput = {
	subject: string;
	board: string;
	course: string;
	tier: string;
	enabled: boolean;
	currentGrade?: string | null;
	targetGrade?: string | null;
};

export type SavedAttemptSummary = {
	id: string;
	activeGaps: Array<{
		gapId: string;
		stepId: string;
		href: string;
	}>;
	recallPrompt: {
		href: string;
		label: string;
		cardCount: number;
	} | null;
};

export type GapGuidedQuestion = {
	id: string;
	question: string;
	expectedAnswer: string;
	hint: string;
	focusStepId: string;
};

export type GapLearningData = {
	gap: DashboardGap;
	subjectLabel: string;
	question: {
		id: string | null;
		title: string;
		prompt: string;
		href: string | null;
	};
	chain: {
		id: string;
		title: string;
		href: string;
		steps: Array<{ id: string; label: string; short: string }>;
	};
	presentation: {
		question: string;
		instructions: string;
		questions: GapGuidedQuestion[];
		memoryChain: string;
		answerPrompt: string;
		modelAnswer: string;
		maxMarks: number;
		targetStepId: string;
	};
};

export type GapFieldJudgeResult = {
	result: 'correct' | 'partial' | 'incorrect';
	feedback: string;
};

export type GapFinalJudgeResult = {
	awardedMarks: number;
	maxMarks: number;
	summary: string;
	presentStepIds: string[];
	missingStepIds: string[];
	gapClosed: boolean;
};

export type RecallReviewGrade = 'again' | 'hard' | 'good' | 'easy';

let ensuredPersonalTables = false;

const personalTableStatements = [
	`CREATE TABLE IF NOT EXISTS user_profiles (
	  uid TEXT PRIMARY KEY,
	  email TEXT NOT NULL,
	  name TEXT,
	  photo_url TEXT,
	  selected_board TEXT NOT NULL DEFAULT 'AQA',
	  selected_qualification TEXT NOT NULL DEFAULT 'GCSE',
	  selected_subject TEXT NOT NULL DEFAULT 'Biology',
	  selected_tier TEXT NOT NULL DEFAULT 'Higher',
	  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS user_profile_subjects (
	  user_id TEXT NOT NULL,
	  subject TEXT NOT NULL,
	  board TEXT NOT NULL DEFAULT 'AQA',
	  qualification TEXT NOT NULL DEFAULT 'GCSE',
	  course TEXT NOT NULL DEFAULT 'Separate Science',
	  tier TEXT NOT NULL DEFAULT 'Higher',
	  enabled INTEGER NOT NULL DEFAULT 1,
	  current_grade TEXT,
	  target_grade TEXT,
	  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  PRIMARY KEY (user_id, subject)
	)`,
	`CREATE TABLE IF NOT EXISTS user_question_attempts (
	  id TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
	  answer_chain_id TEXT REFERENCES answer_chains(id) ON DELETE SET NULL,
	  answer_text TEXT NOT NULL,
	  result TEXT NOT NULL,
	  awarded_marks INTEGER NOT NULL DEFAULT 0,
	  max_marks INTEGER NOT NULL DEFAULT 0,
	  present_step_ids_json TEXT NOT NULL DEFAULT '[]',
	  missing_step_ids_json TEXT NOT NULL DEFAULT '[]',
	  feedback_markdown TEXT NOT NULL DEFAULT '',
	  model TEXT,
	  model_version TEXT,
	  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS user_chain_gaps (
	  id TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
	  chain_step_id TEXT NOT NULL REFERENCES answer_chain_steps(id) ON DELETE CASCADE,
	  source_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
	  latest_attempt_id TEXT REFERENCES user_question_attempts(id) ON DELETE SET NULL,
	  board TEXT,
	  qualification TEXT,
	  subject TEXT,
	  tier TEXT,
	  status TEXT NOT NULL DEFAULT 'active',
	  gap_band TEXT NOT NULL DEFAULT 'large_gap',
	  evidence_count INTEGER NOT NULL DEFAULT 1,
	  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  UNIQUE (user_id, answer_chain_id, chain_step_id)
	)`,
	`CREATE TABLE IF NOT EXISTS user_gap_builder_runs (
	  id TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  gap_id TEXT NOT NULL REFERENCES user_chain_gaps(id) ON DELETE CASCADE,
	  phase TEXT NOT NULL,
	  guided_answers_json TEXT NOT NULL DEFAULT '{}',
	  final_answer TEXT,
	  result_json TEXT NOT NULL DEFAULT '{}',
	  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS user_recall_card_reviews (
	  user_id TEXT NOT NULL,
	  card_id TEXT NOT NULL,
	  subject TEXT NOT NULL,
	  topic_id TEXT NOT NULL,
	  mode TEXT NOT NULL DEFAULT 'recall',
	  last_grade TEXT NOT NULL,
	  seen_count INTEGER NOT NULL DEFAULT 1,
	  correct_count INTEGER NOT NULL DEFAULT 0,
	  interval_days INTEGER NOT NULL DEFAULT 0,
	  due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	  PRIMARY KEY (user_id, card_id)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_created
	  ON user_question_attempts (user_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_user_question_attempts_question
	  ON user_question_attempts (question_id, user_id)`,
	`CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_question
	  ON user_question_attempts (user_id, question_id)`,
	`CREATE INDEX IF NOT EXISTS idx_user_profile_subjects_user_enabled
	  ON user_profile_subjects (user_id, enabled, subject)`,
	`CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_status
	  ON user_chain_gaps (user_id, status, updated_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_chain
	  ON user_chain_gaps (user_id, answer_chain_id)`,
	`CREATE INDEX IF NOT EXISTS idx_user_gap_builder_runs_gap_created
	  ON user_gap_builder_runs (gap_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_user_recall_card_reviews_user_due
	  ON user_recall_card_reviews (user_id, due_at)`
];

const learnerSubjectOptions = [
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	'English Language',
	'English Literature'
];
const defaultEnabledSubjects = new Set(['Biology', 'Chemistry', 'Physics']);
const stemSubjectSet = new Set<string>(aqaStemCurriculum.map((entry) => entry.subject));
const englishSubjectSet = new Set(['English Language', 'English Literature']);
const supportedBoardNames = ['AQA', 'Edexcel', 'OCR', 'WJEC'];

export async function ensurePersonalLearningTables(): Promise<void> {
	if (ensuredPersonalTables) return;
	for (const statement of personalTableStatements) {
		await executeQuery(statement);
	}
	ensuredPersonalTables = true;
}

function jsonString(value: unknown): string {
	return JSON.stringify(value);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function canonicalWord(word: string): string {
	const aliases: Record<string, string> = {
		diffusing: 'diffusion',
		diffuse: 'diffusion',
		diffuses: 'diffusion',
		efficient: 'efficiency',
		efficiently: 'efficiency',
		gases: 'gas',
		gradients: 'gradient',
		maintained: 'maintain',
		maintaining: 'maintain',
		maintains: 'maintain',
		supplied: 'flow',
		supply: 'flow',
		ventilated: 'ventilation',
		ventilates: 'ventilation',
		ventilating: 'ventilation'
	};
	const aliased = aliases[word] ?? word;
	if (aliased.length > 5 && aliased.endsWith('ing')) return aliased.slice(0, -3);
	if (aliased.length > 4 && aliased.endsWith('ed')) return aliased.slice(0, -2);
	if (aliased.length > 4 && aliased.endsWith('ies')) return `${aliased.slice(0, -3)}y`;
	if (aliased.length > 4 && aliased.endsWith('s') && !aliased.endsWith('ss')) {
		return aliased.slice(0, -1);
	}
	return aliased;
}

function words(value: string): string[] {
	const stopwords = new Set([
		'able',
		'about',
		'after',
		'answer',
		'because',
		'before',
		'being',
		'cells',
		'change',
		'changes',
		'does',
		'from',
		'have',
		'into',
		'more',
		'next',
		'that',
		'than',
		'the',
		'their',
		'then',
		'there',
		'this',
		'what',
		'when',
		'where',
		'which',
		'with',
		'would',
		'your'
	]);
	return [...new Set(normalizeText(value).split(' ').map(canonicalWord))]
		.filter((word) => word.length >= 3)
		.filter((word) => !stopwords.has(word));
}

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function stableGapId(userId: string, chainId: string, stepId: string): string {
	return `gap_${stableHash(`${userId}:${chainId}:${stepId}`)}`;
}

function randomId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function toProfile(row: UserProfileRow): UserProfile {
	return {
		uid: row.uid,
		email: row.email,
		name: row.name,
		photoUrl: row.photo_url,
		selectedBoard: row.selected_board,
		selectedQualification: row.selected_qualification,
		selectedSubject: canonicalLearnerSubject(row.selected_subject),
		selectedTier: row.selected_tier
	};
}

function profileSubjects(): string[] {
	return learnerSubjectOptions;
}

function canonicalLearnerSubject(value: string | null | undefined): string {
	const normalized = (value ?? '').trim().toLowerCase();
	const matched = profileSubjects().find((subject) => subject.toLowerCase() === normalized);
	if (matched) return matched;
	if (normalized.includes('computer') || normalized.includes('computing'))
		return 'Computer Science';
	if (normalized.includes('geography')) return 'Geography';
	if (normalized.includes('history')) return 'History';
	if (normalized.includes('english') && normalized.includes('literature')) return 'English Literature';
	if (normalized.includes('english') && normalized.includes('language')) return 'English Language';
	if (normalized.includes('english')) return 'English Language';
	if (normalized.includes('biology')) return 'Biology';
	if (normalized.includes('chemistry')) return 'Chemistry';
	if (normalized.includes('physics')) return 'Physics';
	if (normalized.includes('combined science') || normalized.includes('science')) return 'Biology';
	return 'Biology';
}

function canonicalLearnerSubjectOrNull(value: string | null | undefined): string | null {
	const normalized = (value ?? '').trim();
	if (!normalized) return null;
	return canonicalLearnerSubject(normalized);
}

function subjectSupportsRecall(subject: string): boolean {
	return recallSubject(subject) !== null;
}

function isStemProfileSubject(subject: string): boolean {
	return stemSubjectSet.has(subject);
}

function safeBoard(value: string): string {
	const normalized = value.trim().toLowerCase();
	return supportedBoardNames.find((board) => board.toLowerCase() === normalized) ?? 'AQA';
}

function safeCourse(value: string): LearnerSubject['course'] {
	if (value === 'Combined Science') return 'Combined Science';
	if (value === 'Separate Science') return 'Separate Science';
	return 'GCSE Subject';
}

function safeTier(value: string): LearnerSubject['tier'] {
	return value === 'Foundation' ? 'Foundation' : 'Higher';
}

function toLearnerSubject(
	row: UserProfileSubjectRow,
	subjectOverride?: LearnerSubject['subject']
): LearnerSubject {
	const subject = subjectOverride ?? canonicalLearnerSubject(row.subject);
	return {
		subject,
		board: safeBoard(row.board),
		qualification: 'GCSE',
		course: isStemProfileSubject(subject) ? safeCourse(row.course) : 'GCSE Subject',
		tier: safeTier(row.tier),
		enabled: row.enabled === 1,
		currentGrade: row.current_grade,
		targetGrade: row.target_grade
	};
}

function defaultLearnerSubject(profile: UserProfile, subject: string): LearnerSubject {
	return {
		subject,
		board: englishSubjectSet.has(subject) ? 'OCR' : 'AQA',
		qualification: 'GCSE',
		course: isStemProfileSubject(subject) ? 'Combined Science' : 'GCSE Subject',
		tier: safeTier(profile.selectedTier),
		enabled: defaultEnabledSubjects.has(subject),
		currentGrade: null,
		targetGrade: null
	};
}

async function listLearnerSubjects(
	userId: string,
	profile: UserProfile
): Promise<LearnerSubject[]> {
	const rows = await queryRows<UserProfileSubjectRow>(
		`SELECT user_id, subject, board, qualification, course, tier, enabled,
		        current_grade, target_grade, created_at, updated_at
		 FROM user_profile_subjects
		 WHERE user_id = ?`,
		[userId]
	);
	const bySubject = new Map(
		rows.flatMap((row) => {
			if (row.subject.trim().toLowerCase() === 'english') {
				return [
					['English Language', toLearnerSubject(row, 'English Language')],
					['English Literature', toLearnerSubject(row, 'English Literature')]
				] as Array<readonly [string, LearnerSubject]>;
			}
			const subject = toLearnerSubject(row);
			return [[subject.subject, subject] as const];
		})
	);
	return profileSubjects().map(
		(subject) => bySubject.get(subject) ?? defaultLearnerSubject(profile, subject)
	);
}

function questionTitle(
	promptText: string | null | undefined,
	metadataJson?: string | null
): string {
	const metadata = parseJson<{ title?: string }>(metadataJson, {});
	if (metadata.title) return metadata.title;
	const cleaned = (promptText ?? '')
		.replace(/\*\*/g, '')
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.filter((line) => !/^\[\s*\d+\s*marks?\s*\]$/i.test(line))
		.join(' ');
	const firstQuestion = cleaned.match(
		/[^.?!]*(?:\?|Explain|Describe|Calculate|State|Give)[^.?!]*/i
	)?.[0];
	const title = (firstQuestion ?? cleaned).replace(/\s+/g, ' ').trim();
	return title.length > 92 ? `${title.slice(0, 89).trim()}...` : title || 'GCSE question';
}

function topicLabel(topicPathJson: string | null | undefined, fallback = 'GCSE science'): string {
	const path = parseJson<string[]>(topicPathJson, []);
	return path.at(-1) ?? path[0] ?? fallback;
}

function metaLine(parts: Array<string | number | null | undefined>): string {
	return parts
		.map((part) => (typeof part === 'number' ? String(part) : part))
		.filter((part): part is string => Boolean(part && part.trim()))
		.join(' · ');
}

function subjectLabelFromColumns(
	subject: string | null | undefined,
	subjectArea: string | null | undefined
): string | null {
	return (subject ?? '').toLowerCase().includes('english')
		? (subject ?? null)
		: (subjectArea ?? subject ?? null);
}

function gapBandLabel(value: string): string {
	if (value === 'closed') return 'closed';
	if (value === 'small_gap') return 'small gap';
	if (value === 'medium_gap') return 'medium gap';
	return 'large gap';
}

async function readUserProfile(userId: string): Promise<UserProfile> {
	const row = await queryFirst<UserProfileRow>(
		`SELECT uid, email, name, photo_url, selected_board, selected_qualification,
		        selected_subject, selected_tier, created_at, updated_at, last_seen_at
		 FROM user_profiles
		 WHERE uid = ?`,
		[userId]
	);
	if (!row) throw new Error(`User profile was not created for ${userId}`);
	return toProfile(row);
}

export async function upsertUserProfile(user: AdminUser): Promise<UserProfile> {
	await ensurePersonalLearningTables();
	await executeQuery(
		`INSERT INTO user_profiles (uid, email, name, photo_url, selected_board, selected_subject)
		 VALUES (?, ?, ?, ?, 'AQA', 'Biology')
		 ON CONFLICT(uid) DO UPDATE SET
		   email = excluded.email,
		   name = excluded.name,
		   photo_url = excluded.photo_url,
		   updated_at = CURRENT_TIMESTAMP,
		   last_seen_at = CURRENT_TIMESTAMP`,
		[user.uid, user.email, user.name, user.photoUrl]
	);
	return await readUserProfile(user.uid);
}

async function getOrCreateUserProfile(user: AdminUser): Promise<UserProfile> {
	const existing = await queryFirst<UserProfileRow>(
		`SELECT uid, email, name, photo_url, selected_board, selected_qualification,
		        selected_subject, selected_tier, created_at, updated_at, last_seen_at
		 FROM user_profiles
		 WHERE uid = ?`,
		[user.uid]
	).catch(async () => {
		await ensurePersonalLearningTables();
		return null;
	});
	if (existing) return toProfile(existing);

	await ensurePersonalLearningTables();
	await executeQuery(
		`INSERT INTO user_profiles (uid, email, name, photo_url, selected_board, selected_subject)
		 VALUES (?, ?, ?, ?, 'AQA', 'Biology')
		 ON CONFLICT(uid) DO NOTHING`,
		[user.uid, user.email, user.name, user.photoUrl]
	);
	return await readUserProfile(user.uid);
}

export async function updateUserPreferences({
	userId,
	board,
	subject,
	tier
}: {
	userId: string;
	board: string;
	subject: string;
	tier: string;
}): Promise<void> {
	await ensurePersonalLearningTables();
	const safeSubject = canonicalLearnerSubject(subject);
	const normalizedBoard = safeBoard(board);
	const normalizedTier = safeTier(tier);
	const normalizedCourse = isStemProfileSubject(safeSubject) ? 'Combined Science' : 'GCSE Subject';
	await executeQuery(
		`UPDATE user_profiles
		 SET selected_board = ?, selected_qualification = 'GCSE', selected_subject = ?,
		     selected_tier = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[normalizedBoard, safeSubject, normalizedTier, userId]
	);
	await executeQuery(
		`INSERT INTO user_profile_subjects (
		   user_id, subject, board, qualification, course, tier, enabled
		 )
		 VALUES (?, ?, ?, 'GCSE', ?, ?, 1)
		 ON CONFLICT(user_id, subject) DO UPDATE SET
		   board = excluded.board,
		   qualification = excluded.qualification,
		   course = excluded.course,
		   tier = excluded.tier,
		   enabled = 1,
		   updated_at = CURRENT_TIMESTAMP`,
		[userId, safeSubject, normalizedBoard, normalizedCourse, normalizedTier]
	);
}

export async function updateLearnerSubjects({
	userId,
	subjects
}: {
	userId: string;
	subjects: LearnerSubjectInput[];
}): Promise<void> {
	await ensurePersonalLearningTables();
	const normalized = profileSubjects().map((subject) => {
		const input = subjects.find((entry) => canonicalLearnerSubject(entry.subject) === subject);
		const defaultBoard = englishSubjectSet.has(subject) ? 'OCR' : 'AQA';
		return {
			subject,
			board: safeBoard(input?.board ?? defaultBoard),
			qualification: 'GCSE',
			course: isStemProfileSubject(subject)
				? safeCourse(input?.course ?? 'Combined Science')
				: 'GCSE Subject',
			tier: safeTier(input?.tier ?? 'Higher'),
			enabled: Boolean(input?.enabled),
			currentGrade: input?.currentGrade?.trim() || null,
			targetGrade: input?.targetGrade?.trim() || null
		} satisfies LearnerSubject;
	});

	for (const subject of normalized) {
		await executeQuery(
			`INSERT INTO user_profile_subjects (
			   user_id, subject, board, qualification, course, tier, enabled, current_grade, target_grade
			 )
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, subject) DO UPDATE SET
			   board = excluded.board,
			   qualification = excluded.qualification,
			   course = excluded.course,
			   tier = excluded.tier,
			   enabled = excluded.enabled,
			   current_grade = excluded.current_grade,
			   target_grade = excluded.target_grade,
			   updated_at = CURRENT_TIMESTAMP`,
			[
				userId,
				subject.subject,
				subject.board,
				subject.qualification,
				subject.course,
				subject.tier,
				subject.enabled ? 1 : 0,
				subject.currentGrade,
				subject.targetGrade
			]
		);
	}

	const primary = normalized.find((entry) => entry.enabled) ?? normalized[0];
	await executeQuery(
		`UPDATE user_profiles
		 SET selected_board = ?, selected_qualification = 'GCSE', selected_subject = ?,
		     selected_tier = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[primary.board, primary.subject, primary.tier, userId]
	);
}

export async function getLearnerProfileSettings(user: AdminUser): Promise<LearnerProfileSettings> {
	const profile = await getOrCreateUserProfile(user);
	return {
		profile,
		subjects: await listLearnerSubjects(user.uid, profile),
		subjectOptions: profileSubjects()
	};
}

function toDashboardGap(row: DashboardGapRow): DashboardGap {
	const topic = topicLabel(row.topic_path_json, row.subject ?? 'GCSE science');
	return {
		id: row.id,
		href: `/gaps/${encodeURIComponent(row.id)}`,
		chainId: row.answer_chain_id,
		chainTitle: row.chain_title,
		stepId: row.chain_step_id,
		stepText: row.step_text,
		stepOrder: row.step_order,
		gapBand: gapBandLabel(row.gap_band),
		evidenceCount: row.evidence_count,
		updatedAt: row.updated_at,
		questionId: row.source_question_id,
		questionTitle: row.question_title ?? questionTitle(null),
		questionHref: row.source_question_id
			? `/questions/${encodeURIComponent(row.source_question_id)}/practice`
			: null,
		meta: metaLine([
			row.board,
			row.qualification,
			row.subject,
			row.tier,
			row.paper,
			row.marks ? `${row.marks} marks` : null
		]),
		topic
	};
}

async function listActiveGaps(
	userId: string,
	limit = 6,
	subject?: string
): Promise<DashboardGap[]> {
	const subjectExpression = `CASE
		     WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
		     ELSE COALESCE(q.subject_area, q.subject, g.subject, '')
		   END`;
	const subjectFilter = subject
		? `AND LOWER(${subjectExpression}) LIKE ?`
		: '';
	const params: Array<string | number> = [userId];
	if (subject) params.push(`%${subject.toLowerCase()}%`);
	params.push(limit);
	const rows = await queryRows<DashboardGapRow>(
		`SELECT
		   g.id,
		   g.answer_chain_id,
		   g.chain_step_id,
		   g.source_question_id,
		   g.gap_band,
		   g.evidence_count,
		   g.updated_at,
		   ac.title AS chain_title,
		   ac.canonical_chain_text,
		   s.step_text,
		   s.display_order AS step_order,
		   q.prompt_text AS question_title,
		   q.source_question_ref,
		   COALESCE(q.board, g.board) AS board,
		   COALESCE(q.qualification, g.qualification) AS qualification,
		   ${subjectExpression} AS subject,
		   COALESCE(q.tier, g.tier) AS tier,
		   q.paper,
		   q.topic_path_json,
		   q.marks
		 FROM user_chain_gaps g
		 JOIN answer_chains ac ON ac.id = g.answer_chain_id
		 JOIN answer_chain_steps s ON s.id = g.chain_step_id
		 LEFT JOIN questions q ON q.id = g.source_question_id
		 WHERE g.user_id = ?
		   AND g.status = 'active'
		   ${subjectFilter}
		 ORDER BY
		   CASE g.gap_band
		     WHEN 'large_gap' THEN 0
		     WHEN 'medium_gap' THEN 1
		     WHEN 'small_gap' THEN 2
		     ELSE 3
		   END,
		   g.updated_at DESC
		 LIMIT ?`,
		params
	);

	return rows.map((row) => ({
		...toDashboardGap(row),
		questionTitle: questionTitle(row.question_title)
	}));
}

async function listFirstActiveGapBySubject(
	userId: string,
	subjects: string[]
): Promise<Map<string, DashboardGap>> {
	if (subjects.length === 0) return new Map();
	const wantedSubjects = new Set(subjects);
	const rows = await queryRows<DashboardGapRow & { row_number: number }>(
		`WITH ranked_gaps AS (
		   SELECT
		     g.id,
		     g.answer_chain_id,
		     g.chain_step_id,
		     g.source_question_id,
		     g.gap_band,
		     g.evidence_count,
		     g.updated_at,
		     ac.title AS chain_title,
		     ac.canonical_chain_text,
		     s.step_text,
		     s.display_order AS step_order,
		     q.prompt_text AS question_title,
		     q.source_question_ref,
		     COALESCE(q.board, g.board) AS board,
		     COALESCE(q.qualification, g.qualification) AS qualification,
		     CASE
		       WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
		       ELSE COALESCE(q.subject_area, q.subject, g.subject)
		     END AS subject,
		     COALESCE(q.tier, g.tier) AS tier,
		     q.paper,
		     q.topic_path_json,
		     q.marks,
		     ROW_NUMBER() OVER (
		       PARTITION BY CASE
		         WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
		         ELSE COALESCE(q.subject_area, q.subject, g.subject, '')
		       END
		       ORDER BY
		         CASE g.gap_band
		           WHEN 'large_gap' THEN 0
		           WHEN 'medium_gap' THEN 1
		           WHEN 'small_gap' THEN 2
		           ELSE 3
		         END,
		         g.updated_at DESC
		     ) AS row_number
		   FROM user_chain_gaps g
		   JOIN answer_chains ac ON ac.id = g.answer_chain_id
		   JOIN answer_chain_steps s ON s.id = g.chain_step_id
		   LEFT JOIN questions q ON q.id = g.source_question_id
		   WHERE g.user_id = ?
		     AND g.status = 'active'
		 )
		 SELECT *
		 FROM ranked_gaps
		 WHERE row_number = 1`,
		[userId]
	);

	const gapsBySubject = new Map<string, DashboardGap>();
	for (const row of rows) {
		const subject = canonicalLearnerSubjectOrNull(row.subject);
		if (!subject || !wantedSubjects.has(subject) || gapsBySubject.has(subject)) continue;
		gapsBySubject.set(subject, {
			...toDashboardGap(row),
			questionTitle: questionTitle(row.question_title)
		});
	}
	return gapsBySubject;
}

async function listRecentAttempts(userId: string, limit = 6): Promise<DashboardAttempt[]> {
	const rows = await queryRows<DashboardAttemptRow>(
		`SELECT
		   a.id,
		   a.question_id,
		   a.answer_chain_id,
		   a.result,
		   a.awarded_marks,
		   a.max_marks,
		   a.missing_step_ids_json,
		   a.created_at,
		   q.prompt_text AS question_title,
		   q.source_question_ref,
		   CASE
		     WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
		     ELSE COALESCE(q.subject_area, q.subject)
		   END AS subject,
		   q.paper,
		   ac.title AS chain_title
		 FROM user_question_attempts a
		 LEFT JOIN questions q ON q.id = a.question_id
		 LEFT JOIN answer_chains ac ON ac.id = a.answer_chain_id
		 WHERE a.user_id = ?
		 ORDER BY a.created_at DESC
		 LIMIT ?`,
		[userId, limit]
	);

	return rows.map((row) => ({
		id: row.id,
		questionId: row.question_id,
		questionTitle: questionTitle(row.question_title),
		questionHref: `/questions/${encodeURIComponent(row.question_id)}/practice`,
		result: row.result,
		awardedMarks: row.awarded_marks,
		maxMarks: row.max_marks,
		missingCount: parseJson<string[]>(row.missing_step_ids_json, []).length,
		createdAt: row.created_at,
		meta: metaLine([row.source_question_ref, row.subject, row.paper]),
		chainTitle: row.chain_title
	}));
}

async function readDashboardStats(userId: string): Promise<PersonalDashboard['stats']> {
	const attemptStats = await queryFirst<{
		attempt_count: number;
		total_awarded: number | null;
		total_marks: number | null;
	}>(
		`SELECT COUNT(*) AS attempt_count,
		        SUM(awarded_marks) AS total_awarded,
		        SUM(max_marks) AS total_marks
		 FROM user_question_attempts
		 WHERE user_id = ?`,
		[userId]
	);
	const gapStats = await queryRows<{ status: string; count: number }>(
		`SELECT status, COUNT(*) AS count
		 FROM user_chain_gaps
		 WHERE user_id = ?
		 GROUP BY status`,
		[userId]
	);
	const recallStats = await queryFirst<{ review_count: number; due_count: number }>(
		`SELECT COUNT(*) AS review_count,
		        SUM(CASE WHEN due_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS due_count
		 FROM user_recall_card_reviews
		 WHERE user_id = ?`,
		[userId]
	);
	const gapCount = (status: string) => gapStats.find((row) => row.status === status)?.count ?? 0;
	const totalMarks = attemptStats?.total_marks ?? 0;

	return {
		attemptCount: attemptStats?.attempt_count ?? 0,
		activeGapCount: gapCount('active'),
		closedGapCount: gapCount('closed'),
		recallDueCount: recallStats?.due_count ?? 0,
		recallReviewCount: recallStats?.review_count ?? 0,
		averageMarkPercent:
			totalMarks > 0 ? Math.round(((attemptStats?.total_awarded ?? 0) / totalMarks) * 100) : null
	};
}

type SubjectLearningStats = {
	attemptCount: number;
	activeGapCount: number;
	recallDueCount: number;
	recallReviewCount: number;
	averageMarkPercent: number | null;
};

type SubjectAttemptStatsRow = {
	subject: string | null;
	attempt_count: number;
	total_awarded: number | null;
	total_marks: number | null;
};

type SubjectGapStatsRow = {
	subject: string | null;
	active_count: number;
};

type SubjectRecallStatsRow = {
	subject: string | null;
	review_count: number;
	due_count: number | null;
};

function emptySubjectStats(): SubjectLearningStats {
	return {
		attemptCount: 0,
		activeGapCount: 0,
		recallDueCount: 0,
		recallReviewCount: 0,
		averageMarkPercent: null
	};
}

function ensureSubjectStats(
	statsBySubject: Map<string, SubjectLearningStats>,
	subject: string
): SubjectLearningStats {
	const existing = statsBySubject.get(subject);
	if (existing) return existing;
	const created = emptySubjectStats();
	statsBySubject.set(subject, created);
	return created;
}

async function readSubjectLearningStatsMap(
	userId: string,
	subjects: string[]
): Promise<Map<string, SubjectLearningStats>> {
	const wantedSubjects = new Set(subjects);
	const statsBySubject = new Map(
		subjects.map((subject) => [subject, emptySubjectStats()] as const)
	);

	const [attemptRows, gapRows, recallRows] = await Promise.all([
		queryRows<SubjectAttemptStatsRow>(
			`SELECT CASE
			          WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
			          ELSE COALESCE(q.subject_area, q.subject, '')
			        END AS subject,
			        COUNT(*) AS attempt_count,
			        SUM(a.awarded_marks) AS total_awarded,
			        SUM(a.max_marks) AS total_marks
			 FROM user_question_attempts a
			 LEFT JOIN questions q ON q.id = a.question_id
			 WHERE a.user_id = ?
			 GROUP BY CASE
			          WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
			          ELSE COALESCE(q.subject_area, q.subject, '')
			        END`,
			[userId]
		),
		queryRows<SubjectGapStatsRow>(
			`SELECT CASE
			          WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
			          ELSE COALESCE(q.subject_area, q.subject, g.subject, '')
			        END AS subject,
			        COUNT(*) AS active_count
			 FROM user_chain_gaps g
			 LEFT JOIN questions q ON q.id = g.source_question_id
			 WHERE g.user_id = ?
			   AND g.status = 'active'
			 GROUP BY CASE
			          WHEN LOWER(COALESCE(q.subject, '')) LIKE 'english%' THEN q.subject
			          ELSE COALESCE(q.subject_area, q.subject, g.subject, '')
			        END`,
			[userId]
		),
		queryRows<SubjectRecallStatsRow>(
			`SELECT subject,
			        COUNT(*) AS review_count,
			        SUM(CASE WHEN due_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS due_count
			 FROM user_recall_card_reviews
			 WHERE user_id = ?
			 GROUP BY subject`,
			[userId]
		)
	]);

	const attemptTotalsBySubject = new Map<string, { awarded: number; marks: number }>();
	for (const row of attemptRows) {
		const subject = canonicalLearnerSubjectOrNull(row.subject);
		if (!subject || !wantedSubjects.has(subject)) continue;
		const stats = ensureSubjectStats(statsBySubject, subject);
		const totals = attemptTotalsBySubject.get(subject) ?? { awarded: 0, marks: 0 };
		totals.awarded += row.total_awarded ?? 0;
		totals.marks += row.total_marks ?? 0;
		attemptTotalsBySubject.set(subject, totals);
		stats.attemptCount += row.attempt_count;
	}
	for (const [subject, totals] of attemptTotalsBySubject) {
		const stats = ensureSubjectStats(statsBySubject, subject);
		stats.averageMarkPercent =
			totals.marks > 0 ? Math.round((totals.awarded / totals.marks) * 100) : null;
	}

	for (const row of gapRows) {
		const subject = canonicalLearnerSubjectOrNull(row.subject);
		if (!subject || !wantedSubjects.has(subject)) continue;
		const stats = ensureSubjectStats(statsBySubject, subject);
		stats.activeGapCount += row.active_count;
	}

	for (const row of recallRows) {
		const subject = canonicalLearnerSubjectOrNull(row.subject);
		if (!subject || !wantedSubjects.has(subject)) continue;
		const stats = ensureSubjectStats(statsBySubject, subject);
		stats.recallDueCount += row.due_count ?? 0;
		stats.recallReviewCount += row.review_count;
	}

	return statsBySubject;
}

type NextQuestionSubjectColumn = 'subject_area' | 'subject';

function nextQuestionFromRow(row: NextQuestionRow): DashboardNextQuestion {
	return {
		id: row.id,
		href: `/questions/${encodeURIComponent(row.id)}`,
		title: questionTitle(row.prompt_text, row.metadata_json),
		meta: metaLine([
			row.source_question_ref,
			row.board,
			row.qualification,
			subjectLabelFromColumns(row.subject, row.subject_area),
			row.paper,
			row.marks ? `${row.marks} marks` : null
		]),
		chainId: row.answer_chain_id,
		chainTitle: row.chain_title
	};
}

async function getNextQuestionRowsForSubjectColumn(
	userId: string,
	selectedSubject: string,
	learnerSubject: LearnerSubject | undefined,
	subjectColumn: NextQuestionSubjectColumn
): Promise<NextQuestionRow[]> {
	const subjectPredicate =
		subjectColumn === 'subject_area' ? 'q.subject_area = ?' : 'q.subject = ?';
	return await queryRows<NextQuestionRow>(
		`SELECT
		   q.id,
		   q.prompt_text,
		   q.metadata_json,
		   q.source_question_ref,
		   q.board,
		   q.qualification,
		   q.subject,
		   q.subject_area,
		   q.tier,
		   q.paper,
		   q.marks,
		   q.topic_path_json,
		   qac.answer_chain_id,
		   ac.title AS chain_title
		 FROM questions q
		 JOIN question_answer_chains qac INDEXED BY idx_question_answer_chains_question
		   ON qac.question_id = q.id
		 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
		 WHERE q.status = 'published'
		   AND q.needs_human_review = 0
		   AND qac.needs_human_review = 0
		   AND ac.status = 'published'
		   AND ac.needs_human_review = 0
		   AND ${subjectPredicate}
		   AND (q.board IS NULL OR q.board = ?)
		   AND (
		     q.tier IS NULL
		     OR q.tier = ''
		     OR LOWER(q.tier) = LOWER(?)
		     OR LOWER(q.tier) LIKE '%foundation and higher%'
		     OR LOWER(q.tier) LIKE '%higher and foundation%'
		     OR LOWER(q.tier) LIKE '%both%'
		   )
		   AND q.id NOT IN (
		     SELECT question_id FROM user_question_attempts WHERE user_id = ?
		   )
		 ORDER BY
		   CASE qac.transfer_distance
		     WHEN 'start' THEN 0
		     WHEN 'near' THEN 1
		     WHEN 'stretch' THEN 2
		     WHEN 'exam_transfer' THEN 3
		     ELSE 4
		   END,
		   COALESCE(qac.fit_confidence, 0) DESC,
		   q.id
		 LIMIT 1`,
		[selectedSubject, learnerSubject?.board ?? 'AQA', learnerSubject?.tier ?? 'Higher', userId]
	);
}

async function getNextQuestion(
	userId: string,
	selectedSubject: string,
	learnerSubject?: LearnerSubject
): Promise<DashboardNextQuestion | null> {
	const subjectAreaRows = await getNextQuestionRowsForSubjectColumn(
		userId,
		selectedSubject,
		learnerSubject,
		'subject_area'
	);
	const row =
		subjectAreaRows[0] ??
		(
			await getNextQuestionRowsForSubjectColumn(userId, selectedSubject, learnerSubject, 'subject')
		)[0];
	return row ? nextQuestionFromRow(row) : null;
}

async function questionCountForTopic(subject: string, topicTitle: string): Promise<number> {
	const row = await queryFirst<{ count: number }>(
		`SELECT COUNT(*) AS count
		 FROM questions
		 WHERE status = 'published'
		   AND needs_human_review = 0
		   AND LOWER(COALESCE(subject_area, subject, '')) LIKE ?
		   AND LOWER(topic_path_json) LIKE ?`,
		[`%${subject.toLowerCase()}%`, `%${topicTitle.toLowerCase()}%`]
	);
	return row?.count ?? 0;
}

async function buildCurriculumTopics(
	profile: UserProfile,
	activeGaps: DashboardGap[]
): Promise<PersonalDashboard['curriculum']> {
	if (!isStemProfileSubject(profile.selectedSubject)) {
		return {
			subject: profile.selectedSubject,
			specificationCode: '',
			specificationUrl: '',
			localSpecificationPath: '',
			topics: []
		};
	}
	const subject = getAqaStemSubject(profile.selectedSubject);
	const topics: DashboardCurriculumTopic[] = [];
	for (const topic of subject.topics) {
		const activeGapCount = activeGaps.filter((gap) => {
			const matched = subjectTopicMatches(subject.subject, gap.topic);
			return matched?.id === topic.id;
		}).length;
		topics.push({
			...topic,
			questionCount: await questionCountForTopic(subject.subject, topic.title),
			activeGapCount
		});
	}

	return {
		subject: subject.subject,
		specificationCode: subject.specificationCode,
		specificationUrl: subject.specificationUrl,
		localSpecificationPath: subject.localSpecificationPath,
		topics
	};
}

function confidenceForSubject(stats: SubjectLearningStats): {
	percent: number;
	label: string;
	detail: string;
} {
	const evidenceCount = stats.attemptCount + stats.recallReviewCount;
	if (evidenceCount === 0) {
		return {
			percent: 14,
			label: 'Low evidence',
			detail: 'Start with recall or a real question.'
		};
	}

	const markSignal = stats.averageMarkPercent ?? 45;
	const percent = Math.max(
		12,
		Math.min(
			94,
			Math.round(
				20 +
					stats.attemptCount * 12 +
					Math.min(18, stats.recallReviewCount * 2) +
					markSignal * 0.34 -
					stats.activeGapCount * 8
			)
		)
	);
	if (stats.activeGapCount > 0) {
		return {
			percent,
			label: 'Mistakes to fix',
			detail: `${stats.activeGapCount} ${stats.activeGapCount === 1 ? 'step needs' : 'steps need'} repair.`
		};
	}
	if (stats.recallDueCount > 0) {
		return {
			percent,
			label: 'Recall due',
			detail: `${stats.recallDueCount} ${stats.recallDueCount === 1 ? 'card' : 'cards'} ready.`
		};
	}
	if ((stats.averageMarkPercent ?? 0) >= 75 && stats.attemptCount >= 3) {
		return {
			percent,
			label: 'Strong evidence',
			detail: 'Move into transfer practice.'
		};
	}
	return {
		percent,
		label: 'Building evidence',
		detail: 'More answers will reduce uncertainty.'
	};
}

function buildSubjectLane(
	learnerSubject: LearnerSubject,
	stats: SubjectLearningStats,
	openGap: DashboardGap | null,
	nextQuestion: DashboardNextQuestion | null
): SubjectLearningLane {
	const confidence = confidenceForSubject(stats);
	const supportsRecall = subjectSupportsRecall(learnerSubject.subject);
	const recallHref = `/recall?${new URLSearchParams({
		subject: learnerSubject.subject,
		start: '1'
	}).toString()}`;
	const browseHref = englishSubjectSet.has(learnerSubject.subject)
		? `/english?${new URLSearchParams({ course: learnerSubject.subject }).toString()}`
		: `/chains?${new URLSearchParams({ subject: learnerSubject.subject }).toString()}`;
	let primaryAction: SubjectLearningLane['primaryAction'];
	if (openGap) {
		primaryAction = { label: 'Fix mistake', href: openGap.href, kind: 'gap' };
	} else if (supportsRecall && stats.recallDueCount > 0) {
		primaryAction = { label: 'Review flashcards', href: recallHref, kind: 'recall' };
	} else if (nextQuestion) {
		primaryAction = { label: 'Continue practice', href: nextQuestion.href, kind: 'question' };
	} else if (supportsRecall && stats.attemptCount + stats.recallReviewCount === 0) {
		primaryAction = { label: 'Start flashcards', href: recallHref, kind: 'recall' };
	} else {
		primaryAction = { label: 'Browse questions', href: browseHref, kind: 'browse' };
	}

	return {
		subject: learnerSubject.subject,
		board: learnerSubject.board,
		qualification: learnerSubject.qualification,
		course: learnerSubject.course,
		tier: learnerSubject.tier,
		courseLabel: metaLine([
			learnerSubject.board,
			learnerSubject.qualification,
			isStemProfileSubject(learnerSubject.subject) ? learnerSubject.course : null,
			isStemProfileSubject(learnerSubject.subject) ? learnerSubject.tier : null
		]),
		href: browseHref,
		recallHref,
		practiceHref: nextQuestion?.href ?? browseHref,
		gapsHref: openGap?.href ?? browseHref,
		attemptCount: stats.attemptCount,
		activeGapCount: stats.activeGapCount,
		recallDueCount: stats.recallDueCount,
		recallReviewCount: stats.recallReviewCount,
		averageMarkPercent: stats.averageMarkPercent,
		confidencePercent: confidence.percent,
		confidenceLabel: confidence.label,
		confidenceDetail: confidence.detail,
		nextQuestion,
		openGap,
		primaryAction,
		supportsRecall
	};
}

export async function getPersonalDashboard(user: AdminUser): Promise<PersonalDashboard> {
	const profile = await getOrCreateUserProfile(user);
	const learnerSubjects = await listLearnerSubjects(user.uid, profile);
	const enabledSubjects = learnerSubjects.filter((entry) => entry.enabled);
	const enabledSubjectNames = enabledSubjects.map((entry) => entry.subject);
	const primarySubject =
		enabledSubjects.find((entry) => entry.subject === profile.selectedSubject) ??
		enabledSubjects[0] ??
		learnerSubjects[0];
	const [
		stats,
		activeGaps,
		recentAttempts,
		subjectStatsBySubject,
		openGapsBySubject,
		nextQuestions
	] = await Promise.all([
		readDashboardStats(user.uid),
		listActiveGaps(user.uid),
		listRecentAttempts(user.uid),
		readSubjectLearningStatsMap(user.uid, enabledSubjectNames),
		listFirstActiveGapBySubject(user.uid, enabledSubjectNames),
		Promise.all(enabledSubjects.map((entry) => getNextQuestion(user.uid, entry.subject, entry)))
	]);
	const subjectLanes = enabledSubjects.map((entry, index) =>
		buildSubjectLane(
			entry,
			subjectStatsBySubject.get(entry.subject) ?? emptySubjectStats(),
			openGapsBySubject.get(entry.subject) ?? null,
			nextQuestions[index] ?? null
		)
	);
	const nextQuestion =
		subjectLanes.find((lane) => lane.subject === primarySubject.subject)?.nextQuestion ??
		subjectLanes.find((lane) => lane.nextQuestion)?.nextQuestion ??
		null;

	return {
		profile,
		learnerSubjects,
		subjectLanes,
		stats,
		activeGaps,
		recentAttempts,
		nextQuestion,
		curriculum: {
			subject: profile.selectedSubject,
			specificationCode: '',
			specificationUrl: '',
			localSpecificationPath: '',
			topics: []
		},
		subjectOptions: profileSubjects()
	};
}

function recallSubject(value: string): RecallSubject | null {
	if (value === 'Biology' || value === 'Chemistry' || value === 'Physics') return value;
	return null;
}

function recallPromptForQuestion(data: PracticePageData): SavedAttemptSummary['recallPrompt'] {
	const subject = recallSubject(data.question.meta.subject);
	if (!subject) return null;
	const topicText = data.question.meta.topic.toLowerCase();
	const topic =
		recallCurriculumTopics.find(
			(entry) =>
				entry.subject === subject &&
				(topicText.includes(entry.title.toLowerCase()) ||
					entry.title.toLowerCase().includes(topicText.split(':').at(-1)?.trim() ?? ''))
		) ?? recallCurriculumTopics.find((entry) => entry.subject === subject);
	if (!topic) return null;
	const cardCount = recallCards.filter((card) => card.topicId === topic.id).length;
	const params = new URLSearchParams({
		subject,
		topic: topic.id,
		start: '1'
	});
	return {
		href: `/recall?${params.toString()}`,
		label: `${subject} flashcards: ${topic.title}`,
		cardCount
	};
}

export async function recordQuestionAttempt({
	user,
	questionId,
	answer,
	result
}: {
	user: AdminUser;
	questionId: string;
	answer: string;
	result: QuestionGradeResult;
}): Promise<SavedAttemptSummary> {
	await upsertUserProfile(user);
	const data = await getPracticePageData(questionId);
	const attemptId = randomId('attempt');
	await executeQuery(
		`INSERT INTO user_question_attempts (
		   id, user_id, question_id, answer_chain_id, answer_text, result,
		   awarded_marks, max_marks, present_step_ids_json, missing_step_ids_json,
		   feedback_markdown, model, model_version
		 )
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			attemptId,
			user.uid,
			questionId,
			data.chain.id,
			answer,
			result.result,
			result.awardedMarks,
			result.maxMarks,
			jsonString(result.presentStepIds),
			jsonString(result.missingStepIds),
			result.feedbackMarkdown,
			result.model,
			result.modelVersion
		]
	);

	for (const stepId of result.presentStepIds) {
		await executeQuery(
			`UPDATE user_chain_gaps
			 SET status = 'closed',
			     gap_band = 'closed',
			     latest_attempt_id = ?,
			     updated_at = CURRENT_TIMESTAMP,
			     last_seen_at = CURRENT_TIMESTAMP
			 WHERE user_id = ?
			   AND answer_chain_id = ?
			   AND chain_step_id = ?`,
			[attemptId, user.uid, data.chain.id, stepId]
		);
	}

	const shouldUseRecallInsteadOfGap =
		data.question.meta.marks <= 2 ||
		data.chain.steps.length <= 2 ||
		/recall/i.test(data.chain.title);
	const recallPrompt =
		shouldUseRecallInsteadOfGap && result.result !== 'correct'
			? recallPromptForQuestion(data)
			: null;

	if (shouldUseRecallInsteadOfGap) {
		return {
			id: attemptId,
			activeGaps: [],
			recallPrompt
		};
	}

	for (const stepId of result.missingStepIds) {
		const gapId = stableGapId(user.uid, data.chain.id, stepId);
		await executeQuery(
			`INSERT INTO user_chain_gaps (
			   id, user_id, answer_chain_id, chain_step_id, source_question_id,
			   latest_attempt_id, board, qualification, subject, tier, status, gap_band
			 )
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
			 ON CONFLICT(user_id, answer_chain_id, chain_step_id) DO UPDATE SET
			   source_question_id = excluded.source_question_id,
			   latest_attempt_id = excluded.latest_attempt_id,
			   board = excluded.board,
			   qualification = excluded.qualification,
			   subject = excluded.subject,
			   tier = excluded.tier,
			   status = 'active',
			   gap_band = excluded.gap_band,
			   evidence_count = user_chain_gaps.evidence_count + 1,
			   updated_at = CURRENT_TIMESTAMP,
			   last_seen_at = CURRENT_TIMESTAMP`,
			[
				gapId,
				user.uid,
				data.chain.id,
				stepId,
				questionId,
				attemptId,
				data.question.meta.board,
				data.question.meta.qualification,
				data.question.meta.subject,
				data.question.meta.tier,
				result.awardedMarks <= 0 ? 'large_gap' : 'medium_gap'
			]
		);
	}

	const activeGaps = await queryRows<{ id: string; chain_step_id: string }>(
		`SELECT id, chain_step_id
		 FROM user_chain_gaps
		 WHERE user_id = ?
		   AND answer_chain_id = ?
		   AND status = 'active'`,
		[user.uid, data.chain.id]
	);
	const missing = new Set(result.missingStepIds);

	return {
		id: attemptId,
		activeGaps: activeGaps
			.filter((gap) => missing.has(gap.chain_step_id))
			.map((gap) => ({
				gapId: gap.id,
				stepId: gap.chain_step_id,
				href: `/gaps/${encodeURIComponent(gap.id)}`
			})),
		recallPrompt
	};
}

async function getChainSteps(chainId: string): Promise<ChainStepRow[]> {
	return await queryRows<ChainStepRow>(
		`SELECT id, display_order, step_text, step_role, explanation, common_omission, evidence_json
		 FROM answer_chain_steps
		 WHERE answer_chain_id = ?
		 ORDER BY display_order`,
		[chainId]
	);
}

async function readGapDetail(userId: string, gapId: string): Promise<GapDetailRow | null> {
	return await queryFirst<GapDetailRow>(
		`SELECT
		   g.id,
		   g.answer_chain_id,
		   g.chain_step_id,
		   g.source_question_id,
		   g.status,
		   g.gap_band,
		   g.evidence_count,
		   g.updated_at,
		   ac.title AS chain_title,
		   ac.canonical_chain_text,
		   s.step_text,
		   s.display_order AS step_order,
		   q.prompt_text AS question_title,
		   q.source_question_ref,
		   COALESCE(q.board, g.board) AS board,
		   COALESCE(q.qualification, g.qualification) AS qualification,
		   CASE
		     WHEN LOWER(COALESCE(q.subject, g.subject, '')) LIKE 'english%' THEN COALESCE(q.subject, g.subject)
		     ELSE COALESCE(q.subject_area, q.subject, g.subject)
		   END AS subject,
		   COALESCE(q.tier, g.tier) AS tier,
		   q.paper,
		   q.topic_path_json,
		   q.marks,
		   q.prompt_text AS source_prompt_text,
		   q.context_text AS source_context_text,
		   q.metadata_json AS source_metadata_json,
		   q.topic_path_json AS source_topic_path_json
		 FROM user_chain_gaps g
		 JOIN answer_chains ac ON ac.id = g.answer_chain_id
		 JOIN answer_chain_steps s ON s.id = g.chain_step_id
		 LEFT JOIN questions q ON q.id = g.source_question_id
		 WHERE g.user_id = ?
		   AND g.id = ?`,
		[userId, gapId]
	);
}

function shortStepText(text: string): string {
	return text.replace(/\.$/, '').replace(/^The /, '').replace(/^A /, '').replace(/^An /, '');
}

function buildGuidedQuestions(gap: GapDetailRow, steps: ChainStepRow[]): GapGuidedQuestion[] {
	const index = Math.max(
		0,
		steps.findIndex((step) => step.id === gap.chain_step_id)
	);
	const target = steps[index];
	const previous = steps[Math.max(0, index - 1)];
	const next = steps[Math.min(steps.length - 1, index + 1)];
	const questions: GapGuidedQuestion[] = [];

	if (previous && previous.id !== target.id) {
		questions.push({
			id: 'previous-link',
			question: `What idea comes just before "${shortStepText(target.step_text)}"?`,
			expectedAnswer: previous.step_text,
			hint: previous.common_omission ?? 'Use the earlier cause in the method.',
			focusStepId: previous.id
		});
	}

	questions.push({
		id: 'missing-link',
		question: `What missing step needs to be added for "${shortStepText(target.step_text)}"?`,
		expectedAnswer: target.step_text,
		hint:
			target.common_omission ??
			target.explanation ??
			'Name the specific cause-and-effect step that earns this mark.',
		focusStepId: target.id
	});

	if (next && next.id !== target.id) {
		questions.push({
			id: 'next-link',
			question: `What does that step lead to next?`,
			expectedAnswer: next.step_text,
			hint: next.common_omission ?? 'Connect the missing idea to the next mark-scoring step.',
			focusStepId: next.id
		});
	}

	return questions.slice(0, 3);
}

export async function getGapLearningData(
	userId: string,
	gapId: string
): Promise<GapLearningData | null> {
	await ensurePersonalLearningTables();
	const row = await readGapDetail(userId, gapId);
	if (!row) return null;
	const steps = await getChainSteps(row.answer_chain_id);
	const questionData: PracticePageData | null = row.source_question_id
		? await getPracticePageData(row.source_question_id).catch(() => null)
		: null;
	const dashboardGap = {
		...toDashboardGap(row),
		questionTitle: questionTitle(row.source_prompt_text, row.source_metadata_json)
	};
	const chainSteps = steps.map((step) => ({
		id: step.id,
		label: step.step_text,
		short: shortStepText(step.step_text)
	}));
	const guidedQuestions = buildGuidedQuestions(row, steps);
	const targetStep = steps.find((step) => step.id === row.chain_step_id) ?? steps[0];

	return {
		gap: dashboardGap,
		subjectLabel: metaLine([row.board, row.qualification, row.subject, row.tier]),
		question: {
			id: row.source_question_id,
			title: questionTitle(row.source_prompt_text, row.source_metadata_json),
			prompt: row.source_prompt_text ?? row.question_title ?? row.chain_title,
			href: row.source_question_id
				? `/questions/${encodeURIComponent(row.source_question_id)}/practice`
				: null
		},
		chain: {
			id: row.answer_chain_id,
			title: row.chain_title,
			href: `/chains/${encodeURIComponent(row.answer_chain_id)}`,
			steps: chainSteps
		},
		presentation: {
			question: row.source_prompt_text ?? row.question_title ?? row.chain_title,
			instructions: 'Answer each step in a short phrase, then rewrite the full answer.',
			questions: guidedQuestions,
			memoryChain: chainSteps.map((step) => step.short).join(' -> '),
			answerPrompt: `Rewrite the original answer and make "${shortStepText(targetStep.step_text)}" explicit.`,
			modelAnswer: questionData?.question.modelAnswer ?? row.canonical_chain_text,
			maxMarks: Math.max(1, row.marks ?? guidedQuestions.length),
			targetStepId: row.chain_step_id
		}
	};
}

function judgeAnswerAgainstExpected(answer: string, expected: string): GapFieldJudgeResult {
	const answerWords = new Set(words(answer));
	const expectedWords = words(expected);
	const matches = expectedWords.filter((word) => answerWords.has(word)).length;
	const required =
		expectedWords.length <= 2 ? 1 : Math.max(1, Math.ceil(expectedWords.length * 0.38));

	if (matches >= required) {
		return { result: 'correct', feedback: 'Correct.' };
	}
	if (matches > 0) {
		return {
			result: 'partial',
			feedback: 'You are close. What exact cause or process would an examiner credit here?'
		};
	}
	return {
		result: 'incorrect',
		feedback: 'Which word in the method names this missing idea?'
	};
}

export async function judgeGapField({
	userId,
	gapId,
	questionId,
	answer
}: {
	userId: string;
	gapId: string;
	questionId: string;
	answer: string;
}): Promise<GapFieldJudgeResult | null> {
	const data = await getGapLearningData(userId, gapId);
	const question = data?.presentation.questions.find((entry) => entry.id === questionId);
	if (!data || !question) return null;
	if (!answer.trim()) {
		return { result: 'incorrect', feedback: 'Type an answer first.' };
	}
	const judged = judgeAnswerAgainstExpected(answer, question.expectedAnswer);
	if (judged.result === 'correct') return judged;
	return {
		...judged,
		feedback: judged.result === 'partial' ? judged.feedback : question.hint
	};
}

function stepPresentInAnswer(
	answer: string,
	step: { id: string; label: string; short: string }
): boolean {
	const answerWords = new Set(words(answer));
	const candidates = [...new Set([...words(step.label), ...words(step.short)])];
	if (candidates.length === 0) return false;
	const matches = candidates.filter((word) => answerWords.has(word)).length;
	return matches >= (candidates.length <= 2 ? 1 : Math.max(1, Math.ceil(candidates.length * 0.34)));
}

export async function judgeGapFinalAnswer({
	userId,
	gapId,
	answer,
	guidedAnswers
}: {
	userId: string;
	gapId: string;
	answer: string;
	guidedAnswers: Record<string, string>;
}): Promise<GapFinalJudgeResult | null> {
	const data = await getGapLearningData(userId, gapId);
	if (!data) return null;
	const presentStepIds = data.chain.steps
		.filter((step) => stepPresentInAnswer(answer, step))
		.map((step) => step.id);
	const present = new Set(presentStepIds);
	const missingStepIds = data.chain.steps
		.filter((step) => !present.has(step.id))
		.map((step) => step.id);
	const gapClosed = present.has(data.presentation.targetStepId);
	const maxMarks = data.presentation.maxMarks;
	const awardedMarks = Math.min(
		maxMarks,
		Math.max(
			0,
			Math.round((presentStepIds.length / Math.max(1, data.chain.steps.length)) * maxMarks)
		)
	);
	const summary = gapClosed
		? 'The missing step is now explicit. Use the same method on the next similar question.'
		: 'The answer still needs the target missing step. Add it directly, then connect it to the next step.';

	await executeQuery(
		`INSERT INTO user_gap_builder_runs (
		   id, user_id, gap_id, phase, guided_answers_json, final_answer, result_json
		 )
		 VALUES (?, ?, ?, 'final_check', ?, ?, ?)`,
		[
			randomId('gaprun'),
			userId,
			gapId,
			jsonString(guidedAnswers),
			answer,
			jsonString({ awardedMarks, maxMarks, presentStepIds, missingStepIds, gapClosed })
		]
	);
	await executeQuery(
		`UPDATE user_chain_gaps
		 SET status = ?,
		     gap_band = ?,
		     updated_at = CURRENT_TIMESTAMP,
		     last_seen_at = CURRENT_TIMESTAMP
		 WHERE user_id = ?
		   AND id = ?`,
		[gapClosed ? 'closed' : 'active', gapClosed ? 'closed' : 'small_gap', userId, gapId]
	);

	return {
		awardedMarks,
		maxMarks,
		summary,
		presentStepIds,
		missingStepIds,
		gapClosed
	};
}

function intervalDaysForRecallGrade(grade: RecallReviewGrade): number {
	if (grade === 'easy') return 7;
	if (grade === 'good') return 3;
	if (grade === 'hard') return 1;
	return 0;
}

function dueAtForInterval(intervalDays: number): string {
	return new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ');
}

export async function recordRecallCardReview({
	user,
	cardId,
	grade,
	mode
}: {
	user: AdminUser;
	cardId: string;
	grade: RecallReviewGrade;
	mode: string;
}): Promise<{ status: 'ok'; dueAt: string; intervalDays: number } | null> {
	await upsertUserProfile(user);
	const card: RecallCard | undefined = recallCards.find((entry) => entry.id === cardId);
	if (!card) return null;
	const intervalDays = intervalDaysForRecallGrade(grade);
	const dueAt = dueAtForInterval(intervalDays);
	const correctIncrement = grade === 'again' ? 0 : 1;

	await executeQuery(
		`INSERT INTO user_recall_card_reviews (
		   user_id, card_id, subject, topic_id, mode, last_grade,
		   seen_count, correct_count, interval_days, due_at
		 )
		 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
		 ON CONFLICT(user_id, card_id) DO UPDATE SET
		   subject = excluded.subject,
		   topic_id = excluded.topic_id,
		   mode = excluded.mode,
		   last_grade = excluded.last_grade,
		   seen_count = user_recall_card_reviews.seen_count + 1,
		   correct_count = user_recall_card_reviews.correct_count + ?,
		   interval_days = excluded.interval_days,
		   due_at = excluded.due_at,
		   updated_at = CURRENT_TIMESTAMP`,
		[
			user.uid,
			card.id,
			card.subject,
			card.topicId,
			mode,
			grade,
			correctIncrement,
			intervalDays,
			dueAt,
			correctIncrement
		]
	);

	return { status: 'ok', dueAt, intervalDays };
}
