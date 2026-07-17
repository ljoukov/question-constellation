import { aqaStemCurriculum, getAqaStemSubject, subjectTopicMatches } from '$lib/curriculum/aqaStem';
import { getCurriculumProfileSnapshot } from '$lib/server/curriculumCatalog';
import {
	recallCards,
	recallCurriculumTopics,
	recallSubjects,
	runtimeRecallSubjects,
	type RecallCard,
	type RecallRuntimeSubject,
	type RecallSubject
} from '$lib/recall/aqaScienceRecall';
import { recallEvidenceComponentId } from '$lib/server/recallCatalog';
import { recallActivityHref, recallCoverageHref } from '$lib/recall/routes';
import type { QuestionGradeResult } from '$lib/server/answerGrading';
import {
	constructedAnswerIsIndependent,
	normalizeConstructedAnswerAssistance,
	type ConstructedAnswerAssistance,
	type ExternalInputSource
} from '$lib/learning/answerAssistance';
import { enabledProfileCombinationForQuestion } from '$lib/learning/profileQuestionCompatibility';
import { isScienceLearnerSubject } from '$lib/learning/subjects';
import {
	getPracticePageData,
	type ChainStep,
	type PracticePageData
} from '$lib/server/questionData';
import type { PracticeDraftKind, PracticeDraftSave, SavedPracticeDraft } from '$lib/practiceDrafts';
import type { AdminUser } from '$lib/server/auth/session';
import {
	emptyOcrEnglishLiteratureSelections,
	type EnglishLiteratureSelectionInput,
	type EnglishLiteratureSelections
} from '$lib/englishLiteratureProfile';
import {
	executePersonalQuery,
	queryFirst,
	queryPersonalFirst,
	queryPersonalRows,
	queryRows
} from './db';

type UserProfileRow = {
	uid: string;
	email: string;
	name: string | null;
	photo_url: string | null;
	selected_board: string;
	selected_qualification: string;
	selected_subject: string;
	selected_tier: string;
	theme_preference: string | null;
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

type EnglishLiteratureSelectionsRow = {
	board: string;
	specification_code: string;
	modern_text: string | null;
	nineteenth_century_novel: string | null;
	poetry_cluster: string | null;
	shakespeare_play: string | null;
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

type UserQuestionDraftRow = {
	question_id: string;
	draft_kind: PracticeDraftKind;
	answer_text: string;
	draft_json: string;
	client_updated_at: number;
	updated_at: string;
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
	course: string | null;
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
	themePreference: ThemePreference;
};

export type ThemePreference = 'auto' | 'light' | 'dark';

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
	mcqHref: string;
	coverageHref: string;
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
	englishLiteratureSelections: EnglishLiteratureSelections;
};

export type QuestionBoardAvailability = Map<string, string[]>;

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
	followUpQuestion: {
		id: string;
		title: string;
		href: string;
	} | null;
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
	runId: string;
	awardedMarks: number;
	maxMarks: number;
	summary: string;
	presentStepIds: string[];
	missingStepIds: string[];
	targetStepPresent: boolean;
	gapClosed: boolean;
	externalInputDetected: boolean;
	externalInputSources: ExternalInputSource[];
};

export type RecallReviewGrade = 'again' | 'hard' | 'good' | 'easy';

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

let questionBoardAvailabilityPromise: Promise<QuestionBoardAvailability> | null = null;

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
		selectedTier: row.selected_tier,
		themePreference: safeThemePreference(row.theme_preference)
	};
}

