import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryFirst, queryRows } = vi.hoisted(() => ({
	queryFirst: vi.fn(),
	queryRows: vi.fn()
}));

vi.mock('./db', () => ({ queryFirst, queryRows }));

import {
	clearCurriculumCatalogCachesForTests,
	getCurriculumOffering,
	getCurriculumProfileSnapshot
} from './curriculumCatalog';

const exactLookup = {
	board: 'AQA',
	qualification: 'GCSE',
	profileSubject: 'Biology',
	course: 'Separate Science',
	tier: 'Higher'
};

const offeringRow = {
	id: 'aqa-gcse-biology-8461-v1.0:higher',
	board: 'AQA',
	qualification: 'GCSE',
	profile_subject: 'Biology',
	course: 'Separate Science',
	tier: 'Higher',
	label: 'AQA GCSE Biology (Higher)',
	selection_tree_json: JSON.stringify({ groups: [] }),
	selectable_component_ids_json: '[]',
	snapshot_hash: 'snapshot-hash',
	specification_id: 'aqa-gcse-biology-8461-v1.0',
	specification_code: '8461',
	specification_version: 'v1.0',
	specification_title: 'GCSE Biology 8461',
	landing_url: 'https://www.aqa.org.uk/subjects/science/gcse/biology-8461',
	pdf_url: 'https://filestore.aqa.org.uk/resources/biology/specifications/AQA-8461-SP-2016.PDF',
	first_exam_year: 2018,
	last_exam_year: null
};

const profileSnapshot = {
	qualification: 'GCSE',
	subjects: []
};

beforeEach(() => {
	clearCurriculumCatalogCachesForTests();
	queryFirst.mockReset();
	queryRows.mockReset();
});

describe('curriculum catalog runtime cache', () => {
	it('does not let a wrong-case miss poison the exact offering cache entry', async () => {
		queryRows.mockImplementation(async (_sql: string, params: string[]) =>
			params[0] === 'AQA' ? [offeringRow] : []
		);

		await expect(getCurriculumOffering({ ...exactLookup, board: 'aqa' })).resolves.toBeNull();
		await expect(getCurriculumOffering(exactLookup)).resolves.toMatchObject({
			id: offeringRow.id,
			board: 'AQA'
		});
		expect(queryRows).toHaveBeenCalledTimes(2);
	});

	it('normalizes harmless surrounding whitespace before the exact indexed lookup', async () => {
		queryRows.mockResolvedValue([offeringRow]);

		await expect(
			getCurriculumOffering({ ...exactLookup, board: ' AQA ', course: ' Separate Science ' })
		).resolves.toMatchObject({ id: offeringRow.id });
		await expect(getCurriculumOffering(exactLookup)).resolves.toMatchObject({ id: offeringRow.id });
		expect(queryRows).toHaveBeenCalledTimes(1);
		expect(queryRows.mock.calls[0]?.[1]).toEqual([
			'AQA',
			'GCSE',
			'Biology',
			'Separate Science',
			'Higher'
		]);
	});

	it('evicts a failed offering read so a transient D1 error can recover', async () => {
		queryRows
			.mockRejectedValueOnce(new Error('temporary D1 failure'))
			.mockResolvedValueOnce([offeringRow]);

		await expect(getCurriculumOffering(exactLookup)).rejects.toThrow('temporary D1 failure');
		await expect(getCurriculumOffering(exactLookup)).resolves.toMatchObject({ id: offeringRow.id });
		expect(queryRows).toHaveBeenCalledTimes(2);
	});

	it('evicts a failed profile snapshot read so a transient D1 error can recover', async () => {
		queryFirst.mockRejectedValueOnce(new Error('temporary D1 failure')).mockResolvedValueOnce({
			options_json: JSON.stringify(profileSnapshot),
			source_fingerprint: 'fingerprint'
		});

		await expect(getCurriculumProfileSnapshot()).rejects.toThrow('temporary D1 failure');
		await expect(getCurriculumProfileSnapshot()).resolves.toEqual(profileSnapshot);
		expect(queryFirst).toHaveBeenCalledTimes(2);
	});
});
