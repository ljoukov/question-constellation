export type SubjectId = 'biology' | 'chemistry' | 'physics' | 'english' | 'history';

export type Subject = {
	id: SubjectId;
	name: string;
	shortName: string;
	description: string;
	tone: 'green' | 'blue' | 'violet' | 'orange' | 'gold';
	icon: 'leaf' | 'flask' | 'atom' | 'book' | 'crown';
};

export type Pattern = {
	id: string;
	subjectId: SubjectId;
	title: string;
	parts: string[];
	icon: 'link' | 'cycle' | 'network' | 'quote' | 'line' | 'nodes';
	discoveredFromFamilyId: string;
	mastery: number;
	usedCount: number;
	savedAt: string;
	summary: string;
	topics: string[];
	questionFamilies: string[];
};

export type TransferDistance = 'near' | 'stretch' | 'exam-transfer';

export type QuestionFamily = {
	id: string;
	subjectId: SubjectId;
	topic: string;
	title: string;
	prompt: string;
	meta: string;
	context: string;
	checks: string[];
	practiceSteps: Array<{
		id: string;
		label: string;
		question: string;
		hint: string;
		repair: string;
		answerFragment: string;
	}>;
	revealedPatternId: string;
	transferQuestions: Array<{
		id: string;
		subjectId: SubjectId;
		topic: string;
		title: string;
		distance: TransferDistance;
		description: string;
	}>;
};

export type ProgressSummary = {
	questionsPractised: number;
	patternsSaved: number;
	topicsExplored: number;
	dayStreak: number;
};

export type HomeData = {
	subjects: Subject[];
	suggestedSubject: Subject;
	suggestedFamily: QuestionFamily;
	subjectFamilyLinks: Record<SubjectId, string>;
	featuredPatterns: Pattern[];
	progress: ProgressSummary;
};

export type PracticeData = {
	subjects: Subject[];
	subject: Subject;
	family: QuestionFamily;
	revealedPattern: Pattern;
	relatedFamilies: QuestionFamily[];
};

export type ThinkingMemoryData = {
	subjects: Subject[];
	patterns: Pattern[];
	groupedPatterns: Array<{
		subject: Subject;
		patterns: Pattern[];
	}>;
	selectedPattern: Pattern;
	sourceFamily: QuestionFamily;
	recentlySaved: Pattern[];
	recentlyUsed: Pattern[];
	crossSubjectLinks: Array<{
		from: Pattern;
		to: Pattern;
		reason: string;
	}>;
};

const subjects: Subject[] = [
	{
		id: 'biology',
		name: 'Biology',
		shortName: 'Biology',
		description: 'Life processes, cells and living systems.',
		tone: 'green',
		icon: 'leaf'
	},
	{
		id: 'chemistry',
		name: 'Chemistry',
		shortName: 'Chemistry',
		description: 'Atoms, reactions and everyday materials.',
		tone: 'blue',
		icon: 'flask'
	},
	{
		id: 'physics',
		name: 'Physics',
		shortName: 'Physics',
		description: 'Energy, forces and how the world works.',
		tone: 'violet',
		icon: 'atom'
	},
	{
		id: 'english',
		name: 'English',
		shortName: 'English',
		description: 'Texts, ideas and how meaning is created.',
		tone: 'orange',
		icon: 'book'
	},
	{
		id: 'history',
		name: 'History',
		shortName: 'History',
		description: 'Events, change and historical interpretations.',
		tone: 'gold',
		icon: 'crown'
	}
];

