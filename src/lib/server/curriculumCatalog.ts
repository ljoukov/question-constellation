import type {
	CurriculumOffering,
	CurriculumProfileSnapshot,
	CurriculumSelectionTree
} from '$lib/curriculum/catalog';
import { queryFirst, queryRows } from './db';

type CurriculumOfferingRow = {
	id: string;
	board: string;
	qualification: string;
	profile_subject: string;
	course: string;
	tier: string;
	label: string;
	selection_tree_json: string;
	selectable_component_ids_json: string;
	snapshot_hash: string;
	specification_id: string;
	specification_code: string;
	specification_version: string;
	specification_title: string;
	landing_url: string;
	pdf_url: string;
	first_exam_year: number | null;
	last_exam_year: number | null;
};

type CurriculumProfileSnapshotRow = {
	options_json: string;
	source_fingerprint: string;
};

export type CurriculumOfferingLookup = {
	board: string;
	qualification: string;
	profileSubject: string;
	course: string;
	tier: string;
};

const offeringPromises = new Map<string, Promise<CurriculumOffering | null>>();
let profileSnapshotPromise: Promise<CurriculumProfileSnapshot> | null = null;

function parseJson<T>(value: string, label: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new Error(`Curriculum catalogue contains invalid ${label} JSON.`);
	}
}

function offeringKey(lookup: CurriculumOfferingLookup): string {
	return [
		lookup.qualification,
		lookup.board,
		lookup.profileSubject,
		lookup.course,
		lookup.tier
	].join('|');
}

function normalizeOfferingLookup(lookup: CurriculumOfferingLookup): CurriculumOfferingLookup {
	return {
		board: lookup.board.trim(),
		qualification: lookup.qualification.trim(),
		profileSubject: lookup.profileSubject.trim(),
		course: lookup.course.trim(),
		tier: lookup.tier.trim()
	};
}

function hydrateOffering(row: CurriculumOfferingRow): CurriculumOffering {
	const selectionTree = parseJson<CurriculumSelectionTree>(
		row.selection_tree_json,
		'selection tree'
	);
	const selectableComponentIds = parseJson<string[]>(
		row.selectable_component_ids_json,
		'selectable component ids'
	);
	if (!Array.isArray(selectionTree.groups) || !Array.isArray(selectableComponentIds)) {
		throw new Error(`Curriculum offering ${row.id} has an invalid denormalized snapshot.`);
	}
	return {
		id: row.id,
		board: row.board,
		qualification: row.qualification,
		profileSubject: row.profile_subject,
		course: row.course,
		tier: row.tier,
		label: row.label,
		specification: {
			id: row.specification_id,
			code: row.specification_code,
			version: row.specification_version,
			title: row.specification_title,
			officialSourceUrl: row.landing_url,
			pdfUrl: row.pdf_url,
			firstExamYear: row.first_exam_year,
			lastExamYear: row.last_exam_year
		},
		selectionTree,
		selectableComponentIds,
		snapshotHash: row.snapshot_hash
	};
}

async function readCurriculumOffering(
	lookup: CurriculumOfferingLookup
): Promise<CurriculumOffering | null> {
	const rows = await queryRows<CurriculumOfferingRow>(
		`SELECT o.id, o.board, o.qualification, o.profile_subject, o.course, o.tier,
		        o.label, o.selection_tree_json, o.selectable_component_ids_json,
		        o.snapshot_hash, s.id AS specification_id,
		        s.specification_code, s.version AS specification_version,
		        s.title AS specification_title, s.landing_url, s.pdf_url,
		        s.first_exam_year, s.last_exam_year
		 FROM curriculum_offerings o
		 JOIN curriculum_specifications s ON s.id = o.specification_id
		 WHERE o.enabled = 1
		   AND o.board = ?
		   AND o.qualification = ?
		   AND o.profile_subject = ?
		   AND o.course = ?
		   AND o.tier = ?
		 LIMIT 1`,
		[lookup.board, lookup.qualification, lookup.profileSubject, lookup.course, lookup.tier]
	);
	return rows[0] ? hydrateOffering(rows[0]) : null;
}

export async function getCurriculumOffering(
	lookup: CurriculumOfferingLookup
): Promise<CurriculumOffering | null> {
	const normalizedLookup = normalizeOfferingLookup(lookup);
	const key = offeringKey(normalizedLookup);
	let promise = offeringPromises.get(key);
	if (!promise) {
		promise = readCurriculumOffering(normalizedLookup);
		offeringPromises.set(key, promise);
	}
	try {
		return await promise;
	} catch (cause) {
		if (offeringPromises.get(key) === promise) offeringPromises.delete(key);
		throw cause;
	}
}

export async function getCurriculumProfileSnapshot(): Promise<CurriculumProfileSnapshot> {
	const promise = (profileSnapshotPromise ??= (async () => {
		const row = await queryFirst<CurriculumProfileSnapshotRow>(
			`SELECT options_json, source_fingerprint
			 FROM curriculum_profile_snapshots
			 WHERE id = 'gcse-current' AND qualification = 'GCSE'
			 LIMIT 1`
		);
		if (!row)
			throw new Error('The current GCSE curriculum profile snapshot has not been imported.');
		const snapshot = parseJson<CurriculumProfileSnapshot>(row.options_json, 'profile options');
		if (snapshot.qualification !== 'GCSE' || !Array.isArray(snapshot.subjects)) {
			throw new Error('The current GCSE curriculum profile snapshot is malformed.');
		}
		return snapshot;
	})());
	try {
		return await promise;
	} catch (cause) {
		if (profileSnapshotPromise === promise) profileSnapshotPromise = null;
		throw cause;
	}
}

export function clearCurriculumCatalogCachesForTests(): void {
	offeringPromises.clear();
	profileSnapshotPromise = null;
}
