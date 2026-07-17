import { describe, expect, it } from 'vitest';
import {
	ENGLISH_REVIEW_UNAVAILABLE_REASON,
	ENGLISH_SOURCE_CONTEXT_UNAVAILABLE_REASON,
	englishPracticeEligibility,
	isUsableEnglishSourceAsset
} from './englishPracticeEligibility';

describe('English practice eligibility', () => {
	it('quarantines a line-based Language task when context only names the missing insert', () => {
		const result = englishPracticeEligibility({
			subject: 'English Language',
			prompt: 'Look again at lines 10-28. Explore how the writer uses language and structure.',
			context: 'Question 3 is about Text 2. The relevant source is in the insert.',
			selfContainmentJson: JSON.stringify({ status: 'self_contained' }),
			reviewed: true
		});

		expect(result).toEqual({
			available: false,
			requiresSourceContext: true,
			hasSourceContext: false,
			reason: ENGLISH_SOURCE_CONTEXT_UNAVAILABLE_REASON
		});
	});

	it('accepts a source-dependent task when the reviewed extract is embedded', () => {
		const extract = `“${'The storm pushed against the windows while the family waited in silence. '.repeat(3)}”`;
		const result = englishPracticeEligibility({
			prompt: 'What do these lines suggest about the family?',
			context: `Read the extract. ${extract}`,
			selfContainmentJson: JSON.stringify({
				status: 'source_complete',
				requires_context: true,
				required_source_count: 1
			}),
			reviewed: true
		});

		expect(result.available).toBe(true);
		expect(result.requiresSourceContext).toBe(true);
	});

	it('keeps English Language eligibility grounded in complete visible source evidence without Literature status metadata', () => {
		const extract = `“${'The rain hammered against the windows while the passengers waited in silence. '.repeat(4)}”`;
		expect(
			englishPracticeEligibility({
				subject: ' English Language ',
				prompt: 'Look again at lines 10-28. Explore how the writer uses language and structure.',
				context: extract,
				selfContainmentJson: JSON.stringify({
					status: 'self_contained',
					requires_context: true,
					required_source_count: 1
				}),
				reviewed: true
			})
		).toMatchObject({
			available: true,
			requiresSourceContext: true,
			hasSourceContext: true,
			reason: null
		});

		expect(
			englishPracticeEligibility({
				subject: 'english language',
				prompt: 'Look again at the source. How does the writer create tension?',
				selfContainmentJson: JSON.stringify({
					requires_assets: true,
					required_source_count: 1,
					required_asset_labels: ['Source A page 3']
				}),
				assets: [
					{
						id: 'source-a-page-3',
						publicPath: '/images/papers/source-a-page-3.png',
						role: 'source-page',
						sourceLabel: 'Source A page 3',
						required: true
					}
				],
				reviewed: true
			})
		).toMatchObject({
			available: true,
			requiresSourceContext: true,
			hasSourceContext: true,
			reason: null
		});
	});

	it('accepts reviewed printed-source assets but rejects defect placeholders', () => {
		expect(
			isUsableEnglishSourceAsset({
				publicPath: '/images/papers/page-04.png',
				role: 'source-page',
				sourceLabel: 'Question 1 printed poems page 4',
				required: true
			})
		).toBe(true);
		expect(
			isUsableEnglishSourceAsset({
				publicPath: '/images/papers/placeholder.png',
				role: 'source-defect-observation',
				sourceLabel: 'Extract copyright placeholder',
				required: true
			})
		).toBe(false);
	});

	it('does not require a printed extract for an independent whole-text or anthology task', () => {
		for (const prompt of [
			'How does Dickens present responsibility in A Christmas Carol?',
			'Explore in detail one other poem from your anthology which presents conflict.'
		]) {
			expect(englishPracticeEligibility({ prompt, reviewed: true })).toMatchObject({
				available: true,
				requiresSourceContext: false,
				reason: null
			});
		}
	});

	it('honours explicit required source assets and review state even when the prompt is terse', () => {
		expect(
			englishPracticeEligibility({
				prompt: 'Compare how desperation is presented.',
				selfContainmentJson: JSON.stringify({
					required_asset_labels: ['Printed poems page 4']
				}),
				reviewed: true
			})
		).toMatchObject({ available: false, reason: ENGLISH_SOURCE_CONTEXT_UNAVAILABLE_REASON });

		expect(
			englishPracticeEligibility({
				prompt: 'How does the writer present responsibility?',
				reviewed: false
			})
		).toMatchObject({ available: false, reason: ENGLISH_REVIEW_UNAVAILABLE_REASON });
	});

	it('requires every declared source asset for a two-poem task', () => {
		const firstPage = {
			id: 'poems-page-4',
			publicPath: '/images/papers/page-04.png',
			role: 'source-page',
			sourceLabel: 'Question 1 printed poems page 4',
			altText: 'Question 1 printed poems page 4',
			required: true
		};
		const secondPage = {
			id: 'poems-page-5',
			publicPath: '/images/papers/page-05.png',
			role: 'source-page',
			sourceLabel: 'Question 1 printed poems page 5',
			altText: 'Question 1 printed poems page 5',
			required: true
		};
		const input = {
			prompt: 'Compare how these poems present someone desperate for love.',
			taskKind: 'poetry-comparison' as const,
			selfContainmentJson: JSON.stringify({
				status: 'source_complete',
				requires_assets: true,
				required_source_count: 2,
				complete_source_bundle: false,
				required_asset_labels: [
					'Question 1 printed poems page 4',
					'Question 1 printed poems page 5'
				]
			}),
			reviewed: true
		};

		expect(englishPracticeEligibility({ ...input, assets: [firstPage, secondPage] })).toMatchObject(
			{
				available: true,
				hasSourceContext: true
			}
		);
		expect(englishPracticeEligibility({ ...input, assets: [firstPage] })).toMatchObject({
			available: false,
			hasSourceContext: false
		});
	});

	it('does not let one declared page unlock a two-source comparison', () => {
		expect(
			englishPracticeEligibility({
				prompt: 'Compare how these two extracts present conflict.',
				taskKind: 'extract-comparison',
				selfContainmentJson: JSON.stringify({
					required_asset_labels: ['Extract 1 printed source page']
				}),
				assets: [
					{
						id: 'extract-1',
						publicPath: '/images/extract-1.png',
						role: 'source-page',
						sourceLabel: 'Extract 1 printed source page',
						required: true
					}
				],
				reviewed: true
			})
		).toMatchObject({ available: false, hasSourceContext: false });
	});

	it('allows one printed poem when the comparison names one other studied poem', () => {
		expect(
			englishPracticeEligibility({
				prompt:
					"Compare how poets present power in 'Ozymandias' and in one other poem from the Power and conflict anthology.",
				taskKind: 'poetry-comparison',
				selfContainmentJson: JSON.stringify({
					status: 'source_complete',
					requires_assets: true,
					required_source_count: 1,
					required_asset_labels: ['Printed Ozymandias poem']
				}),
				assets: [
					{
						id: 'printed-ozymandias',
						publicPath: '/images/printed-ozymandias.png',
						role: 'source-page',
						sourceLabel: 'Printed Ozymandias poem',
						required: true
					}
				],
				reviewed: true
			})
		).toMatchObject({ available: true, hasSourceContext: true });
	});

	it('fails closed when a poetry comparison does not say how many sources are printed', () => {
		expect(
			englishPracticeEligibility({
				prompt: 'Compare how poets present the effects of power.',
				taskKind: 'poetry-comparison',
				selfContainmentJson: JSON.stringify({
					required_asset_labels: ['Poetry source page']
				}),
				assets: [
					{
						id: 'poetry-source',
						publicPath: '/images/poetry-source.png',
						role: 'source-page',
						sourceLabel: 'Poetry source page',
						required: true
					}
				],
				reviewed: true
			})
		).toMatchObject({ available: false, hasSourceContext: false });
	});

	it('matches required asset labels instead of accepting an unrelated source image', () => {
		expect(
			englishPracticeEligibility({
				prompt: 'Refer to this extract and explain how tension is created.',
				selfContainmentJson: JSON.stringify({
					required_asset_labels: ['Macbeth Act 2 Scene 3 extract']
				}),
				assets: [
					{
						id: 'other-extract',
						publicPath: '/images/other-extract.png',
						role: 'source-page',
						sourceLabel: 'Romeo and Juliet Prologue extract',
						required: true
					}
				],
				reviewed: true
			})
		).toMatchObject({ available: false, hasSourceContext: false });
	});

	it('only counts an overlay asset when a rendered figure references its exact id', () => {
		const sourceAsset = {
			id: 'macbeth-extract',
			publicPath: '/images/macbeth-extract.png',
			role: 'source-page',
			sourceLabel: 'Macbeth Act 2 Scene 3 extract',
			altText: 'Macbeth Act 2 Scene 3 extract',
			required: true
		};
		const base = {
			prompt: 'Explore how horror is presented. Refer to this extract and elsewhere in the play.',
			taskKind: 'extract-and-wider' as const,
			selfContainmentJson: JSON.stringify({
				status: 'source_complete',
				requires_assets: true,
				required_source_count: 1,
				required_asset_labels: ['Macbeth Act 2 Scene 3 extract']
			}),
			assets: [sourceAsset],
			reviewed: true
		};

		expect(
			englishPracticeEligibility({
				...base,
				renderingOverlay: {
					stemBlocks: [{ kind: 'paragraph', text: 'The question instruction.' }],
					promptBlocks: []
				}
			})
		).toMatchObject({ available: false, hasSourceContext: false });
		expect(
			englishPracticeEligibility({
				...base,
				renderingOverlay: {
					stemBlocks: [{ kind: 'figure', assetId: 'macbeth-extract' }],
					promptBlocks: [{ kind: 'paragraph', text: base.prompt }]
				}
			})
		).toMatchObject({ available: true, hasSourceContext: true });
	});

	it('counts full source text only in block kinds the learner renderer supports', () => {
		const extract = `“${'The room was silent while each character listened for the approaching footsteps. '.repeat(4)}”`;
		const base = {
			prompt:
				'Starting with this passage, explore how the writer presents fear in the novel as a whole.',
			taskKind: 'extract-and-wider' as const,
			selfContainmentJson: JSON.stringify({
				status: 'source_complete',
				requires_context: true,
				required_source_count: 1
			}),
			reviewed: true
		};

		expect(
			englishPracticeEligibility({
				...base,
				renderingOverlay: {
					stemBlocks: [{ kind: 'paragraph', text: extract }],
					promptBlocks: [{ kind: 'paragraph', text: base.prompt }]
				}
			})
		).toMatchObject({ available: true, hasSourceContext: true });
		expect(
			englishPracticeEligibility({
				...base,
				renderingOverlay: {
					stemBlocks: [{ kind: 'source', text: extract }],
					promptBlocks: [{ kind: 'paragraph', text: base.prompt }]
				}
			})
		).toMatchObject({ available: false, hasSourceContext: false });
	});

	it('requires the exact canonical source-complete status before source practice unlocks', () => {
		const input = {
			subject: '  eNgLiSh   LiTeRaTuRe  ',
			prompt: 'Refer to this extract and explain how tension is created.',
			taskKind: 'extract-and-wider' as const,
			assets: [
				{
					id: 'extract-a',
					publicPath: '/images/extract-a.png',
					role: 'source-page',
					sourceLabel: 'Extract A',
					required: true
				}
			],
			reviewed: true
		};

		for (const status of [undefined, 'self_contained', 'source-complete', 'SOURCE_COMPLETE']) {
			expect(
				englishPracticeEligibility({
					...input,
					selfContainmentJson: JSON.stringify({
						status,
						requires_assets: true,
						required_source_count: 1,
						required_asset_labels: ['Extract A']
					})
				})
			).toMatchObject({
				available: false,
				requiresSourceContext: true,
				hasSourceContext: true,
				reason: ENGLISH_SOURCE_CONTEXT_UNAVAILABLE_REASON
			});
		}

		expect(
			englishPracticeEligibility({
				...input,
				selfContainmentJson: JSON.stringify({
					status: 'source_complete',
					requires_assets: true,
					required_source_count: 1,
					required_asset_labels: ['Extract A']
				})
			})
		).toMatchObject({ available: true, hasSourceContext: true, reason: null });
	});

	it('does not require source-complete metadata for source-independent whole-text tasks', () => {
		for (const taskKind of ['whole-text-judgement', 'single-text-analysis'] as const) {
			expect(
				englishPracticeEligibility({
					subject: 'English Literature',
					prompt: 'How does the writer present responsibility across the whole novel?',
					taskKind,
					selfContainmentJson: JSON.stringify({ status: 'self_contained' }),
					reviewed: true
				})
			).toMatchObject({
				available: true,
				requiresSourceContext: false,
				hasSourceContext: true,
				reason: null
			});
		}
	});

	it('does not apply the Literature status contract to valid English Language source practice', () => {
		const extract = `“${'The wind shook the windows while the family waited in silence. '.repeat(4)}”`;
		expect(
			englishPracticeEligibility({
				subject: 'English Language',
				prompt: 'What do these lines suggest about the family?',
				context: `Read the extract. ${extract}`,
				selfContainmentJson: JSON.stringify({
					status: 'self_contained',
					requires_context: true,
					required_source_count: 1
				}),
				reviewed: true
			})
		).toMatchObject({
			available: true,
			requiresSourceContext: true,
			hasSourceContext: true,
			reason: null
		});
	});

	it('does not treat a long one-paragraph synopsis as an imported extract', () => {
		expect(
			englishPracticeEligibility({
				prompt: 'Starting with this moment, explore how power changes in the play as a whole.',
				context: 'This synopsis explains the episode without reproducing it. '.repeat(30),
				reviewed: true
			})
		).toMatchObject({ available: false, hasSourceContext: false });
	});

	it('recognises source-dependent wording without the noun extract', () => {
		for (const prompt of [
			'Starting with this moment, explore how fear is presented in the play as a whole.',
			'Explore how friendship changes. Refer to Act 3 Scene 2 and elsewhere in the play.'
		]) {
			expect(englishPracticeEligibility({ prompt, reviewed: true })).toMatchObject({
				available: false,
				requiresSourceContext: true
			});
		}
	});

	it('keeps a studied-text request for another moment source-independent', () => {
		expect(
			englishPracticeEligibility({
				prompt: 'Explore another moment in Animal Farm where the animals think about the future.',
				reviewed: true
			})
		).toMatchObject({ available: true, requiresSourceContext: false });
	});

	it('does not count imported text that the learner-facing renderer hides', () => {
		const hiddenExtract = `“${'A complete extract sentence with enough detail for analysis. '.repeat(5)}”`;
		expect(
			englishPracticeEligibility({
				prompt: 'Refer to this extract and explain how tension is created.',
				context: hiddenExtract,
				selfContainmentJson: JSON.stringify({ is_self_contained: true }),
				reviewed: true
			})
		).toMatchObject({ available: false, hasSourceContext: false });
	});
});