const patterns: Pattern[] = [
	{
		id: 'cause-process-effect',
		subjectId: 'biology',
		title: 'Cause -> process -> effect',
		parts: ['Cause', 'process', 'effect'],
		icon: 'link',
		discoveredFromFamilyId: 'blood-flow-heart',
		mastery: 4,
		usedCount: 8,
		savedAt: '2h ago',
		summary:
			'Use this when one change leads to another through a biological or scientific process.',
		topics: ['Circulation', 'Respiration', 'Photosynthesis', 'Enzymes'],
		questionFamilies: [
			'Blood flow and the heart',
			'Gas exchange in lungs',
			'How plants make food',
			'Enzyme control reactions'
		]
	},
	{
		id: 'change-response',
		subjectId: 'biology',
		title: 'Change -> response',
		parts: ['Change', 'response'],
		icon: 'cycle',
		discoveredFromFamilyId: 'blood-glucose-control',
		mastery: 4,
		usedCount: 3,
		savedAt: '4h ago',
		summary: 'Use this when a stimulus, condition or variable changes and the system responds.',
		topics: ['Homeostasis', 'Hormones', 'Plant responses'],
		questionFamilies: ['Blood glucose control', 'Temperature regulation', 'Phototropism']
	},
	{
		id: 'substance-cell-energy-effect',
		subjectId: 'biology',
		title: 'Substance -> cell process -> energy -> effect',
		parts: ['Substance', 'cell process', 'energy', 'effect'],
		icon: 'network',
		discoveredFromFamilyId: 'exercise-respiration',
		mastery: 3,
		usedCount: 3,
		savedAt: 'Yesterday',
		summary: 'Trace a substance into a cell-level process before explaining the visible outcome.',
		topics: ['Glucose', 'Mitochondria', 'Respiration'],
		questionFamilies: ['Exercise and respiration', 'Photosynthesis products', 'Cell metabolism']
	},
	{
		id: 'structure-property',
		subjectId: 'chemistry',
		title: 'Structure -> property',
		parts: ['Structure', 'property'],
		icon: 'line',
		discoveredFromFamilyId: 'giant-covalent-hardness',
		mastery: 4,
		usedCount: 6,
		savedAt: 'Yesterday',
		summary: 'Connect the arrangement of particles or bonds to an observable material property.',
		topics: ['Bonding', 'Polymers', 'States of matter'],
		questionFamilies: [
			'Giant covalent structures',
			'Simple molecular substances',
			'Metal properties'
		]
	},
	{
		id: 'particle-movement-property',
		subjectId: 'chemistry',
		title: 'Particle arrangement -> movement -> property',
		parts: ['Particle arrangement', 'movement', 'property'],
		icon: 'nodes',
		discoveredFromFamilyId: 'melting-boiling-points',
		mastery: 3,
		usedCount: 3,
		savedAt: '2 days ago',
		summary: 'Explain a bulk property by first describing how particles are arranged and move.',
		topics: ['Solids', 'Liquids', 'Gases'],
		questionFamilies: ['Melting and boiling points', 'Diffusion', 'Density']
	},
	{
		id: 'evidence-method-effect',
		subjectId: 'english',
		title: 'Evidence -> method -> effect',
		parts: ['Evidence', 'method', 'effect'],
		icon: 'network',
		discoveredFromFamilyId: 'macbeth-tension',
		mastery: 3,
		usedCount: 7,
		savedAt: '2 days ago',
		summary: 'Move from a quotation to the writer method and then to the reader or meaning effect.',
		topics: ['Language analysis', 'Character', 'Theme'],
		questionFamilies: ['Analysing imagery', 'Narrative voice', 'Tension in extracts']
	},
	{
		id: 'quote-inference-judgement',
		subjectId: 'english',
		title: 'Quote -> inference -> judgement',
		parts: ['Quote', 'inference', 'judgement'],
		icon: 'quote',
		discoveredFromFamilyId: 'character-motivation',
		mastery: 3,
		usedCount: 5,
		savedAt: '3 days ago',
		summary: 'Use a short quotation to support an inference before making a precise judgement.',
		topics: ['Essay paragraphs', 'Evaluation', 'Context'],
		questionFamilies: ['Character motivation', 'Theme comparison', 'Writer intention']
	},
	{
		id: 'evidence-inference-judgement',
		subjectId: 'physics',
		title: 'Evidence -> inference -> judgement',
		parts: ['Evidence', 'inference', 'judgement'],
		icon: 'nodes',
		discoveredFromFamilyId: 'force-extension-graph',
		mastery: 3,
		usedCount: 6,
		savedAt: '3 days ago',
		summary:
			'Start with measured evidence, infer what it shows, then choose the strongest conclusion.',
		topics: ['Practical skills', 'Graphs', 'Forces'],
		questionFamilies: ['Interpreting graphs', 'Required practicals', 'Uncertainty']
	},
	{
		id: 'event-change-consequence',
		subjectId: 'history',
		title: 'Event -> change -> consequence',
		parts: ['Event', 'change', 'consequence'],
		icon: 'cycle',
		discoveredFromFamilyId: 'treaty-versailles-impact',
		mastery: 3,
		usedCount: 4,
		savedAt: '4 days ago',
		summary:
			'Use this when an event changes conditions and creates short or long-term consequences.',
		topics: ['Peace treaties', 'Inter-war Europe', 'Causes of conflict'],
		questionFamilies: ['Treaty of Versailles', 'League of Nations', 'Road to war']
	}
];

