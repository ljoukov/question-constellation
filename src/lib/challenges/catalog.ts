import type {
	ChallengeArcDefinition,
	ChallengeDefinition,
	ChallengeSubjectDefinition
} from './types';
import { biologyExpansion } from './expansions/biology';
import { chemistryExpansion } from './expansions/chemistry';
import { physicsExpansion } from './expansions/physics';

const reviewStamp = {
	lastReviewed: '2026-07-17',
	version: 1
} as const;

export const challengeSubjects = [
	{
		subject: 'biology',
		label: 'Biology',
		description:
			'Spot the precise observation, method step or causal link that turns a plausible Biology answer into an exam-ready one.',
		heroSlug: 'enzyme-denaturation-at-45c',
		accent: 'fern'
	},
	{
		subject: 'chemistry',
		label: 'Chemistry',
		description:
			'Follow particles, practical evidence and mole ratios to find the exact step that makes a Chemistry answer work.',
		heroSlug: 'temperature-collision-rate',
		accent: 'amber'
	},
	{
		subject: 'physics',
		label: 'Physics',
		description:
			'Mark the working, track forces and connect particle behaviour to outcomes in short, exact Physics challenges.',
		heroSlug: 'half-range-uncertainty',
		accent: 'electric'
	}
] as const satisfies readonly ChallengeSubjectDefinition[];

export { challengePath, challengeSubjectLabel } from './routing';

export const challengeArcs = [
	{
		id: 'read-the-evidence',
		label: 'Read the evidence',
		description: 'Turn a value, pattern or comparison into a conclusion that answers the question.'
	},
	{
		id: 'complete-the-method',
		label: 'Complete the method',
		description: 'Name every distinct practical or scientific step, in the order the result needs.'
	},
	{
		id: 'connect-cause-to-effect',
		label: 'Connect cause to effect',
		description: 'Build the missing scientific link between what changes and the outcome.'
	},
	{
		id: 'mark-the-working',
		label: 'Mark the working',
		description: 'Find the first invalid equation or calculation step, then fix that step.'
	},
	{
		id: 'track-the-forces',
		label: 'Track the forces',
		description:
			'Combine forces into a resultant, then connect that resultant to acceleration or motion.'
	}
] as const satisfies readonly ChallengeArcDefinition[];

