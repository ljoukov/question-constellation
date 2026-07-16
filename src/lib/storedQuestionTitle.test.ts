import { describe, expect, it } from 'vitest';
import { storedQuestionTitle, storedQuestionTitleIssues } from './storedQuestionTitle.js';

describe('storedQuestionTitle', () => {
	it('uses the same reviewed metadata title for every surface', () => {
		const input = {
			id: 'biology-q1',
			subject: 'Biology',
			metadataJson: JSON.stringify({
				card_title: 'Energy source for photosynthesis',
				card_title_contract: 'concept-method-process-v2'
			}),
			promptText: 'Describe how energy for photosynthesis is gained by plants.',
			selfContainedPromptText: 'Describe how energy for photosynthesis is gained by plants.',
			topicPathJson: '[]'
		};

		expect(storedQuestionTitle(input)).toBe('Energy source for photosynthesis');
		expect(storedQuestionTitle(input)).toBe(storedQuestionTitle({ ...input }));
	});

	it('fails visibly when a science task has no safe semantic title', () => {
		expect(
			storedQuestionTitle({
				id: 'q',
				subject: 'Biology',
				metadataJson: '{}',
				promptText: 'State one other way.',
				selfContainedPromptText: 'State one other way.',
				topicPathJson: '[]'
			})
		).toBe('Unlabelled science question');
	});

	it('uses strict semantic validation for science browse titles', () => {
		expect(
			storedQuestionTitleIssues({
				title: 'Describe how a vaccine works',
				subject: 'Biology',
				promptText: 'Describe how a vaccine works.'
			})
		).toContain('starts_with_command');
	});

	it('accepts concise English focus titles while rejecting placeholders', () => {
		expect(
			storedQuestionTitleIssues({
				title: 'Scrooge as an outsider',
				subject: 'English Literature'
			})
		).toEqual([]);
		expect(
			storedQuestionTitleIssues({
				title: 'Unlabelled science question',
				subject: 'English Language'
			})
		).toContain('mechanics_only');
	});
});