const questionFamilies: QuestionFamily[] = [
	{
		id: 'blood-flow-heart',
		subjectId: 'biology',
		topic: 'Circulation',
		title: 'Blood flow and the heart',
		prompt: 'Explain why reduced blood flow to the heart can cause chest pain.',
		meta: 'Exam style - 6 marks',
		context:
			'A coronary artery can become narrowed. Less oxygenated blood reaches part of the heart muscle during exercise.',
		checks: [
			'Real GCSE question',
			'Guided reasoning repair',
			'Pattern revealed after practice',
			'Transfer to nearby and harder examples'
		],
		practiceSteps: [
			{
				id: 'cause',
				label: 'Find the concrete cause',
				question: 'What is the first concrete change in the question?',
				hint: 'Do not start with pain. Start with the physical change in blood supply.',
				repair: 'Reduced blood flow means less oxygen reaches the heart muscle cells.',
				answerFragment: 'Reduced blood flow lowers oxygen supply to heart muscle cells.'
			},
			{
				id: 'process',
				label: 'Build the process chain',
				question: 'What process inside the cells is affected by less oxygen?',
				hint: 'Connect oxygen to aerobic respiration and energy release.',
				repair:
					'Less oxygen reduces aerobic respiration, so less energy is released for contraction.',
				answerFragment: 'Less oxygen means less aerobic respiration and less energy release.'
			},
			{
				id: 'effect',
				label: 'Name the final effect',
				question: 'How does that process explain the symptom?',
				hint: 'Finish with the visible effect asked for in the question.',
				repair:
					'The heart muscle cannot contract normally and waste products may build up, causing chest pain.',
				answerFragment:
					'The muscle cannot work normally and pain is felt because the tissue is under stress.'
			}
		],
		revealedPatternId: 'cause-process-effect',
		transferQuestions: [
			{
				id: 'gas-exchange-lungs',
				subjectId: 'biology',
				topic: 'Respiration',
				title: 'Explain how reduced gas exchange affects exercise.',
				distance: 'near',
				description: 'Same cause-process-effect chain, still in Biology and respiration.'
			},
			{
				id: 'photosynthesis-light',
				subjectId: 'biology',
				topic: 'Photosynthesis',
				title: 'Explain why lower light intensity reduces plant growth.',
				distance: 'stretch',
				description: 'Same hidden logic, but the process is photosynthesis rather than respiration.'
			},
			{
				id: 'reaction-rate-temperature',
				subjectId: 'chemistry',
				topic: 'Rates of reaction',
				title: 'Explain why a lower temperature slows a reaction.',
				distance: 'exam-transfer',
				description: 'Harder transfer: a different subject, but still cause -> process -> effect.'
			}
		]
	},
	{
		id: 'blood-glucose-control',
		subjectId: 'biology',
		topic: 'Homeostasis',
		title: 'Blood glucose control',
		prompt: 'Explain how the body responds when blood glucose concentration rises after a meal.',
		meta: 'Exam style - 5 marks',
		context: 'After eating, glucose from digested carbohydrate is absorbed into the blood.',
		checks: [
			'Start with the change',
			'Name the body response',
			'Explain how conditions return to normal',
			'Reveal the response pattern'
		],
		practiceSteps: [
			{
				id: 'change',
				label: 'Spot the change',
				question: 'What variable has changed in the question?',
				hint: 'Look for the thing the body needs to control.',
				repair: 'Blood glucose concentration has risen above its normal level.',
				answerFragment: 'After the meal, blood glucose concentration increases.'
			},
			{
				id: 'detect',
				label: 'Find the response',
				question: 'Which organ and hormone respond to this change?',
				hint: 'The pancreas detects the change and releases a hormone.',
				repair: 'The pancreas releases insulin in response to the higher blood glucose.',
				answerFragment: 'The pancreas responds by releasing insulin.'
			},
			{
				id: 'restore',
				label: 'Restore the level',
				question: 'How does that response bring the condition back towards normal?',
				hint: 'Connect insulin to glucose moving into cells or storage.',
				repair:
					'Insulin causes cells to take up glucose and the liver to store glucose as glycogen.',
				answerFragment: 'Cells take in more glucose, so blood glucose falls back towards normal.'
			}
		],
		revealedPatternId: 'change-response',
		transferQuestions: [
			{
				id: 'temperature-sweating',
				subjectId: 'biology',
				topic: 'Homeostasis',
				title: 'Explain why sweating increases when body temperature rises.',
				distance: 'near',
				description: 'Same change -> response structure inside Biology.'
			},
			{
				id: 'plant-phototropism',
				subjectId: 'biology',
				topic: 'Plant responses',
				title: 'Explain how shoots respond to light from one side.',
				distance: 'stretch',
				description: 'Still Biology, but the response is growth rather than hormone control.'
			},
			{
				id: 'rate-equilibrium',
				subjectId: 'chemistry',
				topic: 'Equilibrium',
				title: 'Explain how a reversible reaction responds to a condition change.',
				distance: 'exam-transfer',
				description: 'Different subject, but the reasoning still starts with a change and response.'
			}
		]
	},
	{
		id: 'exercise-respiration',
		subjectId: 'biology',
		topic: 'Respiration',
		title: 'Exercise and respiration',
		prompt: 'Explain why muscles need more glucose during exercise.',
		meta: 'Exam style - 4 marks',
		context: 'During exercise, muscle cells contract more often and need more energy.',
		checks: [
			'Trace the substance',
			'Connect it to a cell process',
			'Explain energy release',
			'Finish with the effect'
		],
		practiceSteps: [
			{
				id: 'substance',
				label: 'Trace the substance',
				question: 'Which substance does the muscle need more of?',
				hint: 'Start with the named fuel in the question.',
				repair: 'Muscle cells need more glucose.',
				answerFragment: 'More glucose is supplied to muscle cells.'
			},
			{
				id: 'cell-process',
				label: 'Link to cell process',
				question: 'What process uses glucose inside cells?',
				hint: 'Name the process that releases energy from glucose.',
				repair: 'Glucose is used in respiration inside the muscle cells.',
				answerFragment: 'Glucose is used for respiration.'
			},
			{
				id: 'energy-effect',
				label: 'Explain the effect',
				question: 'How does that help the muscles during exercise?',
				hint: 'Finish by connecting energy release to contraction.',
				repair: 'Respiration releases energy so muscles can keep contracting.',
				answerFragment: 'More energy is released, allowing muscles to contract repeatedly.'
			}
		],
		revealedPatternId: 'substance-cell-energy-effect',
		transferQuestions: [
			{
				id: 'photosynthesis-glucose',
				subjectId: 'biology',
				topic: 'Photosynthesis',
				title: 'Explain why glucose made in photosynthesis is useful to a plant.',
				distance: 'near',
				description: 'Same substance -> cell process -> effect chain.'
			},
			{
				id: 'fermentation-yeast',
				subjectId: 'biology',
				topic: 'Microbiology',
				title: 'Explain how yeast uses sugar during fermentation.',
				distance: 'stretch',
				description: 'Still cell-level reasoning, but a different organism and process.'
			},
			{
				id: 'battery-reactants',
				subjectId: 'chemistry',
				topic: 'Electrochemistry',
				title: 'Explain why changing reactants changes a cell voltage.',
				distance: 'exam-transfer',
				description: 'Hard transfer from cell biology into chemical energy reasoning.'
			}
		]
	},
	{
		id: 'giant-covalent-hardness',
		subjectId: 'chemistry',
		topic: 'Bonding',
		title: 'Giant covalent structures',
		prompt: 'Explain why diamond has a very high melting point.',
		meta: 'Exam style - 4 marks',
		context: 'Diamond is made of carbon atoms arranged in a giant covalent structure.',
		checks: [
			'Concrete material first',
			'Guided structure reasoning',
			'Property pattern revealed',
			'Transfer to other materials'
		],
		practiceSteps: [
			{
				id: 'structure',
				label: 'Describe the structure',
				question: 'What is the arrangement of atoms and bonds in diamond?',
				hint: 'Start with the structure, not the melting point.',
				repair: 'Each carbon atom forms strong covalent bonds in a giant lattice.',
				answerFragment: 'Diamond has a giant covalent lattice with many strong covalent bonds.'
			},
			{
				id: 'energy',
				label: 'Connect structure to energy',
				question: 'What must happen to melt the substance?',
				hint: 'Melting requires overcoming bonds or forces.',
				repair: 'A lot of energy is needed to break the many strong covalent bonds.',
				answerFragment: 'A large amount of energy is needed to overcome those bonds.'
			},
			{
				id: 'property',
				label: 'State the property',
				question: 'How does that explain the high melting point?',
				hint: 'Now name the property asked about.',
				repair: 'Because so much energy is needed, diamond has a very high melting point.',
				answerFragment: 'This gives diamond a very high melting point.'
			}
		],
		revealedPatternId: 'structure-property',
		transferQuestions: [
			{
				id: 'graphite-conductivity',
				subjectId: 'chemistry',
				topic: 'Bonding',
				title: 'Explain why graphite conducts electricity.',
				distance: 'near',
				description: 'Same structure -> property reasoning in the same topic.'
			},
			{
				id: 'polymers-flexible',
				subjectId: 'chemistry',
				topic: 'Polymers',
				title: 'Explain why some polymers are flexible.',
				distance: 'stretch',
				description: 'Still Chemistry, but the structure is chains rather than a lattice.'
			},
			{
				id: 'alveoli-surface-area',
				subjectId: 'biology',
				topic: 'Gas exchange',
				title: 'Explain how alveoli are adapted for gas exchange.',
				distance: 'exam-transfer',
				description: 'Different subject, same move: structure explains function or property.'
			}
		]
	},
	{
		id: 'melting-boiling-points',
		subjectId: 'chemistry',
		topic: 'States of matter',
		title: 'Melting and boiling points',
		prompt: 'Explain why a simple molecular substance has a low boiling point.',
		meta: 'Exam style - 4 marks',
		context:
			'Simple molecular substances are made of small molecules with weak forces between them.',
		checks: [
			'Describe particle arrangement',
			'Connect movement or separation',
			'Explain the observed property',
			'Transfer to other particle models'
		],
		practiceSteps: [
			{
				id: 'arrangement',
				label: 'Describe arrangement',
				question: 'What particles or forces should you describe first?',
				hint: 'Focus on what is between molecules, not the bonds inside them.',
				repair: 'There are weak intermolecular forces between small molecules.',
				answerFragment: 'The substance has weak forces between molecules.'
			},
			{
				id: 'movement',
				label: 'Connect movement',
				question: 'What must particles do when the substance boils?',
				hint: 'Boiling separates molecules from each other.',
				repair: 'Only a small amount of energy is needed to overcome the weak forces.',
				answerFragment: 'The molecules can separate easily because the forces are weak.'
			},
			{
				id: 'property',
				label: 'State the property',
				question: 'How does that explain the low boiling point?',
				hint: 'End with the property named in the question.',
				repair: 'Because little energy is needed, the substance has a low boiling point.',
				answerFragment: 'This means it boils at a low temperature.'
			}
		],
		revealedPatternId: 'particle-movement-property',
		transferQuestions: [
			{
				id: 'diffusion-gases',
				subjectId: 'chemistry',
				topic: 'Particles',
				title: 'Explain why gases diffuse faster at higher temperatures.',
				distance: 'near',
				description: 'Same particle movement reasoning in Chemistry.'
			},
			{
				id: 'density-solids-liquids',
				subjectId: 'chemistry',
				topic: 'Density',
				title: 'Explain why particle spacing affects density.',
				distance: 'stretch',
				description: 'Same model, but the property is density rather than boiling point.'
			},
			{
				id: 'osmosis-water-potential',
				subjectId: 'biology',
				topic: 'Transport in cells',
				title: 'Explain why water moves into a cell by osmosis.',
				distance: 'exam-transfer',
				description: 'Harder transfer from particle movement into a Biology transport question.'
			}
		]
	},
	{
		id: 'force-extension-graph',
		subjectId: 'physics',
		topic: 'Forces',
		title: 'Force and extension graphs',
		prompt: 'Use the graph to decide whether the spring obeys Hooke’s law.',
		meta: 'Required practical - 4 marks',
		context: 'A student records extension as different forces are added to a spring.',
		checks: [
			'Start with graph evidence',
			'Make the inference explicit',
			'Finish with a justified judgement',
			'Transfer to practical questions'
		],
		practiceSteps: [
			{
				id: 'evidence',
				label: 'Quote the evidence',
				question: 'What graph feature should you use first?',
				hint: 'Look for proportionality: straight line through the origin.',
				repair: 'The graph is a straight line through the origin for the first part.',
				answerFragment: 'The first part is a straight line through the origin.'
			},
			{
				id: 'inference',
				label: 'Make the inference',
				question: 'What does that evidence show about force and extension?',
				hint: 'Say how the variables are related.',
				repair: 'Extension is proportional to force while the graph stays straight.',
				answerFragment: 'Extension is proportional to force in that region.'
			},
			{
				id: 'judgement',
				label: 'Make the judgement',
				question: 'So does the spring obey Hooke’s law?',
				hint: 'Limit your judgement to the region supported by the evidence.',
				repair: 'It obeys Hooke’s law only up to the limit of proportionality.',
				answerFragment: 'It obeys Hooke’s law up to the limit of proportionality.'
			}
		],
		revealedPatternId: 'evidence-inference-judgement',
		transferQuestions: [
			{
				id: 'cooling-curve',
				subjectId: 'physics',
				topic: 'Energy',
				title: 'Use a cooling curve to identify a change of state.',
				distance: 'near',
				description: 'Same graph-evidence move in Physics.'
			},
			{
				id: 'enzyme-graph',
				subjectId: 'biology',
				topic: 'Enzymes',
				title: 'Use an enzyme graph to judge the optimum temperature.',
				distance: 'stretch',
				description: 'Different topic, same evidence -> inference -> judgement structure.'
			},
			{
				id: 'english-evidence-judgement',
				subjectId: 'english',
				topic: 'Language analysis',
				title: 'Use evidence to judge how a writer creates tension.',
				distance: 'exam-transfer',
				description: 'Hard transfer into written analysis using the same reasoning shape.'
			}
		]
	},
	{
		id: 'macbeth-tension',
		subjectId: 'english',
		topic: 'Language analysis',
		title: 'How writers create tension',
		prompt: 'Explain how the writer creates tension in this extract.',
		meta: 'Exam style - 8 marks',
		context: 'The extract uses short sentences, violent imagery, and a shift in pace.',
		checks: [
			'Concrete evidence first',
			'Method named after evidence',
			'Effect explained',
			'Transfer to unseen extracts'
		],
		practiceSteps: [
			{
				id: 'evidence',
				label: 'Choose evidence',
				question: 'Which detail from the text should you start with?',
				hint: 'Pick a short quotation or precise textual detail.',
				repair: 'The short sentence creates a sudden pause in the action.',
				answerFragment: 'The writer uses a short sentence at a tense moment.'
			},
			{
				id: 'method',
				label: 'Name the method',
				question: 'What method is the writer using?',
				hint: 'Move from what you noticed to the writer’s technique.',
				repair: 'The method is sentence structure and pacing.',
				answerFragment: 'This use of sentence structure changes the pace.'
			},
			{
				id: 'effect',
				label: 'Explain the effect',
				question: 'What does this make the reader feel or understand?',
				hint: 'Finish with the reader effect or meaning.',
				repair: 'The pause makes the moment feel more dramatic and uncertain.',
				answerFragment: 'The reader feels suspense because the action briefly stops.'
			}
		],
		revealedPatternId: 'evidence-method-effect',
		transferQuestions: [
			{
				id: 'poetry-imagery',
				subjectId: 'english',
				topic: 'Poetry',
				title: 'Explain how imagery shapes mood in a poem.',
				distance: 'near',
				description: 'Same evidence -> method -> effect pattern in English.'
			},
			{
				id: 'history-source-tone',
				subjectId: 'history',
				topic: 'Source analysis',
				title: 'Explain how a source’s wording reveals attitude.',
				distance: 'stretch',
				description: 'Different subject, but still evidence, method and effect.'
			},
			{
				id: 'biology-adaptation-effect',
				subjectId: 'biology',
				topic: 'Adaptations',
				title: 'Explain how a feature helps an organism survive.',
				distance: 'exam-transfer',
				description:
					'Harder transfer: evidence becomes a feature, effect becomes survival advantage.'
			}
		]
	},
	{
		id: 'character-motivation',
		subjectId: 'english',
		topic: 'Character analysis',
		title: 'Character motivation',
		prompt: 'Use a quotation to judge what motivates a character in this extract.',
		meta: 'Exam style - 6 marks',
		context: 'The character speaks politely but repeats words that reveal anxiety and ambition.',
		checks: [
			'Choose a precise quote',
			'Make an inference',
			'Build a judgement',
			'Transfer to essay paragraphs'
		],
		practiceSteps: [
			{
				id: 'quote',
				label: 'Choose the quote',
				question: 'Which textual detail should anchor the answer?',
				hint: 'Use a short phrase that can support a clear inference.',
				repair: 'The repeated phrase suggests the character is trying to convince themselves.',
				answerFragment: 'The repeated phrase shows the idea matters to the character.'
			},
			{
				id: 'inference',
				label: 'Make the inference',
				question: 'What does that quotation suggest about motivation?',
				hint: 'Move beyond spotting language into what it reveals.',
				repair: 'It suggests the character is anxious but determined to gain status.',
				answerFragment: 'This suggests ambition is mixed with insecurity.'
			},
			{
				id: 'judgement',
				label: 'Make the judgement',
				question: 'What overall judgement can you make?',
				hint: 'Use the inference to answer the exam question directly.',
				repair:
					'The character is motivated by ambition, but the language shows that confidence is fragile.',
				answerFragment: 'Overall, the character is driven by ambition but not fully confident.'
			}
		],
		revealedPatternId: 'quote-inference-judgement',
		transferQuestions: [
			{
				id: 'theme-comparison',
				subjectId: 'english',
				topic: 'Theme',
				title: 'Use a quotation to compare how two texts present power.',
				distance: 'near',
				description: 'Same quote -> inference -> judgement structure in English.'
			},
			{
				id: 'history-source-motive',
				subjectId: 'history',
				topic: 'Source analysis',
				title: 'Use a source detail to judge the author’s motive.',
				distance: 'stretch',
				description: 'Different subject, but a quote still supports an inference and judgement.'
			},
			{
				id: 'physics-practical-conclusion',
				subjectId: 'physics',
				topic: 'Required practicals',
				title: 'Use a result to judge whether a method is reliable.',
				distance: 'exam-transfer',
				description: 'Hard transfer from literary evidence into scientific evaluation.'
			}
		]
	},
	{
		id: 'treaty-versailles-impact',
		subjectId: 'history',
		topic: 'Peace treaties',
		title: 'Consequences of the Treaty of Versailles',
		prompt: 'Explain one way the Treaty of Versailles affected Germany.',
		meta: 'Exam style - 6 marks',
		context: 'The treaty imposed reparations, territorial losses, and military restrictions.',
		checks: [
			'Start with a concrete event',
			'Describe the change it caused',
			'Explain the consequence',
			'Transfer to other cause questions'
		],
		practiceSteps: [
			{
				id: 'event',
				label: 'Name the event',
				question: 'Which treaty term will you use as the concrete starting point?',
				hint: 'Choose one term rather than listing all of them.',
				repair: 'Germany had to pay reparations after the treaty.',
				answerFragment: 'The treaty required Germany to pay reparations.'
			},
			{
				id: 'change',
				label: 'Explain the change',
				question: 'What did that term change inside Germany?',
				hint: 'Describe the pressure it created.',
				repair: 'The payments put economic pressure on the government and people.',
				answerFragment: 'This created economic pressure and resentment.'
			},
			{
				id: 'consequence',
				label: 'State the consequence',
				question: 'What was the historical consequence?',
				hint: 'Connect the change to political or social impact.',
				repair: 'It increased resentment towards the treaty and weakened trust in the government.',
				answerFragment: 'This helped create resentment and political instability.'
			}
		],
		revealedPatternId: 'event-change-consequence',
		transferQuestions: [
			{
				id: 'league-failure',
				subjectId: 'history',
				topic: 'League of Nations',
				title: 'Explain one consequence of the League failing to act.',
				distance: 'near',
				description: 'Same event -> change -> consequence move in History.'
			},
			{
				id: 'industrial-revolution',
				subjectId: 'history',
				topic: 'Industrial change',
				title: 'Explain how industrialisation changed working lives.',
				distance: 'stretch',
				description: 'Same pattern, but a broader change over time.'
			},
			{
				id: 'biology-antibiotic-resistance',
				subjectId: 'biology',
				topic: 'Natural selection',
				title: 'Explain how antibiotic use can lead to resistant bacteria.',
				distance: 'exam-transfer',
				description: 'Different subject, same chain from event to change to consequence.'
			}
		]
	}
];