const biologyChallenges = [
	{
		...reviewStamp,
		id: 'biology-data-conclusions',
		slug: 'smoking-risk-data-conclusions',
		subject: 'biology',
		title: 'Can you draw a conclusion from smoking-risk data?',
		topic: 'Working scientifically: interpreting data',
		subjectArtTheme: 'regulation-immunity',
		hook: '“Smoking causes disease” sounds scientific — but the table cannot prove that.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Researchers compared the risk of four cardiovascular diseases in smokers with the risk in people who had never smoked. The increases were 12%, 24%, 37% and 65%. Give two conclusions supported by these data.',
		questionPresentation: {
			lead: 'Researchers compared the risk of four cardiovascular diseases in smokers with the risk in people who had never smoked.',
			table: {
				caption: 'Increase in risk compared with people who had never smoked',
				columns: ['Disease', 'Increase in risk'],
				rows: [
					['W', '12%'],
					['X', '24%'],
					['Y', '37%'],
					['Z', '65%']
				]
			},
			task: 'Give two conclusions supported by these data.'
		},
		metaDescription:
			'Try a GCSE Biology data challenge: compare two smoking-risk answers, fix the unsupported claim and apply the skill to photosynthesis data.',
		sourceQuestionId: '84611h-jun24-01-6',
		transferQuestionId: '8464b1h-jun24-04-2',
		staticAnswers: {
			a: 'Smoking causes all four cardiovascular diseases shown. Disease Z has the highest increase at 65%, while W has the lowest at 12%.',
			b: 'Smokers have a higher risk for every disease shown. The increase is greatest for Z at 65% and smallest for W at 12%.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers identify the highest and lowest increases. Only Answer B keeps the first conclusion within the evidence: the table shows an association with higher risk, not proof that smoking caused every case.',
		commandWordLesson:
			'“Give two conclusions” means state two distinct things the displayed data support. A pattern and a comparison count only when each is expressed as a conclusion, not as copied numbers.',
		diagnosisPrompt: 'What is the decisive weakness in Answer A?',
		diagnosisChoices: [
			{
				id: 'causal-language',
				text: 'It says smoking causes disease, although the table only compares risk.',
				feedback: 'Exactly: an association in the table does not establish causation.',
				correct: true
			},
			{
				id: 'missing-percentage-sign',
				text: 'It compares percentages without first converting every value into a decimal.',
				feedback:
					'Percentages can be compared directly here; conversion would not fix the causal claim.',
				correct: false
			},
			{
				id: 'too-many-diseases',
				text: 'It compares the highest and lowest increases instead of calculating their mean.',
				feedback:
					'The question asks for conclusions, so a supported comparison is more useful than a mean.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement makes the first conclusion evidence-led?',
		repairChoices: [
			{
				id: 'add-risk-comparison',
				text: 'Replace “causes all four diseases” with “is associated with higher risk for all four diseases”.',
				feedback: 'This preserves the pattern while removing the unsupported claim of causation.',
				correct: true
			},
			{
				id: 'add-biological-mechanism',
				text: 'Replace it with “damages arteries, which proves smoking caused every case shown”.',
				feedback: 'A mechanism does not let this table prove the cause of every case.',
				correct: false
			},
			{
				id: 'add-sample-size',
				text: 'Replace it with “only disease Z is linked to smoking because its increase is largest”.',
				feedback: 'All four diseases show increased risk, so this discards a supported pattern.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['risk', 'chance', 'likelihood'],
			['all four', 'every disease', 'each disease'],
			['65%', 'highest', 'greatest']
		],
		repairSuccess:
			'You changed an unsupported cause claim into a conclusion tied to the pattern and an extreme value.',
		transferPromptLead:
			'A pondweed produces 1, 2, 4, 8, 16, 16, 2 and 0 cm³ of gas from 10 °C to 45 °C in 5 °C steps. Which description uses the data best?',
		transferChoices: [
			{
				id: 'temperature-causes-growth',
				text: 'Gas rises from 1 cm³ to 16 cm³ by 35 °C, proving temperature always increases photosynthesis rate.',
				feedback: 'The readings fall sharply after 35 °C, so “always” contradicts the data.',
				correct: false
			},
			{
				id: 'rise-then-fall-vague',
				text: 'Gas rises from 1 cm³ to its peak at 30–35 °C, before falling at the highest temperatures.',
				feedback:
					'This captures the pattern, but it omits the peak and final values needed for precise evidence.',
				correct: false
			},
			{
				id: 'rise-peak-fall-data',
				text: 'Gas rises from 1 cm³ at 10 °C to 16 cm³ at 30–35 °C, then falls to 0 cm³ at 45 °C.',
				feedback: 'This states the pattern, peak and fall with precise evidence.',
				correct: true
			}
		],
		transferExplanation:
			'The context changed from disease risk to photosynthesis, but the marking steps did not: identify the pattern or extreme, then write a conclusion supported by values.',
		memoryHandle: 'Pattern → comparison → conclusion'
	},
	{
		...reviewStamp,
		lastReviewed: '2026-07-21',
		version: 2,
		id: 'biology-cell-differences',
		slug: 'prokaryotic-cell-differences',
		subject: 'biology',
		title: 'Can you give three genuine cell differences?',
		topic: 'Cell biology: prokaryotic and eukaryotic cells',
		subjectArtTheme: 'cells-practical',
		hook: 'One correct fact is not yet three differences — and repeating it does not help.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Bacterial cells are prokaryotic cells. Give three ways that a prokaryotic cell is different from a eukaryotic cell.',
		metaDescription:
			'Test GCSE Biology cell structure by comparing two student answers, identifying missing differences and applying them in a new cell comparison.',
		sourceQuestionId: '8464b1h-jun24-05-2',
		transferQuestionId: '84611h-nov20-03-2',
		staticAnswers: {
			a: 'A prokaryotic cell is smaller, has no nucleus and has no mitochondria.',
			b: 'A prokaryotic cell has no nucleus, so its genetic information is in the cytoplasm.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Answer B gives one valid directional difference. Answer A supplies three distinct feature categories: size, nucleus and mitochondria. Each clearly distinguishes a prokaryotic cell from a eukaryotic one.',
		commandWordLesson:
			'“Give three ways” sets both the number and the direction. Supply three different features and state how the prokaryotic cell differs; do not split one idea into repeated wording.',
		diagnosisPrompt: 'Why is Answer B incomplete?',
		diagnosisChoices: [
			{
				id: 'needs-cell-size-only',
				text: 'It uses the nucleus difference, which is not accepted for prokaryotic cells.',
				feedback:
					'The nucleus/DNA location is a valid difference; the problem is the requested count.',
				correct: false
			},
			{
				id: 'cytoplasm-wrong',
				text: 'It should describe three similarities before it gives any cell differences.',
				feedback: 'The command asks directly for differences, so similarities are not required.',
				correct: false
			},
			{
				id: 'only-one-difference',
				text: 'It gives only one of the three distinct differences requested.',
				feedback: 'Right: a correct single feature does not satisfy the requested count.',
				correct: true
			}
		],
		repairPrompt: 'Which addition completes the answer without repeating its DNA point?',
		repairChoices: [
			{
				id: 'repeat-nucleus',
				text: 'Add: “Its DNA lies free in the cytoplasm because it has no nucleus.”',
				feedback:
					'That restates the existing genetic-information difference rather than adding two new ones.',
				correct: false
			},
			{
				id: 'add-size-mitochondria',
				text: 'Add: “It is smaller and it has no mitochondria.”',
				feedback: 'These are two new, distinct feature differences.',
				correct: true
			},
			{
				id: 'add-cell-membrane',
				text: 'Add: “It has a cell membrane and cytoplasm.”',
				feedback: 'Eukaryotic cells also have those structures, so these are similarities.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['smaller', 'much smaller'],
			['no mitochondria', 'lacks mitochondria', 'without mitochondria']
		],
		repairSuccess:
			'You preserved the correct DNA point and added two different feature categories instead of rephrasing it.',
		transferPromptLead:
			'Which set gives three clear differences between a typical bacterial cell and typical liver or mesophyll cells?',
		transferChoices: [
			{
				id: 'smaller-no-nucleus-no-mitochondria',
				text: 'It is smaller, has no nucleus and has no mitochondria.',
				feedback:
					'Each item is a distinct, directed difference visible or relevant to the cell types.',
				correct: true
			},
			{
				id: 'membrane-cytoplasm-dna',
				text: 'It has a cell membrane, cytoplasm and genetic material.',
				feedback: 'Those are features shared by both prokaryotic and eukaryotic cells.',
				correct: false
			},
			{
				id: 'no-nucleus-dna-free',
				text: 'It has no nucleus, free DNA and unenclosed genetic material.',
				feedback: 'All three phrases repeat the same nucleus/DNA difference.',
				correct: false
			}
		],
		transferExplanation:
			'Count distinct feature categories and make the comparison direction explicit; three versions of one DNA point still earn only one idea.',
		memoryHandle: 'Different feature, clear direction, requested count'
	},
	{
		...reviewStamp,
		id: 'biology-extra-controls',
		slug: 'reaction-time-control-variables',
		subject: 'biology',
		title: 'Which controls make a reaction-time test fair?',
		topic: 'Working scientifically: control variables',
		subjectArtTheme: 'cells-practical',
		hook: 'A control can sound sensible and still be too vague — or already controlled.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'Scientists tested reaction time at three blood glucose concentrations. Age, sex, and food and drink consumed were controlled. Suggest two other control variables.',
		metaDescription:
			'Try a GCSE Biology control-variables challenge using a reaction-time study, then transfer the same reasoning to a long-term health survey.',
		sourceQuestionId: '8464b2h-jun24-06-5',
		transferQuestionId: '84611h-nov20-06-1',
		staticAnswers: {
			a: 'Use people of the same age and sex, and give everyone the same food and drink before testing.',
			b: 'Use the same hand for every reaction-time test, and make sure each person had the same amount of sleep.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'off-command',
		showdownExplanation:
			'Answer B names additional variables the investigators could define and hold consistent. Answer A only repeats age, sex, food and drink, which the question says are already controlled.',
		commandWordLesson:
			'“Suggest two other control variables” means do not repeat the named controls. Give two separate, specific factors that could affect the measured outcome.',
		diagnosisPrompt: 'What should the examiner notice first about Answer A?',
		diagnosisChoices: [
			{
				id: 'vague-and-repeated',
				text: 'Every factor it suggests is a control the question has already named.',
				feedback: 'Exactly: controls must be specific, distinct and genuinely additional.',
				correct: true
			},
			{
				id: 'three-not-two',
				text: 'It gives three controls when the question accepts exactly two responses.',
				feedback: 'Giving an extra idea is not the issue; repeating the named controls is.',
				correct: false
			},
			{
				id: 'cannot-control-people',
				text: 'Participant variables need not be controlled when everyone takes the same test.',
				feedback:
					'Participant differences can affect reaction time even when the test itself is identical.',
				correct: false
			}
		],
		repairPrompt: 'Which pair replaces the vague and repeated ideas?',
		repairChoices: [
			{
				id: 'age-sex',
				text: 'Use people of the same age and sex in every test group before measuring reaction time.',
				feedback: 'Both are explicitly named as already controlled.',
				correct: false
			},
			{
				id: 'height-mass',
				text: 'Use people with the same height and body mass for every trial.',
				feedback:
					'These are more specific, but their direct effect on this reaction-time method is less defensible.',
				correct: false
			},
			{
				id: 'test-hand-sleep',
				text: 'Use the same hand in every test; control each person’s hours of sleep.',
				feedback: 'These are two distinct controls that could affect reaction time.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['same hand', 'dominant hand', 'hand used'],
			['sleep', 'hours slept', 'amount of sleep', 'tiredness']
		],
		repairSuccess:
			'Your controls are now measurable, relevant to reaction time and separate from the factors already listed.',
		transferPromptLead:
			'A 15-year survey compares alcohol consumption with liver disease and already controls age and gender. Which additional pair is most appropriate?',
		transferChoices: [
			{
				id: 'age-follow-up',
				text: 'Control age and length of follow-up for every participant.',
				feedback: 'Age is already controlled in the survey.',
				correct: false
			},
			{
				id: 'smoking-bmi',
				text: 'Control smoking habits and BMI for every participant.',
				feedback: 'Both could affect liver-disease risk and are distinct from age and gender.',
				correct: true
			},
			{
				id: 'liver-disease-gender',
				text: 'Control gender and existing liver disease for every participant.',
				feedback: 'Gender is already controlled, so this is not an additional pair.',
				correct: false
			}
		],
		transferExplanation:
			'The particular controls change with the investigation, but the selection test stays the same: relevant, specific, not already given, and distinct from each other.',
		memoryHandle: 'Relevant + specific + not already given'
	},
	{
		...reviewStamp,
		id: 'biology-enzyme-denature',
		slug: 'enzyme-denaturation-at-45c',
		subject: 'biology',
		title: 'Why does photosynthesis stop at 45 °C?',
		topic: 'Bioenergetics: enzymes and photosynthesis',
		subjectArtTheme: 'biochemistry',
		hook: 'Enzymes are not “killed”. The missing link is what heat changes.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'An aquatic plant produced no gas at 45 °C. Explain why no gas was produced by the plant at this temperature.',
		metaDescription:
			'Play a GCSE Biology enzyme challenge: spot why “enzymes are killed” is weak, fix the active-site link and apply it to rate data.',
		sourceQuestionId: '8464b1h-jun24-04-3',
		transferQuestionId: '84611h-nov20-01-8',
		staticAnswers: {
			a: 'At 45 °C the enzymes denature. Their active sites change shape, so substrates no longer fit and oxygen-producing reactions stop.',
			b: 'At 45 °C the enzymes stop working. Substrates collide with them less often, so the reactions producing oxygen stop.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers connect high temperature to the stopped reaction. Answer A gives the correct molecular link: denaturation changes active-site shape and prevents binding. Answer B wrongly explains the fall through fewer collisions.',
		commandWordLesson:
			'“Explain why” needs a cause-and-effect explanation. Here, name the enzyme change and connect it to fewer successful reactions, rather than restating that the temperature is high.',
		diagnosisPrompt: 'Which link is scientifically wrong or missing in Answer B?',
		diagnosisChoices: [
			{
				id: 'oxygen-used',
				text: 'It should say oxygen is used faster than the plant can produce it.',
				feedback:
					'The question is about why the photosynthesis reactions stop at high temperature.',
				correct: false
			},
			{
				id: 'active-site-shape',
				text: 'It blames fewer collisions instead of denaturation changing the active-site shape.',
				feedback: 'Yes. That change explains why substrates can no longer bind effectively.',
				correct: true
			},
			{
				id: 'particles-stop',
				text: 'It should say every enzyme-controlled reaction stops above exactly 45 °C.',
				feedback:
					'The evidence concerns this plant and reaction, not a universal cut-off for all enzymes.',
				correct: false
			}
		],
		repairPrompt: 'What change makes Answer B’s collision explanation accurate?',
		repairChoices: [
			{
				id: 'denature-fit',
				text: 'Replace with: “enzymes denature, changing active-site shape so substrates no longer fit”.',
				feedback: 'This supplies the precise structural change and its effect on the reaction.',
				correct: true
			},
			{
				id: 'enzyme-evaporates',
				text: 'Replace with: “the substrate denatures, so it cannot reach the unchanged active site”.',
				feedback: 'The required explanation is the enzyme active site changing shape.',
				correct: false
			},
			{
				id: 'cold-slow',
				text: 'Replace with: “particles have too little kinetic energy to collide successfully”.',
				feedback: 'That describes a low-temperature effect, not excessive heat.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['denature', 'denatured', 'denaturation'],
			['active site changes shape', 'active site changed shape', 'shape of the active site'],
			['substrate no longer fits', 'substrates cannot fit', 'cannot bind']
		],
		repairSuccess:
			'You replaced the incorrect collision explanation with the exact mechanism: denaturation, changed active site and failed binding.',
		transferPromptLead:
			'Pondweed photosynthesis falls from 40.8 cm³/hour at 35 °C to 2.1 cm³/hour at 45 °C. Which explanation fits?',
		transferChoices: [
			{
				id: 'less-light',
				text: 'The light intensity must have fallen, so fewer enzyme–substrate collisions occurred.',
				feedback: 'The stated change is temperature; no light change is given.',
				correct: false
			},
			{
				id: 'more-collisions',
				text: 'Faster particles make more successful collisions, so the rate must keep increasing.',
				feedback: 'Above the optimum, enzyme denaturation can outweigh the collision-rate effect.',
				correct: false
			},
			{
				id: 'denature-rate',
				text: 'At 45 °C enzymes denature and active sites change shape, so the reaction rate falls.',
				feedback: 'This connects excessive temperature to enzyme structure and the measured rate.',
				correct: true
			}
		],
		transferExplanation:
			'Zero gas and a large rate decrease are different observations, but both use the same high-temperature enzyme link.',
		memoryHandle: 'Too hot → denature → active site changes'
	},
	{
		...reviewStamp,
		id: 'biology-reagent-colour',
		slug: 'protein-food-test-colour',
		subject: 'biology',
		title: 'What colour proves protein is present?',
		topic: 'Organisation: food tests',
		subjectArtTheme: 'biochemistry',
		hook: '“Look for a colour change” is not an observation an examiner can use.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe how to test a drink for protein. Give the colour of a positive result.',
		metaDescription:
			'Try a GCSE Biology food-test challenge: improve a vague Biuret result, remember the positive colour and apply the method to starch.',
		sourceQuestionId: '8464b1h-jun24-01-3',
		transferQuestionId: '84611h-nov20-04-5',
		staticAnswers: {
			a: 'Add Biuret solution to the drink. Record any change from its starting colour.',
			b: 'Add Biuret solution to the drink. Record a mauve or purple positive result.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Both answers name Biuret solution, but only Answer B gives the diagnostic positive observation. “Any colour change” cannot distinguish the expected result from an unrelated change.',
		commandWordLesson:
			'“Describe how” asks for the action; “give the colour” asks for the observation. Include both the reagent-to-sample step and the named positive colour.',
		diagnosisPrompt: 'Which required piece is absent from Answer A?',
		diagnosisChoices: [
			{
				id: 'needs-heating',
				text: 'It must heat the Biuret mixture in a hot water bath first.',
				feedback: 'Heating is needed for Benedict’s test, not the Biuret protein test.',
				correct: false
			},
			{
				id: 'needs-mass',
				text: 'It must calculate the mass of protein before observing a colour.',
				feedback: 'This is a qualitative food test, so the requested evidence is a colour.',
				correct: false
			},
			{
				id: 'named-positive-colour',
				text: 'It does not name the mauve or purple positive result.',
				feedback: 'Exactly: the observation must be specific enough to identify protein.',
				correct: true
			}
		],
		repairPrompt: 'Which addition completes the original method?',
		repairChoices: [
			{
				id: 'blue-positive',
				text: 'Add: “A positive result stays the original blue colour.”',
				feedback: 'Blue is the negative starting colour, not the positive result.',
				correct: false
			},
			{
				id: 'purple-positive',
				text: 'Add: “A positive result becomes mauve or purple.”',
				feedback: 'This is the specific observation the original answer lacks.',
				correct: true
			},
			{
				id: 'boil-red',
				text: 'Add: “A positive result becomes a brick-red precipitate.”',
				feedback: 'That confuses the protein test with Benedict’s reducing-sugar test.',
				correct: false
			}
		],
		freeTextKeywordGroups: [['mauve', 'purple', 'lilac', 'violet']],
		repairSuccess:
			'You kept the correct reagent and made the result observable: mauve or purple means protein is present.',
		transferPromptLead:
			'Leaf liquid must now be tested for starch. Which method-and-result pair is correct?',
		transferChoices: [
			{
				id: 'iodine-blue-black',
				text: 'Add iodine solution; the orange-brown colour becomes blue-black.',
				feedback: 'That is the reagent and specific positive result for starch.',
				correct: true
			},
			{
				id: 'biuret-purple',
				text: 'Add Biuret solution; the blue colour becomes purple.',
				feedback: 'That tests for protein, not starch.',
				correct: false
			},
			{
				id: 'benedicts-brick-red',
				text: 'Add Benedict’s solution and heat; the blue colour becomes brick red.',
				feedback: 'That tests for reducing sugars such as glucose.',
				correct: false
			}
		],
		transferExplanation:
			'The reagent and colour changed, but the reusable method stayed intact: add the correct reagent, then state the specific positive colour.',
		memoryHandle: 'Reagent in → named positive colour'
	},
	{
		...reviewStamp,
		id: 'biology-heated-food-test',
		slug: 'benedicts-sugar-test',
		subject: 'biology',
		title: 'Which step activates Benedict’s test?',
		topic: 'Organisation: food tests',
		subjectArtTheme: 'biochemistry',
		hook: 'The reagent is right. The red result sounds right. One practical step still matters.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe how to test a drink for sugar and give the colour of a positive result.',
		metaDescription:
			'Practise the GCSE Biology Benedict’s test: compare realistic methods, fix the missing heating step and transfer the sequence to leaf glucose.',
		sourceQuestionId: '8464b1h-jun24-01-2',
		transferQuestionId: '84611h-nov20-04-4',
		staticAnswers: {
			a: 'Add Benedict’s solution, then leave the mixture at room temperature. A positive result changes from blue towards brick red.',
			b: 'Add Benedict’s solution, then heat the mixture in a hot water bath. A positive result changes from blue towards brick red.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Both answers name Benedict’s solution and a positive colour change. Only Answer B includes the missing practical step: heat the mixture using an appropriate method, such as a hot water bath.',
		commandWordLesson:
			'For “describe how”, give the usable sequence: reagent to sample, heating, then the positive observation. A result alone is not a method.',
		diagnosisPrompt: 'What is the most important practical weakness in Answer A?',
		diagnosisChoices: [
			{
				id: 'heating-unspecified',
				text: 'It leaves the mixture unheated, although Benedict’s test needs an appropriate heating method.',
				feedback:
					'Correct: a hot water bath is one appropriate way to supply the required heating.',
				correct: true
			},
			{
				id: 'needs-iodine',
				text: 'It should add iodine solution before the Benedict’s solution to confirm sugar.',
				feedback: 'Iodine tests for starch, not reducing sugar.',
				correct: false
			},
			{
				id: 'red-never-valid',
				text: 'It should report only brick red because weaker positive colours are not accepted.',
				feedback:
					'Brick red is an accepted strong positive result; the method wording is the key weakness.',
				correct: false
			}
		],
		repairPrompt: 'Which change adds the appropriate heating step?',
		repairChoices: [
			{
				id: 'leave-sunlight',
				text: 'Replace “leave at room temperature” with “hold the tube in your hands until warm”.',
				feedback: 'Hand warmth does not provide the clear heating method the test requires.',
				correct: false
			},
			{
				id: 'heat-direct-flame',
				text: 'Replace it with “heat Benedict’s solution alone, cool it, then add the drink”.',
				feedback: 'The sample and Benedict’s solution need to be heated as a mixture.',
				correct: false
			},
			{
				id: 'hot-water-bath',
				text: 'Replace it with “heat the mixture appropriately, for example in a hot water bath”.',
				feedback:
					'This states the necessary action and gives a suitable example without implying one route only.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			[
				'heat the mixture',
				'heat mixture',
				'heated mixture',
				'hot water bath',
				'boiling water bath',
				'heating block',
				'electric test tube heater'
			]
		],
		repairSuccess:
			'You restored the usable sequence: Benedict’s solution, appropriate heating, then a positive colour change.',
		transferPromptLead:
			'Students have leaf liquid and want to find out whether it contains glucose. What should they do?',
		transferChoices: [
			{
				id: 'iodine-no-heat',
				text: 'Add iodine solution, keep it at room temperature and look for blue-black.',
				feedback: 'That tests for starch.',
				correct: false
			},
			{
				id: 'benedicts-heat-colour',
				text: 'Add Benedict’s solution, heat the mixture appropriately and look for a change away from blue.',
				feedback: 'This transfers the complete reagent–heat–colour sequence.',
				correct: true
			},
			{
				id: 'biuret-purple',
				text: 'Add Biuret solution, keep it at room temperature and look for purple.',
				feedback: 'That tests for protein.',
				correct: false
			}
		],
		transferExplanation:
			'Changing drink to leaf liquid does not change the glucose-test method: add Benedict’s, heat, then observe the accepted positive colour range.',
		memoryHandle: 'Benedict’s → heat → not blue'
	},
	{
		...reviewStamp,
		id: 'biology-ivf-sequence',
		slug: 'ivf-process-sequence',
		subject: 'biology',
		title: 'Can you put IVF in the right place?',
		topic: 'Hormonal coordination: fertility treatment',
		subjectArtTheme: 'inheritance-reproduction',
		hook: 'Fertilisation happens — but not where this answer says it does.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Describe how the process of in vitro fertilisation (IVF) can result in pregnancy.',
		metaDescription:
			'Try a GCSE Biology IVF sequence challenge: locate the in-vitro step, fix the order and apply the sequence from egg collection to embryo transfer.',
		sourceQuestionId: '8464b2h-jun24-03-5',
		transferQuestionId: '8464b2h-jun22-05-5',
		staticAnswers: {
			a: 'Mature eggs are collected and inserted into the uterus with sperm. The resulting embryos divide there, then one or two continue developing in the uterus.',
			b: 'Mature eggs are collected and fertilised with sperm in a laboratory. The resulting embryos divide, then one or two are inserted into the uterus.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers collect mature eggs and describe embryo development. Only Answer B keeps the defining IVF locations in order: fertilisation happens in a laboratory, then embryo(s) are transferred to the uterus.',
		commandWordLesson:
			'“Describe how the process” rewards an ordered account. Keep each location and stage clear; do not jump from fertilisation to pregnancy without embryo formation and transfer.',
		diagnosisPrompt: 'Where does Answer A first leave the IVF process?',
		diagnosisChoices: [
			{
				id: 'embryo-grows',
				text: 'It describes embryos dividing before they can be inserted into the uterus.',
				feedback: 'Embryo development is part of the route to pregnancy.',
				correct: false
			},
			{
				id: 'inside-fertilisation',
				text: 'It places the eggs and sperm together in the uterus instead of fertilising eggs in a laboratory.',
				feedback: 'Exactly: “in vitro” means the eggs are fertilised outside the body.',
				correct: true
			},
			{
				id: 'mentions-sperm',
				text: 'It collects mature eggs before allowing the embryos to begin dividing.',
				feedback:
					'Egg collection and later embryo division are valid stages; their locations are the issue.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement restores the defining IVF sequence?',
		repairChoices: [
			{
				id: 'lab-fertilise-transfer',
				text: 'Replace with: “Collected eggs are fertilised with sperm in a lab; embryos form, then are inserted into the uterus.”',
				feedback: 'This fixes both the location and the missing transfer sequence.',
				correct: true
			},
			{
				id: 'inject-sperm-blood',
				text: 'Replace with: “Collected eggs and sperm are inserted together so fertilisation occurs naturally in the uterus.”',
				feedback: 'That still misses the laboratory fertilisation that defines IVF.',
				correct: false
			},
			{
				id: 'embryo-fertilised',
				text: 'Replace with: “Collected eggs are fertilised in a lab and kept there until pregnancy is established.”',
				feedback: 'Embryos must be transferred to the uterus for pregnancy to develop.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['egg collected', 'eggs collected', 'collect eggs', 'remove eggs'],
			['laboratory', 'in a lab', 'outside the body', 'in vitro'],
			['fertilised with sperm', 'sperm fertilises the eggs', 'fertilisation'],
			['embryo inserted', 'embryos transferred', 'put into the uterus', 'inserted into uterus']
		],
		repairSuccess:
			'You restored the two locations that define IVF: fertilisation in the laboratory, then embryo transfer to the uterus.',
		transferPromptLead:
			'FSH and LH have already been given. Which option correctly describes the remaining IVF steps?',
		transferChoices: [
			{
				id: 'fertilise-inside',
				text: 'Collect the eggs, then place eggs and sperm together in the uterus for fertilisation.',
				feedback:
					'Egg collection is present, but fertilisation should happen in a laboratory rather than the uterus.',
				correct: false
			},
			{
				id: 'collect-insert-eggs',
				text: 'Collect eggs, fertilise them in a laboratory, then keep the dividing embryos in the laboratory.',
				feedback:
					'Laboratory fertilisation is present, but the embryos must then be transferred to the uterus.',
				correct: false
			},
			{
				id: 'collect-lab-divide-transfer',
				text: 'Collect eggs, fertilise them with sperm in a laboratory, let embryos form, then insert embryo(s) into the uterus.',
				feedback: 'This keeps every remaining stage in the correct order.',
				correct: true
			}
		],
		transferExplanation:
			'The transfer prompt begins after hormone treatment, but the reusable core remains collect → laboratory fertilisation → embryo division → uterus transfer.',
		memoryHandle: 'Collect → lab fertilise → divide → transfer'
	},
	{
		...reviewStamp,
		id: 'biology-vaccine-immunity',
		slug: 'measles-vaccine-immunity',
		subject: 'biology',
		title: 'What gives a vaccine its memory?',
		topic: 'Infection and response: vaccination',
		subjectArtTheme: 'regulation-immunity',
		hook: 'Phagocytes do not make antibodies — and antibodies alone do not explain lasting immunity.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Describe how the measles vaccine helps a person to become immune to the measles pathogen.',
		metaDescription:
			'Play a GCSE Biology vaccination challenge: correct who makes antibodies, add memory cells and apply the immunity reasoning to a bacterial vaccine.',
		sourceQuestionId: '8464b1h-jun24-03-3',
		transferQuestionId: '8464b1h-nov20-04-2',
		staticAnswers: {
			a: 'The vaccine introduces harmless measles antigens. Lymphocytes make specific antibodies and memory cells, so later exposure produces a faster response before illness develops.',
			b: 'The vaccine introduces harmless measles antigens. Lymphocytes make specific antibodies, which remain permanently and destroy the virus during later exposure.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers identify harmless antigens, lymphocytes and specific antibodies. Answer A then explains lasting immunity through memory cells. Answer B instead claims the first antibodies remain permanently.',
		commandWordLesson:
			'“Describe how … become immune” needs the full time sequence: safe antigen exposure now, a specific lymphocyte response, memory cells, then a faster response on later exposure.',
		diagnosisPrompt: 'Which pair of problems most limits Answer B?',
		diagnosisChoices: [
			{
				id: 'must-be-live',
				text: 'It identifies lymphocytes, although phagocytes are the cells that make specific antibodies.',
				feedback: 'Lymphocytes make specific antibodies; phagocytes do not.',
				correct: false
			},
			{
				id: 'no-pathogen',
				text: 'It describes harmless antigens rather than using a fully active measles virus.',
				feedback: 'Harmless antigens can safely stimulate the specific immune response.',
				correct: false
			},
			{
				id: 'wrong-cell-no-memory',
				text: 'It relies on antibodies remaining permanently instead of memory cells triggering a rapid later response.',
				feedback:
					'Correct: immune memory, not permanent first antibodies, explains the faster response.',
				correct: true
			}
		],
		repairPrompt: 'Which change completes the immunity explanation?',
		repairChoices: [
			{
				id: 'phagocytes-faster',
				text: 'Replace with: “The same antibodies copy themselves rapidly and destroy measles when the virus returns later”.',
				feedback:
					'Antibodies do not reproduce; memory lymphocytes enable later antibody production.',
				correct: false
			},
			{
				id: 'lymphocytes-memory',
				text: 'Replace with: “Memory cells remain and trigger faster production of specific antibodies on later exposure.”',
				feedback: 'This supplies the cellular basis of a faster, specific later response.',
				correct: true
			},
			{
				id: 'antibiotics',
				text: 'Replace with: “Phagocytes store the first antibodies and release them during later exposure.”',
				feedback: 'Phagocytes do not store antibodies; memory cells support the later response.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['lymphocyte', 'lymphocytes', 'white blood cells'],
			['memory cell', 'memory cells'],
			['faster', 'more quickly', 'rapid', 'quicker'],
			['specific antibody', 'specific antibodies', 'matching antibodies']
		],
		repairSuccess:
			'You connected the first exposure to later protection: lymphocytes make specific antibodies and leave memory cells for a faster response.',
		transferPromptLead:
			'A new vaccine is being developed against gonorrhoea, a bacterial disease. Which sequence explains how it could prevent illness?',
		transferChoices: [
			{
				id: 'antigen-antibody-memory',
				text: 'Harmless gonorrhoea antigens stimulate specific antibodies and memory cells, enabling a rapid response on later exposure.',
				feedback: 'The pathogen changed, but the complete immunity sequence still applies.',
				correct: true
			},
			{
				id: 'antibodies-antibiotics',
				text: 'Harmless gonorrhoea antigens stimulate antibodies that remain permanently and kill bacteria during later exposure.',
				feedback: 'Long-term protection depends on memory cells and renewed antibody production.',
				correct: false
			},
			{
				id: 'disease-practice',
				text: 'Harmless gonorrhoea antigens stimulate a general white-cell response without making specific memory cells.',
				feedback: 'Effective vaccination depends on a specific response and memory cells.',
				correct: false
			}
		],
		transferExplanation:
			'Virus or bacterium, the sequence is the same: harmless antigen → specific antibodies and memory cells → faster later response before illness develops.',
		memoryHandle: 'Antigen → specific antibody → memory → faster response'
	},
	{
		...reviewStamp,
		id: 'biology-homeostasis-control',
		slug: 'homeostasis-control-loop',
		subject: 'biology',
		title: 'What makes homeostasis a control process?',
		topic: 'Homeostasis and response: control systems',
		subjectArtTheme: 'regulation-immunity',
		hook: 'The body does not stay completely unchanged. It detects a change and responds to it.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Explain how homeostasis helps the body keep internal conditions suitable for cells.',
		metaDescription:
			'Play a GCSE Biology homeostasis challenge: complete the receptor-to-effector control loop and apply it to blood glucose control.',
		staticAnswers: {
			a: 'Homeostasis keeps internal conditions within suitable limits. Receptors detect a change, coordination centres process the information and effectors act to restore the condition.',
			b: 'Homeostasis keeps every internal condition completely unchanged. Receptors detect a change, while effectors prevent the outside environment from changing the body.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A describes a working control loop and suitable limits. Answer B wrongly treats homeostasis as perfect constancy and says effectors control the outside environment.',
		commandWordLesson:
			'“Explain how” needs the linked control steps: a receptor detects a change, a coordination centre processes information, and an effector produces a response.',
		diagnosisPrompt: 'Which claim first makes Answer B inaccurate?',
		diagnosisChoices: [
			{
				id: 'perfectly-unchanged',
				text: 'Internal conditions must remain completely unchanged at every moment.',
				feedback: 'Correct: conditions are regulated within suitable limits, not fixed perfectly.',
				correct: true
			},
			{
				id: 'receptors-detect',
				text: 'Receptors detect changes in an internal or external condition.',
				feedback: 'That is a valid first step in a homeostatic control system.',
				correct: false
			},
			{
				id: 'effectors-respond',
				text: 'Effectors produce responses after information has been processed.',
				feedback: 'That is the correct role of effectors in the control loop.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the complete control sequence?',
		repairChoices: [
			{
				id: 'brain-only',
				text: 'The brain notices every change and directly keeps all conditions constant.',
				feedback: 'Not every control centre is the brain, and conditions vary within limits.',
				correct: false
			},
			{
				id: 'receptor-coordinator-effector',
				text: 'Receptors detect change, coordination centres process information and effectors respond to return the condition within suitable limits.',
				feedback:
					'This links the control system to its purpose: keeping a condition within suitable limits.',
				correct: true
			},
			{
				id: 'environment-controlled',
				text: 'Effectors alter the surroundings so that internal conditions never need changing.',
				feedback:
					'Effectors change conditions inside the body rather than controlling the surroundings.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['receptor', 'receptors'],
			['coordination centre', 'coordination centres', 'control centre', 'control centres'],
			['effector', 'effectors'],
			['within suitable limits', 'normal level', 'optimum level', 'restore the condition']
		],
		repairSuccess:
			'You built the control loop: detect the change, process the information, then respond to keep the condition within suitable limits.',
		transferPromptLead:
			'Blood glucose rises after a meal. Which sequence best explains the homeostatic response?',
		transferChoices: [
			{
				id: 'insulin-raises',
				text: 'The pancreas releases insulin, causing blood glucose to rise further.',
				feedback: 'Insulin lowers blood glucose rather than increasing it further.',
				correct: false
			},
			{
				id: 'insulin-release',
				text: 'The pancreas releases insulin, causing liver cells to release more glucose into the blood.',
				feedback:
					'Insulin makes cells take in glucose and promotes storage rather than releasing more glucose.',
				correct: false
			},
			{
				id: 'insulin-lowers',
				text: 'The pancreas detects the rise and releases insulin, increasing glucose uptake.',
				feedback: 'This detects the change and produces a response that lowers blood glucose.',
				correct: true
			}
		],
		transferExplanation:
			'Blood glucose control follows the same loop: detect a change, coordinate a hormonal response, then use effectors to move the condition back towards its normal level.',
		memoryHandle: 'Change → receptor → coordination centre → effector → suitable limits'
	},
	{
		...reviewStamp,
		id: 'biology-recessive-inheritance',
		slug: 'recessive-allele-probability',
		subject: 'biology',
		title: 'Can you read a recessive inheritance cross?',
		topic: 'Inheritance, variation and evolution: genetic inheritance',
		subjectArtTheme: 'inheritance-reproduction',
		hook: 'Carrying a recessive allele is not the same as showing the recessive characteristic.',
		arc: 'read-the-evidence',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A genetic condition is caused by recessive allele r. Two unaffected heterozygous parents have a child. Explain the probability that the child has the condition.',
		metaDescription:
			'Play a GCSE Biology inheritance challenge: distinguish carriers from recessive phenotypes and transfer the reasoning to another genetic cross.',
		staticAnswers: {
			a: 'Each parent is Rr. The possible offspring are RR, Rr, Rr and rr, so one in four is affected because the recessive condition requires rr.',
			b: 'Each parent is Rr. The possible offspring are RR, Rr, Rr and rr, so three in four are affected because three genotypes contain allele r.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers set up the four genotypes correctly. Answer B then counts heterozygous carriers as affected, even though dominant R masks recessive r in Rr.',
		commandWordLesson:
			'For a genetic probability, identify the parental genotypes, list the possible offspring genotypes, then connect the required phenotype to the genotype that produces it.',
		diagnosisPrompt: 'Which step first makes Answer B wrong?',
		diagnosisChoices: [
			{
				id: 'parents-bb',
				text: 'Writing each heterozygous parent as Rr.',
				feedback: 'Rr is the correct genotype for a heterozygous parent.',
				correct: false
			},
			{
				id: 'four-outcomes',
				text: 'Listing RR, Rr, Rr and rr as possible offspring.',
				feedback: 'Those are the correct four outcomes for an Rr × Rr cross.',
				correct: false
			},
			{
				id: 'counting-carriers',
				text: 'Counting Rr carriers as showing the recessive condition.',
				feedback: 'Exactly: only rr shows this recessive condition.',
				correct: true
			}
		],
		repairPrompt: 'Which statement correctly connects genotype to phenotype?',
		repairChoices: [
			{
				id: 'one-b-enough',
				text: 'Any genotype containing r is affected, giving a three-in-four chance.',
				feedback: 'A dominant R masks r in heterozygous offspring.',
				correct: false
			},
			{
				id: 'bb-only',
				text: 'Only rr is affected, giving a one-in-four chance.',
				feedback: 'This correctly links the recessive phenotype to two recessive alleles.',
				correct: true
			},
			{
				id: 'bb-dominant',
				text: 'Only RR is affected, giving a one-in-four chance.',
				feedback: 'RR contains two dominant alleles and does not show the recessive condition.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['rr', 'two recessive alleles'],
			['one in four', '1 in 4', '25%', 'one-quarter'],
			['recessive phenotype', 'recessive condition', 'affected']
		],
		repairSuccess:
			'You separated carrying r from showing the recessive condition and found the one-in-four probability.',
		transferPromptLead:
			'Cystic fibrosis is caused by a recessive allele. Two unaffected carriers have a child. Which conclusion is correct?',
		transferChoices: [
			{
				id: 'all-affected',
				text: 'Every child is affected because both parents carry the allele.',
				feedback:
					'Carriers have one dominant allele, so not every child inherits two recessive alleles.',
				correct: false
			},
			{
				id: 'quarter-affected',
				text: 'One in four outcomes is affected because only the double-recessive genotype shows it.',
				feedback:
					'This correctly connects the affected phenotype to the double-recessive genotype.',
				correct: true
			},
			{
				id: 'half-affected',
				text: 'Two in four outcomes are affected because the heterozygotes carry the allele.',
				feedback: 'Heterozygous carriers do not show a recessive condition.',
				correct: false
			}
		],
		transferExplanation:
			'The characteristic changed, but the inheritance logic did not: carriers are heterozygous, and only the offspring with two recessive alleles shows the recessive condition.',
		memoryHandle: 'Cross → genotype → phenotype → probability'
	}
] satisfies ChallengeDefinition[];

const chemistryChallenges = [
	{
		...reviewStamp,
		id: 'chemistry-alloy-hardness',
		slug: 'alloy-hardness',
		subject: 'chemistry',
		title: 'Why is an alloy harder than a pure metal?',
		topic: 'Bonding, structure and properties: alloys',
		subjectArtTheme: 'particles-bonding',
		hook: 'Both answers say the alloy is harder. Only one explains what stops the layers sliding.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'A bicycle frame is made from an aluminium alloy instead of pure aluminium. Explain why the alloy is harder.',
		metaDescription:
			'Try a GCSE Chemistry alloy challenge: compare two particle explanations, find the false idea and apply the correct reasoning to another metal.',
		sourceQuestionId: '8464c1h-jun24-01-2',
		transferQuestionId: '8464c1h-jun22-05-3',
		staticAnswers: {
			a: 'The added atoms are different sizes, so they distort the regular metal layers. The layers cannot slide over each other as easily, making the alloy harder.',
			b: 'The added atoms fill the gaps in the regular metal layers. This holds the layers together more tightly, so the alloy is harder.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A follows the particle explanation all the way through: different-sized atoms distort the layers, the layers slide less easily, and the alloy is harder. Answer B invents gap-filling instead of explaining the disrupted layers.',
		commandWordLesson:
			'“Explain why” needs linked causes. Start with the different-sized atoms, describe their effect on the layers, then connect reduced sliding to greater hardness.',
		diagnosisPrompt: 'Which idea first makes Answer B scientifically inaccurate?',
		diagnosisChoices: [
			{
				id: 'gap-filling',
				text: 'It says added atoms fill gaps instead of distorting layers.',
				feedback:
					'Exactly: different-sized atoms disrupt the regular layers rather than filling gaps.',
				correct: true
			},
			{
				id: 'names-hardness',
				text: 'It says the alloy is harder instead of naming aluminium.',
				feedback: 'The material is already given; the missing issue is how its layers change.',
				correct: false
			},
			{
				id: 'mentions-layers',
				text: 'It mentions layers before stating that all metals contain atoms.',
				feedback: 'Using the layer model is appropriate; the gap-filling claim is the error.',
				correct: false
			}
		],
		repairPrompt: 'Which change makes the particle explanation accurate?',
		repairChoices: [
			{
				id: 'heavier-atoms',
				text: 'Heavier atoms press the layers together, so they cannot move.',
				feedback: 'Mass is not the key property in the accepted particle explanation.',
				correct: false
			},
			{
				id: 'distort-layers',
				text: 'Different-sized atoms distort the layers, so they slide less easily.',
				feedback: 'That supplies the missing structural link between mixing and hardness.',
				correct: true
			},
			{
				id: 'ionic-bonds',
				text: 'Added atoms form ionic bonds that lock every layer together.',
				feedback: 'An alloy still has metallic bonding; ionic bonds are not formed throughout.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['different sizes', 'different-sized', 'different size'],
			['distort', 'distorted', 'disrupt'],
			['slide', 'sliding']
		],
		repairSuccess:
			'You connected atomic size to distorted layers, reduced sliding and the harder material.',
		transferPromptLead:
			'Pure aluminium bends too easily for a ladder. Which explanation best predicts why mixing in another metal makes it harder?',
		transferChoices: [
			{
				id: 'gravity-compresses',
				text: 'The new atoms are heavier, so gravity presses the layers together.',
				feedback: 'Greater atomic mass does not explain why the layers slide less easily.',
				correct: false
			},
			{
				id: 'ionic-replacement',
				text: 'The new atoms replace metallic bonds with stronger ionic bonds.',
				feedback: 'The material remains metallic; this changes the bonding model incorrectly.',
				correct: false
			},
			{
				id: 'distortion-reduces-sliding',
				text: 'Different-sized atoms distort the layers, making sliding between them harder.',
				feedback: 'This carries the same particle reasoning into the new use.',
				correct: true
			}
		],
		transferExplanation:
			'The use changed from a bicycle to a ladder, but the explanation stayed precise: different-sized atoms distort the layers, reduce sliding and make the alloy harder.',
		memoryHandle: 'Different sizes → distorted layers → less sliding → harder'
	},
	{
		...reviewStamp,
		id: 'chemistry-collision-rate',
		slug: 'temperature-collision-rate',
		subject: 'chemistry',
		title: 'Why does a higher temperature speed up a reaction?',
		topic: 'Rates of reaction: collision theory',
		subjectArtTheme: 'reactions-energy',
		hook: 'The particles do move faster. The final mark depends on what that changes about collisions.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'A reaction mixture is warmed from 20 °C to 40 °C. Explain why the reaction rate increases.',
		metaDescription:
			'Try a GCSE Chemistry collision-theory challenge: compare two temperature explanations, identify the false step and apply the reasoning again.',
		sourceQuestionId: '84622h-jun24-09-5',
		transferQuestionId: '8464c2h-jun24-02-2',
		staticAnswers: {
			a: 'At higher temperature, particles move faster and collide more often. More collisions have enough energy to react, so the reaction rate rises.',
			b: 'At higher temperature, particles gain energy and more particles are produced. The larger number of particles means the reaction rate rises.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A connects higher temperature to faster particles, more frequent collisions and more collisions with enough energy to react. Answer B wrongly claims that heating creates more particles.',
		commandWordLesson:
			'“Explain why” needs the collision-theory links. State how particle motion changes, what happens to collision frequency and the proportion above the activation-energy threshold, then give the effect on rate.',
		diagnosisPrompt: 'Where does Answer B first leave collision theory?',
		diagnosisChoices: [
			{
				id: 'energy-increases',
				text: 'It says particles gain energy when the temperature rises.',
				feedback: 'That part is sound: the particles have more kinetic energy.',
				correct: false
			},
			{
				id: 'particle-count-increases',
				text: 'It says heating produces more particles in the mixture.',
				feedback:
					'Exactly: temperature changes particle motion and energy distribution, not particle count.',
				correct: true
			},
			{
				id: 'rate-rises',
				text: 'It says the reaction rate rises after the temperature rises.',
				feedback: 'That is the observed effect; the false link is the claimed extra particles.',
				correct: false
			}
		],
		repairPrompt: 'Which change completes the collision-theory explanation?',
		repairChoices: [
			{
				id: 'particles-expand',
				text: 'Particles expand and cover more space, so reactions finish sooner.',
				feedback: 'Particles are not explained as expanding when a mixture is heated.',
				correct: false
			},
			{
				id: 'bonds-weaken',
				text: 'Every chemical bond becomes weaker, so all reactions happen instantly.',
				feedback: 'Heating does not make every bond weak or every reaction instantaneous.',
				correct: false
			},
			{
				id: 'faster-successful-collisions',
				text: 'Particles move faster, collide more often and more collisions have enough energy to react.',
				feedback:
					'This links temperature to collision frequency and the activation-energy threshold.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['move faster', 'moving faster', 'greater speed'],
			['collide more often', 'more frequent collisions', 'collision frequency'],
			['enough energy', 'activation energy', 'minimum energy', 'energy threshold']
		],
		repairSuccess:
			'You linked higher temperature to faster particles, more frequent collisions and a greater proportion above the activation energy.',
		transferPromptLead:
			'Magnesium reacts slowly with acid at 15 °C and faster at 35 °C. Which explanation uses collision theory correctly?',
		transferChoices: [
			{
				id: 'more-acid-particles',
				text: 'Heating creates more acid particles, so more collisions become possible.',
				feedback: 'The number of particles does not increase merely because temperature rises.',
				correct: false
			},
			{
				id: 'faster-more-successful',
				text: 'Particles move faster, so collisions are more frequent and more have enough energy to react.',
				feedback:
					'This connects higher temperature to collision frequency and the energy needed for reaction.',
				correct: true
			},
			{
				id: 'magnesium-melts',
				text: 'The magnesium starts melting, so its particles react with acid.',
				feedback: 'Magnesium does not need to melt for this reaction rate to increase.',
				correct: false
			}
		],
		transferExplanation:
			'Changing the reactants does not change the reasoning: higher temperature means faster particles, more frequent collisions and a greater proportion with enough energy to react.',
		memoryHandle:
			'Higher temperature → faster particles → more collisions above activation energy → faster rate'
	},
	{
		...reviewStamp,
		id: 'chemistry-stoichiometric-mass',
		slug: 'ammonia-to-hydrogen-mass',
		subject: 'chemistry',
		title: 'Can you keep the mole ratio the right way round?',
		topic: 'Quantitative chemistry: reacting masses',
		subjectArtTheme: 'reactions-energy',
		hook: 'The first mole calculation is right. One reversed ratio changes the final mass.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Ammonia decomposes: $2\\mathrm{NH_3} \\rightarrow \\mathrm{N_2} + 3\\mathrm{H_2}$. Calculate the mass of hydrogen made from $25.0\\,\\mathrm{g}$ of ammonia. $M_r(\\mathrm{NH_3}) = 17$ and $M_r(\\mathrm{H_2}) = 2$.',
		metaDescription:
			'Try a GCSE Chemistry reacting-mass challenge: find the reversed mole ratio, correct the hydrogen calculation and apply the method to a different reaction.',
		sourceQuestionId: '8464c1h-jun24-05-2',
		transferQuestionId: '8464c1h-nov20-06-3',
		staticAnswers: {
			a: '$25.0 \\div 17 = 1.47$ mol $\\mathrm{NH_3}$. The $3:2$ ratio gives $2.21$ mol $\\mathrm{H_2}$, so the mass is $2.21 \\times 2 = 4.41\\,\\mathrm{g}$.',
			b: '$25.0 \\div 17 = 1.47$ mol $\\mathrm{NH_3}$. The $2:3$ ratio gives $0.98$ mol $\\mathrm{H_2}$, so the mass is $0.98 \\times 2 = 1.96\\,\\mathrm{g}$.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers convert ammonia mass to moles correctly. Answer B first goes wrong by reversing the equation ratio: two moles of ammonia make three moles of hydrogen, so the ammonia amount must be multiplied by 3 ÷ 2.',
		commandWordLesson:
			'For a reacting-mass calculation, show the route from mass to moles, apply the balanced-equation ratio in the direction asked, then convert the product moles back to mass.',
		diagnosisPrompt: 'Which line is the first incorrect step in Answer B?',
		diagnosisChoices: [
			{
				id: 'ammonia-moles',
				text: 'Dividing $25.0$ by $17$ to find moles of ammonia.',
				feedback: 'That correctly converts the given ammonia mass into moles.',
				correct: false
			},
			{
				id: 'ratio-direction',
				text: 'Multiplying ammonia moles by $2/3$ instead of $3/2$.',
				feedback:
					'Exactly: the equation gives three hydrogen molecules for every two ammonia molecules.',
				correct: true
			},
			{
				id: 'hydrogen-mass',
				text: 'Multiplying hydrogen moles by its relative formula mass of $2$.',
				feedback: 'That is the correct final conversion once the hydrogen moles are right.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement uses the balanced equation correctly?',
		repairChoices: [
			{
				id: 'ratio-two-thirds',
				text: 'Multiply $1.47$ by $2/3$ to get $0.98$ mol $\\mathrm{H_2}$.',
				feedback: 'This keeps the ratio reversed, so it still underestimates the hydrogen.',
				correct: false
			},
			{
				id: 'ratio-three-halves',
				text: 'Multiply $1.47$ by $3/2$ to get $2.21$ mol $\\mathrm{H_2}$.',
				feedback: 'This follows the two-ammonia-to-three-hydrogen ratio in the required direction.',
				correct: true
			},
			{
				id: 'relative-mass-ratio',
				text: 'Multiply $1.47$ by $17/2$ to get $12.5$ mol $\\mathrm{H_2}$.',
				feedback: 'Relative formula masses do not replace the balanced-equation mole ratio.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['3/2', '3 ÷ 2', '3:2'],
			['2.21', '2.205', '2.2'],
			['4.41', '4.4']
		],
		repairSuccess:
			'You kept the equation ratio in the product direction and reached $4.41\\,\\mathrm{g}$ of hydrogen.',
		transferPromptLead:
			'Gold reacts with chlorine: $2\\mathrm{Au} + 3\\mathrm{Cl_2} \\rightarrow 2\\mathrm{AuCl_3}$. Which working gives the mass of chlorine needed for $0.175\\,\\mathrm{g}$ of gold? $A_r(\\mathrm{Au}) = 197$ and $A_r(\\mathrm{Cl}) = 35.5$. Give the answer in mg.',
		transferChoices: [
			{
				id: 'transfer-inverted',
				text: '$0.175 \\div 197 = 0.000888$ mol; $0.000888 \\times 2/3 \\times 71 \\times 1000 = 42.0\\,\\mathrm{mg}$.',
				feedback: 'The gold-to-chlorine ratio is $3/2$, not $2/3$.',
				correct: false
			},
			{
				id: 'transfer-skip-ratio',
				text: '$0.175 \\div 197 = 0.000888$ mol; $0.000888 \\times 71 \\times 1000 = 63.1\\,\\mathrm{mg}$.',
				feedback:
					'This assumes equal moles of gold and chlorine instead of applying the equation ratio.',
				correct: false
			},
			{
				id: 'transfer-correct',
				text: '$0.175 \\div 197 = 0.000888$ mol; $0.000888 \\times 3/2 \\times 71 \\times 1000 = 94.6\\,\\mathrm{mg}$.',
				feedback:
					'This finds gold moles, applies the $3:2$ chlorine-to-gold ratio and converts grams to milligrams.',
				correct: true
			}
		],
		transferExplanation:
			'The substances and units changed, but the route stayed fixed: convert gold mass to moles, multiply by $3/2$, use $M_r(\\mathrm{Cl_2}) = 71$, then convert grams to milligrams.',
		memoryHandle: 'Mass → moles → mole ratio → moles → mass'
	},
	{
		...reviewStamp,
		id: 'chemistry-constant-mass',
		slug: 'heat-to-constant-mass',
		subject: 'chemistry',
		title: 'What does a constant mass prove?',
		topic: 'Practical chemistry: heating to constant mass',
		subjectArtTheme: 'practical-analysis',
		hook: 'Repeating the weighing is not busywork. The unchanged result is the evidence.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 1,
		estimatedMinutes: 4,
		previewQuestion:
			'A salt solution is heated in an evaporating dish, cooled and weighed. This is repeated until the mass no longer changes. Why?',
		metaDescription:
			'Try a GCSE Chemistry practical challenge: decide what constant mass shows, improve the weaker explanation and apply the evidence to a dry solid.',
		sourceQuestionId: '84622h-jun24-01-3',
		transferQuestionId: '8464c2h-jun24-06-3',
		staticAnswers: {
			a: 'A constant mass shows that all the water has evaporated, so the remaining salt is dry.',
			b: 'A constant mass shows that the solid has reached room temperature, so it is safe to weigh.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A uses the unchanged mass as evidence that heating no longer removes water and the remaining solid is dry. Cooling is needed before weighing, but a constant mass does not merely prove room temperature.',
		commandWordLesson:
			'“Why” asks what the repeated result demonstrates. Connect the unchanged mass to no more water being removed and therefore to a dry solid.',
		diagnosisPrompt: 'What does Answer B misunderstand about constant mass?',
		diagnosisChoices: [
			{
				id: 'cooling-omitted',
				text: 'It should say the sample is cooled before every weighing.',
				feedback: 'Cooling matters to the method, but it is not what constant mass demonstrates.',
				correct: false
			},
			{
				id: 'temperature-proof',
				text: 'It treats unchanged mass as proof of room temperature.',
				feedback: 'Exactly: unchanged mass shows that heating removes no more water.',
				correct: true
			},
			{
				id: 'balance-precision',
				text: 'It should state the number of decimal places on the balance.',
				feedback: 'Balance precision does not explain the scientific purpose of constant mass.',
				correct: false
			}
		],
		repairPrompt: 'Which change explains the purpose of constant mass?',
		repairChoices: [
			{
				id: 'mass-equals-zero',
				text: 'The mass reaches zero because the whole sample has evaporated.',
				feedback: 'The solid remains; only the water should be removed.',
				correct: false
			},
			{
				id: 'balance-calibrated',
				text: 'The repeated value proves that the balance is perfectly calibrated.',
				feedback: 'Repeated agreement here is evidence about the sample, not perfect calibration.',
				correct: false
			},
			{
				id: 'all-water-removed',
				text: 'No more water is removed, so the remaining solid is dry.',
				feedback: 'This states exactly what the unchanged mass demonstrates.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['all water removed', 'no water remains', 'water has evaporated'],
			['dry', 'dry solid', 'completely dry']
		],
		repairSuccess:
			'You used the unchanged mass as evidence that all water was removed and the solid was dry.',
		transferPromptLead:
			'A student heats and weighs an evaporating basin containing a $100\\,\\mathrm{cm^3}$ seawater sample. How would repeating the heating and weighing improve the method?',
		transferChoices: [
			{
				id: 'all-solid-gone',
				text: 'It proves every dissolved solid has evaporated from the basin.',
				feedback: 'The dissolved solids should remain; heating is used to remove the water.',
				correct: false
			},
			{
				id: 'dry-precipitate',
				text: 'It lets the student heat until constant mass, showing all water has evaporated.',
				feedback: 'Repeated heating and weighing show when water removal is complete.',
				correct: true
			},
			{
				id: 'balance-exact',
				text: 'It proves the balance gives every mass with perfect accuracy.',
				feedback: 'Equal readings do not establish perfect accuracy for the balance.',
				correct: false
			}
		],
		transferExplanation:
			'In the seawater method, repeating the heating and weighing until constant mass shows that all water has evaporated before the dissolved-solid mass is calculated.',
		memoryHandle: 'Heat → reweigh → unchanged mass → dry solid'
	},
	{
		...reviewStamp,
		id: 'chemistry-ionic-bonding',
		slug: 'sodium-chloride-ionic-bond',
		subject: 'chemistry',
		title: 'What actually holds an ionic compound together?',
		topic: 'Bonding, structure and properties: ionic bonding',
		subjectArtTheme: 'particles-bonding',
		hook: 'Electron transfer makes the ions. The attraction between opposite charges makes the bond.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Explain how sodium and chlorine atoms form the ionic compound sodium chloride.',
		metaDescription:
			'Play a GCSE Chemistry ionic bonding challenge: link electron transfer to charged ions and the electrostatic attraction between them.',
		staticAnswers: {
			a: 'Sodium transfers one electron to chlorine. This forms Na+ and Cl− ions, which are held together by strong electrostatic attraction between opposite charges.',
			b: 'Sodium shares one electron with chlorine. This forms neutral molecules, which are held together because their outer electron shells overlap.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A links electron transfer to oppositely charged ions and electrostatic attraction. Answer B describes sharing, which belongs to covalent bonding, and leaves the particles neutral.',
		commandWordLesson:
			'“Explain how” needs both stages: show the electron transfer that produces ions, then name the electrostatic attraction between their opposite charges.',
		diagnosisPrompt: 'Where does Answer B first use the wrong bonding model?',
		diagnosisChoices: [
			{
				id: 'electron-sharing',
				text: 'It says sodium and chlorine share an electron.',
				feedback: 'Correct: ionic bonding begins with electron transfer, not sharing.',
				correct: true
			},
			{
				id: 'outer-shells',
				text: 'It refers to electrons in the outer shells.',
				feedback: 'Outer-shell electrons are relevant; the error is saying they are shared.',
				correct: false
			},
			{
				id: 'two-elements',
				text: 'It describes sodium and chlorine as different elements.',
				feedback: 'They are different elements, so this statement is not the problem.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the correct ionic-bonding sequence?',
		repairChoices: [
			{
				id: 'proton-transfer',
				text: 'Sodium transfers a proton, creating atoms with opposite masses.',
				feedback: 'Bonding changes electrons, not the number of protons in each nucleus.',
				correct: false
			},
			{
				id: 'electron-transfer-attraction',
				text: 'Sodium transfers an electron, forming opposite ions that attract.',
				feedback: 'This links electron transfer to the electrostatic attraction.',
				correct: true
			},
			{
				id: 'electron-pair-molecule',
				text: 'Both atoms contribute an electron to make a shared pair.',
				feedback: 'A shared pair describes a covalent bond rather than an ionic bond.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['transfer', 'transfers', 'transferred'],
			['opposite charges', 'oppositely charged', 'positive and negative'],
			['electrostatic attraction', 'strong attraction']
		],
		repairSuccess:
			'You connected electron transfer to opposite ions and the electrostatic attraction that holds them together.',
		transferPromptLead:
			'Magnesium reacts with oxygen to form magnesium oxide. Which statement uses the same bonding model?',
		transferChoices: [
			{
				id: 'mg-shares',
				text: 'Magnesium and oxygen share electrons to form neutral molecules.',
				feedback: 'That uses a covalent model and does not form the required ions.',
				correct: false
			},
			{
				id: 'oxygen-protons',
				text: 'Oxygen transfers protons to magnesium to create opposite charges.',
				feedback: 'The reaction transfers electrons, not protons.',
				correct: false
			},
			{
				id: 'mg-transfers-two',
				text: 'Magnesium transfers two electrons, forming ions with opposite charges.',
				feedback: 'This correctly applies electron transfer and electrostatic attraction.',
				correct: true
			}
		],
		transferExplanation:
			'The elements changed, but the chain stayed the same: electron transfer makes oppositely charged ions, and electrostatic attraction holds the ionic structure together.',
		memoryHandle: 'Transfer electrons → opposite ions → electrostatic attraction'
	},
	{
		...reviewStamp,
		id: 'chemistry-molten-electrolysis',
		slug: 'molten-lead-bromide-electrolysis',
		subject: 'chemistry',
		title: 'Can you track ions to the right electrode?',
		topic: 'Chemical changes: electrode reactions (HT only)',
		subjectArtTheme: 'practical-analysis',
		hook: 'The electrode names matter less than charge: positive ions go negative, negative ions go positive.',
		arc: 'connect-cause-to-effect',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Molten lead bromide is electrolysed. Explain which product forms at each electrode.',
		metaDescription:
			'Play a GCSE Chemistry Higher electrolysis challenge: track molten ions to opposite electrodes and apply gain or loss of electrons correctly.',
		staticAnswers: {
			a: 'Pb2+ ions move to the positive anode and gain electrons to form lead. Br− ions move to the negative cathode and lose electrons to form bromine.',
			b: 'Pb2+ ions move to the negative cathode and gain electrons to form lead. Br− ions move to the positive anode and lose electrons to form bromine.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers name the products and electron changes correctly. Answer A sends each ion to the electrode with the same charge, although opposite charges attract.',
		commandWordLesson:
			'Track each ion by charge first. Cations move to the negative cathode and gain electrons; anions move to the positive anode and lose electrons.',
		diagnosisPrompt: 'Which step first makes Answer A wrong?',
		diagnosisChoices: [
			{
				id: 'lead-ion-charge',
				text: 'It writes the lead ion as Pb2+.',
				feedback: 'Pb2+ is the correct ion in molten lead bromide.',
				correct: false
			},
			{
				id: 'same-charge-electrode',
				text: 'It sends each ion to an electrode with the same charge.',
				feedback: 'Exactly: ions move towards the oppositely charged electrode.',
				correct: true
			},
			{
				id: 'bromine-product',
				text: 'It identifies bromine as the product from bromide ions.',
				feedback: 'Bromide ions do form bromine after losing electrons.',
				correct: false
			}
		],
		repairPrompt: 'Which routing and electron change is correct?',
		repairChoices: [
			{
				id: 'pb-cathode-gains',
				text: 'Pb2+ goes to the cathode and gains electrons.',
				feedback: 'This correctly uses opposite charge and reduction at the cathode.',
				correct: true
			},
			{
				id: 'pb-anode-loses',
				text: 'Pb2+ goes to the anode and loses electrons.',
				feedback: 'The positive ion is attracted to the negative cathode.',
				correct: false
			},
			{
				id: 'br-cathode-gains',
				text: 'Br− goes to the cathode and gains electrons.',
				feedback: 'The negative ion goes to the positive anode and loses electrons.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['cathode', 'negative electrode'],
			['gain electrons', 'gains electrons', 'reduction'],
			['anode', 'positive electrode'],
			['lose electrons', 'loses electrons', 'oxidation']
		],
		repairSuccess:
			'You used charge to route each ion and matched electron gain to the cathode and loss to the anode.',
		transferPromptLead:
			'Molten zinc chloride contains Zn2+ and Cl− ions. Which products and movements are correct?',
		transferChoices: [
			{
				id: 'zinc-anode',
				text: 'Zinc forms at the anode and chlorine forms at the cathode.',
				feedback: 'The ions have been sent to electrodes with the same charge.',
				correct: false
			},
			{
				id: 'zinc-cathode',
				text: 'Zinc forms at the cathode and chlorine forms at the anode.',
				feedback: 'This correctly routes the positive and negative ions.',
				correct: true
			},
			{
				id: 'chloride-cathode',
				text: 'Chloride gains electrons at the cathode while zinc loses electrons.',
				feedback: 'Chloride loses electrons at the anode; zinc ions gain at the cathode.',
				correct: false
			}
		],
		transferExplanation:
			'For any molten binary ionic compound, cations gain electrons at the cathode to form the metal, while anions lose electrons at the anode.',
		memoryHandle: 'Cation → cathode → gain; anion → anode → lose'
	},
	{
		...reviewStamp,
		id: 'chemistry-exothermic-energy',
		slug: 'exothermic-temperature-rise',
		subject: 'chemistry',
		title: 'Why does an exothermic mixture get warmer?',
		topic: 'Energy changes: exothermic and endothermic reactions',
		subjectArtTheme: 'reactions-energy',
		hook: 'A temperature rise describes the surroundings. It tells you which way energy moved.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'The temperature of a reaction mixture rises from 20 °C to 34 °C. Explain what this shows about energy transfer.',
		metaDescription:
			'Play a GCSE Chemistry energetics challenge: use a temperature rise to identify an exothermic reaction and the direction of energy transfer.',
		staticAnswers: {
			a: 'The reaction is exothermic because it transfers energy to the surroundings. The surroundings warm up, so the measured temperature rises.',
			b: 'The reaction is endothermic because it absorbs energy from the surroundings. The absorbed energy makes the measured temperature rise.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A follows the measured temperature: energy leaves the reacting chemicals and warms the surroundings. Answer B reverses the transfer expected for an endothermic reaction.',
		commandWordLesson:
			'Use the temperature change to identify the direction of energy transfer: warming surroundings means energy was transferred from the reaction to them.',
		diagnosisPrompt: 'Which link in Answer B is reversed?',
		diagnosisChoices: [
			{
				id: 'temperature-rises',
				text: 'It reports that the measured temperature rises.',
				feedback: 'That is the given observation and is not the error.',
				correct: false
			},
			{
				id: 'endothermic-warms',
				text: 'It says absorbing energy makes the surroundings warmer.',
				feedback: 'Correct: absorption from the surroundings would tend to cool them.',
				correct: true
			},
			{
				id: 'energy-transfers',
				text: 'It treats energy as something that can be transferred.',
				feedback: 'Energy transfer is exactly what exothermic and endothermic describe.',
				correct: false
			}
		],
		repairPrompt: 'Which statement matches the temperature evidence?',
		repairChoices: [
			{
				id: 'exo-to-surroundings',
				text: 'The reaction transfers energy to the surroundings, so they warm.',
				feedback: 'This correctly explains the rise as an exothermic energy transfer.',
				correct: true
			},
			{
				id: 'endo-from-surroundings',
				text: 'The reaction takes energy from the surroundings, so they warm.',
				feedback: 'Removing energy from the surroundings would tend to cool them.',
				correct: false
			},
			{
				id: 'no-transfer',
				text: 'No energy transfers; the thermometer creates the extra thermal energy.',
				feedback: 'A thermometer measures temperature rather than supplying the reaction energy.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['exothermic'],
			['energy to surroundings', 'transfers energy to the surroundings', 'energy released'],
			['temperature rises', 'surroundings warm', 'warmer']
		],
		repairSuccess:
			'You used the warmer surroundings to identify energy transfer out of the reaction.',
		transferPromptLead:
			'An instant cold pack becomes colder when its chemicals mix. Which explanation fits the observation?',
		transferChoices: [
			{
				id: 'exo-cools',
				text: 'It is exothermic because energy moves into the surroundings.',
				feedback: 'Energy transferred to the surroundings would warm them.',
				correct: false
			},
			{
				id: 'endo-absorbs',
				text: 'It is endothermic because energy is taken from the surroundings.',
				feedback: 'This explains why the pack and its surroundings become colder.',
				correct: true
			},
			{
				id: 'no-energy',
				text: 'It is neither because temperature changes without any energy transfer.',
				feedback: 'A temperature change is evidence of energy transfer.',
				correct: false
			}
		],
		transferExplanation:
			'Whether the mixture warms or cools, read the surroundings: warming means energy arrives from an exothermic reaction; cooling means an endothermic reaction takes energy.',
		memoryHandle: 'Surroundings warm → exothermic; cool → endothermic'
	},
	{
		...reviewStamp,
		id: 'chemistry-flame-tests',
		slug: 'potassium-flame-test',
		subject: 'chemistry',
		title: 'Can you trust the flame colour?',
		topic: 'Chemical analysis: flame tests',
		subjectArtTheme: 'practical-analysis',
		hook: 'A trace of sodium can hide another ion’s colour. Cleaning the loop protects the evidence.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe how to carry out a flame test and identify a potassium ion in a solid sample.',
		metaDescription:
			'Play a GCSE Chemistry flame-test challenge: prevent contamination, identify potassium by its lilac flame and transfer the method.',
		staticAnswers: {
			a: 'Dip the used wire loop straight into the sample, place it in the blue flame and identify potassium from any bright flame colour.',
			b: 'Clean the wire loop with hydrochloric acid, dip it into the sample, place it in the blue flame and identify potassium from a lilac flame.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Answer B protects the result from contamination and gives potassium’s lilac colour. Answer A reuses a dirty loop and does not match a specific colour to the ion.',
		commandWordLesson:
			'“Describe how” needs a usable method and the observation: clean the loop, add the sample, place it in the flame, then name the ion-specific colour.',
		diagnosisPrompt: 'What most limits the reliability of Answer A?',
		diagnosisChoices: [
			{
				id: 'blue-flame',
				text: 'It uses a blue Bunsen flame for the test.',
				feedback: 'A non-luminous blue flame helps the sample colour remain visible.',
				correct: false
			},
			{
				id: 'dirty-loop',
				text: 'It uses the loop without cleaning away earlier ions.',
				feedback: 'Exactly: contamination can change or mask the observed flame colour.',
				correct: true
			},
			{
				id: 'solid-sample',
				text: 'It begins with a sample that is a solid.',
				feedback: 'A small solid sample can be tested after being placed on the loop.',
				correct: false
			}
		],
		repairPrompt: 'Which addition makes the method and conclusion complete?',
		repairChoices: [
			{
				id: 'wash-water-green',
				text: 'Rinse with water, then identify potassium from a green flame.',
				feedback: 'Potassium gives lilac, and hydrochloric acid is used to clean the loop.',
				correct: false
			},
			{
				id: 'heat-red',
				text: 'Heat the loop red-hot, then identify potassium from a red flame.',
				feedback: 'A red flame indicates lithium rather than potassium.',
				correct: false
			},
			{
				id: 'acid-clean-lilac',
				text: 'Clean with hydrochloric acid, then identify potassium from lilac.',
				feedback: 'This controls contamination and uses the correct positive result.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['hydrochloric acid', 'clean with acid', 'acid-cleaned'],
			['lilac', 'lilac flame'],
			['potassium', 'potassium ion', 'potassium ions']
		],
		repairSuccess:
			'You protected the observation from contamination and matched potassium to a lilac flame.',
		transferPromptLead:
			'A cleaned loop gives a crimson-red flame with a new sample. Which conclusion is justified?',
		transferChoices: [
			{
				id: 'sodium-yellow',
				text: 'Sodium ions are present because sodium gives a yellow flame.',
				feedback: 'Yellow is sodium’s colour, but the observed flame is crimson red.',
				correct: false
			},
			{
				id: 'lithium-red',
				text: 'Lithium ions are present because lithium gives a crimson flame.',
				feedback: 'This matches the observed colour to the correct ion.',
				correct: true
			},
			{
				id: 'potassium-lilac',
				text: 'Potassium ions are present because potassium gives a lilac flame.',
				feedback: 'Lilac is potassium’s colour, not the crimson red observed.',
				correct: false
			}
		],
		transferExplanation:
			'The sample changed, but the evidence rule stayed the same: use a clean loop, observe the flame colour, then match that colour to the metal ion.',
		memoryHandle: 'Clean loop → sample → flame colour → ion'
	},
	{
		...reviewStamp,
		id: 'chemistry-equilibrium-pressure',
		slug: 'equilibrium-pressure-ammonia',
		subject: 'chemistry',
		title: 'Which way does higher pressure move equilibrium?',
		topic: 'Rates and equilibrium: changing pressure (HT only)',
		subjectArtTheme: 'reactions-energy',
		hook: 'Count gas molecules on each side before deciding which direction pressure favours.',
		arc: 'connect-cause-to-effect',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'For $\\mathrm{N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g)}$, explain how increasing pressure changes the equilibrium yield of ammonia.',
		metaDescription:
			'Play a GCSE Chemistry Higher equilibrium challenge: count gas molecules and predict how increased pressure changes ammonia yield.',
		staticAnswers: {
			a: 'There are four gas molecules on the left and two on the right. Higher pressure shifts equilibrium right, towards fewer gas molecules, so ammonia yield increases.',
			b: 'There are four gas molecules on the left and two on the right. Higher pressure shifts equilibrium left, where more particles can collide, so ammonia yield decreases.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers count the gas molecules correctly. Answer B then chooses the side with more gas molecules, while increased pressure favours the side with fewer.',
		commandWordLesson:
			'For a pressure change, count gaseous molecules on both sides, identify the side with fewer, then state the change in equilibrium yield.',
		diagnosisPrompt: 'Which step first makes Answer B wrong?',
		diagnosisChoices: [
			{
				id: 'four-left',
				text: 'It counts four gas molecules on the left side.',
				feedback: 'The equation shows one nitrogen plus three hydrogen molecules.',
				correct: false
			},
			{
				id: 'two-right',
				text: 'It counts two gas molecules on the right side.',
				feedback: 'The equation shows two ammonia molecules on the right.',
				correct: false
			},
			{
				id: 'favours-more',
				text: 'It says higher pressure favours the side with more gas.',
				feedback: 'Correct: higher pressure favours the side with fewer gas molecules.',
				correct: true
			}
		],
		repairPrompt: 'Which replacement gives the correct equilibrium link?',
		repairChoices: [
			{
				id: 'right-fewer',
				text: 'Equilibrium shifts right towards fewer gas molecules, increasing ammonia yield.',
				feedback: 'This correctly applies the effect of increased pressure.',
				correct: true
			},
			{
				id: 'left-more',
				text: 'Equilibrium shifts left towards more gas molecules, decreasing ammonia yield.',
				feedback: 'This is the opposite of the pressure response.',
				correct: false
			},
			{
				id: 'no-shift-collisions',
				text: 'Equilibrium does not shift because both sides contain colliding particles.',
				feedback: 'The unequal gas-molecule counts mean pressure changes the equilibrium position.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['fewer gas molecules', 'fewer moles of gas', 'two gas molecules'],
			['shifts right', 'moves right', 'favours products'],
			['ammonia yield increases', 'more ammonia', 'increased yield']
		],
		repairSuccess:
			'You counted the gases and followed increased pressure towards the side with fewer gas molecules.',
		transferPromptLead:
			'For $\\mathrm{2SO_2(g) + O_2(g) \\rightleftharpoons 2SO_3(g)}$, what does increased pressure do?',
		transferChoices: [
			{
				id: 'left-three',
				text: 'It shifts left because the left has three gas molecules.',
				feedback: 'Higher pressure favours the side with fewer, not more, gas molecules.',
				correct: false
			},
			{
				id: 'right-two',
				text: 'It shifts right because the right has two gas molecules.',
				feedback: 'This correctly favours the side with fewer gas molecules.',
				correct: true
			},
			{
				id: 'unchanged',
				text: 'It stays unchanged because every substance shown is a gas.',
				feedback: 'The gas totals differ, so pressure changes the equilibrium position.',
				correct: false
			}
		],
		transferExplanation:
			'The equation changed, but the decision rule did not: compare the gas totals and follow increased pressure towards the side with fewer gas molecules.',
		memoryHandle: 'Higher pressure → fewer gas molecules'
	},
	{
		...reviewStamp,
		id: 'chemistry-life-cycle',
		slug: 'life-cycle-comparison',
		subject: 'chemistry',
		title: 'Can one “green” feature settle a life-cycle comparison?',
		topic: 'Using resources: life-cycle assessment',
		subjectArtTheme: 'materials-industry',
		hook: 'Biodegradable sounds decisive, but a fair comparison follows both products from raw material to disposal.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A paper bag is biodegradable, while a plastic bag uses less material and can be reused. Explain why this information alone cannot show which has the lower environmental impact.',
		metaDescription:
			'Play a GCSE Chemistry life-cycle challenge: compare products across raw materials, manufacture, use and disposal without relying on one feature.',
		staticAnswers: {
			a: 'The paper bag must have the lower impact because it biodegrades after use. Disposal is the only life-cycle stage that matters for environmental impact.',
			b: 'Neither bag can be judged from one feature. Raw materials, manufacture, transport, use and disposal must be compared for equivalent amounts and uses.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B compares the whole life cycle and asks for a fair basis. Answer A treats one disposal benefit as proof while ignoring impacts in the other stages.',
		commandWordLesson:
			'“Explain why … cannot show” asks you to identify missing evidence. Name the life-cycle stages and the need to compare equivalent quantities and use.',
		diagnosisPrompt: 'What is the decisive weakness in Answer A?',
		diagnosisChoices: [
			{
				id: 'paper-biodegrades',
				text: 'It says that paper can biodegrade after it is used.',
				feedback: 'That can be relevant evidence, but it is only one feature.',
				correct: false
			},
			{
				id: 'one-stage-only',
				text: 'It judges the products using only their disposal stage.',
				feedback: 'Exactly: a life-cycle assessment considers impacts across every stage.',
				correct: true
			},
			{
				id: 'plastic-reusable',
				text: 'It does not assume every plastic bag is reused forever.',
				feedback: 'No product should be given an unrealistic number of uses.',
				correct: false
			}
		],
		repairPrompt: 'Which addition makes the comparison fair?',
		repairChoices: [
			{
				id: 'colour-only',
				text: 'Compare the colours of the bags before measuring any impacts.',
				feedback: 'Colour does not provide a complete environmental comparison.',
				correct: false
			},
			{
				id: 'disposal-only',
				text: 'Compare only how quickly both materials break down after disposal.',
				feedback: 'This still ignores raw materials, manufacture, transport and use.',
				correct: false
			},
			{
				id: 'whole-life-equivalent',
				text: 'Compare every life-cycle stage for equivalent quantities and uses.',
				feedback: 'This gives the full scope and a fair comparison basis.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['raw materials', 'extracting materials'],
			['manufacture', 'manufacturing'],
			['use', 'reuse', 'uses'],
			['disposal', 'end of life', 'recycling']
		],
		repairSuccess:
			'You replaced a one-feature verdict with a whole-life comparison on an equivalent basis.',
		transferPromptLead:
			'A reusable bottle takes more energy to manufacture than a disposable bottle. Which evidence is still needed for a fair comparison?',
		transferChoices: [
			{
				id: 'brand-popularity',
				text: 'Only which bottle brand is more popular with shoppers.',
				feedback: 'Popularity does not measure environmental impact.',
				correct: false
			},
			{
				id: 'full-life-uses',
				text: 'Impacts across all stages and the realistic number of uses.',
				feedback: 'This compares the full life cycle on a meaningful use basis.',
				correct: true
			},
			{
				id: 'manufacture-only',
				text: 'Only the manufacturing energy, because later stages cannot change the result.',
				feedback: 'Transport, reuse and disposal can change the overall comparison.',
				correct: false
			}
		],
		transferExplanation:
			'For bags or bottles, one stage cannot settle the result. Compare raw materials, manufacture, transport, use and disposal for the same service provided.',
		memoryHandle: 'Raw materials → manufacture → use → disposal'
	}
] satisfies ChallengeDefinition[];

const physicsChallenges = [
	{
		...reviewStamp,
		id: 'physics-gas-pressure',
		slug: 'gas-pressure-in-a-syringe',
		subject: 'physics',
		title: 'Why does gas pressure rise in a syringe?',
		topic: 'Particle model: gas pressure',
		subjectArtTheme: 'thermal-particles',
		hook: 'The pressure rises — but the particles do not speed up when temperature stays constant.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A sealed syringe contains a fixed mass of air. The plunger is pushed in slowly, so pressure rises while temperature stays constant. Explain why.',
		metaDescription:
			'Try a GCSE Physics gas-pressure challenge: fix a particle-model explanation for a compressed syringe, then transfer it to a pressure cooker.',
		sourceQuestionId: '84631h-jun24-08-1',
		transferQuestionId: 'aqa-8464p1h-qp-jun22-04-4',
		staticAnswers: {
			a: 'Compression reduces the volume, so particles hit the syringe walls more often. The greater collision rate increases force per unit area and pressure.',
			b: 'Compression reduces the volume, so particles move faster and hit the syringe walls harder. The greater impact force increases pressure.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'The question holds temperature constant, so average particle speed does not increase. Answer A uses the actual change: less volume puts the same particles closer together, increasing the frequency of collisions with the walls and therefore pressure.',
		commandWordLesson:
			'“Explain why” needs the particle explanation, not just “it is compressed”. Name the changed condition, wall collisions and the resulting pressure change.',
		diagnosisPrompt: 'Where does Answer B first go wrong?',
		diagnosisChoices: [
			{
				id: 'fixed-mass',
				text: 'It assumes the same particles remain inside the sealed syringe during compression.',
				feedback: 'That is stated in the question and is a valid assumption.',
				correct: false
			},
			{
				id: 'speed-at-constant-temperature',
				text: 'It claims particle speed rises even though temperature is constant.',
				feedback:
					'Correct: the pressure increase must be explained by reduced volume and collision frequency.',
				correct: true
			},
			{
				id: 'pressure-cannot-change',
				text: 'It says the smaller volume lets particles reach the walls more frequently.',
				feedback:
					'That collision-frequency link is valid; the added claim about speed is the error.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement fixes the particle explanation?',
		repairChoices: [
			{
				id: 'particles-shrink',
				text: 'Replace with: “The particles become smaller, so more of them fit near each wall.”',
				feedback: 'The particles are modelled as unchanged; the spacing changes.',
				correct: false
			},
			{
				id: 'particles-hit-each-other',
				text: 'Replace with: “Particles collide with each other more often, which directly creates pressure.”',
				feedback: 'Pressure is linked to collisions with the container walls.',
				correct: false
			},
			{
				id: 'smaller-volume-wall-collisions',
				text: 'Replace with: “The smaller volume makes particles hit the syringe walls more frequently.”',
				feedback: 'This fixes the exact constant-temperature link.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['smaller volume', 'less volume', 'volume decreases', 'reduced volume'],
			['more frequent collisions', 'collide more often', 'more collisions'],
			['wall', 'walls', 'syringe wall']
		],
		repairSuccess:
			'You kept temperature out of the explanation and connected smaller volume to more frequent wall collisions.',
		transferPromptLead:
			'A sealed pressure cooker gains more steam while the steam also gets hotter. Which particle explanation accounts for its pressure rise?',
		transferChoices: [
			{
				id: 'more-and-faster-particles',
				text: 'More, faster steam particles strike the walls more frequently and forcefully, increasing pressure.',
				feedback: 'This uses both stated changes and links each to wall collisions.',
				correct: true
			},
			{
				id: 'steam-expands-particles',
				text: 'Hotter steam particles expand, so their larger size presses harder against the walls.',
				feedback: 'The particle model does not treat individual particles as expanding.',
				correct: false
			},
			{
				id: 'boiling-label',
				text: 'Hotter steam particles crowd closer together, so their spacing alone raises the pressure.',
				feedback:
					'Heating raises particle speed; the prompt also adds particles as more steam forms.',
				correct: false
			}
		],
		transferExplanation:
			'The syringe changed volume at constant temperature; the cooker changes particle number and speed. In both, finish at more frequent or more forceful wall collisions and higher pressure.',
		memoryHandle: 'Condition → motion/spacing → wall collisions → pressure'
	},
	{
		...reviewStamp,
		id: 'physics-half-range',
		slug: 'half-range-uncertainty',
		subject: 'physics',
		title: 'Uncertainty from repeated readings',
		topic: 'Working scientifically: uncertainty',
		subjectArtTheme: 'radiation-measurement',
		hook: 'Repeated readings give two related values that are easy to confuse.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Repeated accelerations are $1.36$, $1.39$ and $1.33\\,\\mathrm{m\\,s^{-2}}$. Calculate the uncertainty and show your working.',
		metaDescription:
			'Try a GCSE Physics repeated-readings challenge: compare uncertainty calculations, locate the first invalid step and apply the method to new data.',
		sourceQuestionId: '84632h-jun24-05-4',
		transferQuestionId: 'aqa-8464p1h-qp-jun22-04-2',
		staticAnswers: {
			a: 'Range: $1.39 - 1.33 = 0.06\\,\\mathrm{m\\,s^{-2}}$. Uncertainty is the full range, so it is $\\pm 0.06\\,\\mathrm{m\\,s^{-2}}$.',
			b: 'Range: $1.39 - 1.33 = 0.06\\,\\mathrm{m\\,s^{-2}}$. The uncertainty is half the range, so $0.06 \\div 2 = \\pm 0.03\\,\\mathrm{m\\,s^{-2}}$.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers use the same highest and lowest readings and obtain the same range. Their final uncertainty values differ, so the next step is to find where Answer A first stops being valid.',
		commandWordLesson:
			'“Calculate” and “show your working” mean that each stage of the calculation must be visible, followed by the final value, sign and unit.',
		diagnosisPrompt: 'Which line is the first problem in Answer A?',
		diagnosisChoices: [
			{
				id: 'choosing-extremes',
				text: 'Selecting $1.39$ as the highest and $1.33$ as the lowest reading.',
				feedback: 'Those are the correct extreme readings.',
				correct: false
			},
			{
				id: 'subtracting',
				text: 'Subtracting the lowest reading from the highest to find the range.',
				feedback: 'That correctly calculates the range.',
				correct: false
			},
			{
				id: 'reporting-full-range',
				text: 'Reporting the $0.06$ range itself as the uncertainty.',
				feedback:
					'Yes. The range calculation is valid, but the final quantity is not yet the uncertainty.',
				correct: true
			}
		],
		repairPrompt: 'Which line should replace Answer A’s final sentence?',
		repairChoices: [
			{
				id: 'divide-three',
				text: '$\\text{Uncertainty} = 0.06 \\div 3 = \\pm 0.02\\,\\mathrm{m\\,s^{-2}}$.',
				feedback: 'The number of readings does not set this uncertainty; use half the range.',
				correct: false
			},
			{
				id: 'divide-two',
				text: '$\\text{Uncertainty} = 0.06 \\div 2 = \\pm 0.03\\,\\mathrm{m\\,s^{-2}}$.',
				feedback: 'This correction keeps the unit and ± sign.',
				correct: true
			},
			{
				id: 'mean',
				text: '$\\text{Uncertainty} = (1.36 + 1.39 + 1.33) \\div 3$.',
				feedback: 'That calculates the mean, not the uncertainty.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['half', 'divide by 2', 'divided by two', '÷ 2'],
			['0.03'],
			['m/s²', 'm/s^2', 'metres per second squared']
		],
		repairSuccess:
			'You kept the valid range and changed only the final step: halve the range, then include ± and the original unit.',
		transferPromptLead:
			'Four pressure readings are $0.115$, $0.120$, $0.121$ and $0.116\\,\\mathrm{MPa}$. Which value correctly gives the uncertainty in the mean pressure?',
		transferChoices: [
			{
				id: 'plus-minus-003',
				text: '$\\pm 0.003\\,\\mathrm{MPa}$',
				feedback:
					'Range is $0.006\\,\\mathrm{MPa}$; half the range is $\\pm 0.003\\,\\mathrm{MPa}$.',
				correct: true
			},
			{
				id: 'plus-minus-006',
				text: '$\\pm 0.006\\,\\mathrm{MPa}$',
				feedback: 'That is the full range.',
				correct: false
			},
			{
				id: 'plus-minus-118',
				text: '$\\pm 0.118\\,\\mathrm{MPa}$',
				feedback: 'That is close to the mean, not its half-range uncertainty.',
				correct: false
			}
		],
		transferExplanation:
			'The range is $0.121 - 0.115 = 0.006\\,\\mathrm{MPa}$. Half the range is $0.003\\,\\mathrm{MPa}$, so the uncertainty is $\\pm 0.003\\,\\mathrm{MPa}$.',
		memoryHandle: 'Range = highest − lowest; uncertainty = half the range'
	},
	{
		...reviewStamp,
		id: 'physics-weight-equation',
		slug: 'rocket-weight-during-ascent',
		subject: 'physics',
		title: 'Does upward acceleration increase weight?',
		topic: 'Forces: weight, mass and gravitational field strength',
		subjectArtTheme: 'forces-motion',
		hook: 'Acceleration changes the resultant force, but weight still follows W = mg.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A rocket burns a large volume of fuel while accelerating from the ground to 40 km. Explain how its weight changes during the ascent.',
		metaDescription:
			'Try a GCSE Physics weight challenge: separate acceleration from W = mg, explain a rocket’s changing weight and transfer to paperclips.',
		sourceQuestionId: '8464p2h-jun24-06-2',
		transferQuestionId: 'aqa-8464p2h-qp-nov20-01.4',
		staticAnswers: {
			a: 'Weight is W = mg. Burning fuel reduces mass, but upward acceleration increases g by more, so the rocket’s weight increases.',
			b: 'Weight is W = mg. Burning fuel reduces mass and g falls with height, so the rocket’s weight decreases.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers start with W = mg and recognise that fuel loss reduces mass. Answer A then confuses the rocket’s upward acceleration with gravitational field strength. Answer B correctly notes that g falls with height, so both factors reduce weight.',
		commandWordLesson:
			'“Explain how” asks for the direction of change and its reasons. State the governing relationship, then track each variable that changes.',
		diagnosisPrompt: 'What is the core misconception in Answer A?',
		diagnosisChoices: [
			{
				id: 'acceleration-is-weight',
				text: 'It treats the rocket’s upward acceleration as an increase in gravitational field strength.',
				feedback:
					'Correct: weight depends on mass and gravitational field strength, not direction of acceleration.',
				correct: true
			},
			{
				id: 'rockets-have-no-weight',
				text: 'It assumes burning and expelling fuel reduces the rocket’s total mass.',
				feedback:
					'That is a valid part of the explanation because the expelled fuel no longer travels with it.',
				correct: false
			},
			{
				id: 'fuel-has-no-mass',
				text: 'It uses W = mg even though the rocket also has a resultant upward force.',
				feedback:
					'W = mg still defines weight; other forces determine the resultant and acceleration.',
				correct: false
			}
		],
		repairPrompt: 'Which correction connects the answer to W = mg?',
		repairChoices: [
			{
				id: 'speed-makes-weight',
				text: 'Replace with: “The upward thrust and acceleration increase g enough to outweigh the falling mass during the whole ascent”.',
				feedback:
					'Thrust affects resultant acceleration, not the local gravitational field strength g.',
				correct: false
			},
			{
				id: 'acceleration-is-g',
				text: 'Replace with: “Mass falls, but g rises with height, so the weight stays constant.”',
				feedback: 'Gravitational field strength falls rather than rises as height increases.',
				correct: false
			},
			{
				id: 'mass-g-fall',
				text: 'Replace with: “Mass falls as fuel burns and g falls with height, so W = mg decreases”.',
				feedback: 'This corrects the direction and ties it to both relevant variables.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['mass decreases', 'mass falls', 'less mass', 'fuel burns', 'fuel is used'],
			['gravitational field strength decreases', 'g decreases', 'g falls', 'weaker gravity'],
			['weight decreases', 'weight falls', 'less weight']
		],
		repairSuccess:
			'You separated weight from resultant force and followed the variables that actually appear in W = mg.',
		transferPromptLead:
			'Twenty paperclips each have mass 1.0 g. With g = 9.8 N/kg, what total weight can a magnet support?',
		transferChoices: [
			{
				id: '196-newtons',
				text: '196 N',
				feedback: 'This uses grams directly instead of converting to kilograms.',
				correct: false
			},
			{
				id: '0196-newtons',
				text: '0.196 N',
				feedback: '20 × 1.0 g = 0.020 kg, then W = 0.020 × 9.8 = 0.196 N.',
				correct: true
			},
			{
				id: '49-newtons',
				text: '4.9 N',
				feedback: 'This does not use the total mass of 0.020 kg.',
				correct: false
			}
		],
		transferExplanation:
			'The rocket asks for a direction of change and the paperclips ask for a value, but both begin with mass in kilograms and W = mg.',
		memoryHandle: 'Weight follows mass × g'
	},
	{
		...reviewStamp,
		id: 'physics-momentum-sharing',
		slug: 'momentum-shared-in-a-collision',
		subject: 'physics',
		title: 'Why does the moving train slow after a collision?',
		topic: 'Forces: momentum in collisions',
		subjectArtTheme: 'forces-motion',
		hook: 'Energy language sounds plausible, but the question asks you to account for momentum.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A moving toy train collides with a stationary carriage. Explain why the train’s velocity after the collision is lower, using momentum.',
		metaDescription:
			'Practise GCSE Physics momentum: compare collision explanations, fix the conservation link and apply it from a train to bowling.',
		sourceQuestionId: '8464p2h-jun22-03-2',
		transferQuestionId: 'aqa-8464p2h-nov20-04-5',
		staticAnswers: {
			a: 'Total momentum is conserved. The carriage gains momentum, so the train loses momentum; with the train’s mass unchanged, its velocity decreases.',
			b: 'Total momentum decreases during the collision because the carriage gains some. With the train’s mass unchanged, its velocity therefore decreases.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers track the carriage’s gain and connect the train’s lower momentum to lower velocity. The decisive difference is conservation: momentum is redistributed within the train–carriage system, not reduced because the carriage gains some.',
		commandWordLesson:
			'When “use ideas about momentum” appears, name conservation of total momentum and account for both objects. Finish by connecting the momentum change to velocity.',
		diagnosisPrompt: 'Which link is incorrect in Answer B?',
		diagnosisChoices: [
			{
				id: 'train-mass-increases',
				text: 'It assumes the train’s mass remains unchanged throughout the collision.',
				feedback: 'The question gives no mass change for the train.',
				correct: false
			},
			{
				id: 'momentum-transferred',
				text: 'It treats the carriage’s gained momentum as lost from the train–carriage system rather than redistributed.',
				feedback: 'Exactly: this accounts for both objects in the collision.',
				correct: true
			},
			{
				id: 'momentum-destroyed',
				text: 'It connects the train’s lower momentum to lower velocity when its mass is unchanged.',
				feedback: 'That p = mv link is valid; the error occurs earlier in the system total.',
				correct: false
			}
		],
		repairPrompt: 'Which momentum-based replacement completes the explanation?',
		repairChoices: [
			{
				id: 'conserved-sharing',
				text: 'Replace with: “Total momentum stays constant; the carriage gains momentum as the train loses momentum and slows.”',
				feedback: 'This supplies conservation, sharing and the velocity outcome.',
				correct: true
			},
			{
				id: 'energy-conserved-speed',
				text: 'Replace with: “The carriage gains momentum, but the train keeps its original momentum and speed.”',
				feedback: 'This does not account for momentum transferred to the carriage.',
				correct: false
			},
			{
				id: 'force-used-up',
				text: 'Replace with: “Momentum becomes sound energy, reducing the total momentum of both vehicles.”',
				feedback: 'Energy can change form, but total momentum remains conserved in the system.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['momentum conserved', 'conservation of momentum', 'total momentum stays the same'],
			['carriage gains momentum', 'momentum transferred to carriage', 'pin gains momentum'],
			['train loses momentum', 'train momentum decreases', 'ball loses momentum']
		],
		repairSuccess:
			'You fixed the system total: momentum is conserved while being redistributed between the collision partners.',
		transferPromptLead:
			'A bowling ball hits a pin and slows down. Which momentum explanation is complete?',
		transferChoices: [
			{
				id: 'ball-sticks',
				text: 'Total momentum stays constant, but the moving pin gains momentum without the ball losing any.',
				feedback:
					'If the pin gains momentum, the ball must lose momentum within the conserved total.',
				correct: false
			},
			{
				id: 'momentum-lost-system',
				text: 'The ball’s momentum becomes sound energy, so the ball–pin system loses its total momentum.',
				feedback: 'Momentum is conserved even though energy may change form.',
				correct: false
			},
			{
				id: 'pin-gains-ball-loses',
				text: 'Total momentum is conserved; the pin gains momentum, so the ball’s momentum and velocity decrease.',
				feedback: 'This tracks both objects and finishes at the observed slowing.',
				correct: true
			}
		],
		transferExplanation:
			'Train and carriage became ball and pin, but the conserved total still has to be shared: one gains momentum, the other loses it and slows.',
		memoryHandle: 'Total conserved; one gains, one loses'
	},
	{
		...reviewStamp,
		id: 'physics-conductivity-rate',
		slug: 'thermal-conductivity-ice-cream-bowl',
		subject: 'physics',
		title: 'Why does an ice-cream bowl need metal and plastic?',
		topic: 'Energy: thermal conductivity',
		subjectArtTheme: 'thermal-particles',
		hook: 'Naming a conductor and an insulator is not enough until you say which energy transfer each controls.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'An ice-cream bowl has a metal inner surface, cold coolant in its walls and a plastic outer surface. Explain why the different thermal conductivities matter.',
		metaDescription:
			'Try a GCSE Physics thermal-conductivity challenge: connect material, transfer rate and direction, then apply the reasoning to a heat engine.',
		sourceQuestionId: 'aqa-8464p1h-qp-nov20-05-3',
		transferQuestionId: '8464p1h-jun23-06-2',
		staticAnswers: {
			a: 'Metal is a good conductor and plastic is an insulator. These different materials keep the mixture cold inside the machine.',
			b: 'Metal transfers energy quickly from the mixture to the coolant. Plastic transfers energy slowly from the surroundings into the coolant.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Answer A recalls material labels but never explains rate, direction or purpose. Answer B uses high conductivity to speed useful energy transfer out of the mixture and low conductivity to slow unwanted energy transfer in from the surroundings.',
		commandWordLesson:
			'“Explain why … important in the design” needs property → transfer rate and direction → design purpose. Do not stop at “metal conducts”.',
		diagnosisPrompt: 'What does Answer A still need to explain?',
		diagnosisChoices: [
			{
				id: 'metal-colour',
				text: 'How the electrical conductivity of each material makes the cooling system work.',
				feedback: 'The stated property is thermal conductivity, not electrical conductivity.',
				correct: false
			},
			{
				id: 'coolant-freezes',
				text: 'Why plastic prevents all thermal energy transfer once the coolant is cold.',
				feedback: 'Low conductivity slows transfer; it does not reduce the rate to zero.',
				correct: false
			},
			{
				id: 'rate-direction-purpose',
				text: 'How each conductivity changes the rate and direction of useful or unwanted energy transfer.',
				feedback: 'Correct: those links turn material labels into a design explanation.',
				correct: true
			}
		],
		repairPrompt: 'Which addition gives both materials a design purpose?',
		repairChoices: [
			{
				id: 'temperatures-labels',
				text: 'Add: “The metal stays cold while the plastic remains at room temperature around the outside surface”.',
				feedback: 'That describes possible temperatures but not the conductivity effect.',
				correct: false
			},
			{
				id: 'fast-out-slow-in',
				text: 'Add: “Metal transfers energy quickly to coolant; plastic slows energy entering from the surroundings.”',
				feedback: 'This supplies rate, direction and purpose for both surfaces.',
				correct: true
			},
			{
				id: 'plastic-stops-all',
				text: 'Add: “Plastic blocks energy completely while metal stores the cold inside.”',
				feedback: 'Low conductivity reduces the rate; it does not make transfer zero.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			[
				'metal high thermal conductivity',
				'metal conducts quickly',
				'metal transfers energy quickly'
			],
			['mixture to coolant', 'coffee to air', 'energy out of mixture'],
			['plastic low thermal conductivity', 'plastic slows transfer', 'plastic insulates'],
			['surroundings to coolant', 'energy entering', 'from outside']
		],
		repairSuccess:
			'You gave each material a job and followed the direction of thermal energy instead of relying on labels.',
		transferPromptLead:
			'Hot coffee must heat air in a chamber quickly. Why should the chamber bottom be metal rather than plastic?',
		transferChoices: [
			{
				id: 'higher-conductivity-faster',
				text: 'Metal has higher thermal conductivity, so energy transfers from coffee to air faster.',
				feedback: 'This links the material property to rate, direction and purpose.',
				correct: true
			},
			{
				id: 'metal-stores-cold',
				text: 'Metal stores more cold, so the coffee loses energy to it more quickly.',
				feedback:
					'“Cold” is not a stored substance, and this does not explain the required fast heating.',
				correct: false
			},
			{
				id: 'plastic-melts',
				text: 'Plastic has lower conductivity, so it transfers energy from coffee to air more quickly.',
				feedback: 'Lower conductivity would slow the required energy transfer.',
				correct: false
			}
		],
		transferExplanation:
			'The useful direction reversed — out of ice-cream mixture, into chamber air — but high conductivity still means a faster transfer rate.',
		memoryHandle: 'Conductivity sets rate; context sets direction'
	},
	{
		...reviewStamp,
		id: 'physics-motor-force',
		slug: 'motor-effect-force-on-a-wire',
		subject: 'physics',
		title: 'Why does a current-carrying wire move?',
		topic: 'Magnetism: the motor effect',
		subjectArtTheme: 'electricity-magnetism',
		hook: 'Electricity does not simply “push” the wire. Two magnetic fields interact.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'A current-carrying wire is placed between permanent magnets. Explain why there is a force on the wire.',
		metaDescription:
			'Practise the GCSE Physics motor effect: improve an electricity explanation, connect interacting fields to force and apply it to acceleration.',
		sourceQuestionId: '8464p2h-jun22-04-1',
		transferQuestionId: '8464p2h-jun23-04-3',
		staticAnswers: {
			a: 'The current creates a magnetic field around the wire. The permanent magnet attracts the current and pulls the wire sideways.',
			b: 'The current creates a magnetic field around the wire. It interacts with the permanent magnet’s field, producing a force on the wire.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers recognise the magnetic field produced by the current. Answer A then treats current itself as something a magnet attracts. Answer B gives the motor-effect cause: the current’s field interacts with the permanent magnet’s field.',
		commandWordLesson:
			'For “explain why there is a force”, connect the current-carrying conductor and magnetic field through their interaction. Naming current alone does not explain the force.',
		diagnosisPrompt: 'Which causal claim needs replacing in Answer A?',
		diagnosisChoices: [
			{
				id: 'field-interaction',
				text: 'The current’s magnetic field interacts with the permanent magnet’s magnetic field.',
				feedback: 'Exactly: that interaction produces the force.',
				correct: true
			},
			{
				id: 'wire-charged',
				text: 'The permanent magnet attracts the copper conductor because copper becomes magnetic.',
				feedback: 'The force is not explained by copper becoming a magnetic material.',
				correct: false
			},
			{
				id: 'gravity-reverses',
				text: 'Moving charges build up on one side, creating an electrostatic force across the wire.',
				feedback: 'That is not the magnetic motor-effect mechanism described here.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the physical explanation?',
		repairChoices: [
			{
				id: 'electrons-heavy',
				text: 'Replace with: “Moving charges make one side of the wire electrically positive”.',
				feedback: 'That does not cause the observed sideways motor force.',
				correct: false
			},
			{
				id: 'magnet-attracts-copper',
				text: 'Replace with: “The permanent magnet magnetises the copper and then attracts it”.',
				feedback: 'Copper is not simply pulled as a magnetic material in this demonstration.',
				correct: false
			},
			{
				id: 'two-fields-interact',
				text: 'Replace with: “The current’s magnetic field interacts with the permanent magnetic field, causing a force”.',
				feedback: 'This adds the exact missing cause without unnecessary detail.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['magnetic field from current', 'current produces a magnetic field', 'current’s field'],
			['permanent magnetic field', 'field from the magnet', 'magnet’s field'],
			['interact', 'interaction']
		],
		repairSuccess:
			'You replaced a vague push with the motor-effect explanation: current in field → fields interact → force.',
		transferPromptLead:
			'A copper rod accelerates when current passes through it in a permanent magnetic field. Which change increases its acceleration?',
		transferChoices: [
			{
				id: 'heavier-rod',
				text: 'Increase the rod’s mass while keeping the current and magnetic field unchanged.',
				feedback: 'For the same force, greater mass would reduce acceleration.',
				correct: false
			},
			{
				id: 'increase-current',
				text: 'Increase the current while keeping the rod’s mass and magnetic field unchanged.',
				feedback: 'A larger force on the same rod produces greater acceleration.',
				correct: true
			},
			{
				id: 'remove-magnet',
				text: 'Reduce the magnetic field strength while keeping the current and rod unchanged.',
				feedback: 'Without the external magnetic field, the motor-effect force is lost.',
				correct: false
			}
		],
		transferExplanation:
			'The first question explains where the force comes from; the transfer asks how to strengthen it and connect the larger force to acceleration.',
		memoryHandle: 'Current in field → interaction → force → motion'
	},
	{
		...reviewStamp,
		id: 'physics-parallel-currents',
		slug: 'currents-in-parallel-branches',
		subject: 'physics',
		title: 'Where does current add in a parallel circuit?',
		topic: 'Electricity: parallel circuits',
		subjectArtTheme: 'electricity-magnetism',
		hook: 'The identical branches match each other — but not the current before the split.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'Two identical lamps are in parallel. I₁ is the main current before the junction; I₂ and I₃ are the branch currents. Compare all three.',
		metaDescription:
			'Mark a GCSE Physics parallel-circuit answer, fix the current-at-a-junction step and apply the rule to identical resistors.',
		sourceQuestionId: '8464p1h-jun18-06-2',
		transferQuestionId: 'aqa-8464p1h-nov21-05-4',
		staticAnswers: {
			a: 'The identical branches carry equal currents, so I₂ = I₃. Current is shared equally, so I₁ = I₂ = I₃.',
			b: 'The identical branches carry equal currents, so I₂ = I₃. Junction currents add, so I₁ = I₂ + I₃ = 2I₂.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Answer A is correct until its final equality. Identical branches do carry equal currents, but the main current supplies both branches, so it is their sum rather than equal to either one.',
		commandWordLesson:
			'“Compare” means state exact relationships, not just “bigger” or “shared”. Use equal p.d. across parallel branches and conservation of current at junctions.',
		diagnosisPrompt: 'Which is the first invalid statement in Answer A?',
		diagnosisChoices: [
			{
				id: 'all-currents-equal',
				text: 'The final claim that all three currents are equal: I₁ = I₂ = I₃.',
				feedback: 'Correct: I₂ = I₃, but I₁ is their sum.',
				correct: true
			},
			{
				id: 'branches-identical',
				text: 'The claim that the two parallel branches contain identical components.',
				feedback: 'That is given by the two identical lamps.',
				correct: false
			},
			{
				id: 'branch-currents-equal',
				text: 'The claim that the identical branches carry equal currents: I₂ = I₃.',
				feedback: 'Equal components at the same p.d. carry equal branch currents.',
				correct: false
			}
		],
		repairPrompt: 'Which single replacement fixes the final line?',
		repairChoices: [
			{
				id: 'current-used-up',
				text: 'Replace it with: “Current is used up at the junction, so I₂ + I₃ = 0”.',
				feedback: 'Current is not consumed at a junction.',
				correct: false
			},
			{
				id: 'main-is-sum',
				text: 'Replace it with: “I₁ = I₂ + I₃, and because I₂ = I₃, I₁ = 2I₂.”',
				feedback: 'This preserves the valid equality and fixes the junction relationship.',
				correct: true
			},
			{
				id: 'branches-series',
				text: 'Replace it with: “I₁ is smaller than each branch current because current divides”.',
				feedback: 'The lamps are explicitly in parallel.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['i₁ = i₂ + i₃', 'i1 = i2 + i3', 'main current is the sum', 'branch currents add'],
			['i₂ = i₃', 'i2 = i3', 'branch currents are equal'],
			['twice', '2i₂', '2i2', 'double']
		],
		repairSuccess:
			'You stopped at the first wrong equality and replaced only that line: equal branches, adding currents at the junction.',
		transferPromptLead:
			'Circuit A has one resistor. Circuit B has two identical resistors in parallel across the same ideal battery. How do the meter readings compare?',
		transferChoices: [
			{
				id: 'both-half',
				text: 'The voltage stays the same, but the main current halves in circuit B.',
				feedback: 'Parallel branches each get the full battery p.d.',
				correct: false
			},
			{
				id: 'voltage-double-current-same',
				text: 'The voltage doubles, but the main current stays the same in circuit B.',
				feedback: 'The battery p.d. stays the same; the extra identical branch adds current.',
				correct: false
			},
			{
				id: 'same-voltage-double-current',
				text: 'The voltage stays the same, but the main current doubles in circuit B.',
				feedback: 'Each branch draws the A current, and the two branch currents add.',
				correct: true
			}
		],
		transferExplanation:
			'The labels changed from three currents to meter readings, but parallel branches still share p.d. and their currents add in the main wire.',
		memoryHandle: 'Parallel: same p.d.; junction: currents add'
	},
	{
		...reviewStamp,
		id: 'physics-resultant-acceleration',
		slug: 'resultant-force-on-a-trolley',
		subject: 'physics',
		title: 'Why does a trolley speed up on a hard floor?',
		topic: 'Forces: resultant force and acceleration',
		subjectArtTheme: 'forces-motion',
		hook: 'Less resistance matters because it changes the resultant — not because resistance vanishes.',
		arc: 'track-the-forces',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'A loaded trolley is pushed from carpet onto a hard floor with the same horizontal force. Explain why its speed increases.',
		metaDescription:
			'Try a GCSE Physics resultant-force challenge: connect lower resistance to acceleration, then apply the reasoning to a trolley on a slope.',
		sourceQuestionId: '84632h-jun24-02-4',
		transferQuestionId: '84632h-jun24-05-5',
		staticAnswers: {
			a: 'On the hard floor the resistive force is smaller. With the same push, the trolley has less friction and can move faster.',
			b: 'On the hard floor the resistive force is smaller. The same push gives a larger resultant force, so the trolley accelerates.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Answer A identifies one changed force but stops before combining it with the unchanged push. Answer B finds the larger forward resultant and then links that resultant to acceleration and increased speed.',
		commandWordLesson:
			'For “explain why the speed increased”, track forces all the way to motion: changed opposing force → changed resultant force → acceleration → speed change.',
		diagnosisPrompt: 'What link is missing after “less friction”?',
		diagnosisChoices: [
			{
				id: 'mass-falls',
				text: 'The trolley’s mass decreases when it moves from carpet onto the hard floor.',
				feedback: 'Changing surface does not change the trolley’s mass.',
				correct: false
			},
			{
				id: 'friction-pushes',
				text: 'The smaller resistive force changes direction and begins pushing the trolley forward.',
				feedback: 'The resistive force opposes the motion; it is simply smaller.',
				correct: false
			},
			{
				id: 'larger-resultant',
				text: 'The unchanged push minus less resistance gives a larger forward resultant force.',
				feedback: 'Exactly: that larger resultant causes acceleration.',
				correct: true
			}
		],
		repairPrompt: 'Which addition completes the force-to-motion explanation?',
		repairChoices: [
			{
				id: 'resultant-accelerates',
				text: 'Add: “The unchanged push gives a larger forward resultant, so the trolley accelerates”.',
				feedback: 'This combines the forces and reaches the observed motion.',
				correct: true
			},
			{
				id: 'no-forces',
				text: 'Add: “The hard floor removes every resistive force, so only the push acts”.',
				feedback: 'The push, resistance, weight and support forces still act.',
				correct: false
			},
			{
				id: 'constant-resultant',
				text: 'Add: “The resultant force stays unchanged, but the trolley still accelerates forward”.',
				feedback: 'With the same drive and less resistance, the resultant changes.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['larger resultant force', 'resultant force increases', 'greater net force'],
			['forward', 'in direction of motion'],
			['accelerates', 'acceleration increases', 'speeds up']
		],
		repairSuccess:
			'You combined the unchanged push and reduced resistance before describing the acceleration they cause.',
		transferPromptLead:
			'A trolley is pulled down a runway by 2.0 N. The trolley end is raised, adding a component of its weight down the runway. What happens?',
		transferChoices: [
			{
				id: 'mass-grows',
				text: 'The raised runway increases the trolley’s mass, so its acceleration decreases.',
				feedback: 'Tilting the runway does not change trolley mass.',
				correct: false
			},
			{
				id: 'resultant-and-acceleration-grow',
				text: 'The weight component adds to the pull, so resultant force and acceleration increase.',
				feedback: 'This combines the aligned forces and follows the larger resultant to motion.',
				correct: true
			},
			{
				id: 'same-pull-same-acceleration',
				text: 'The 2.0 N pull stays unchanged, so the resultant force and acceleration stay unchanged.',
				feedback: 'The pull is only one force; the added weight component changes the resultant.',
				correct: false
			}
		],
		transferExplanation:
			'One context reduces an opposing force; the other adds a force in the motion direction. Both increase the resultant force and therefore acceleration for fixed mass.',
		memoryHandle: 'Combine forces first; predict motion second'
	},
	{
		...reviewStamp,
		id: 'physics-radiation-risk',
		slug: 'x-ray-screen-radiation-dose',
		subject: 'physics',
		title: 'Why does a radiographer use a screen?',
		topic: 'Atomic structure: radiation dose and risk',
		subjectArtTheme: 'radiation-measurement',
		hook: 'The screen reduces external irradiation; it is not cleaning up contamination.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A patient receives 0.5 mSv during an X-ray. A radiographer takes many images each day. Explain why the radiographer stands behind a protective screen.',
		metaDescription:
			'Practise GCSE Physics radiation safety: distinguish irradiation from contamination, connect shielding to dose and transfer the link to distance.',
		sourceQuestionId: 'aqa-8464p2h-qp-nov20-05.2',
		transferQuestionId: '8464p1h-jun19-06-4',
		staticAnswers: {
			a: 'Many images could give the radiographer a large total dose. The screen absorbs some X-rays, reducing the dose received and therefore the risk of harm.',
			b: 'Many images could give the radiographer a large total dose. The screen blocks the radiation, preventing any X-rays from reaching them.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers connect repeated imaging to a large total dose. The decisive difference is the shield claim: Answer A says it absorbs some X-rays and reduces dose and risk; Answer B overclaims that it prevents every X-ray reaching the radiographer.',
		commandWordLesson:
			'“Explain why” needs the full protection reasoning: exposure condition → dose → how the control reduces dose → reduced risk. Avoid saying a shield removes all risk.',
		diagnosisPrompt: 'Which claim in Answer B is not justified?',
		diagnosisChoices: [
			{
				id: 'x-rays-radioactive',
				text: 'It treats repeated exposures as contributing to the radiographer’s total received dose.',
				feedback: 'That cumulative-dose link is valid for someone taking many images.',
				correct: false
			},
			{
				id: 'repeated-dose-shield-risk',
				text: 'It says the screen prevents all exposure instead of absorbing some X-rays and reducing dose.',
				feedback:
					'Correct: shielding reduces dose and risk but does not justify an absolute zero-exposure claim.',
				correct: true
			},
			{
				id: 'screen-shortens-half-life',
				text: 'It links a lower received dose to a lower probability of harm for the radiographer.',
				feedback:
					'That dose–risk relationship is valid; only the total-blocking claim needs correcting.',
				correct: false
			}
		],
		repairPrompt: 'Which change makes the shielding claim accurate?',
		repairChoices: [
			{
				id: 'screen-stops-all',
				text: 'Replace with: “The screen blocks every X-ray, so the radiographer’s risk becomes zero”.',
				feedback:
					'Protective screens reduce exposure; absolute zero-risk language is not justified.',
				correct: false
			},
			{
				id: 'contamination',
				text: 'Replace with: “The screen prevents radioactive X-ray material contaminating the radiographer”.',
				feedback: 'The hazard here is external X-ray irradiation, not contamination by material.',
				correct: false
			},
			{
				id: 'absorbs-dose',
				text: 'Replace with: “The screen absorbs some X-rays, reducing the dose received and risk of harm”.',
				feedback:
					'This preserves the valid dose context and corrects only the absolute shield claim.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['many x-rays', 'repeated exposure', 'cumulative exposure', 'many images'],
			['absorbs', 'attenuates', 'blocks some', 'shield'],
			['lower dose', 'reduces dose', 'less radiation received'],
			['lower risk', 'reduces risk', 'less chance of harm']
		],
		repairSuccess:
			'You kept the cumulative-dose reasoning and replaced an absolute claim with the accurate shielding link: less exposure, lower dose, lower risk.',
		transferPromptLead:
			'A teacher measures gamma radiation through lead and stands as far from the apparatus as possible. Why?',
		transferChoices: [
			{
				id: 'distance-reduces-dose',
				text: 'Greater distance reduces the radiation dose received and lowers the risk of harm.',
				feedback: 'Distance changes exposure, which changes dose and risk.',
				correct: true
			},
			{
				id: 'distance-prevents-contamination',
				text: 'Greater distance prevents radioactive atoms entering the teacher and removes contamination risk.',
				feedback: 'The setup presents an external irradiation hazard, not stated contamination.',
				correct: false
			},
			{
				id: 'distance-changes-isotope',
				text: 'Greater distance makes the lanthanum decay faster, shortening the teacher’s exposure time.',
				feedback: 'Distance does not change the isotope’s decay rate.',
				correct: false
			}
		],
		transferExplanation:
			'Screening and distance are different controls, but both reduce received dose and therefore reduce the probability of harm.',
		memoryHandle: 'Control exposure → lower dose → lower risk'
	},
	{
		...reviewStamp,
		id: 'physics-drag-balance',
		slug: 'parachute-terminal-velocity',
		subject: 'physics',
		title: 'Why do parachutes lower terminal velocity?',
		topic: 'Forces: drag and terminal velocity',
		subjectArtTheme: 'forces-motion',
		hook: 'More drag is only the start. Terminal velocity is set by where drag balances weight.',
		arc: 'track-the-forces',
		mechanic: 'missing-link',
		difficulty: 'stretch',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A falling passenger module uses parachutes and has a lower terminal velocity than it would without them. Explain why.',
		metaDescription:
			'Try a GCSE Physics terminal-velocity challenge: connect parachute area, drag and balanced forces, then apply the reasoning to a swimmer.',
		sourceQuestionId: '8464p2h-jun24-06-4',
		transferQuestionId: 'aqa-8464p2h-qp-jun18-07-2',
		staticAnswers: {
			a: 'Larger parachutes create more drag at any speed. Drag stays greater than weight, so the module keeps slowing throughout its descent.',
			b: 'Larger parachutes create a given drag at a lower speed. Drag balances weight sooner, so the module reaches a lower constant terminal speed.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers connect larger parachutes to greater drag. Answer A then incorrectly keeps drag greater than weight forever. Answer B follows the forces to their new balance, which occurs at a lower constant terminal speed.',
		commandWordLesson:
			'To “explain why … lower terminal velocity”, end at the new balance condition. Mention how the change affects drag, when forces become equal and what zero resultant means for motion.',
		diagnosisPrompt: 'Which terminal-velocity link needs correcting in Answer A?',
		diagnosisChoices: [
			{
				id: 'balance-at-lower-speed',
				text: 'Drag eventually equals weight, giving zero resultant at a lower constant speed.',
				feedback: 'Exactly: this explains the new terminal value rather than only a slowdown.',
				correct: true
			},
			{
				id: 'parachute-reduces-weight',
				text: 'The larger parachute reduces the module’s weight until it matches the drag.',
				feedback: 'Opening a parachute chiefly changes area and drag, not weight.',
				correct: false
			},
			{
				id: 'all-forces-stop',
				text: 'Both drag and weight fall to zero when the lower terminal speed is reached.',
				feedback: 'Weight and drag still act; they are balanced.',
				correct: false
			}
		],
		repairPrompt: 'Which addition explains the lower terminal speed?',
		repairChoices: [
			{
				id: 'drag-greater-forever',
				text: 'Replace with: “Drag remains greater than weight, so the module slows to rest”.',
				feedback: 'That would keep producing a resultant and would not be terminal motion.',
				correct: false
			},
			{
				id: 'area-balance-lower',
				text: 'Replace with: “The larger area makes drag equal weight at a lower speed, which then stays constant”.',
				feedback: 'This connects area, force balance and the new terminal velocity.',
				correct: true
			},
			{
				id: 'balanced-means-stop',
				text: 'Replace with: “Drag becomes greater than weight, so the module falls at constant speed”.',
				feedback: 'Zero resultant means zero acceleration, not necessarily zero velocity.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['larger area', 'greater area', 'increased surface area', 'parachute area'],
			['drag equals weight', 'air resistance balances weight', 'forces balance'],
			['lower speed', 'slower speed', 'lower velocity'],
			['constant speed', 'constant velocity', 'zero acceleration']
		],
		repairSuccess:
			'You completed the terminal-motion explanation: larger area → balance reached at lower speed → zero acceleration at that speed.',
		transferPromptLead:
			'A swimmer increases forward Force A. Resistive Force B initially stays smaller but rises with speed. What happens?',
		transferChoices: [
			{
				id: 'stops-immediately',
				text: 'The swimmer slows to rest because the two forces act in opposite directions.',
				feedback: 'Opposing forces only stop acceleration when they are equal.',
				correct: false
			},
			{
				id: 'accelerates-forever',
				text: 'The swimmer keeps accelerating because Force A stays larger than Force B at every speed.',
				feedback: 'As speed rises, resistive Force B also rises.',
				correct: false
			},
			{
				id: 'higher-constant-speed',
				text: 'The swimmer accelerates; B rises until it equals A, then motion continues at a higher constant speed.',
				feedback: 'This follows the changing drag to the new balanced-force condition.',
				correct: true
			}
		],
		transferExplanation:
			'Parachute area and swimmer thrust change different forces, but terminal or steady motion still begins when resistance grows to balance the driving force or weight.',
		memoryHandle: 'Change → drag responds → forces balance → constant speed'
	},
	{
		...reviewStamp,
		lastReviewed: '2026-07-21',
		version: 2,
		id: 'physics-thinking-distance',
		slug: 'extra-thinking-distance',
		subject: 'physics',
		title: 'Which reaction time belongs in the calculation?',
		topic: 'Forces: stopping and thinking distance',
		subjectArtTheme: 'forces-motion',
		hook: 'The multiplication is right. The time placed into it is not.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'A driver at 15 m/s becomes tired, increasing reaction time from 0.50 s to 0.82 s. Determine the extra distance travelled before braking.',
		metaDescription:
			'Mark a GCSE Physics thinking-distance calculation, fix the reaction-time change and apply the equation to a second driving case.',
		sourceQuestionId: 'aqa-8464p2h-qp-jun18-06-1',
		transferQuestionId: '8464p2h-jun22-06-1',
		staticAnswers: {
			a: 'The new reaction time is 0.82 s, so extra thinking distance = 15 × 0.82 = 12.3 m.',
			b: 'The extra reaction time = 0.82 − 0.50 = 0.32 s. The extra thinking distance = 15 × 0.32 = 4.8 m.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Answer A correctly uses distance = speed × time but inserts the whole tired reaction time. The question asks for extra distance, so Answer B first finds the increase in reaction time and multiplies by speed.',
		commandWordLesson:
			'Watch comparison words in “determine”: extra, increase and change require a difference before the usual equation is applied. Show that difference explicitly.',
		diagnosisPrompt: 'Where does Answer A first go wrong?',
		diagnosisChoices: [
			{
				id: 'using-distance-equation',
				text: 'Using the relationship distance = speed × reaction time for the calculation.',
				feedback: 'That is the correct relationship for thinking distance.',
				correct: false
			},
			{
				id: 'using-15',
				text: 'Using the stated constant speed of 15 m/s in the calculation.',
				feedback: 'That is the stated car speed.',
				correct: false
			},
			{
				id: 'using-total-time',
				text: 'Using the total 0.82 s instead of the increase 0.82 − 0.50 s.',
				feedback: 'Correct: “extra” requires the change in reaction time.',
				correct: true
			}
		],
		repairPrompt: 'Which one-line edit fixes the working?',
		repairChoices: [
			{
				id: 'multiply-time-change',
				text: 'Replace 15 × 0.82 with 15 × (0.82 − 0.50) = 4.8 m.',
				feedback: 'This preserves the right equation and fixes only the chosen time.',
				correct: true
			},
			{
				id: 'divide-speed',
				text: 'Replace it with 15 ÷ (0.82 − 0.50) = 46.9 m.',
				feedback: 'Thinking distance is speed multiplied by reaction time.',
				correct: false
			},
			{
				id: 'subtract-speed',
				text: 'Replace it with 15 − (0.82 − 0.50) = 14.68 m.',
				feedback: 'Speed and time cannot be subtracted to obtain a distance.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['0.82 - 0.50', '0.82−0.50', 'difference in reaction time', 'change in reaction time'],
			['0.32'],
			['15 × 0.32', '15*0.32', 'speed times extra time'],
			['4.8 m', '4.8 metres']
		],
		repairSuccess:
			'You kept the correct distance equation and fixed the earlier interpretation of “extra”.',
		transferPromptLead:
			'A car travelling at 30 m/s has a thinking distance of 21 m. Using distance = speed × time, what is the driver’s reaction time?',
		transferChoices: [
			{
				id: '143-seconds',
				text: '30 ÷ 21 = 1.43 s',
				feedback: 'To find time, divide distance by speed, not speed by distance.',
				correct: false
			},
			{
				id: '070-seconds',
				text: '21 ÷ 30 = 0.70 s',
				feedback: 'Rearranging d = vt gives t = d/v.',
				correct: true
			},
			{
				id: '630-seconds',
				text: '21 × 30 = 630 s',
				feedback:
					'Multiplication finds distance when speed and time are known; here time is unknown.',
				correct: false
			}
		],
		transferExplanation:
			'The first question selects a time difference before multiplying; the transfer rearranges the same d = vt relationship to recover time.',
		memoryHandle: 'Thinking distance = speed × reaction time'
	},
	{
		...reviewStamp,
		id: 'physics-zero-resultant',
		slug: 'zero-resultant-balanced-forces',
		subject: 'physics',
		title: 'Forces on a stationary parcel',
		topic: 'Forces: balanced forces and motion',
		subjectArtTheme: 'forces-motion',
		hook: 'A stationary object can still have several forces acting on it.',
		arc: 'track-the-forces',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'A parcel rests on a level bench. What is the resultant vertical force on the parcel? Give a reason.',
		metaDescription:
			'Try a GCSE Physics balanced-forces challenge: compare two reasons for a zero resultant, identify the first error and apply the idea to motion.',
		sourceQuestionId: '84632h-jun24-02-1',
		transferQuestionId: 'aqa-8464p2h-qp-jun18-01-1',
		staticAnswers: {
			a: 'The resultant vertical force is 0 N because the upward support force balances the parcel’s downward weight.',
			b: 'The resultant vertical force is 0 N because there are no vertical forces on the parcel.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers give the same resultant, but only one justifies it using forces that actually act on the parcel. The next step is to test Answer B’s reason.',
		commandWordLesson:
			'“Give a reason” means justify the numerical result by identifying the relevant forces and explaining their combined effect.',
		diagnosisPrompt: 'Which statement identifies the problem with Answer B’s reason?',
		diagnosisChoices: [
			{
				id: 'resultant-not-zero',
				text: 'It says the parcel has a downward resultant because its weight acts downward.',
				feedback: 'A persistent downward resultant would produce downward acceleration.',
				correct: false
			},
			{
				id: 'forces-balance',
				text: 'It treats zero resultant as if no vertical forces act at all.',
				feedback:
					'Yes. Zero describes the combined effect of the vertical forces, not their absence.',
				correct: true
			},
			{
				id: 'support-is-horizontal',
				text: 'It says the bench’s support force acts horizontally rather than vertically.',
				feedback: 'The bench supports the parcel vertically.',
				correct: false
			}
		],
		repairPrompt: 'Which sentence should replace Answer B’s reason?',
		repairChoices: [
			{
				id: 'weight-disappears',
				text: 'The parcel’s weight becomes zero because the parcel is stationary on the bench.',
				feedback: 'Gravity still acts on a stationary parcel.',
				correct: false
			},
			{
				id: 'stationary-no-force-law',
				text: 'The support force and weight cancel, so neither individual force still exists.',
				feedback: 'Balanced forces still act even though their combined effect is zero.',
				correct: false
			},
			{
				id: 'up-balances-down',
				text: 'The upward support force equals the downward weight, so their resultant is zero.',
				feedback: 'This states the individual forces and why their resultant is zero.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['weight', 'gravity', 'downward force'],
			['support force', 'normal contact force', 'upward force', 'reaction force'],
			['balance', 'equal and opposite', 'same size opposite direction']
		],
		repairSuccess:
			'You kept the correct 0 N result and replaced the false “no forces” reason with the two balancing vertical forces.',
		transferPromptLead:
			'A glider is already moving on a frictionless air track. Its pulling mass reaches the ground, so the horizontal pull is removed. What happens next, and why?',
		transferChoices: [
			{
				id: 'constant-velocity',
				text: 'The glider continues at constant velocity because the resultant force and acceleration are zero.',
				feedback:
					'Correct. With no horizontal resultant, acceleration is zero and the existing velocity stays unchanged.',
				correct: true
			},
			{
				id: 'stops-instantly',
				text: 'The glider stops immediately because zero resultant force means that its velocity is zero.',
				feedback:
					'Zero resultant means zero acceleration, not zero velocity; stopping requires a resultant opposite the motion.',
				correct: false
			},
			{
				id: 'keeps-accelerating',
				text: 'The glider keeps accelerating because it retains the acceleration caused by the earlier pull.',
				feedback:
					'Acceleration depends on the current resultant force, so it becomes zero when the pull is removed.',
				correct: false
			}
		],
		transferExplanation:
			'After the pull is removed on the frictionless track, the horizontal resultant and acceleration are zero. The glider’s existing velocity therefore stays constant.',
		memoryHandle: 'Zero resultant → zero acceleration → velocity unchanged'
	}
] satisfies ChallengeDefinition[];

export const challengeCatalog: readonly ChallengeDefinition[] = [
	...biologyChallenges,
	...biologyExpansion,
	...chemistryChallenges,
	...chemistryExpansion,
	...physicsChallenges,
	...physicsExpansion
];

export function challengeByRoute(subject: string, slug: string): ChallengeDefinition | undefined {
	const normalizedSubject = subject.trim().toLowerCase();
	const normalizedSlug = slug.trim().toLowerCase();
	return challengeCatalog.find(
		(challenge) => challenge.subject === normalizedSubject && challenge.slug === normalizedSlug
	);
}

export function challengesForSubject(subject: string): ChallengeDefinition[] {
	const normalizedSubject = subject.trim().toLowerCase();
	return challengeCatalog.filter((challenge) => challenge.subject === normalizedSubject);
}
