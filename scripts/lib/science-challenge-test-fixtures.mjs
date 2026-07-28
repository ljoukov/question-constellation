export function providerScienceChallengeFixture(id, index = 0) {
	const strongerAnswer = index % 2 === 0 ? 'a' : 'b';
	const weakAnswer = strongerAnswer === 'a' ? 'b' : 'a';
	return {
		definition: {
			id,
			slug: id,
			subject: 'physics',
			subjectArtTheme: 'forces-motion',
			title: `Force and motion challenge ${index + 1}`,
			topic: 'Forces and motion',
			hook: 'Trace the causal link from a resultant force to a change in motion.',
			arc: 'track-the-forces',
			mechanic: 'first-wrong-step',
			difficulty: 'standard',
			marks: 3,
			estimatedMinutes: 4,
			previewQuestion: `Which statement completes force-and-motion example ${index + 1}?`,
			questionPresentation: null,
			metaDescription:
				'Practise a calibrated GCSE Physics force-and-motion challenge and repair one scientific step.',
			sourceQuestionId: `paper-question-${index + 1}`,
			lastReviewed: '2026-07-23',
			version: 1,
			staticAnswers: {
				a:
					strongerAnswer === 'a'
						? 'The resultant force and acceleration point in the same direction.'
						: 'The object changes motion without any resultant force.',
				b:
					strongerAnswer === 'b'
						? 'The resultant force and acceleration point in the same direction.'
						: 'The object changes motion without any resultant force.'
			},
			strongerAnswer,
			weakAnswer,
			weakAnswerKind: 'incorrect-claim',
			showdownExplanation:
				'The stronger answer connects the resultant force to the resulting acceleration.',
			commandWordLesson:
				'Explain means connect the resultant force to the resulting acceleration.',
			diagnosisPrompt: 'Which scientific link is missing or incorrect?',
			diagnosisChoices: choices(
				'It must connect the resultant force to acceleration.',
				index % 3
			),
			repairPrompt: 'Which phrase repairs the explanation?',
			repairChoices: choices(
				'A resultant force causes acceleration in its direction.',
				(index + 1) % 3
			),
			freeTextKeywordGroups: [['resultant force'], ['acceleration']],
			repairSuccess: 'The answer now connects the resultant force to acceleration.',
			transferPromptLead:
				'A trolley experiences a non-zero resultant force. Which statement follows?',
			transferChoices: choices(
				'The trolley accelerates in the direction of the resultant force.',
				(index + 2) % 3
			),
			transferExplanation:
				'A non-zero resultant force produces acceleration in the direction of that force.',
			memoryHandle: 'resultant force → acceleration'
		},
		grounding: {
			curriculumComponentId: `physics-component-${index + 1}`,
			specificationId: 'aqa-gcse-physics-test',
			specificationSha256: 'a'.repeat(64),
			calibrationQuestionId: `paper-question-${index + 1}`,
			calibrationQuestionSha256: String(index + 1).padStart(64, '0')
		},
		art: {
			opening: artBrief(id, 'opening', `Dynamics trolley setup ${index + 1}`),
			transfer: artBrief(id, 'transfer', `Second trolley setup ${index + 1}`)
		}
	};
}

function choices(correctText, correctIndex) {
	return Array.from({ length: 3 }, (_, index) => ({
		id: index === correctIndex ? 'correct-link' : `wrong-${index + 1}`,
		text: index === correctIndex ? correctText : `Plausible distractor ${index + 1}.`,
		feedback:
			index === correctIndex
				? 'This supplies the decisive scientific link.'
				: 'This does not supply the required force-and-motion link.',
		correct: index === correctIndex
	}));
}

function artBrief(challengeId, context, scene) {
	return {
		schemaVersion: 'science-question-art/v1',
		id: `${challengeId}-${context}`,
		context,
		scene,
		visualAnchor: `${scene} as one uncluttered mechanics setup`,
		altText: `${scene}, shown without answer-revealing labels.`,
		approvedMeaning: 'The mechanics context is visible without revealing the answer.',
		accuracyConstraints: [
			'Keep the trolley and track physically coherent.',
			'Use only the force arrow required by the scene.'
		],
		forbiddenDetails: [
			'Do not label the correct answer.',
			'Do not add equations or explanatory text.'
		]
	};
}