const progress: ProgressSummary = {
	questionsPractised: 0,
	patternsSaved: 0,
	topicsExplored: 0,
	dayStreak: 0
};

function subjectById(subjectId: SubjectId): Subject {
	const subject = subjects.find((item) => item.id === subjectId);
	if (!subject) {
		throw new Error(`Unknown subject: ${subjectId}`);
	}
	return subject;
}

function patternById(patternId: string): Pattern {
	const pattern = patterns.find((item) => item.id === patternId);
	if (!pattern) {
		throw new Error(`Unknown pattern: ${patternId}`);
	}
	return pattern;
}

function familyById(familyId: string): QuestionFamily {
	const family = questionFamilies.find((item) => item.id === familyId);
	if (!family) {
		throw new Error(`Unknown question family: ${familyId}`);
	}
	return family;
}

function firstFamilyForSubject(subjectId: SubjectId): QuestionFamily {
	const family = questionFamilies.find((item) => item.subjectId === subjectId);
	if (!family) {
		throw new Error(`No starter family for subject: ${subjectId}`);
	}
	return family;
}

function subjectFamilyLinks(): Record<SubjectId, string> {
	return Object.fromEntries(
		subjects.map((subject) => [subject.id, firstFamilyForSubject(subject.id).id])
	) as Record<SubjectId, string>;
}