function safeThemePreference(value: unknown): ThemePreference {
	return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

function profileSubjects(): string[] {
	return learnerSubjectOptions;
}

function cloneQuestionBoardAvailability(
	availability: QuestionBoardAvailability
): QuestionBoardAvailability {
	return new Map([...availability.entries()].map(([subject, boards]) => [subject, [...boards]]));
}

function boardSortValue(board: string) {
	const index = supportedBoardNames.findIndex(
		(candidate) => candidate.toLowerCase() === board.toLowerCase()
	);
	return index === -1 ? supportedBoardNames.length : index;
}

function normalizeBoardList(boards: string[]) {
	const seen = new Set<string>();
	return boards
		.map((board) => safeBoard(board))
		.filter((board) => {
			const key = board.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((left, right) => boardSortValue(left) - boardSortValue(right));
}

async function readQuestionBoardAvailability(): Promise<QuestionBoardAvailability> {
	const snapshot = await getCurriculumProfileSnapshot();
	const availability = new Map<string, string[]>();
	for (const entry of snapshot.subjects) {
		const subject = canonicalLearnerSubject(entry.subject);
		availability.set(subject, normalizeBoardList(entry.boards.map((board) => board.name)));
	}

	const missingSubjects = profileSubjects().filter((subject) => !availability.get(subject)?.length);
	if (missingSubjects.length > 0) {
		throw new Error(
			`The curriculum profile snapshot is missing supported GCSE combinations for: ${missingSubjects.join(', ')}`
		);
	}

	return availability;
}

export async function getImportedQuestionBoardAvailability(): Promise<QuestionBoardAvailability> {
	questionBoardAvailabilityPromise ??= readQuestionBoardAvailability();
	return cloneQuestionBoardAvailability(await questionBoardAvailabilityPromise);
}

function availableBoardsForSubject(
	subject: string,
	availability: QuestionBoardAvailability
): string[] {
	const canonicalSubject = canonicalLearnerSubject(subject);
	const boards = availability.get(canonicalSubject);
	if (!boards?.length) {
		throw new Error(`No imported board availability for ${canonicalSubject}.`);
	}
	return normalizeBoardList(boards);
}

function canonicalLearnerSubject(value: string | null | undefined): string {
	const normalized = (value ?? '').trim().toLowerCase();
	const matched = profileSubjects().find((subject) => subject.toLowerCase() === normalized);
	if (matched) return matched;
	if (normalized.includes('computer') || normalized.includes('computing'))
		return 'Computer Science';
	if (normalized.includes('geography')) return 'Geography';
	if (normalized.includes('history')) return 'History';
	if (normalized.includes('english') && normalized.includes('literature'))
		return 'English Literature';
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

function safeBoardForSubject(
	subject: string,
	value: string,
	availability: QuestionBoardAvailability
): string {
	const requestedBoard = safeBoard(value);
	const boards = availableBoardsForSubject(subject, availability);
	return boards.find((board) => board.toLowerCase() === requestedBoard.toLowerCase()) ?? boards[0];
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
	boardAvailability: QuestionBoardAvailability
): LearnerSubject {
	const subject = canonicalLearnerSubject(row.subject);
	return {
		subject,
		board: safeBoardForSubject(subject, row.board, boardAvailability),
		qualification: 'GCSE',
		course: isStemProfileSubject(subject) ? safeCourse(row.course) : 'GCSE Subject',
		tier: safeTier(row.tier),
		enabled: row.enabled === 1,
		currentGrade: row.current_grade,
		targetGrade: row.target_grade
	};
}

function defaultLearnerSubject(
	profile: UserProfile,
	subject: string,
	boardAvailability: QuestionBoardAvailability
): LearnerSubject {
	return {
		subject,
		board: safeBoardForSubject(
			subject,
			englishSubjectSet.has(subject) ? 'OCR' : profile.selectedBoard,
			boardAvailability
		),
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
	profile: UserProfile,
	boardAvailability: QuestionBoardAvailability
): Promise<LearnerSubject[]> {
	const rows = await queryPersonalRows<UserProfileSubjectRow>(
		`SELECT user_id, subject, board, qualification, course, tier, enabled,
		        current_grade, target_grade, created_at, updated_at
		 FROM user_profile_subjects
		 WHERE user_id = ?`,
		[userId]
	);
	const bySubject = new Map(
		rows.map((row) => {
			const subject = toLearnerSubject(row, boardAvailability);
			return [subject.subject, subject] as const;
		})
	);
	return profileSubjects().map(
		(subject) =>
			bySubject.get(subject) ?? defaultLearnerSubject(profile, subject, boardAvailability)
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

function gapBandLabel(value: string): string {
	if (value === 'closed') return 'closed';
	if (value === 'small_gap') return 'small gap';
	if (value === 'medium_gap') return 'medium gap';
	return 'large gap';
}

async function readUserProfile(userId: string): Promise<UserProfile> {
	const row = await queryPersonalFirst<UserProfileRow>(
		`SELECT uid, email, name, photo_url, selected_board, selected_qualification,
		        selected_subject, selected_tier, theme_preference, created_at, updated_at, last_seen_at
		 FROM user_profiles
		 WHERE uid = ?`,
		[userId]
	);
	if (!row) throw new Error(`User profile was not created for ${userId}`);
	return toProfile(row);
}

export async function upsertUserProfile(user: AdminUser): Promise<UserProfile> {
	await executePersonalQuery(
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
	const existing = await queryPersonalFirst<UserProfileRow>(
		`SELECT uid, email, name, photo_url, selected_board, selected_qualification,
		        selected_subject, selected_tier, theme_preference, created_at, updated_at, last_seen_at
		 FROM user_profiles
		 WHERE uid = ?`,
		[user.uid]
	);
	if (existing) return toProfile(existing);

	await executePersonalQuery(
		`INSERT INTO user_profiles (uid, email, name, photo_url, selected_board, selected_subject)
		 VALUES (?, ?, ?, ?, 'AQA', 'Biology')
		 ON CONFLICT(uid) DO NOTHING`,
		[user.uid, user.email, user.name, user.photoUrl]
	);
	return await readUserProfile(user.uid);
}

export async function getUserThemePreference(user: AdminUser): Promise<ThemePreference> {
	const profile = await getOrCreateUserProfile(user);
	return profile.themePreference;
}

export async function updateUserThemePreference({
	user,
	themePreference
}: {
	user: AdminUser;
	themePreference: ThemePreference;
}): Promise<ThemePreference> {
	await upsertUserProfile(user);
	const safePreference = safeThemePreference(themePreference);
	await executePersonalQuery(
		`UPDATE user_profiles
		 SET theme_preference = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[safePreference, user.uid]
	);
	return safePreference;
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
	const boardAvailability = await getImportedQuestionBoardAvailability();
	const safeSubject = canonicalLearnerSubject(subject);
	const normalizedBoard = safeBoardForSubject(safeSubject, board, boardAvailability);
	const normalizedTier = safeTier(tier);
	const normalizedCourse = isStemProfileSubject(safeSubject) ? 'Combined Science' : 'GCSE Subject';
	await executePersonalQuery(
		`UPDATE user_profiles
		 SET selected_board = ?, selected_qualification = 'GCSE', selected_subject = ?,
		     selected_tier = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[normalizedBoard, safeSubject, normalizedTier, userId]
	);
	await executePersonalQuery(
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
	const boardAvailability = await getImportedQuestionBoardAvailability();
	const normalized = profileSubjects().map((subject) => {
		const input = subjects.find((entry) => canonicalLearnerSubject(entry.subject) === subject);
		const defaultBoard = englishSubjectSet.has(subject) ? 'OCR' : 'AQA';
		return {
			subject,
			board: safeBoardForSubject(subject, input?.board ?? defaultBoard, boardAvailability),
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
		await executePersonalQuery(
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
	await executePersonalQuery(
		`UPDATE user_profiles
		 SET selected_board = ?, selected_qualification = 'GCSE', selected_subject = ?,
		     selected_tier = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[primary.board, primary.subject, primary.tier, userId]
	);
}

export async function updateEnglishLiteratureSelections({
	userId,
	selections
}: {
	userId: string;
	selections: EnglishLiteratureSelectionInput;
}): Promise<void> {
	await executePersonalQuery(
		`INSERT INTO user_english_literature_selections (
		   user_id, board, specification_code, modern_text, nineteenth_century_novel,
		   poetry_cluster, shakespeare_play
		 )
		 VALUES (?, 'OCR', 'J352', ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   board = excluded.board,
		   specification_code = excluded.specification_code,
		   modern_text = excluded.modern_text,
		   nineteenth_century_novel = excluded.nineteenth_century_novel,
		   poetry_cluster = excluded.poetry_cluster,
		   shakespeare_play = excluded.shakespeare_play,
		   updated_at = CURRENT_TIMESTAMP`,
		[
			userId,
			selections.modernText,
			selections.nineteenthCenturyNovel,
			selections.poetryCluster,
			selections.shakespearePlay
		]
	);
}

async function getEnglishLiteratureSelections(
	userId: string
): Promise<EnglishLiteratureSelections> {
	const row = await queryPersonalFirst<EnglishLiteratureSelectionsRow>(
		`SELECT board, specification_code, modern_text, nineteenth_century_novel,
		        poetry_cluster, shakespeare_play
		 FROM user_english_literature_selections
		 WHERE user_id = ?`,
		[userId]
	);

	if (!row) return emptyOcrEnglishLiteratureSelections();

	return {
		board: 'OCR',
		specificationCode: 'J352',
		modernText: row.modern_text,
		nineteenthCenturyNovel: row.nineteenth_century_novel,
		poetryCluster: row.poetry_cluster,
		shakespearePlay: row.shakespeare_play
	};
}

export async function getLearnerProfileSettings(user: AdminUser): Promise<LearnerProfileSettings> {
	const [profile, boardAvailability] = await Promise.all([
		getOrCreateUserProfile(user),
		getImportedQuestionBoardAvailability()
	]);
	const [subjects, englishLiteratureSelections] = await Promise.all([
		listLearnerSubjects(user.uid, profile, boardAvailability),
		getEnglishLiteratureSelections(user.uid)
	]);

	return {
		profile: {
			...profile,
			selectedBoard: safeBoardForSubject(
				profile.selectedSubject,
				profile.selectedBoard,
				boardAvailability
			)
		},
		subjects,
		subjectOptions: profileSubjects(),
		englishLiteratureSelections
	};
}

export async function getDefaultLearnerProfileSettings(): Promise<LearnerProfileSettings> {
	const boardAvailability = await getImportedQuestionBoardAvailability();
	const profile: UserProfile = {
		uid: 'anonymous',
		email: '',
		name: null,
		photoUrl: null,
		selectedBoard: 'AQA',
		selectedQualification: 'GCSE',
		selectedSubject: 'Biology',
		selectedTier: 'Higher',
		themePreference: 'auto'
	};
	return {
		profile,
		subjects: profileSubjects().map((subject) =>
			defaultLearnerSubject(profile, subject, boardAvailability)
		),
		subjectOptions: profileSubjects(),
		englishLiteratureSelections: emptyOcrEnglishLiteratureSelections()
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
	const subjectFilter = subject ? `AND LOWER(COALESCE(subject, '')) LIKE ?` : '';
	const params: Array<string | number> = [userId];
	if (subject) params.push(`%${subject.toLowerCase()}%`);
	params.push(limit);
	const rows = await queryPersonalRows<DashboardGapRow>(
		`SELECT
		   id,
		   answer_chain_id,
		   chain_step_id,
		   source_question_id,
		   gap_band,
		   evidence_count,
		   updated_at,
		   chain_title,
		   canonical_chain_text,
		   step_text,
		   step_order,
		   source_question_title AS question_title,
		   source_question_ref,
		   board,
		   qualification,
		   subject,
		   tier,
		   paper,
		   topic_path_json,
		   marks
		 FROM user_chain_gaps
		 WHERE user_id = ?
		   AND status = 'active'
		   ${subjectFilter}
		 ORDER BY
		   CASE gap_band
		     WHEN 'large_gap' THEN 0
		     WHEN 'medium_gap' THEN 1
		     WHEN 'small_gap' THEN 2
		     ELSE 3
		   END,
			   updated_at DESC
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
	const rows = await queryPersonalRows<DashboardGapRow & { row_number: number }>(
		`WITH ranked_gaps AS (
		   SELECT
		     id,
		     answer_chain_id,
		     chain_step_id,
		     source_question_id,
		     gap_band,
		     evidence_count,
		     updated_at,
		     chain_title,
		     canonical_chain_text,
		     step_text,
		     step_order,
		     source_question_title AS question_title,
		     source_question_ref,
		     board,
		     qualification,
		     subject,
		     tier,
		     paper,
		     topic_path_json,
		     marks,
		     ROW_NUMBER() OVER (
		       PARTITION BY COALESCE(subject, '')
		       ORDER BY
		         CASE gap_band
		           WHEN 'large_gap' THEN 0
		           WHEN 'medium_gap' THEN 1
		           WHEN 'small_gap' THEN 2
		           ELSE 3
		         END,
		         updated_at DESC
		     ) AS row_number
		   FROM user_chain_gaps
		   WHERE user_id = ?
		     AND status = 'active'
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
	const rows = await queryPersonalRows<DashboardAttemptRow>(
		`SELECT
		   id,
		   question_id,
		   answer_chain_id,
		   result,
		   awarded_marks,
		   max_marks,
		   missing_step_ids_json,
		   created_at,
		   question_title,
		   source_question_ref,
		   subject,
		   paper,
		   chain_title
		 FROM user_question_attempts
		 WHERE user_id = ?
		 ORDER BY created_at DESC
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
	const attemptStats = await queryPersonalFirst<{
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
	const gapStats = await queryPersonalRows<{ status: string; count: number }>(
		`SELECT status, COUNT(*) AS count
		 FROM user_chain_gaps
		 WHERE user_id = ?
		 GROUP BY status`,
		[userId]
	);
	const recallStats = await queryPersonalFirst<{ review_count: number; due_count: number }>(
		`SELECT COUNT(*) AS review_count,
		        SUM(CASE WHEN due_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS due_count
		 FROM user_recall_card_reviews
		 WHERE user_id = ?
		   AND content_revision IS NOT NULL
		   AND content_hash IS NOT NULL`,
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
		queryPersonalRows<SubjectAttemptStatsRow>(
			`SELECT subject,
			        COUNT(*) AS attempt_count,
			        SUM(awarded_marks) AS total_awarded,
			        SUM(max_marks) AS total_marks
			 FROM user_question_attempts
			 WHERE user_id = ?
			 GROUP BY subject`,
			[userId]
		),
		queryPersonalRows<SubjectGapStatsRow>(
			`SELECT subject,
			        COUNT(*) AS active_count
			 FROM user_chain_gaps
			 WHERE user_id = ?
			   AND status = 'active'
			 GROUP BY subject`,
			[userId]
		),
		queryPersonalRows<SubjectRecallStatsRow>(
			`SELECT subject,
			        COUNT(*) AS review_count,
			        SUM(CASE WHEN due_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS due_count
			 FROM user_recall_card_reviews
			 WHERE user_id = ?
			   AND content_revision IS NOT NULL
			   AND content_hash IS NOT NULL
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

async function listAttemptedQuestionIds(userId: string): Promise<Set<string>> {
	const rows = await queryPersonalRows<{ question_id: string }>(
		`SELECT question_id
		 FROM user_question_attempts
		 WHERE user_id = ?
		 ORDER BY created_at DESC
		 LIMIT 2000`,
		[userId]
	);
	return new Set(rows.map((row) => row.question_id));
}

function nextQuestionFromRow(row: NextQuestionRow): DashboardNextQuestion {
	return {
		id: row.id,
		href: `/questions/${encodeURIComponent(row.id)}`,
		title: questionTitle(row.prompt_text, row.metadata_json),
		meta: metaLine([
			row.source_question_ref,
			row.board,
			row.qualification,
			row.subject_area ?? row.subject,
			row.paper,
			row.marks ? `${row.marks} marks` : null
		]),
		chainId: row.answer_chain_id,
		chainTitle: row.chain_title
	};
}

async function getNextQuestionRowsForSubjectColumn(
	selectedSubject: string,
	learnerSubject: LearnerSubject | undefined,
	subjectColumn: NextQuestionSubjectColumn,
	attemptedQuestionIds: Set<string>
): Promise<NextQuestionRow[]> {
	const subjectPredicate =
		subjectColumn === 'subject_area' ? 'q.subject_area = ?' : 'q.subject = ?';
	const rows = await queryRows<NextQuestionRow>(
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
		 LIMIT 24`,
		[selectedSubject, learnerSubject?.board ?? 'AQA', learnerSubject?.tier ?? 'Higher']
	);
	return rows.filter((row) => !attemptedQuestionIds.has(row.id));
}

async function getNextQuestion(
	selectedSubject: string,
	learnerSubject: LearnerSubject | undefined,
	attemptedQuestionIds: Set<string>
): Promise<DashboardNextQuestion | null> {
	const subjectAreaRows = await getNextQuestionRowsForSubjectColumn(
		selectedSubject,
		learnerSubject,
		'subject_area',
		attemptedQuestionIds
	);
	const row =
		subjectAreaRows[0] ??
		(
			await getNextQuestionRowsForSubjectColumn(
				selectedSubject,
				learnerSubject,
				'subject',
				attemptedQuestionIds
			)
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
			label: 'Gaps to close',
			detail: `${stats.activeGapCount} ${stats.activeGapCount === 1 ? 'step needs' : 'steps need'} another pass.`
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
	const recallSubjectValue = recallSubject(learnerSubject.subject);
	const supportsRecall = recallSubjectValue !== null;
	const recallHref = recallSubjectValue
		? recallActivityHref(recallSubjectValue, 'flashcards')
		: '/recall';
	const mcqHref = recallSubjectValue ? recallActivityHref(recallSubjectValue, 'mcq') : '/recall';
	const coverageHref = recallSubjectValue ? recallCoverageHref(recallSubjectValue) : '/recall';
	const browseHref = `/chains?${new URLSearchParams({ subject: learnerSubject.subject }).toString()}`;
	let primaryAction: SubjectLearningLane['primaryAction'];
	if (openGap) {
		primaryAction = { label: 'Close the gap', href: openGap.href, kind: 'gap' };
	} else if (nextQuestion) {
		primaryAction = {
			label: stats.attemptCount === 0 ? 'Start exam question' : 'Continue practice',
			href: nextQuestion.href,
			kind: 'question'
		};
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
		mcqHref,
		coverageHref,
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
	const [profile, boardAvailability] = await Promise.all([
		getOrCreateUserProfile(user),
		getImportedQuestionBoardAvailability()
	]);
	const normalizedProfile = {
		...profile,
		selectedBoard: safeBoardForSubject(
			profile.selectedSubject,
			profile.selectedBoard,
			boardAvailability
		)
	};
	const learnerSubjects = await listLearnerSubjects(user.uid, normalizedProfile, boardAvailability);
	const enabledSubjects = learnerSubjects.filter((entry) => entry.enabled);
	const enabledSubjectNames = enabledSubjects.map((entry) => entry.subject);
	const primarySubject =
		enabledSubjects.find((entry) => entry.subject === normalizedProfile.selectedSubject) ??
		enabledSubjects[0] ??
		learnerSubjects[0];
	const [
		stats,
		activeGaps,
		recentAttempts,
		subjectStatsBySubject,
		openGapsBySubject,
		attemptedQuestionIds
	] = await Promise.all([
		readDashboardStats(user.uid),
		listActiveGaps(user.uid),
		listRecentAttempts(user.uid),
		readSubjectLearningStatsMap(user.uid, enabledSubjectNames),
		listFirstActiveGapBySubject(user.uid, enabledSubjectNames),
		listAttemptedQuestionIds(user.uid)
	]);
	const nextQuestions = await Promise.all(
		enabledSubjects.map((entry) => getNextQuestion(entry.subject, entry, attemptedQuestionIds))
	);
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
		profile: normalizedProfile,
		learnerSubjects,
		subjectLanes,
		stats,
		activeGaps,
		recentAttempts,
		nextQuestion,
		curriculum: {
			subject: normalizedProfile.selectedSubject,
			specificationCode: '',
			specificationUrl: '',
			localSpecificationPath: '',
			topics: []
		},
		subjectOptions: profileSubjects()
	};
}

function recallSubject(value: string): RecallRuntimeSubject | null {
	return value !== 'All subjects' && runtimeRecallSubjects.includes(value as RecallRuntimeSubject)
		? (value as RecallRuntimeSubject)
		: null;
}

function recallPromptForQuestion(data: PracticePageData): SavedAttemptSummary['recallPrompt'] {
	const runtimeSubject = recallSubject(data.question.meta.subject);
	if (!runtimeSubject || !recallSubjects.includes(runtimeSubject as RecallSubject)) return null;
	const subject = runtimeSubject as RecallSubject;
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
		start: '1',
		returnTo: `/questions/${encodeURIComponent(data.question.id)}/practice`
	});
	return {
		href: `/recall?${params.toString()}`,
		label: `${subject} flashcards: ${topic.title}`,
		cardCount
	};
}

function savedDraftFromRow(row: UserQuestionDraftRow): SavedPracticeDraft {
	return {
		questionId: row.question_id,
		draftKind: row.draft_kind,
		answerText: row.answer_text,
		payload: parseJson<Record<string, unknown>>(row.draft_json, {}),
		clientUpdatedAt: row.client_updated_at,
		updatedAt: row.updated_at
	};
}

export async function getQuestionDraft(
	userId: string,
	questionId: string
): Promise<SavedPracticeDraft | null> {
	const row = await queryPersonalFirst<UserQuestionDraftRow>(
		`SELECT question_id, draft_kind, answer_text, draft_json, client_updated_at, updated_at
		 FROM user_question_drafts
		 WHERE user_id = ?
		   AND question_id = ?`,
		[userId, questionId]
	);
	return row ? savedDraftFromRow(row) : null;
}

export async function saveQuestionDrafts(
	user: AdminUser,
	drafts: PracticeDraftSave[]
): Promise<{ saved: Array<{ questionId: string; clientUpdatedAt: number }> }> {
	await upsertUserProfile(user);

	for (const draft of drafts) {
		await executePersonalQuery(
			`INSERT INTO user_question_drafts (
			   user_id, question_id, draft_kind, answer_text, draft_json, client_updated_at, updated_at
			 )
			 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			 ON CONFLICT(user_id, question_id) DO UPDATE SET
			   draft_kind = excluded.draft_kind,
			   answer_text = excluded.answer_text,
			   draft_json = excluded.draft_json,
			   client_updated_at = excluded.client_updated_at,
			   updated_at = CURRENT_TIMESTAMP
			 WHERE excluded.client_updated_at >= user_question_drafts.client_updated_at`,
			[
				user.uid,
				draft.questionId,
				draft.draftKind,
				draft.answerText,
				jsonString(draft.payload),
				draft.clientUpdatedAt
			]
		);
	}

	return {
		saved: drafts.map((draft) => ({
			questionId: draft.questionId,
			clientUpdatedAt: draft.clientUpdatedAt
		}))
	};
}

export async function recordQuestionAttempt({
	user,
	questionId,
	answer,
	result,
	attemptId: requestedAttemptId,
	assistance
}: {
	user: AdminUser;
	questionId: string;
	answer: string;
	result: QuestionGradeResult;
	attemptId?: string;
	assistance?: ConstructedAnswerAssistance;
}): Promise<SavedAttemptSummary | null> {
	await upsertUserProfile(user);
	const [data, sourceRows, settings] = await Promise.all([
		getPracticePageData(questionId),
		queryRows<{
			board: string | null;
			qualification: string | null;
			subject: string | null;
			subject_area: string | null;
			component_code: string | null;
			tier: string | null;
		}>(
			`SELECT board, qualification, subject, subject_area, component_code, tier
			 FROM questions
			 WHERE id = ?
			 LIMIT 1`,
			[questionId]
		),
		getLearnerProfileSettings(user)
	]);
	const sourceRow = sourceRows[0];
	if (!sourceRow) return null;
	const learnerSubject = enabledProfileCombinationForQuestion(settings.subjects, {
		board: sourceRow.board,
		qualification: sourceRow.qualification,
		subject: sourceRow.subject,
		subjectArea: sourceRow.subject_area,
		componentCode: sourceRow.component_code,
		tier: sourceRow.tier
	});
	if (!learnerSubject) return null;
	const storedSubject = learnerSubject.subject;
	const storedCourse = learnerSubject.course;
	const storedTier = learnerSubject.tier;
	const attemptId = requestedAttemptId ?? randomId('attempt');
	const normalizedAssistance = normalizeConstructedAnswerAssistance(assistance);
	const presentStepIdsJson = jsonString(result.presentStepIds);
	const missingStepIdsJson = jsonString(result.missingStepIds);
	const topicPathJson = jsonString([data.question.meta.topic].filter(Boolean));
	const independent = constructedAnswerIsIndependent(normalizedAssistance) ? 1 : 0;
	const assistanceJson = jsonString(normalizedAssistance);
	const insertedAttempt = await queryPersonalFirst<{ id: string }>(
		`INSERT INTO user_question_attempts (
		   id, user_id, question_id, answer_chain_id, answer_text, result,
		   awarded_marks, max_marks, present_step_ids_json, missing_step_ids_json,
		   feedback_markdown, model, model_version, question_title, source_question_ref,
		   board, qualification, subject, course, tier, paper, topic_path_json, chain_title,
		   independent, assistance_json
		 )
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO NOTHING
		 RETURNING id`,
		[
			attemptId,
			user.uid,
			questionId,
			data.chain.id,
			answer,
			result.result,
			result.awardedMarks,
			result.maxMarks,
			presentStepIdsJson,
			missingStepIdsJson,
			result.feedbackMarkdown,
			result.model,
			result.modelVersion,
			data.question.title,
			data.question.sourceRef,
			learnerSubject.board,
			learnerSubject.qualification,
			storedSubject,
			storedCourse,
			storedTier,
			data.question.meta.paper,
			topicPathJson,
			data.chain.title,
			independent,
			assistanceJson
		]
	);
	if (!insertedAttempt) {
		const existing = await queryPersonalFirst<{ matches_write: number }>(
			`SELECT CASE WHEN
			   user_id = ? AND question_id = ? AND answer_chain_id = ?
			   AND answer_text = ? AND result = ?
			   AND awarded_marks = ? AND max_marks = ?
			   AND present_step_ids_json = ? AND missing_step_ids_json = ?
			   AND feedback_markdown = ?
			   AND COALESCE(model, '') = COALESCE(?, '')
			   AND COALESCE(model_version, '') = COALESCE(?, '')
			   AND COALESCE(question_title, '') = COALESCE(?, '')
			   AND COALESCE(source_question_ref, '') = COALESCE(?, '')
			   AND COALESCE(board, '') = COALESCE(?, '')
			   AND COALESCE(qualification, '') = COALESCE(?, '')
			   AND COALESCE(subject, '') = COALESCE(?, '')
			   AND COALESCE(course, '') = COALESCE(?, '')
			   AND COALESCE(tier, '') = COALESCE(?, '')
			   AND COALESCE(paper, '') = COALESCE(?, '')
			   AND topic_path_json = ?
			   AND COALESCE(chain_title, '') = COALESCE(?, '')
			   AND independent = ? AND assistance_json = ?
			 THEN 1 ELSE 0 END AS matches_write
			 FROM user_question_attempts
			 WHERE id = ?`,
			[
				user.uid,
				questionId,
				data.chain.id,
				answer,
				result.result,
				result.awardedMarks,
				result.maxMarks,
				presentStepIdsJson,
				missingStepIdsJson,
				result.feedbackMarkdown,
				result.model,
				result.modelVersion,
				data.question.title,
				data.question.sourceRef,
				learnerSubject.board,
				learnerSubject.qualification,
				storedSubject,
				storedCourse,
				storedTier,
				data.question.meta.paper,
				topicPathJson,
				data.chain.title,
				independent,
				assistanceJson,
				attemptId
			]
		);
		if (existing?.matches_write !== 1) {
			throw new Error('Attempt id is already in use for a different canonical write.');
		}
	}

	const followUpKind = questionAttemptFollowUpKind({
		subject: learnerSubject.subject,
		marks: data.question.meta.marks,
		chainStepCount: data.chain.steps.length,
		chainTitle: data.chain.title
	});
	const recallPrompt =
		followUpKind === 'recall' && result.result !== 'correct' ? recallPromptForQuestion(data) : null;

	if (followUpKind !== 'close_gap') {
		return {
			id: attemptId,
			activeGaps: [],
			recallPrompt
		};
	}

	for (const stepId of result.missingStepIds) {
		const gapId = stableGapId(user.uid, data.chain.id, stepId);
		const step = data.chain.steps.find((entry) => entry.id === stepId);
		await executePersonalQuery(
			`INSERT INTO user_chain_gaps (
			   id, user_id, answer_chain_id, chain_step_id, source_question_id,
			   latest_attempt_id, board, qualification, subject, course, tier, paper, topic_path_json,
			   marks, chain_title, canonical_chain_text, step_text, step_order,
			   source_question_title, source_question_ref, source_prompt_text,
			   source_context_text, source_metadata_json, source_topic_path_json,
			   status, gap_band
			 )
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
			 ON CONFLICT(user_id, answer_chain_id, chain_step_id) DO UPDATE SET
			   source_question_id = excluded.source_question_id,
			   latest_attempt_id = excluded.latest_attempt_id,
			   board = excluded.board,
			   qualification = excluded.qualification,
			   subject = excluded.subject,
			   course = excluded.course,
			   tier = excluded.tier,
			   paper = excluded.paper,
			   topic_path_json = excluded.topic_path_json,
			   marks = excluded.marks,
			   chain_title = excluded.chain_title,
			   canonical_chain_text = excluded.canonical_chain_text,
			   step_text = excluded.step_text,
			   step_order = excluded.step_order,
			   source_question_title = excluded.source_question_title,
			   source_question_ref = excluded.source_question_ref,
			   source_prompt_text = excluded.source_prompt_text,
			   source_context_text = excluded.source_context_text,
			   source_metadata_json = excluded.source_metadata_json,
			   source_topic_path_json = excluded.source_topic_path_json,
			   status = CASE
			     WHEN user_chain_gaps.latest_attempt_id = excluded.latest_attempt_id
			     THEN user_chain_gaps.status
			     ELSE 'active'
			   END,
			   gap_band = CASE
			     WHEN user_chain_gaps.latest_attempt_id = excluded.latest_attempt_id
			     THEN user_chain_gaps.gap_band
			     ELSE excluded.gap_band
			   END,
			   evidence_count = CASE
			     WHEN user_chain_gaps.latest_attempt_id = excluded.latest_attempt_id
			     THEN user_chain_gaps.evidence_count
			     WHEN COALESCE(user_chain_gaps.course, '') = COALESCE(excluded.course, '')
			      AND COALESCE(user_chain_gaps.tier, '') = COALESCE(excluded.tier, '')
			     THEN user_chain_gaps.evidence_count + 1
			     ELSE 1
			   END,
			   updated_at = CURRENT_TIMESTAMP,
			   last_seen_at = CURRENT_TIMESTAMP`,
			[
				gapId,
				user.uid,
				data.chain.id,
				stepId,
				questionId,
				attemptId,
				learnerSubject.board,
				learnerSubject.qualification,
				storedSubject,
				storedCourse,
				storedTier,
				data.question.meta.paper,
				jsonString([data.question.meta.topic].filter(Boolean)),
				data.question.meta.marks,
				data.chain.title,
				data.chain.canonicalText,
				step?.label ?? stepId,
				Math.max(
					0,
					data.chain.steps.findIndex((entry) => entry.id === stepId)
				),
				data.question.title,
				data.question.sourceRef,
				data.question.prompt,
				data.question.context,
				jsonString({ title: data.question.title }),
				jsonString([data.question.meta.topic].filter(Boolean)),
				result.awardedMarks <= 0 ? 'large_gap' : 'medium_gap'
			]
		);
	}

	const activeGaps = await queryPersonalRows<{ id: string; chain_step_id: string }>(
		`SELECT id, chain_step_id
		 FROM user_chain_gaps
		 WHERE user_id = ?
		   AND answer_chain_id = ?
		   AND course = ?
		   AND tier = ?
		   AND status = 'active'`,
		[user.uid, data.chain.id, storedCourse, storedTier]
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

export function scienceAttemptFollowUpKind({
	marks,
	chainStepCount,
	chainTitle
}: {
	marks: number;
	chainStepCount: number;
	chainTitle: string;
}): 'recall' | 'close_gap' | 'none' {
	const recallShaped = chainStepCount <= 2 || /recall/i.test(chainTitle);
	if (marks >= 1 && marks <= 3) return 'recall';
	if (marks >= 4 && marks <= 6) return recallShaped ? 'recall' : 'close_gap';
	return 'none';
}

export function questionAttemptFollowUpKind({
	subject,
	marks,
	chainStepCount,
	chainTitle
}: {
	subject: string;
	marks: number;
	chainStepCount: number;
	chainTitle: string;
}): 'recall' | 'close_gap' | 'none' {
	if (!isScienceLearnerSubject(subject)) return 'none';
	return scienceAttemptFollowUpKind({ marks, chainStepCount, chainTitle });
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
	return await queryPersonalFirst<GapDetailRow>(
		`SELECT
		   id,
		   answer_chain_id,
		   chain_step_id,
		   source_question_id,
		   status,
		   gap_band,
		   evidence_count,
		   updated_at,
		   chain_title,
		   canonical_chain_text,
		   step_text,
		   step_order,
		   source_question_title AS question_title,
		   source_question_ref,
		   board,
		   qualification,
		   subject,
		   course,
		   tier,
		   paper,
		   topic_path_json,
		   marks,
		   source_prompt_text,
		   source_context_text,
		   source_metadata_json,
		   source_topic_path_json
		 FROM user_chain_gaps
		 WHERE user_id = ?
		   AND id = ?`,
		[userId, gapId]
	);
}

function shortStepText(text: string): string {
	return text.replace(/\.$/, '').replace(/^The /, '').replace(/^A /, '').replace(/^An /, '');
}

function chainStepLabel(text: string): string {
	const value = shortStepText(text).trim();
	if (!value) return 'the next idea';
	if (/^[A-Z][a-z]/.test(value)) return `${value[0].toLowerCase()}${value.slice(1)}`;
	return value;
}

export function gapGuidedQuestionPrompt({
	kind,
	previous,
	target,
	next
}: {
	kind: 'previous' | 'missing' | 'next';
	previous?: string | null;
	target: string;
	next?: string | null;
}): string {
	const previousLabel = previous ? chainStepLabel(previous) : null;
	const targetLabel = chainStepLabel(target);
	const nextLabel = next ? chainStepLabel(next) : null;
	if (kind === 'previous') return `What happens immediately before ${targetLabel}?`;
	if (kind === 'next') return `What happens immediately after ${targetLabel}?`;
	if (previousLabel && nextLabel) {
		return `What causal step connects “${previousLabel}” to “${nextLabel}”?`;
	}
	if (previousLabel) return `What happens immediately after ${previousLabel}?`;
	if (nextLabel) return `What must happen immediately before ${nextLabel}?`;
	return 'Which specific process completes this explanation?';
}

function buildGuidedQuestions(gap: GapDetailRow, steps: ChainStepRow[]): GapGuidedQuestion[] {
	const index = Math.max(
		0,
		steps.findIndex((step) => step.id === gap.chain_step_id)
	);
	const target = steps[index];
	const previous = steps[Math.max(0, index - 1)];
	const next = steps[Math.min(steps.length - 1, index + 1)];
	const hasPrevious = Boolean(previous && previous.id !== target.id);
	const hasNext = Boolean(next && next.id !== target.id);
	const questions: GapGuidedQuestion[] = [];

	// At a chain boundary, asking for the neighbour as well as the missing step creates
	// two reciprocal prompts whose wording gives both answers away. Keep the wider
	// three-step reconstruction only when the missing idea genuinely sits between two links.
	if (hasPrevious && hasNext && previous) {
		questions.push({
			id: 'previous-link',
			question: gapGuidedQuestionPrompt({
				kind: 'previous',
				target: target.step_text
			}),
			expectedAnswer: previous.step_text,
			hint: previous.common_omission ?? 'Use the earlier cause in the method.',
			focusStepId: previous.id
		});
	}

	questions.push({
		id: 'missing-link',
		question: gapGuidedQuestionPrompt({
			kind: 'missing',
			previous: hasPrevious ? previous.step_text : null,
			target: target.step_text,
			next: hasNext ? next.step_text : null
		}),
		expectedAnswer: target.step_text,
		hint:
			target.common_omission ??
			target.explanation ??
			'Name the specific cause-and-effect step that earns this mark.',
		focusStepId: target.id
	});

	if (hasPrevious && hasNext && next) {
		questions.push({
			id: 'next-link',
			question: gapGuidedQuestionPrompt({
				kind: 'next',
				target: target.step_text
			}),
			expectedAnswer: next.step_text,
			hint: next.common_omission ?? 'Connect the missing idea to the next mark-scoring step.',
			focusStepId: next.id
		});
	}

	return questions.slice(0, 3);
}

function normalizedScopeValue(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

export type GapFollowUpScope = {
	board: string | null;
	qualification: string | null;
	subject: string | null;
	course: string | null;
	tier: string | null;
};

function scienceSubjectArea(value: string | null | undefined): string | null {
	const normalizedValue = normalizedScopeValue(value);
	if (normalizedValue.includes('biology')) return 'biology';
	if (normalizedValue.includes('chemistry')) return 'chemistry';
	if (normalizedValue.includes('physics')) return 'physics';
	return null;
}

function questionScienceSubjectArea(question: PracticePageData['question']): string | null {
	return (
		scienceSubjectArea(question.meta.subjectArea) ??
		scienceSubjectArea(question.meta.subject) ??
		scienceSubjectArea(question.meta.paper)
	);
}

function isCombinedScienceQuestion(question: PracticePageData['question']): boolean {
	const courseText = normalizedScopeValue(`${question.meta.subject} ${question.meta.paper}`);
	return (
		courseText.includes('combined science') ||
		courseText.includes('trilogy') ||
		courseText.includes('synergy')
	);
}

function isGenericScienceSubject(value: string | null | undefined): boolean {
	const subject = normalizedScopeValue(value);
	return subject === 'science' || subject.includes('combined science');
}

function acceptsEveryTier(value: string): boolean {
	return (
		!value ||
		value === 'all' ||
		value.includes('both') ||
		(value.includes('foundation') && value.includes('higher'))
	);
}

export function isQuestionInGapScope(
	row: GapFollowUpScope,
	question: PracticePageData['question'],
	sourceQuestion: PracticePageData['question'] | null = null
): boolean {
	if (
		(row.board && normalizedScopeValue(question.meta.board) !== normalizedScopeValue(row.board)) ||
		(row.qualification &&
			normalizedScopeValue(question.meta.qualification) !== normalizedScopeValue(row.qualification))
	) {
		return false;
	}

	const requiredScienceArea =
		scienceSubjectArea(row.subject) ??
		(sourceQuestion ? questionScienceSubjectArea(sourceQuestion) : null);
	if (requiredScienceArea && questionScienceSubjectArea(question) !== requiredScienceArea) {
		return false;
	}
	if (row.subject && !requiredScienceArea && !isGenericScienceSubject(row.subject)) {
		const questionSubject = normalizedScopeValue(
			question.meta.subjectArea ?? question.meta.subject
		);
		if (questionSubject !== normalizedScopeValue(row.subject)) return false;
	}

	const questionTier = normalizedScopeValue(question.meta.tier);
	const learnerTier = normalizedScopeValue(row.tier);
	if (learnerTier && !acceptsEveryTier(questionTier) && questionTier !== learnerTier) {
		return false;
	}

	const explicitCourse = normalizedScopeValue(row.course);
	const course =
		explicitCourse === 'combined science' || explicitCourse === 'separate science'
			? explicitCourse
			: sourceQuestion
				? isCombinedScienceQuestion(sourceQuestion)
					? 'combined science'
					: questionScienceSubjectArea(sourceQuestion)
						? 'separate science'
						: explicitCourse
				: explicitCourse;
	if (course === 'combined science' && !isCombinedScienceQuestion(question)) return false;
	if (course === 'separate science' && isCombinedScienceQuestion(question)) return false;

	return true;
}

export async function getGapLearningData(
	userId: string,
	gapId: string
): Promise<GapLearningData | null> {
	const row = await readGapDetail(userId, gapId);
	if (!row) return null;
	const questionData: PracticePageData | null = row.source_question_id
		? await getPracticePageData(row.source_question_id).catch(() => null)
		: null;
	const steps =
		questionData?.chain.steps.map((step, index) => ({
			id: step.id,
			display_order: index,
			step_text: step.label,
			step_role: step.role,
			explanation: step.explanation,
			common_omission: step.commonOmission,
			evidence_json: jsonString(step.markEvidence ? [step.markEvidence] : [])
		})) ?? (await getChainSteps(row.answer_chain_id));
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
	const followUpQuestion =
		questionData?.questions.find(
			(question) =>
				question.id !== row.source_question_id &&
				isQuestionInGapScope(row, question, questionData.question)
		) ?? null;

	return {
		gap: dashboardGap,
		subjectLabel: metaLine([row.board, row.qualification, row.subject, row.tier]),
		question: {
			id: row.source_question_id,
			title: questionTitle(row.source_prompt_text, row.source_metadata_json),
			prompt: row.source_prompt_text ?? row.question_title ?? row.chain_title,
			href: row.source_question_id
				? `/questions/${encodeURIComponent(row.source_question_id)}`
				: null
		},
		followUpQuestion: followUpQuestion
			? {
					id: followUpQuestion.id,
					title: followUpQuestion.title,
					href: `/questions/${encodeURIComponent(followUpQuestion.id)}/practice`
				}
			: null,
		chain: {
			id: row.answer_chain_id,
			title: row.chain_title,
			href: row.source_question_id
				? `/questions/${encodeURIComponent(row.source_question_id)}/chain`
				: `/constellations/${encodeURIComponent(row.answer_chain_id)}`,
			steps: chainSteps
		},
		presentation: {
			question: row.source_prompt_text ?? row.question_title ?? row.chain_title,
			instructions: 'Answer each step in a short phrase, then rewrite the full answer.',
			questions: guidedQuestions,
			memoryChain: chainSteps.map((step) => step.short).join(' -> '),
			answerPrompt: `Rewrite the original answer and make "${shortStepText(targetStep.step_text)}" explicit.`,
			modelAnswer: questionData?.question.modelAnswer ?? '',
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
	guidedAnswers,
	submissionId,
	assistance
}: {
	userId: string;
	gapId: string;
	answer: string;
	guidedAnswers: Record<string, string>;
	submissionId?: string;
	assistance?: ConstructedAnswerAssistance;
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
	const normalizedAssistance = normalizeConstructedAnswerAssistance(assistance);
	const targetStepPresent = present.has(data.presentation.targetStepId);
	const gapClosed = targetStepPresent && !normalizedAssistance.externalInputDetected;
	const maxMarks = data.presentation.maxMarks;
	const awardedMarks = Math.min(
		maxMarks,
		Math.max(
			0,
			Math.round((presentStepIds.length / Math.max(1, data.chain.steps.length)) * maxMarks)
		)
	);
	const summary =
		normalizedAssistance.externalInputDetected && targetStepPresent
			? 'The missing step is present. Because text was pasted or dropped, this check stays as assisted practice and the gap remains open.'
			: gapClosed
				? 'The missing step is now explicit. Use the same method on the next similar question.'
				: 'The answer still needs the target missing step. Add it directly, then connect it to the next step.';
	const runId = submissionId ?? randomId('gaprun');

	const insertedRun = await queryPersonalFirst<{ id: string }>(
		`INSERT INTO user_gap_builder_runs (
		   id, user_id, gap_id, phase, guided_answers_json, final_answer, result_json,
		   assistance_json
		 )
		 VALUES (?, ?, ?, 'final_check', ?, ?, ?, ?)
		 ON CONFLICT(id) DO NOTHING
		 RETURNING id`,
		[
			runId,
			userId,
			gapId,
			jsonString(guidedAnswers),
			answer,
			jsonString({
				awardedMarks,
				maxMarks,
				presentStepIds,
				missingStepIds,
				targetStepPresent,
				gapClosed
			}),
			jsonString(normalizedAssistance)
		]
	);
	if (!insertedRun) {
		const existing = await queryPersonalFirst<{ id: string }>(
			`SELECT id FROM user_gap_builder_runs
			 WHERE id = ? AND user_id = ? AND gap_id = ? AND final_answer = ?
			   AND assistance_json = ?`,
			[runId, userId, gapId, answer, jsonString(normalizedAssistance)]
		);
		if (!existing) throw new Error('Gap response id is already in use.');
	}
	await executePersonalQuery(
		`UPDATE user_chain_gaps
		 SET status = ?,
		     gap_band = ?,
		     updated_at = CURRENT_TIMESTAMP,
		     last_seen_at = CURRENT_TIMESTAMP
		 WHERE user_id = ?
		   AND id = ?`,
		[
			gapClosed ? 'awaiting_check' : 'active',
			gapClosed ? 'awaiting_check' : 'small_gap',
			userId,
			gapId
		]
	);

	return {
		runId,
		awardedMarks,
		maxMarks,
		summary,
		presentStepIds,
		missingStepIds,
		targetStepPresent,
		gapClosed,
		externalInputDetected: normalizedAssistance.externalInputDetected,
		externalInputSources: normalizedAssistance.externalInputSources
	};
}

function intervalDaysForRecallGrade(grade: RecallReviewGrade, previousInterval = 0): number {
	if (grade === 'easy') return Math.max(3, previousInterval * 3 || 3);
	if (grade === 'good') return Math.max(1, previousInterval * 2 || 1);
	if (grade === 'hard') return Math.max(0.25, previousInterval * 1.2 || 0.25);
	return 5 / (24 * 60);
}

function dueAtForInterval(intervalDays: number, fromTime = Date.now()): string {
	return new Date(fromTime + intervalDays * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ');
}

export async function recordRecallCardReview({
	user,
	card,
	grade,
	mode
}: {
	user: AdminUser;
	card: RecallCard;
	grade: RecallReviewGrade;
	mode: string;
}): Promise<{ status: 'ok'; dueAt: string; intervalDays: number } | null> {
	await upsertUserProfile(user);
	const settings = await getLearnerProfileSettings(user);
	const learnerSubject = settings.subjects.find(
		(entry) => entry.enabled && entry.subject === card.subject
	);
	if (!learnerSubject) return null;
	const evidenceRows = await queryPersonalRows<{
		outcome: string;
		occurred_at: string;
		metadata_json: string;
	}>(
		`SELECT outcome, occurred_at, metadata_json
		 FROM user_learning_evidence
		 WHERE user_id = ?
			   AND component_kind = 'recall_card'
			   AND component_id = ?
			   AND course = ?
			   AND tier = ?
			 ORDER BY occurred_at, id`,
		[user.uid, recallEvidenceComponentId(card), learnerSubject.course, learnerSubject.tier]
	);
	const reviews = evidenceRows
		.map((row) => ({
			row,
			metadata: parseJson<{
				grade?: string;
				mode?: string;
				contentRevision?: number | null;
				contentHash?: string | null;
			}>(row.metadata_json, {})
		}))
		.filter(
			(
				entry
			): entry is typeof entry & {
				metadata: {
					grade: RecallReviewGrade;
					mode?: string;
					contentRevision?: number | null;
					contentHash?: string | null;
				};
			} => ['again', 'hard', 'good', 'easy'].includes(entry.metadata.grade ?? '')
		)
		.filter(
			(entry) =>
				entry.metadata.contentHash === card.contentHash &&
				entry.metadata.contentRevision === card.contentRevision
		);
	if (reviews.length === 0) return null;
	let intervalDays = 0;
	for (const review of reviews) {
		intervalDays = intervalDaysForRecallGrade(review.metadata.grade, intervalDays);
	}
	const latest = reviews.at(-1)!;
	const latestTime = Date.parse(latest.row.occurred_at);
	const dueAt = dueAtForInterval(
		intervalDays,
		Number.isFinite(latestTime) ? latestTime : Date.now()
	);
	const correctCount = reviews.filter((review) => review.metadata.grade !== 'again').length;
	const latestGrade = latest.metadata.grade;
	const latestMode = latest.metadata.mode ?? mode;
	const scopeKey = `${learnerSubject.course}|${learnerSubject.tier}`;

	await executePersonalQuery(
		`INSERT INTO user_recall_card_reviews (
		   user_id, card_id, scope_key, subject, course, tier, topic_id, mode, last_grade,
		   seen_count, correct_count, interval_days, due_at, content_revision, content_hash
		 )
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, card_id, scope_key) DO UPDATE SET
		   subject = excluded.subject,
		   course = excluded.course,
		   tier = excluded.tier,
		   topic_id = excluded.topic_id,
		   mode = excluded.mode,
		   last_grade = excluded.last_grade,
		   seen_count = excluded.seen_count,
		   correct_count = excluded.correct_count,
		   interval_days = excluded.interval_days,
		   due_at = excluded.due_at,
		   content_revision = excluded.content_revision,
		   content_hash = excluded.content_hash,
		   updated_at = CURRENT_TIMESTAMP
		 WHERE user_recall_card_reviews.content_revision IS NOT excluded.content_revision
		    OR user_recall_card_reviews.content_hash IS NOT excluded.content_hash
		    OR excluded.seen_count >= user_recall_card_reviews.seen_count`,
		[
			user.uid,
			card.id,
			scopeKey,
			card.subject,
			learnerSubject.course,
			learnerSubject.tier,
			card.topicId,
			latestMode,
			latestGrade,
			reviews.length,
			correctCount,
			intervalDays,
			dueAt,
			card.contentRevision,
			card.contentHash
		]
	);

	return { status: 'ok', dueAt, intervalDays };
}
