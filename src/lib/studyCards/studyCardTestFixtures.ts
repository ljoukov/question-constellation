export function studyCardArtifactFixture() {
	return {
		schemaVersion: 'standard-study-deck-v1',
		release: {
			id: 'standard-study-deck-test-v1',
			promptVersion: 'standard-study-card-compiler-v1',
			generator: {
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max',
				runId: 'generator-run-test-v1'
			},
			reviewer: {
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max',
				runId: 'reviewer-run-test-v1',
				independentTurn: true
			},
			startedAt: '2026-07-16T10:00:00.000Z',
			finishedAt: '2026-07-16T10:15:00.000Z',
			sourceManifestHash: 'a'.repeat(64),
			artifactPath:
				'data/study-cards/releases/standard-study-deck-test-v1/accepted-study-cards.json'
		},
		cards: [
			{
				id: 'ocr-english-literature-macbeth-ambition-quotation',
				conceptKey: 'macbeth-ambition-quotation',
				board: 'OCR',
				qualification: 'GCSE',
				subject: 'English Literature',
				kind: 'quotation',
				visualCue: '🔥',
				front: 'Which short Macbeth quotation captures dangerous ambition?',
				back: '“Vaulting ambition”',
				explanation:
					'Macbeth recognises that ambition can overreach, foreshadowing the destructive consequences of his choice.',
				memoryTip: 'Picture ambition vaulting over a horse and losing control.',
				contentRevision: 1,
				choices: [
					{
						key: 'vaulting-ambition',
						text: '“Vaulting ambition”',
						isCorrect: true,
						feedback: 'This directly names the force Macbeth knows is driving him.'
					},
					{
						key: 'fair-is-foul',
						text: '“Fair is foul”',
						isCorrect: false,
						feedback: 'This introduces moral inversion rather than Macbeth naming his ambition.',
						misconception: 'Confuses the witches’ paradox with Macbeth’s self-diagnosis.'
					},
					{
						key: 'out-damned-spot',
						text: '“Out, damned spot!”',
						isCorrect: false,
						feedback: 'This expresses Lady Macbeth’s guilt later in the play.',
						misconception: 'Chooses a guilt quotation because it is memorable.'
					},
					{
						key: 'brave-macbeth',
						text: '“Brave Macbeth”',
						isCorrect: false,
						feedback:
							'This establishes Macbeth’s martial reputation before his ambition takes control.',
						misconception: 'Confuses Macbeth’s starting reputation with his tragic motivation.'
					}
				],
				sources: [
					{
						kind: 'primary-text',
						url: 'https://www.gutenberg.org/ebooks/1533',
						title: 'Macbeth by William Shakespeare',
						locator: 'Act 1, Scene 7',
						excerpt: 'I have no spur ... but only vaulting ambition',
						sourceHash: 'b'.repeat(64),
						rightsBasis: 'Public-domain primary text; short attributed excerpt.',
						supports: ['front', 'back', 'explanation', 'memoryTip']
					}
				],
				targets: [
					{
						offeringId: 'ocr-j352-english-literature-higher',
						curriculumComponentId: 'ocr-j352-macbeth-ambition',
						topicComponentId: 'ocr-j352-macbeth',
						isPrimary: true,
						confidence: 1,
						reviewed: true
					}
				]
			}
		],
		coverage: [
			{
				offeringId: 'ocr-j352-english-literature-higher',
				topicComponentId: 'ocr-j352-macbeth',
				status: 'ready',
				cardCount: 1
			},
			{
				offeringId: 'ocr-j352-english-literature-higher',
				topicComponentId: 'ocr-j352-animal-farm',
				status: 'withheld',
				cardCount: 0,
				reason: 'No independently reviewed primary-text source bundle is available yet.'
			}
		]
	};
}