function familySubjectMap(): Record<string, SubjectId> {
	return Object.fromEntries(
		questionFamilies.map((family) => [family.id, family.subjectId])
	) as Record<string, SubjectId>;
}

export function getSubjects(): Subject[] {
	return subjects;
}

export function getSubjectFamilyLinks(): Record<SubjectId, string> {
	return subjectFamilyLinks();
}

export function getFamilySubjectMap(): Record<string, SubjectId> {
	return familySubjectMap();
}

export function getHomeData(): HomeData {
	return {
		subjects,
		suggestedSubject: subjectById('biology'),
		suggestedFamily: familyById('blood-flow-heart'),
		subjectFamilyLinks: subjectFamilyLinks(),
		featuredPatterns: [
			patterns.find((pattern) => pattern.id === 'cause-process-effect'),
			patterns.find((pattern) => pattern.id === 'structure-property'),
			patterns.find((pattern) => pattern.id === 'evidence-inference-judgement')
		].filter(Boolean) as Pattern[],
		progress
	};
}

export function getPracticeData(familyId: string): PracticeData {
	const family = familyById(familyId);
	const revealedPattern = patternById(family.revealedPatternId);
	return {
		subjects,
		subject: subjectById(family.subjectId),
		family,
		revealedPattern,
		relatedFamilies: questionFamilies.filter(
			(item) => item.subjectId === family.subjectId && item.id !== family.id
		)
	};
}

export function getThinkingMemoryData(): ThinkingMemoryData {
	const visibleSubjectIds: SubjectId[] = ['biology', 'chemistry', 'physics', 'english', 'history'];
	const groupedPatterns = visibleSubjectIds.map((subjectId) => {
		return {
			subject: subjectById(subjectId),
			patterns: patterns.filter((pattern) => pattern.subjectId === subjectId)
		};
	});
	const selectedPattern =
		patterns.find((pattern) => pattern.id === 'cause-process-effect') ?? patterns[0];
	const sourceFamily = familyById(selectedPattern.discoveredFromFamilyId);

	return {
		subjects,
		patterns,
		groupedPatterns,
		selectedPattern,
		sourceFamily,
		recentlySaved: patterns.slice(0, 4),
		recentlyUsed: [
			selectedPattern,
			patterns.find((pattern) => pattern.id === 'structure-property'),
			patterns.find((pattern) => pattern.id === 'evidence-inference-judgement'),
			patterns.find((pattern) => pattern.id === 'change-response')
		].filter(Boolean) as Pattern[],
		crossSubjectLinks: [
			{
				from: selectedPattern,
				to: patterns.find((pattern) => pattern.id === 'structure-property') ?? selectedPattern,
				reason: 'Same reasoning pattern. Different examples.'
			},
			{
				from: patterns.find((pattern) => pattern.id === 'structure-property') ?? selectedPattern,
				to: patterns.find((pattern) => pattern.id === 'evidence-method-effect') ?? selectedPattern,
				reason: 'Transfer your thinking across subjects.'
			}
		]
	};
}
