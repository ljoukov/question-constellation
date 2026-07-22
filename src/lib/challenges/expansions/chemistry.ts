import type { ChallengeDefinition } from '../types';

const reviewStamp = {
	lastReviewed: '2026-07-21',
	version: 1
} as const;

export const chemistryExpansion = [
	{
		...reviewStamp,
		id: 'chemistry-brass-hardness',
		slug: 'brass-harder-than-copper',
		subject: 'chemistry',
		title: 'Why is brass harder than pure copper?',
		topic: 'Bonding, structure and properties: alloys',
		subjectArtTheme: 'particles-bonding',
		hook: 'Adding zinc changes the regular copper layers, not the type of bonding holding the metal together.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Brass contains copper mixed with zinc. Explain why brass is harder than pure copper.',
		metaDescription:
			'Build a GCSE Chemistry alloy explanation by linking different-sized atoms, distorted metal layers and reduced sliding in brass.',
		staticAnswers: {
			a: 'Zinc atoms are different sizes from copper atoms, so they distort the regular layers. The layers slide less easily, making brass harder than pure copper.',
			b: 'Zinc atoms fit into spaces between copper atoms, so they pack the regular layers. The layers slide less easily, making brass harder than pure copper.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A identifies the real structural change: different-sized atoms distort the layers and hinder sliding. Answer B invents spaces being filled in otherwise regular layers.',
		commandWordLesson:
			'An explanation needs the full cause-and-effect route from atomic size, through distorted layers and reduced sliding, to greater hardness.',
		diagnosisPrompt: 'Which statement first makes Answer B inaccurate?',
		diagnosisChoices: [
			{
				id: 'fills-spaces',
				text: 'It says zinc atoms fill spaces inside regular copper layers.',
				feedback:
					'Different-sized atoms distort the regular arrangement instead of filling special spaces.',
				correct: true
			},
			{
				id: 'layers-exist',
				text: 'It says copper atoms are arranged in layers within the metal.',
				feedback: 'The layer model is appropriate for explaining pure metals and alloys.',
				correct: false
			},
			{
				id: 'brass-harder',
				text: 'It says brass is harder than the original pure copper metal.',
				feedback: 'That is the property the structural explanation needs to account for.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the accurate structural link?',
		repairChoices: [
			{
				id: 'stronger-bonds',
				text: 'Zinc atoms create ionic bonds that lock each copper layer.',
				feedback: 'Brass retains metallic bonding; the explanation depends on disrupted layers.',
				correct: false
			},
			{
				id: 'distorted-layers',
				text: 'Different-sized zinc atoms distort layers and make sliding harder.',
				feedback: 'This connects the changed structure directly to increased hardness.',
				correct: true
			},
			{
				id: 'heavier-atoms',
				text: 'Heavier zinc atoms press down and stop every layer moving.',
				feedback: 'Atomic mass and downward pressure do not explain alloy hardness.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['different sizes', 'different-sized atoms'],
			['distort layers', 'disrupt layers'],
			['slide less easily', 'harder to slide']
		],
		repairSuccess:
			'You linked different atomic sizes to distorted layers, reduced sliding and greater hardness.',
		transferPromptLead:
			'Pure gold is too soft for a durable ring. Why can mixing gold with another metal make the ring harder?',
		transferChoices: [
			{
				id: 'alloy-distorts',
				text: 'Different-sized atoms distort the layers, so they slide less easily.',
				feedback: 'This applies the same structure-and-sliding explanation to a gold alloy.',
				correct: true
			},
			{
				id: 'alloy-melts',
				text: 'Added atoms partly melt the layers, so they become fixed together.',
				feedback: 'The finished solid alloy is not hardened by remaining partly molten.',
				correct: false
			},
			{
				id: 'alloy-gaps',
				text: 'Added atoms fill every gap, so the layers become perfectly regular.',
				feedback: 'Alloy atoms disrupt the regular layers rather than perfecting them.',
				correct: false
			}
		],
		transferExplanation:
			'The metal changed, but the explanation stayed the same: different-sized atoms distort layers and make sliding more difficult.',
		memoryHandle: 'Different sizes → distorted layers → less sliding → harder'
	},
	{
		...reviewStamp,
		id: 'chemistry-pure-metal-bending',
		slug: 'pure-metal-bends-more-easily',
		subject: 'chemistry',
		title: 'Why does a pure metal bend more easily?',
		topic: 'Bonding, structure and properties: alloys',
		subjectArtTheme: 'particles-bonding',
		hook: 'Regular layers explain why shaping a pure metal is easier than shaping its alloy.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Pure copper bends more easily than bronze, which contains copper and tin. Explain this difference.',
		metaDescription:
			'Practise a GCSE Chemistry structure explanation by comparing sliding layers in a pure metal with distorted layers in an alloy.',
		staticAnswers: {
			a: 'Pure copper has fewer atoms than bronze, so its atoms have more empty space. That extra space lets its layers move and makes copper easier to bend.',
			b: 'Pure copper has regular layers of equal-sized atoms that can slide over one another. Tin atoms distort the layers in bronze, so sliding is more difficult.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B compares the structures directly: regular layers slide in pure copper, while different-sized atoms disrupt them in bronze. Answer A wrongly relies on empty space.',
		commandWordLesson:
			'When asked to explain a difference, compare both structures and connect layer movement to how easily each material bends.',
		diagnosisPrompt: 'What is the central error in Answer A?',
		diagnosisChoices: [
			{
				id: 'copper-soft',
				text: 'It says pure copper bends more easily than the bronze alloy.',
				feedback: 'That comparison is given and needs a structural explanation.',
				correct: false
			},
			{
				id: 'empty-space',
				text: 'It explains bending through extra empty space between copper atoms.',
				feedback: 'The accepted explanation is about regular layers sliding past one another.',
				correct: true
			},
			{
				id: 'mentions-atoms',
				text: 'It discusses atoms instead of describing the visible metal sample.',
				feedback: 'A particle-level explanation is exactly what this question requires.',
				correct: false
			}
		],
		repairPrompt: 'Which comparison supplies the correct explanation?',
		repairChoices: [
			{
				id: 'pure-regular',
				text: 'Copper layers are regular and slide; tin distorts bronze layers.',
				feedback: 'This accurately compares layer arrangement and movement in both materials.',
				correct: true
			},
			{
				id: 'alloy-ionic',
				text: 'Copper is metallic, while bronze contains rigid ionic bonds throughout.',
				feedback: 'Bronze is still a metallic material rather than an ionic lattice.',
				correct: false
			},
			{
				id: 'alloy-hollow',
				text: 'Copper is solid, while bronze contains hollow spaces between layers.',
				feedback: 'Hollow spaces do not account for the hardness of bronze.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['regular layers', 'layers of equal-sized atoms'],
			['slide over', 'slide past'],
			['distort', 'disrupt']
		],
		repairSuccess:
			'You compared freely sliding regular layers with distorted layers that resist movement.',
		transferPromptLead:
			'A manufacturer chooses an alloy instead of pure aluminium for a case that resists permanent bending. Which comparison explains the choice?',
		transferChoices: [
			{
				id: 'more-electrons',
				text: 'The alloy contains more electrons, so each atom becomes immovable.',
				feedback: 'Electron count alone does not explain resistance to layer sliding.',
				correct: false
			},
			{
				id: 'smaller-sample',
				text: 'The alloy uses less metal, so gravity bends the case less.',
				feedback: 'The structural property does not arise from using a smaller mass.',
				correct: false
			},
			{
				id: 'distorted-resists',
				text: 'Different-sized atoms distort layers, so sliding becomes more difficult.',
				feedback:
					'This correctly links the alloy structure to greater resistance to permanent bending.',
				correct: true
			}
		],
		transferExplanation:
			'Whether the product is bronze or aluminium alloy, distorted layers resist sliding more than regular pure-metal layers.',
		memoryHandle: 'Regular layers → easy sliding; distorted layers → harder sliding'
	},
	{
		...reviewStamp,
		id: 'chemistry-concentration-collisions',
		slug: 'concentration-collision-frequency',
		subject: 'chemistry',
		title: 'Why does a concentrated solution react faster?',
		topic: 'Rates of reaction: collision theory',
		subjectArtTheme: 'reactions-energy',
		hook: 'More reactant particles in the same volume changes collision frequency, not their individual speed.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Magnesium reacts faster with 1.0 mol/dm³ hydrochloric acid than with 0.5 mol/dm³ acid. Explain why.',
		metaDescription:
			'Use GCSE Chemistry collision theory to link higher acid concentration, more particles per volume and more frequent successful collisions.',
		staticAnswers: {
			a: 'The concentrated acid makes every particle move faster and collide with greater energy. This produces more successful collisions each second, so magnesium reacts faster.',
			b: 'The concentrated acid has more acid particles in the same volume, so collisions with magnesium happen more often. More successful collisions occur each second, so magnesium reacts faster.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B changes particle number per volume and therefore collision frequency. Answer A incorrectly treats concentration as if it raises temperature and particle speed.',
		commandWordLesson:
			'For concentration, link more reacting particles in each unit volume to more frequent collisions and therefore more successful collisions per second.',
		diagnosisPrompt: 'Which claim makes Answer A inaccurate?',
		diagnosisChoices: [
			{
				id: 'faster-particles',
				text: 'It says greater concentration makes individual particles move faster.',
				feedback: 'Particle speed is linked to temperature, not concentration itself.',
				correct: true
			},
			{
				id: 'collisions-matter',
				text: 'It says successful collisions are needed for chemical reaction.',
				feedback: 'Successful collisions are central to collision theory.',
				correct: false
			},
			{
				id: 'rate-faster',
				text: 'It says the more concentrated acid reacts at a faster rate.',
				feedback: 'That is the observed result which needs explaining.',
				correct: false
			}
		],
		repairPrompt: 'Which sequence correctly explains the faster reaction?',
		repairChoices: [
			{
				id: 'same-particles',
				text: 'Same particles per volume, but each collision lasts much longer.',
				feedback: 'Concentration changes the number of particles per unit volume.',
				correct: false
			},
			{
				id: 'more-particles',
				text: 'More particles per volume, more frequent collisions, faster reaction.',
				feedback: 'This is the correct collision-theory route for increased concentration.',
				correct: true
			},
			{
				id: 'larger-particles',
				text: 'Larger acid particles, stronger collisions, and a faster reaction.',
				feedback: 'Concentration does not change the size of acid particles.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['more particles', 'more acid particles'],
			['same volume', 'per unit volume'],
			['more frequent collisions', 'collide more often']
		],
		repairSuccess:
			'You linked more particles per unit volume to more frequent successful collisions and a faster rate.',
		transferPromptLead:
			'Sodium thiosulfate reacts faster when its concentration is doubled at the same temperature. Which explanation fits?',
		transferChoices: [
			{
				id: 'warmer',
				text: 'Particles become warmer, so every collision releases more chemical energy.',
				feedback: 'The temperature is unchanged, so warming cannot explain the difference.',
				correct: false
			},
			{
				id: 'more-per-volume',
				text: 'More particles occupy each volume, so collisions happen more often.',
				feedback: 'This correctly links concentration to collision frequency.',
				correct: true
			},
			{
				id: 'new-particles',
				text: 'Each particle splits in two, so the reaction instantly finishes.',
				feedback: 'Increasing concentration does not split the reacting particles.',
				correct: false
			}
		],
		transferExplanation:
			'The substances changed, but concentration still changes how many reacting particles share a volume and how often they collide.',
		memoryHandle: 'More particles per volume → more collisions → faster rate'
	},
	{
		...reviewStamp,
		id: 'chemistry-pressure-collisions',
		slug: 'gas-pressure-collision-frequency',
		subject: 'chemistry',
		title: 'Why do compressed gases react faster?',
		topic: 'Rates of reaction: collision theory',
		subjectArtTheme: 'reactions-energy',
		hook: 'Compression brings gas particles closer together, increasing how often they meet.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Two reacting gases are compressed at constant temperature. Explain why their reaction rate increases.',
		metaDescription:
			'Apply GCSE Chemistry collision theory to explain how higher gas pressure increases particle concentration and collision frequency.',
		staticAnswers: {
			a: 'Compression forces gas particles into a smaller volume, so particles are closer together and collide more often. More successful collisions occur each second, increasing the reaction rate.',
			b: 'Compression makes each gas particle larger, so particles touch one another across the smaller volume. Their greater size creates more reactions each second, increasing the reaction rate.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A correctly links a smaller volume to greater particle concentration and more frequent collisions. Answer B wrongly claims that compression changes particle size.',
		commandWordLesson:
			'For gas pressure, follow the change from smaller volume to particles being closer, more frequent collisions and a faster reaction.',
		diagnosisPrompt: 'Where does Answer B first go wrong?',
		diagnosisChoices: [
			{
				id: 'smaller-volume',
				text: 'It says the gas occupies a smaller volume after compression.',
				feedback: 'Compression does place the same gas into a smaller volume.',
				correct: false
			},
			{
				id: 'larger-particles',
				text: 'It says compression makes the individual gas particles larger.',
				feedback: 'Compression reduces spacing between particles, not particle size.',
				correct: true
			},
			{
				id: 'faster-rate',
				text: 'It says there are more reactions in each second.',
				feedback: 'That is consistent with a higher reaction rate.',
				correct: false
			}
		],
		repairPrompt: 'Which link should replace the particle-size claim?',
		repairChoices: [
			{
				id: 'closer-more',
				text: 'Particles are closer together, so collisions happen more often.',
				feedback: 'This accurately links compression to greater collision frequency.',
				correct: true
			},
			{
				id: 'hotter-faster',
				text: 'Particles become hotter, so their average speed always doubles.',
				feedback: 'The temperature is constant, so this is not the explanation.',
				correct: false
			},
			{
				id: 'heavier-stronger',
				text: 'Particles become heavier, so every collision becomes a reaction.',
				feedback: 'Compression does not change particle mass or guarantee success.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['smaller volume', 'compressed'],
			['closer together', 'less space'],
			['more frequent collisions', 'collide more often']
		],
		repairSuccess:
			'You linked compression to closer particles, more frequent successful collisions and a faster rate.',
		transferPromptLead:
			'A gas reaction slows when the container volume increases at constant temperature. Which explanation is correct?',
		transferChoices: [
			{
				id: 'particles-shrink',
				text: 'Particles shrink as volume rises, so fewer reactions can occur.',
				feedback: 'Container volume does not change the size of each particle.',
				correct: false
			},
			{
				id: 'particles-cool',
				text: 'Particles cool as volume rises, so all movement eventually stops.',
				feedback: 'The temperature stays constant and particle motion continues.',
				correct: false
			},
			{
				id: 'farther-fewer',
				text: 'Particles spread farther apart, so collisions happen less often.',
				feedback: 'This correctly explains the lower collision frequency and slower rate.',
				correct: true
			}
		],
		transferExplanation:
			'Pressure and volume change particle spacing: closer gas particles collide more often, while more widely spaced particles collide less often.',
		memoryHandle: 'Smaller volume → closer particles → more collisions → faster rate'
	},
	{
		...reviewStamp,
		id: 'chemistry-magnesium-oxide-mass',
		slug: 'magnesium-to-magnesium-oxide-mass',
		subject: 'chemistry',
		title: 'Can you turn a mole ratio into product mass?',
		topic: 'Quantitative chemistry: reacting masses',
		subjectArtTheme: 'reactions-energy',
		hook: 'The balanced coefficients connect moles; relative formula masses convert those moles back into grams.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Magnesium burns according to $2\\mathrm{Mg} + \\mathrm{O_2} \\rightarrow 2\\mathrm{MgO}$. Calculate the mass of magnesium oxide made from 6.0 g of magnesium. Use $A_r(\\mathrm{Mg})=24$ and $M_r(\\mathrm{MgO})=40$.',
		metaDescription:
			'Work through a GCSE Chemistry reacting-mass calculation from magnesium moles and equation ratio to magnesium oxide mass.',
		staticAnswers: {
			a: '$6.0 \\div 24 = 0.25$ mol Mg. The $2:2$ ratio gives $0.25$ mol MgO, so the product mass is $0.25 \\times 40 = 10.0$ g.',
			b: '$6.0 \\div 24 = 0.25$ mol Mg. The oxygen coefficient doubles this to $0.50$ mol MgO, so the product mass is $0.50 \\times 40 = 20.0$ g.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers find magnesium moles correctly. Answer B then uses the oxygen coefficient instead of reading the equal 2:2 ratio between magnesium and magnesium oxide.',
		commandWordLesson:
			'Convert the given mass to moles, use the coefficients for the named reactant and product, then convert product moles to mass.',
		diagnosisPrompt: 'Which is the first incorrect calculation step?',
		diagnosisChoices: [
			{
				id: 'divide-24',
				text: 'Dividing 6.0 g by 24 to find magnesium moles.',
				feedback: 'This correctly gives 0.25 mol of magnesium.',
				correct: false
			},
			{
				id: 'double-moles',
				text: 'Doubling magnesium moles to obtain magnesium oxide moles.',
				feedback: 'The magnesium-to-magnesium-oxide coefficient ratio is 2:2, or 1:1.',
				correct: true
			},
			{
				id: 'times-40',
				text: 'Multiplying magnesium oxide moles by its relative formula mass.',
				feedback: 'That is the correct final conversion from moles to grams.',
				correct: false
			}
		],
		repairPrompt: 'Which calculation uses the balanced equation correctly?',
		repairChoices: [
			{
				id: 'ratio-one',
				text: '$0.25$ mol Mg gives $0.25$ mol MgO, then $\\times 40$.',
				feedback: 'The 2:2 coefficients give equal mole amounts before conversion.',
				correct: true
			},
			{
				id: 'ratio-two',
				text: '$0.25$ mol Mg gives $0.50$ mol MgO, then $\\times 40$.',
				feedback: 'This doubles a mole amount that should stay unchanged.',
				correct: false
			},
			{
				id: 'ratio-half',
				text: '$0.25$ mol Mg gives $0.125$ mol MgO, then $\\times 40$.',
				feedback: 'This halves a mole amount despite the equal coefficients.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['0.25 mol magnesium', '0.25 mol Mg'],
			['1:1 ratio', '2:2 ratio'],
			['10.0 g', '10 g']
		],
		repairSuccess:
			'You kept the 2:2 coefficient ratio as 1:1 and converted the product moles to 10.0 g.',
		transferPromptLead:
			'For $2\\mathrm{H_2} + \\mathrm{O_2} \\rightarrow 2\\mathrm{H_2O}$, how many moles of water form from 3.0 mol of hydrogen when oxygen is in excess?',
		transferChoices: [
			{
				id: 'six-water',
				text: '6.0 mol, because the product coefficient is two.',
				feedback: 'The hydrogen and water coefficients are both two.',
				correct: false
			},
			{
				id: 'three-water',
				text: '3.0 mol, because hydrogen and water have equal coefficients.',
				feedback: 'The equal coefficients give an equal mole amount.',
				correct: true
			},
			{
				id: 'one-five-water',
				text: '1.5 mol, because two hydrogen molecules make one oxygen.',
				feedback: 'The requested product is water, not oxygen.',
				correct: false
			}
		],
		transferExplanation:
			'The substances changed, but the calculation still follows given moles, the named coefficient ratio and product moles.',
		memoryHandle: 'Mass → moles → coefficient ratio → moles → mass'
	},
	{
		...reviewStamp,
		id: 'chemistry-carbon-dioxide-mass',
		slug: 'carbonate-to-carbon-dioxide-mass',
		subject: 'chemistry',
		title: 'Which coefficient controls the product mass?',
		topic: 'Quantitative chemistry: reacting masses',
		subjectArtTheme: 'reactions-energy',
		hook: 'Moles follow the balanced equation before any product mass is calculated.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Calcium carbonate decomposes: $\\mathrm{CaCO_3} \\rightarrow \\mathrm{CaO} + \\mathrm{CO_2}$. Calculate the mass of carbon dioxide formed from 25.0 g of calcium carbonate. Use $M_r(\\mathrm{CaCO_3})=100$ and $M_r(\\mathrm{CO_2})=44$.',
		metaDescription:
			'Check a GCSE Chemistry reacting-mass calculation by following mass, moles, the balanced ratio and carbon dioxide mass.',
		staticAnswers: {
			a: '$25.0 \\div 100 = 0.25$ mol CaCO₃. The $1:1$ ratio gives $0.25$ mol CO₂, so its mass is $0.25 \\times 44 = 11.0$ g.',
			b: '$25.0 \\div 100 = 0.25$ mol CaCO₃. The two products double this to $0.50$ mol CO₂, so its mass is $0.50 \\times 44 = 22.0$ g.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Answer A uses the 1:1 coefficients for calcium carbonate and carbon dioxide. Answer B incorrectly treats the number of different products as a coefficient.',
		commandWordLesson:
			'Use only the coefficients beside the named reactant and product; the number of different substances does not set the mole ratio.',
		diagnosisPrompt: 'Where does Answer B first become incorrect?',
		diagnosisChoices: [
			{
				id: 'moles-carbonate',
				text: 'It calculates 0.25 mol of calcium carbonate from 25.0 g.',
				feedback: 'Dividing by 100 correctly gives 0.25 mol.',
				correct: false
			},
			{
				id: 'double-products',
				text: 'It doubles moles because the equation has two products.',
				feedback: 'Product count does not replace the balanced coefficients.',
				correct: true
			},
			{
				id: 'mass-conversion',
				text: 'It multiplies carbon dioxide moles by a formula mass.',
				feedback: 'That is the correct type of final conversion.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement uses the correct mole ratio?',
		repairChoices: [
			{
				id: 'one-one',
				text: 'Use 1:1, so 0.25 mol produces 0.25 mol carbon dioxide.',
				feedback: 'This follows the equal coefficients in the balanced equation.',
				correct: true
			},
			{
				id: 'one-two',
				text: 'Use 1:2, so 0.25 mol produces 0.50 mol carbon dioxide.',
				feedback: 'There is no coefficient of two before carbon dioxide.',
				correct: false
			},
			{
				id: 'two-one',
				text: 'Use 2:1, so 0.25 mol produces 0.125 mol carbon dioxide.',
				feedback: 'There is no coefficient of two before calcium carbonate.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['0.25 mol calcium carbonate', '0.25 mol CaCO3'],
			['1:1', 'equal coefficients'],
			['11.0 g', '11 g']
		],
		repairSuccess:
			'You ignored the number of product types and used the 1:1 coefficient ratio to obtain 11.0 g.',
		transferPromptLead:
			'For $\\mathrm{2KClO_3} \\rightarrow \\mathrm{2KCl} + \\mathrm{3O_2}$, how many moles of oxygen form from 4.0 mol of potassium chlorate?',
		transferChoices: [
			{
				id: 'four-oxygen',
				text: '4.0 mol, because there are two substances among the products.',
				feedback: 'The number of product substances does not control the ratio.',
				correct: false
			},
			{
				id: 'six-oxygen',
				text: '6.0 mol, because the coefficient ratio is three to two.',
				feedback: 'Multiplying 4.0 by 3/2 gives 6.0 mol.',
				correct: true
			},
			{
				id: 'two-seven',
				text: '2.7 mol, because the coefficient ratio is two to three.',
				feedback: 'The ratio has been applied in the wrong direction.',
				correct: false
			}
		],
		transferExplanation:
			'Whether coefficients are equal or unequal, isolate the named reactant-to-product ratio and apply it in the required direction.',
		memoryHandle: 'Given mass → reactant moles → equation ratio → product mass'
	},
	{
		...reviewStamp,
		id: 'chemistry-river-water-solids',
		slug: 'river-water-dissolved-solids',
		subject: 'chemistry',
		title: 'How do you measure dissolved solids in water?',
		topic: 'Chemical analysis: dissolved solids in water',
		subjectArtTheme: 'practical-analysis',
		hook: 'The water must leave while the dissolved material remains, and repeated masses confirm drying is complete.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Describe how to determine the mass of dissolved solids in 50 cm³ of filtered river water.',
		metaDescription:
			'Plan a GCSE Chemistry water-analysis method using filtered water, evaporation, cooling and repeated weighing to measure dissolved solids reliably.',
		staticAnswers: {
			a: 'Weigh an evaporating basin, add 50 cm³ of filtered river water and heat until dry. Cool, weigh, reheat, then repeat the cool–weigh cycle until the mass is unchanged; subtract the basin mass.',
			b: 'Weigh an evaporating basin, add 50 cm³ of filtered river water and heat for five minutes. Weigh it while still hot only once, then subtract the basin mass.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Answer A cools before weighing and repeats heating, cooling and weighing until the mass is unchanged. Answer B uses an arbitrary heating time and one hot measurement.',
		commandWordLesson:
			'A reliable method states what is measured, how water is removed, how complete drying is checked and which mass difference is calculated.',
		diagnosisPrompt: 'What most weakens the result in Answer B?',
		diagnosisChoices: [
			{
				id: 'fixed-volume',
				text: 'It measures a fixed 50 cm³ volume of the river water.',
				feedback: 'A known volume is needed to make the result meaningful.',
				correct: false
			},
			{
				id: 'one-hot-mass',
				text: 'It relies on one hot mass after an arbitrary heating time.',
				feedback: 'Cooling and repeated unchanged masses are needed to confirm dryness.',
				correct: true
			},
			{
				id: 'basin-mass',
				text: 'It subtracts the empty basin mass from the final mass.',
				feedback: 'That subtraction correctly isolates the residue mass.',
				correct: false
			}
		],
		repairPrompt: 'Which addition confirms that evaporation is complete?',
		repairChoices: [
			{
				id: 'boil-faster',
				text: 'Boil more vigorously until every solid begins to melt.',
				feedback: 'Melting or losing residue would make the measurement inaccurate.',
				correct: false
			},
			{
				id: 'one-minute',
				text: 'Stop after exactly one minute and read the hottest mass.',
				feedback: 'A fixed time does not prove that all water has gone.',
				correct: false
			},
			{
				id: 'repeat-mass',
				text: 'Cool, weigh, then repeat heating until the mass stays unchanged.',
				feedback: 'Repeated unchanged masses show that further water is not being lost.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['evaporate', 'heat until dry'],
			['cool and weigh', 'cool before weighing'],
			['constant mass', 'mass unchanged']
		],
		repairSuccess:
			'You completed the method with cooling and repeated weighing until no further mass was lost.',
		transferPromptLead:
			'A student dries 25 cm³ of filtered lake water and obtains a residue. Which check best shows that all water has been removed?',
		transferChoices: [
			{
				id: 'residue-colour',
				text: 'Record the residue colour once the basin looks completely dry.',
				feedback: 'Appearance alone cannot show whether a small amount of water remains.',
				correct: false
			},
			{
				id: 'unchanged-masses',
				text: 'Reheat, cool and reweigh until two consecutive masses are unchanged.',
				feedback: 'An unchanged mass after further heating confirms complete drying.',
				correct: true
			},
			{
				id: 'highest-temperature',
				text: 'Use the highest temperature so the basin remains very hot.',
				feedback: 'Excessive heating can lose residue, and hot objects give unreliable masses.',
				correct: false
			}
		],
		transferExplanation:
			'The water source and volume changed, but complete drying still requires cooling and repeated masses that no longer decrease.',
		memoryHandle: 'Evaporate → cool → weigh → repeat to unchanged mass'
	},
	{
		...reviewStamp,
		id: 'chemistry-water-solids-comparison',
		slug: 'compare-water-dissolved-solids',
		subject: 'chemistry',
		title: 'How can two water samples be compared fairly?',
		topic: 'Chemical analysis: dissolved solids in water',
		subjectArtTheme: 'practical-analysis',
		hook: 'Equal starting volumes and dry residues turn two final masses into a fair comparison.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Describe how to compare the mass of dissolved solids in filtered samples of tap water and pond water.',
		metaDescription:
			'Design a fair GCSE Chemistry comparison of dissolved solids using equal filtered-water volumes, evaporation and constant final masses.',
		staticAnswers: {
			a: 'Heat any amount of each filtered water sample for the same time, then compare the total masses. The heavier container has more dissolved solids in its water.',
			b: 'Use equal volumes of the filtered samples in pre-weighed basins, evaporate each, then reheat, cool and reweigh to unchanged mass. Compare residue masses after subtracting basin masses.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'off-command',
		showdownExplanation:
			'Answer B keeps the starting volumes equal and compares dry residue masses alone. Answer A varies the water amount and includes container mass in the comparison.',
		commandWordLesson:
			'A comparison method controls starting volume, isolates the dissolved residue and applies the same endpoint test to both samples.',
		diagnosisPrompt: 'Why is Answer A not a fair comparison?',
		diagnosisChoices: [
			{
				id: 'same-time',
				text: 'It heats both samples for exactly the same length of time.',
				feedback: 'Equal time alone does not ensure equal volume or complete drying.',
				correct: false
			},
			{
				id: 'unequal-volume',
				text: 'It allows different starting volumes and compares container masses too.',
				feedback: 'Both differences can hide the actual dissolved-solids comparison.',
				correct: true
			},
			{
				id: 'uses-heating',
				text: 'It removes water by heating the samples in containers.',
				feedback: 'Evaporation is appropriate when the dry residue is measured carefully.',
				correct: false
			}
		],
		repairPrompt: 'Which change creates a fair dissolved-solids comparison?',
		repairChoices: [
			{
				id: 'equal-volumes',
				text: 'Use equal volumes and compare dry residue masses only.',
				feedback: 'This controls the starting amount and isolates dissolved solids.',
				correct: true
			},
			{
				id: 'equal-colours',
				text: 'Choose equal-coloured samples and compare their starting masses only.',
				feedback: 'Colour and initial total mass do not isolate dissolved solids.',
				correct: false
			},
			{
				id: 'different-basins',
				text: 'Use different volumes and compare each full basin mass directly.',
				feedback: 'Different volumes and basin masses prevent a fair comparison.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['equal volumes', 'same volume'],
			['evaporate', 'remove the water'],
			['residue mass', 'mass of dissolved solids']
		],
		repairSuccess:
			'You controlled the sample volume and compared residue masses after complete evaporation.',
		transferPromptLead:
			'Two 100 cm³ filtered water samples leave dry residues of 0.08 g and 0.21 g. Which conclusion is supported?',
		transferChoices: [
			{
				id: 'first-more',
				text: 'The first sample contains more dissolved solids per 100 cm³.',
				feedback: 'Its residue is smaller, so it contains less dissolved material.',
				correct: false
			},
			{
				id: 'second-more',
				text: 'The second sample contains more dissolved solids per 100 cm³.',
				feedback: 'Equal volumes make the larger dry residue a valid comparison.',
				correct: true
			},
			{
				id: 'same-solids',
				text: 'Both samples contain the same dissolved solids per 100 cm³.',
				feedback: 'The dry residue masses are different for equal starting volumes.',
				correct: false
			}
		],
		transferExplanation:
			'Equal starting volumes allow dry residue masses to be compared directly; the larger residue means more dissolved solids in that volume.',
		memoryHandle: 'Equal volume → dry fully → subtract basin → compare residue'
	},
	{
		...reviewStamp,
		id: 'chemistry-sodium-chloride-bond',
		slug: 'sodium-chloride-electron-transfer',
		subject: 'chemistry',
		title: 'What actually holds sodium chloride together?',
		topic: 'Bonding, structure and properties: ionic bonding',
		subjectArtTheme: 'particles-bonding',
		hook: 'Electron transfer creates ions; the force between those ions is the bond.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion: 'Explain how sodium and chlorine atoms form an ionic bond in sodium chloride.',
		metaDescription:
			'Build a GCSE Chemistry ionic-bonding explanation from electron transfer to oppositely charged ions and electrostatic attraction.',
		staticAnswers: {
			a: 'Sodium and chlorine share one electron between them, so both atoms become neutral. A strong attraction between the neutral atoms then forms sodium chloride.',
			b: 'A sodium atom transfers one electron to a chlorine atom, forming Na+ and Cl− ions. Electrostatic attraction between the oppositely charged ions forms the ionic bond.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B distinguishes ionic bonding from covalent bonding: the electron is transferred, charged ions form and electrostatic attraction holds them together. Answer A wrongly uses sharing.',
		commandWordLesson:
			'A complete ionic-bonding explanation states the electron movement, resulting ion charges and electrostatic force between opposite charges.',
		diagnosisPrompt: 'Which idea first makes Answer A incorrect?',
		diagnosisChoices: [
			{
				id: 'sharing',
				text: 'It says sodium and chlorine share an electron between them.',
				feedback: 'Ionic bonding involves electron transfer rather than electron sharing.',
				correct: true
			},
			{
				id: 'two-elements',
				text: 'It says both sodium and chlorine are involved in bonding.',
				feedback: 'The compound is formed from both elements, as stated.',
				correct: false
			},
			{
				id: 'attraction',
				text: 'It says an attractive force holds particles together after bonding.',
				feedback: 'Attraction is required, but it must act between charged ions.',
				correct: false
			}
		],
		repairPrompt: 'Which sequence describes ionic bonding correctly?',
		repairChoices: [
			{
				id: 'share-neutral',
				text: 'Share one electron, remain neutral, then attract weakly.',
				feedback: 'Sharing and neutral particles do not describe this ionic compound.',
				correct: false
			},
			{
				id: 'transfer-ions',
				text: 'Transfer one electron, form opposite ions, then attract electrostatically.',
				feedback: 'This contains the full accepted sequence for ionic bonding.',
				correct: true
			},
			{
				id: 'lose-both',
				text: 'Both atoms lose electrons, form positive ions, then attract.',
				feedback: 'Two positive ions repel rather than forming this ionic bond.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['transfer electron', 'electron transferred'],
			['positive and negative ions', 'oppositely charged ions'],
			['electrostatic attraction', 'strong attraction']
		],
		repairSuccess:
			'You connected electron transfer to ion formation and electrostatic attraction between opposite charges.',
		transferPromptLead:
			'Lithium reacts with fluorine to form lithium fluoride. Which account of the bonding is correct?',
		transferChoices: [
			{
				id: 'transfer-attract',
				text: 'Lithium transfers an electron to fluorine; the resulting opposite ions attract.',
				feedback:
					'This applies electron transfer and electrostatic attraction in the new compound.',
				correct: true
			},
			{
				id: 'share-attract',
				text: 'Lithium shares an electron with fluorine; the neutral atoms attract.',
				feedback: 'A metal and non-metal form ions by electron transfer here.',
				correct: false
			},
			{
				id: 'both-positive',
				text: 'Both atoms lose an electron; the two positive ions attract.',
				feedback: 'Like charges repel, and fluorine gains rather than loses an electron.',
				correct: false
			}
		],
		transferExplanation:
			'The elements changed, but ionic bonding still requires electron transfer followed by attraction between positive and negative ions.',
		memoryHandle: 'Electron transfer → opposite ions → electrostatic attraction'
	},
	{
		...reviewStamp,
		id: 'chemistry-magnesium-oxide-bond',
		slug: 'magnesium-oxide-ionic-bond',
		subject: 'chemistry',
		title: 'Why do magnesium and oxygen form charged ions?',
		topic: 'Bonding, structure and properties: ionic bonding',
		subjectArtTheme: 'particles-bonding',
		hook: 'Following both electrons prevents correct charges from becoming an unexplained guess.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Explain how magnesium and oxygen atoms form ions and bond in magnesium oxide.',
		metaDescription:
			'Follow two-electron transfer in a GCSE Chemistry ionic-bonding challenge, then connect Mg2+ and O2− ions by electrostatic attraction.',
		staticAnswers: {
			a: 'Magnesium transfers two electrons to oxygen, forming Mg2+ and O2− ions. Strong electrostatic attraction between these oppositely charged ions holds magnesium oxide together.',
			b: 'Magnesium transfers one electron to oxygen, forming Mg+ and O− ions. Strong electrostatic attraction between these oppositely charged ions holds magnesium oxide together.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers use electron transfer and electrostatic attraction. Answer B transfers only one electron, giving the wrong charges for magnesium and oxide ions.',
		commandWordLesson:
			'Track the number of electrons transferred, use it to state each ion charge, then name the electrostatic attraction between those ions.',
		diagnosisPrompt: 'What is the first incorrect detail in Answer B?',
		diagnosisChoices: [
			{
				id: 'one-electron',
				text: 'It transfers only one electron from magnesium to oxygen.',
				feedback: 'Magnesium loses two electrons and oxygen gains those two electrons.',
				correct: true
			},
			{
				id: 'opposite-ions',
				text: 'It describes attraction between ions carrying opposite electric charges.',
				feedback: 'That electrostatic attraction is the basis of the ionic bond.',
				correct: false
			},
			{
				id: 'compound-name',
				text: 'It identifies the product as the compound magnesium oxide.',
				feedback: 'That is the correct name of the ionic compound formed.',
				correct: false
			}
		],
		repairPrompt: 'Which electron transfer gives the correct ions?',
		repairChoices: [
			{
				id: 'one-electron',
				text: 'Transfer one electron to form Mg+ and O− ions.',
				feedback: 'These are not the stable ion charges in magnesium oxide.',
				correct: false
			},
			{
				id: 'three-electrons',
				text: 'Transfer three electrons to form Mg3+ and O3− ions.',
				feedback: 'Magnesium and oxygen do not form these ion charges.',
				correct: false
			},
			{
				id: 'two-electrons',
				text: 'Transfer two electrons to form Mg2+ and O2− ions.',
				feedback: 'This correctly connects electron movement to both ion charges.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['two electrons', '2 electrons'],
			['Mg2+', 'magnesium two plus'],
			['O2−', 'oxide two minus'],
			['electrostatic attraction', 'opposite charges attract']
		],
		repairSuccess:
			'You transferred two electrons, obtained the correct charges and retained the electrostatic attraction.',
		transferPromptLead:
			'Calcium transfers two electrons to sulfur when calcium sulfide forms. Which ions and force result?',
		transferChoices: [
			{
				id: 'one-charges',
				text: 'Ca+ and S− ions held by shared electron pairs.',
				feedback: 'Two electrons give charges of two, and ionic bonding is electrostatic.',
				correct: false
			},
			{
				id: 'two-charges',
				text: 'Ca2+ and S2− ions held by electrostatic attraction.',
				feedback: 'This matches the two-electron transfer and ionic force.',
				correct: true
			},
			{
				id: 'neutral-atoms',
				text: 'Neutral Ca and S atoms held by metallic attraction.',
				feedback: 'The transfer forms ions, and the compound is not metallic.',
				correct: false
			}
		],
		transferExplanation:
			'Changing the elements does not change the route: transferred electrons determine charges, then opposite ions attract electrostatically.',
		memoryHandle: 'Electron count → ion charges → electrostatic attraction'
	},
	{
		...reviewStamp,
		id: 'chemistry-magnesium-chloride-electrolysis',
		slug: 'molten-magnesium-chloride-electrolysis',
		subject: 'chemistry',
		title: 'Can you route ions to the correct electrodes?',
		topic: 'Electrolysis: molten ionic compounds (HT only)',
		subjectArtTheme: 'particles-bonding',
		hook: 'Charge sends each ion to its electrode; electron movement then identifies oxidation or reduction.',
		arc: 'connect-cause-to-effect',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Molten magnesium chloride contains Mg2+ and Cl− ions. State what happens at each electrode during electrolysis.',
		metaDescription:
			'Follow GCSE Chemistry electrolysis from ion charge to electrode, electron transfer and products in molten magnesium chloride.',
		staticAnswers: {
			a: 'Mg2+ moves to the negative cathode and gains two electrons to form magnesium. Cl− moves to the positive anode and loses electrons to form chlorine.',
			b: 'Mg2+ moves to the positive anode and loses two electrons to form magnesium. Cl− moves to the negative cathode and gains electrons to form chlorine.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A sends each ion to the oppositely charged electrode, then gives electron gain at the cathode and electron loss at the anode. Answer B reverses both routes.',
		commandWordLesson:
			'Start with ion charge, choose the oppositely charged electrode, then state whether electrons are gained or lost and name the product.',
		diagnosisPrompt: 'Which feature first makes Answer B incorrect?',
		diagnosisChoices: [
			{
				id: 'magnesium-product',
				text: 'It names magnesium as the product formed from Mg2+ ions.',
				feedback: 'Magnesium is the correct product when Mg2+ gains electrons.',
				correct: false
			},
			{
				id: 'chlorine-product',
				text: 'It names chlorine as the product formed from chloride ions.',
				feedback: 'Chloride ions can lose electrons to form chlorine.',
				correct: false
			},
			{
				id: 'same-charge',
				text: 'It sends each ion towards an electrode with the same charge.',
				feedback: 'Ions move to electrodes carrying the opposite charge.',
				correct: true
			}
		],
		repairPrompt: 'Which statement correctly describes the cathode reaction?',
		repairChoices: [
			{
				id: 'mg-gains',
				text: 'Mg2+ gains two electrons at the cathode to form magnesium.',
				feedback: 'This is reduction at the negative electrode.',
				correct: true
			},
			{
				id: 'mg-loses',
				text: 'Mg2+ loses two electrons at the cathode to form magnesium.',
				feedback: 'A positive ion must gain electrons to become a neutral atom.',
				correct: false
			},
			{
				id: 'chloride-gains',
				text: 'Cl− gains one electron at the cathode to form chlorine.',
				feedback: 'Chloride moves to the anode and loses electrons.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['cathode', 'negative electrode'],
			['gain electrons', 'reduction'],
			['anode', 'positive electrode'],
			['lose electrons', 'oxidation']
		],
		repairSuccess:
			'You used opposite charges to route the ions and matched electron gain and loss to the correct electrodes.',
		transferPromptLead:
			'Molten calcium bromide contains Ca2+ and Br− ions. Which electrode statement is correct?',
		transferChoices: [
			{
				id: 'calcium-anode',
				text: 'Calcium forms at the positive anode after Ca2+ loses electrons.',
				feedback: 'Ca2+ is attracted to the negative cathode and gains electrons.',
				correct: false
			},
			{
				id: 'calcium-cathode',
				text: 'Calcium forms at the negative cathode after Ca2+ gains electrons.',
				feedback: 'This correctly combines charge, electrode and electron transfer.',
				correct: true
			},
			{
				id: 'bromide-cathode',
				text: 'Bromine forms at the negative cathode after Br− gains electrons.',
				feedback: 'Br− goes to the positive anode and loses electrons.',
				correct: false
			}
		],
		transferExplanation:
			'For any molten ionic compound, positive ions gain electrons at the cathode and negative ions lose electrons at the anode.',
		memoryHandle: 'Cation → cathode → gain; anion → anode → lose'
	},
	{
		...reviewStamp,
		id: 'chemistry-aluminium-oxide-electrolysis',
		slug: 'aluminium-oxide-half-equations',
		subject: 'chemistry',
		title: 'Can you balance electrode half equations?',
		topic: 'Electrolysis: half equations (HT only)',
		subjectArtTheme: 'particles-bonding',
		hook: 'Each half equation must conserve both atoms and electric charge.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Molten aluminium oxide contains Al3+ and O2− ions. Write balanced half equations for the products at both electrodes.',
		metaDescription:
			'Balance GCSE Chemistry electrolysis half equations for aluminium and oxygen by conserving atoms, charge and electrons.',
		staticAnswers: {
			a: '$\\mathrm{Al^{3+} + 2e^- \\rightarrow Al}$ at the cathode and $\\mathrm{O^{2-} \\rightarrow O_2 + 2e^-}$ at the anode. Each ion changes into its element.',
			b: '$\\mathrm{Al^{3+} + 3e^- \\rightarrow Al}$ at the cathode and $\\mathrm{2O^{2-} \\rightarrow O_2 + 4e^-}$ at the anode. Atoms and charge balance in both equations.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Answer B balances atom numbers and total charge in both half equations. Answer A supplies too few electrons to Al3+ and only one oxygen atom before making O2.',
		commandWordLesson:
			'For each half equation, balance element atoms first and then add the number of electrons needed to balance the overall charge.',
		diagnosisPrompt: 'What first reveals that Answer A is unbalanced?',
		diagnosisChoices: [
			{
				id: 'cathode-location',
				text: 'It places aluminium formation at the negative cathode electrode.',
				feedback: 'Positive Al3+ ions are reduced at the cathode.',
				correct: false
			},
			{
				id: 'two-electrons',
				text: 'It gives Al3+ only two electrons before forming neutral aluminium.',
				feedback: 'Three electrons are required to balance a charge of plus three.',
				correct: true
			},
			{
				id: 'oxygen-product',
				text: 'It identifies oxygen as the product made from oxide ions.',
				feedback: 'Oxygen is the expected anode product; the equation needs balancing.',
				correct: false
			}
		],
		repairPrompt: 'Which pair of half equations is fully balanced?',
		repairChoices: [
			{
				id: 'two-two',
				text: '$\\mathrm{Al^{3+}+2e^-\\rightarrow Al}$ and $\\mathrm{O^{2-}\\rightarrow O_2+2e^-}$.',
				feedback: 'Neither charge nor oxygen atoms are fully balanced.',
				correct: false
			},
			{
				id: 'three-two',
				text: '$\\mathrm{Al^{3+}+3e^-\\rightarrow Al}$ and $\\mathrm{O^{2-}\\rightarrow O_2+2e^-}$.',
				feedback: 'The aluminium equation balances, but oxygen atoms do not.',
				correct: false
			},
			{
				id: 'three-four',
				text: '$\\mathrm{Al^{3+}+3e^-\\rightarrow Al}$ and $\\mathrm{2O^{2-}\\rightarrow O_2+4e^-}$.',
				feedback: 'Both atom totals and overall charges are balanced.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['3 electrons', '3e−', '3e-'],
			['2 oxide ions', '2O2−', '2O2-'],
			['4 electrons', '4e−', '4e-']
		],
		repairSuccess:
			'You balanced aluminium charge with three electrons and paired two oxide ions to make one oxygen molecule.',
		transferPromptLead:
			'Which cathode half equation correctly forms lead from Pb2+ ions during molten electrolysis?',
		transferChoices: [
			{
				id: 'lead-gain',
				text: '$\\mathrm{Pb^{2+} + 2e^- \\rightarrow Pb}$, because charge balances.',
				feedback: 'Two electrons reduce Pb2+ to neutral lead.',
				correct: true
			},
			{
				id: 'lead-one',
				text: '$\\mathrm{Pb^{2+} + e^- \\rightarrow Pb}$, because one electron transfers.',
				feedback: 'One electron leaves a total charge of plus one.',
				correct: false
			},
			{
				id: 'lead-lose',
				text: '$\\mathrm{Pb^{2+} \\rightarrow Pb + 2e^-}$, because lead oxidises.',
				feedback: 'Pb2+ must gain electrons at the cathode, not lose them.',
				correct: false
			}
		],
		transferExplanation:
			'The ion changed, but the same check applies: conserve atoms and use electrons to make the total charge equal on both sides.',
		memoryHandle: 'Balance atoms → balance charge with electrons'
	},
	{
		...reviewStamp,
		id: 'chemistry-neutralisation-energy',
		slug: 'neutralisation-temperature-rise',
		subject: 'chemistry',
		title: 'What does a warmer neutralisation mixture show?',
		topic: 'Energy changes: exothermic reactions',
		subjectArtTheme: 'reactions-energy',
		hook: 'The thermometer tracks the surroundings, so its rise reveals the direction of energy transfer.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'An acid and alkali are mixed. The temperature rises from 19 °C to 27 °C. Explain what this shows.',
		metaDescription:
			'Use a temperature rise in a GCSE Chemistry neutralisation to identify an exothermic reaction and energy transfer to the surroundings.',
		staticAnswers: {
			a: 'The reaction is endothermic because the chemicals take in energy. Taking in energy causes the surroundings to warm, so the measured temperature increases.',
			b: 'The reaction is exothermic because energy transfers to the surroundings. The surroundings warm as they receive energy, so the measured temperature increases.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B reads the temperature as a surroundings measurement and follows energy out of the reaction. Answer A reverses the direction expected for an endothermic change.',
		commandWordLesson:
			'Connect the observed temperature change to the surroundings, then use the transfer direction to classify the reaction.',
		diagnosisPrompt: 'Which link in Answer A is reversed?',
		diagnosisChoices: [
			{
				id: 'endo-warms',
				text: 'It says taking energy from the surroundings makes them warmer.',
				feedback: 'Removing energy from the surroundings would make them cooler.',
				correct: true
			},
			{
				id: 'temperature-measured',
				text: 'It uses the measured temperature change as scientific evidence.',
				feedback: 'The temperature change is the relevant observation here.',
				correct: false
			},
			{
				id: 'reaction-occurs',
				text: 'It says an energy change occurs when the chemicals react.',
				feedback: 'Chemical reactions can transfer energy to or from surroundings.',
				correct: false
			}
		],
		repairPrompt: 'Which statement fits the temperature increase?',
		repairChoices: [
			{
				id: 'endo-from',
				text: 'Endothermic: energy transfers from the surroundings into the reaction.',
				feedback: 'That direction would cool the surroundings rather than warm them.',
				correct: false
			},
			{
				id: 'exo-to',
				text: 'Exothermic: energy transfers from the reaction into the surroundings.',
				feedback: 'This transfer explains why the measured surroundings get warmer.',
				correct: true
			},
			{
				id: 'no-transfer',
				text: 'Neither: temperature rises without energy moving between anything.',
				feedback: 'A temperature rise is evidence that energy has transferred.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['exothermic'],
			['energy to surroundings', 'transfers energy to the surroundings'],
			['temperature increases', 'surroundings warm']
		],
		repairSuccess:
			'You used the warmer surroundings to identify an exothermic transfer from the reaction.',
		transferPromptLead:
			'A fuel burns beneath a beaker and the water temperature rises. Which energy statement is correct?',
		transferChoices: [
			{
				id: 'water-gives',
				text: 'The water transfers energy into the fuel, so combustion is endothermic.',
				feedback: 'The water warms because it receives energy from combustion.',
				correct: false
			},
			{
				id: 'fuel-stores',
				text: 'The fuel stores the water temperature, so no energy transfers.',
				feedback: 'Temperature is not stored, and the warming shows energy transfer.',
				correct: false
			},
			{
				id: 'fuel-gives',
				text: 'Combustion transfers energy to the water, so it is exothermic.',
				feedback: 'This correctly follows energy from the reaction to the surroundings.',
				correct: true
			}
		],
		transferExplanation:
			'For neutralisation or combustion, surroundings that warm have received energy from an exothermic reaction.',
		memoryHandle: 'Surroundings warm → energy transferred out → exothermic'
	},
	{
		...reviewStamp,
		id: 'chemistry-cold-pack-energy',
		slug: 'cold-pack-endothermic-change',
		subject: 'chemistry',
		title: 'Why does an instant cold pack get colder?',
		topic: 'Energy changes: endothermic reactions',
		subjectArtTheme: 'reactions-energy',
		hook: 'A cooling pack is evidence that energy moved away from its surroundings and into the change.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'An instant cold pack falls from 21 °C to 7 °C when its chemicals mix. Explain the energy transfer.',
		metaDescription:
			'Explain a GCSE Chemistry cold pack by connecting a temperature decrease to energy taken from the surroundings in an endothermic change.',
		staticAnswers: {
			a: 'The change is endothermic because it takes in energy from the surroundings. The surroundings lose energy and cool, so the measured temperature falls.',
			b: 'The change is exothermic because it releases cold energy to the surroundings. The surroundings receive cold energy, so the measured temperature falls.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A describes energy transfer and explains why the surroundings cool. Answer B treats cold as a substance being released and labels the change incorrectly.',
		commandWordLesson:
			'Use the falling surroundings temperature to infer energy loss, then state that the change takes in that energy and is endothermic.',
		diagnosisPrompt: 'What is the decisive error in Answer B?',
		diagnosisChoices: [
			{
				id: 'temperature-falls',
				text: 'It says the measured temperature of the cold pack falls.',
				feedback: 'That is the observation the explanation must address.',
				correct: false
			},
			{
				id: 'chemicals-mix',
				text: 'It says the temperature changes when the chemicals are mixed.',
				feedback: 'Mixing starts the change, but does not create the error.',
				correct: false
			},
			{
				id: 'cold-energy',
				text: 'It treats cold as energy released by an exothermic change.',
				feedback: 'Energy moves into the change from surroundings; cold is not released.',
				correct: true
			}
		],
		repairPrompt: 'Which explanation correctly follows the energy?',
		repairChoices: [
			{
				id: 'endo-takes',
				text: 'The change takes energy from surroundings, so they become colder.',
				feedback: 'This correctly describes an endothermic energy transfer.',
				correct: true
			},
			{
				id: 'exo-gives-cold',
				text: 'The change gives cold energy to surroundings, so they cool.',
				feedback: 'Cold is not a transferred form of energy.',
				correct: false
			},
			{
				id: 'temperature-destroyed',
				text: 'The change destroys temperature, so no energy transfer occurs.',
				feedback: 'Temperature changes because energy is transferred, not destroyed.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['endothermic'],
			['takes energy from surroundings', 'energy absorbed from surroundings'],
			['surroundings cool', 'temperature falls']
		],
		repairSuccess: 'You followed energy from the cooling surroundings into the endothermic change.',
		transferPromptLead:
			'A reaction mixture cools from 25 °C to 18 °C. Which statement best explains the observation?',
		transferChoices: [
			{
				id: 'exo-to',
				text: 'It is exothermic because energy transfers into the surroundings.',
				feedback: 'Energy moving into surroundings would tend to warm them.',
				correct: false
			},
			{
				id: 'endo-from',
				text: 'It is endothermic because energy transfers from the surroundings.',
				feedback: 'This explains why the measured surroundings become cooler.',
				correct: true
			},
			{
				id: 'neither',
				text: 'It is neither because energy cannot move during reactions.',
				feedback: 'Chemical reactions can transfer energy to or from surroundings.',
				correct: false
			}
		],
		transferExplanation:
			'The setting changed, but a temperature decrease still means the surroundings lost energy to an endothermic change.',
		memoryHandle: 'Surroundings cool → energy taken in → endothermic'
	},
	{
		...reviewStamp,
		id: 'chemistry-lithium-flame',
		slug: 'lithium-crimson-flame-test',
		subject: 'chemistry',
		title: 'Which ion gives a crimson flame?',
		topic: 'Chemical analysis: flame tests',
		subjectArtTheme: 'practical-analysis',
		hook: 'The conclusion comes from matching one observed colour to the correct metal ion.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'A clean wire loop carrying a solid sample produces a crimson flame. Identify the metal ion and explain your conclusion.',
		metaDescription:
			'Match a crimson observation to lithium in this GCSE Chemistry flame-test challenge and distinguish it from sodium and potassium colours.',
		staticAnswers: {
			a: 'The sample contains sodium ions because sodium gives a bright flame. A strong colour is enough to identify sodium without naming the particular colour.',
			b: 'The sample contains lithium ions because lithium gives a crimson flame. The observed crimson colour matches the characteristic result for lithium ions.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B matches the precise crimson observation to lithium. Answer A substitutes sodium and relies on brightness, while sodium is identified by a yellow flame.',
		commandWordLesson:
			'Name the observed flame colour and match it directly to the ion; brightness alone is not an identity test.',
		diagnosisPrompt: 'Why does Answer A identify the wrong ion?',
		diagnosisChoices: [
			{
				id: 'sodium-colour',
				text: 'It ignores that sodium gives yellow rather than crimson.',
				feedback: 'The observed crimson flame matches lithium, not sodium.',
				correct: true
			},
			{
				id: 'solid-sample',
				text: 'It accepts that a solid sample can be tested.',
				feedback: 'A small solid sample can be placed on the loop.',
				correct: false
			},
			{
				id: 'clean-loop',
				text: 'It accepts the result from a clean wire loop.',
				feedback: 'A clean loop helps avoid contamination between samples.',
				correct: false
			}
		],
		repairPrompt: 'Which conclusion matches the observed colour?',
		repairChoices: [
			{
				id: 'sodium',
				text: 'Sodium ions are present because sodium gives a yellow flame.',
				feedback: 'That colour does not match the crimson observation.',
				correct: false
			},
			{
				id: 'potassium',
				text: 'Potassium ions are present because potassium gives a lilac flame.',
				feedback: 'Lilac does not match the observed crimson colour.',
				correct: false
			},
			{
				id: 'lithium',
				text: 'Lithium ions are present because lithium gives a crimson flame.',
				feedback: 'This matches the observation to the characteristic lithium colour.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['lithium', 'Li+'],
			['crimson', 'crimson red']
		],
		repairSuccess: 'You used the exact crimson observation to identify lithium ions.',
		transferPromptLead:
			'A second clean sample produces a lilac flame. Which conclusion is supported?',
		transferChoices: [
			{
				id: 'sodium-yellow',
				text: 'Sodium ions are present because sodium gives yellow.',
				feedback: 'Yellow does not match the observed lilac flame.',
				correct: false
			},
			{
				id: 'lithium-crimson',
				text: 'Lithium ions are present because lithium gives crimson.',
				feedback: 'Crimson does not match the observed lilac flame.',
				correct: false
			},
			{
				id: 'potassium-lilac',
				text: 'Potassium ions are present because potassium gives lilac.',
				feedback: 'This is the correct match between flame colour and ion.',
				correct: true
			}
		],
		transferExplanation:
			'The colour changed, but the rule did not: identify the ion by matching its characteristic flame colour.',
		memoryHandle: 'Observe exact flame colour → match metal ion'
	},
	{
		...reviewStamp,
		id: 'chemistry-mixed-flame-colours',
		slug: 'sodium-masks-flame-colours',
		subject: 'chemistry',
		title: 'Can one flame colour hide another ion?',
		topic: 'Chemical analysis: flame tests',
		subjectArtTheme: 'practical-analysis',
		hook: 'A strong sodium colour can dominate a mixture, so one visible colour may not describe every ion present.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'A mixed salt sample gives a bright yellow flame. Explain what can and cannot be concluded from this result.',
		metaDescription:
			'Interpret a mixed-salt flame test in GCSE Chemistry by identifying sodium while recognising that its bright colour may mask other ions.',
		staticAnswers: {
			a: 'The yellow flame supports the presence of sodium ions. However, sodium can mask other flame colours, so the result does not prove that sodium is the only metal ion.',
			b: 'The yellow flame proves that sodium is the only metal ion present. Any second metal ion would always produce a separate colour that remains clearly visible.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A identifies sodium while respecting the limitation of a mixed sample. Answer B assumes every ion colour remains visible, although sodium can mask weaker colours.',
		commandWordLesson:
			'Separate the positive identification from the limitation: yellow supports sodium, but a mixture can contain additional ions whose colours are masked.',
		diagnosisPrompt: 'Which claim in Answer B goes beyond the evidence?',
		diagnosisChoices: [
			{
				id: 'yellow-sodium',
				text: 'It links a yellow flame with sodium ions in the sample.',
				feedback: 'Yellow is the characteristic flame colour for sodium ions.',
				correct: false
			},
			{
				id: 'only-ion',
				text: 'It says the yellow result proves sodium is the only ion.',
				feedback: 'Sodium can mask colours from other metal ions in a mixture.',
				correct: true
			},
			{
				id: 'bright-colour',
				text: 'It describes the observed yellow flame as bright in colour.',
				feedback: 'The error is the exclusive conclusion, not the brightness description.',
				correct: false
			}
		],
		repairPrompt: 'Which conclusion is properly limited?',
		repairChoices: [
			{
				id: 'all-visible',
				text: 'Only sodium is present because all ion colours remain visible.',
				feedback: 'Sodium can mask other flame colours in mixed samples.',
				correct: false
			},
			{
				id: 'no-sodium',
				text: 'Sodium is absent because yellow is not a flame-test colour.',
				feedback: 'Yellow is the characteristic positive result for sodium.',
				correct: false
			},
			{
				id: 'sodium-may-mask',
				text: 'Sodium is present, but its yellow may mask other colours.',
				feedback: 'This identifies sodium without excluding additional metal ions.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['sodium', 'Na+'],
			['yellow flame', 'yellow'],
			['mask other colours', 'other ions may be present']
		],
		repairSuccess:
			'You identified sodium while keeping open the possibility that its strong colour hides other ions.',
		transferPromptLead:
			'A mixture produces a yellow flame even though potassium may also be present. Which statement is justified?',
		transferChoices: [
			{
				id: 'potassium-absent',
				text: 'Potassium is definitely absent because no lilac colour is visible.',
				feedback: 'Sodium yellow can mask the lilac colour from potassium.',
				correct: false
			},
			{
				id: 'sodium-only',
				text: 'Only sodium is present because mixtures always separate their colours.',
				feedback: 'Colours may overlap or be masked rather than appearing separately.',
				correct: false
			},
			{
				id: 'potassium-possible',
				text: 'Sodium is present, while potassium may be hidden by yellow.',
				feedback: 'This keeps the positive sodium result and the masking limitation.',
				correct: true
			}
		],
		transferExplanation:
			'In any mixed sample, identify the visible colour but avoid excluding ions whose colours could have been masked.',
		memoryHandle: 'Visible colour → likely ion → check masking limitation'
	},
	{
		...reviewStamp,
		id: 'chemistry-dimer-equilibrium-pressure',
		slug: 'nitrogen-dioxide-pressure-equilibrium',
		subject: 'chemistry',
		title: 'Which side does higher pressure favour?',
		topic: 'Rates and equilibrium: changing pressure (HT only)',
		subjectArtTheme: 'reactions-energy',
		hook: 'Count gaseous molecules on each side before predicting the direction of movement.',
		arc: 'connect-cause-to-effect',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'For $\\mathrm{2NO_2(g) \\rightleftharpoons N_2O_4(g)}$, explain how increasing pressure changes the equilibrium amount of $\\mathrm{N_2O_4}$.',
		metaDescription:
			'Use GCSE Chemistry equilibrium reasoning to count gas molecules and predict how higher pressure changes nitrogen tetroxide yield.',
		staticAnswers: {
			a: 'There are two gas molecules on the left and one on the right. Higher pressure shifts equilibrium right towards fewer gas molecules, increasing the amount of N₂O₄.',
			b: 'There are two gas molecules on the left and one on the right. Higher pressure shifts equilibrium left towards more gas molecules, decreasing the amount of N₂O₄.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers count the gaseous molecules correctly. Answer B then follows higher pressure towards the side with more molecules, which reverses the equilibrium rule.',
		commandWordLesson:
			'Count gaseous molecules on each side, choose the side with fewer for increased pressure, then state how the named equilibrium amount changes.',
		diagnosisPrompt: 'Which step first makes Answer B wrong?',
		diagnosisChoices: [
			{
				id: 'two-left',
				text: "It counts two gas molecules on the equation's left side.",
				feedback: 'The coefficient before NO₂ is two, so this count is correct.',
				correct: false
			},
			{
				id: 'one-right',
				text: "It counts one gas molecule on the equation's right side.",
				feedback: 'No coefficient before N₂O₄ means one molecule.',
				correct: false
			},
			{
				id: 'favours-more',
				text: 'It says increased pressure favours the side with more molecules.',
				feedback: 'Increased pressure favours the side with fewer gas molecules.',
				correct: true
			}
		],
		repairPrompt: 'Which prediction follows the pressure rule?',
		repairChoices: [
			{
				id: 'right-fewer',
				text: 'Shift right towards one gas molecule, increasing N₂O₄ amount.',
				feedback: 'This correctly favours the side with fewer gaseous molecules.',
				correct: true
			},
			{
				id: 'left-more',
				text: 'Shift left towards two gas molecules, decreasing N₂O₄ amount.',
				feedback: 'This is the response expected for decreased, not increased, pressure.',
				correct: false
			},
			{
				id: 'no-shift',
				text: 'Stay unchanged because both sides contain only gaseous substances.',
				feedback: 'The molecule totals differ, so pressure changes the equilibrium position.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['fewer gas molecules', 'one gas molecule'],
			['shifts right', 'favours the right'],
			['more N2O4', 'N2O4 increases']
		],
		repairSuccess:
			'You counted the gas molecules and followed increased pressure towards the side with fewer.',
		transferPromptLead:
			'For $\\mathrm{2SO_3(g) \\rightleftharpoons 2SO_2(g) + O_2(g)}$, what does increasing pressure do?',
		transferChoices: [
			{
				id: 'right-three',
				text: 'It shifts right because that side has three gas molecules.',
				feedback: 'Increased pressure favours fewer gas molecules, not more.',
				correct: false
			},
			{
				id: 'left-two',
				text: 'It shifts left because that side has two gas molecules.',
				feedback: 'This correctly follows increased pressure towards fewer gas molecules.',
				correct: true
			},
			{
				id: 'unchanged-gases',
				text: 'It stays unchanged because every substance is in the gas state.',
				feedback: 'Pressure depends on unequal gas totals, not simply their state.',
				correct: false
			}
		],
		transferExplanation:
			'Even when the side with fewer molecules changes, increased pressure always favours that smaller gaseous total.',
		memoryHandle: 'Count gas molecules → higher pressure favours fewer'
	},
	{
		...reviewStamp,
		id: 'chemistry-equal-gas-equilibrium',
		slug: 'equal-gas-moles-pressure-equilibrium',
		subject: 'chemistry',
		title: 'What if both equilibrium sides have equal gas totals?',
		topic: 'Rates and equilibrium: changing pressure (HT only)',
		subjectArtTheme: 'reactions-energy',
		hook: 'Pressure cannot favour a smaller gaseous total when the two totals are equal.',
		arc: 'connect-cause-to-effect',
		mechanic: 'first-wrong-step',
		difficulty: 'stretch',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'For $\\mathrm{H_2(g) + I_2(g) \\rightleftharpoons 2HI(g)}$, explain the effect of increasing pressure on the equilibrium position.',
		metaDescription:
			'Count equal gas totals in a GCSE Chemistry equilibrium and decide why increasing pressure does not favour either side.',
		staticAnswers: {
			a: 'There are two gas molecules on the left and two on the right. Higher pressure shifts equilibrium right because the product has the larger coefficient.',
			b: 'There are two gas molecules on the left and two on the right. Higher pressure does not shift equilibrium because neither side has fewer gas molecules.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers count two gaseous molecules on each side. Answer A then shifts right despite the equal totals, while Answer B correctly identifies no pressure preference.',
		commandWordLesson:
			'Count every gaseous coefficient on each side. If the totals are equal, a pressure change does not favour either equilibrium direction.',
		diagnosisPrompt: 'Which step first makes Answer A wrong?',
		diagnosisChoices: [
			{
				id: 'two-left',
				text: 'It totals two gas molecules on the left of the equation.',
				feedback: 'One hydrogen plus one iodine gives a total of two.',
				correct: false
			},
			{
				id: 'shift-right',
				text: 'It predicts a rightward shift despite equal gas totals.',
				feedback: 'Equal gaseous totals give pressure no side to favour.',
				correct: true
			},
			{
				id: 'two-right',
				text: 'It totals two gas molecules on the right of the equation.',
				feedback: 'The coefficient before HI is two, so this is correct.',
				correct: false
			}
		],
		repairPrompt: 'Which conclusion follows from equal gas totals?',
		repairChoices: [
			{
				id: 'shift-left',
				text: 'Pressure shifts equilibrium left because reactants are separate substances.',
				feedback: 'The number of substance types is not the relevant comparison.',
				correct: false
			},
			{
				id: 'shift-right',
				text: 'Pressure shifts equilibrium right because HI has coefficient two.',
				feedback: 'The total coefficient on each side is two.',
				correct: false
			},
			{
				id: 'no-shift',
				text: 'Pressure causes no shift because both sides total two gas molecules.',
				feedback: 'This correctly recognises that neither side has fewer.',
				correct: true
			}
		],
		freeTextKeywordGroups: [
			['two on each side', 'equal gas molecules'],
			['no shift', 'does not change equilibrium'],
			['neither side has fewer', 'equal totals']
		],
		repairSuccess:
			'You compared the complete gas totals and avoided inventing a shift when they were equal.',
		transferPromptLead:
			'For $\\mathrm{CO(g) + H_2O(g) \\rightleftharpoons CO_2(g) + H_2(g)}$, how does increased pressure affect equilibrium?',
		transferChoices: [
			{
				id: 'no-shift',
				text: 'It causes no shift because both sides have two gas molecules.',
				feedback: 'Equal gas totals mean neither side is favoured by pressure.',
				correct: true
			},
			{
				id: 'shift-right',
				text: 'It shifts right because the products have two different gases.',
				feedback: 'Different gas identities do not matter when total numbers are equal.',
				correct: false
			},
			{
				id: 'shift-left',
				text: 'It shifts left because water is included among the reactants.',
				feedback: 'The gas totals, not the name of a reactant, control the response.',
				correct: false
			}
		],
		transferExplanation:
			'For any equilibrium with equal gaseous totals, pressure has no side with fewer molecules to favour.',
		memoryHandle: 'Count both sides → equal gas totals → no pressure shift'
	},
	{
		...reviewStamp,
		id: 'chemistry-reusable-bottle-life-cycle',
		slug: 'reusable-bottle-life-cycle',
		subject: 'chemistry',
		title: 'When does a reusable bottle have lower impact?',
		topic: 'Using resources: life-cycle assessment',
		subjectArtTheme: 'materials-industry',
		hook: 'A higher manufacturing impact may be spread across many uses, so one stage cannot settle the comparison.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A reusable aluminium bottle needs more energy to manufacture than one disposable plastic bottle. Explain why this fact alone cannot identify the lower-impact option.',
		metaDescription:
			'Compare bottles in a GCSE Chemistry life-cycle assessment across manufacture, transport, repeated use and disposal on an equal basis.',
		staticAnswers: {
			a: 'The disposable bottle must have lower environmental impact because its manufacture uses less energy. Manufacturing is the only stage needed for this comparison.',
			b: 'The whole life cycle must be compared, including raw materials, manufacture, transport, number of uses and disposal. The options need comparison for the same amount of service.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B compares the complete life cycles on an equivalent-use basis. Answer A turns one manufacturing advantage into a verdict and ignores repeated use and later stages.',
		commandWordLesson:
			'When one fact is insufficient, name the missing life-cycle stages and explain that the alternatives need an equivalent basis for comparison.',
		diagnosisPrompt: 'What is the decisive weakness in Answer A?',
		diagnosisChoices: [
			{
				id: 'one-stage',
				text: 'It judges the whole comparison using only manufacturing energy.',
				feedback: 'A life-cycle assessment includes every stage and realistic use.',
				correct: true
			},
			{
				id: 'plastic-exists',
				text: 'It accepts that a disposable bottle can be made from plastic.',
				feedback: 'The material is part of the given comparison, not the error.',
				correct: false
			},
			{
				id: 'energy-measured',
				text: 'It treats manufacturing energy as relevant environmental evidence.',
				feedback: 'Manufacturing energy matters, but it is only one contribution.',
				correct: false
			}
		],
		repairPrompt: 'Which evidence would make the comparison meaningful?',
		repairChoices: [
			{
				id: 'colour-popularity',
				text: 'Bottle colours and which design customers say they prefer.',
				feedback: 'Preference does not measure environmental impact across a life cycle.',
				correct: false
			},
			{
				id: 'whole-life-uses',
				text: 'Impacts across all stages and a realistic number of uses.',
				feedback: 'This gives the full scope and an equivalent-use basis.',
				correct: true
			},
			{
				id: 'manufacture-only',
				text: 'Manufacturing energy alone, measured with an extra decimal place.',
				feedback: 'Extra precision does not replace the missing life-cycle stages.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['raw materials', 'material extraction'],
			['manufacture', 'manufacturing'],
			['number of uses', 'reuse'],
			['disposal', 'end of life']
		],
		repairSuccess:
			'You replaced a one-stage verdict with a whole-life comparison for the same service.',
		transferPromptLead:
			'A glass container is heavier to transport but can be reused many times. Which comparison is fair?',
		transferChoices: [
			{
				id: 'transport-only',
				text: 'Compare transport only because heavier products always have higher impact.',
				feedback: 'Reuse, manufacture and disposal may alter the overall result.',
				correct: false
			},
			{
				id: 'whole-service',
				text: 'Compare all stages for containers providing the same number of uses.',
				feedback: 'This uses a complete life cycle and equivalent service.',
				correct: true
			},
			{
				id: 'reuse-only',
				text: 'Compare reuse only because manufacturing and disposal no longer matter.',
				feedback: 'Every life-cycle stage can contribute environmental impact.',
				correct: false
			}
		],
		transferExplanation:
			'For bottles or containers, environmental comparison needs every stage and the same service rather than a single attractive feature.',
		memoryHandle: 'Whole life cycle → equivalent use → fair comparison'
	},
	{
		...reviewStamp,
		id: 'chemistry-phone-life-cycle',
		slug: 'phone-refurbishment-life-cycle',
		subject: 'chemistry',
		title: 'Does refurbishing always settle a life-cycle choice?',
		topic: 'Using resources: life-cycle assessment',
		subjectArtTheme: 'materials-industry',
		hook: 'Extending product life can reduce new extraction, but a fair verdict still includes every stage and equivalent use.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A refurbished phone avoids making one new phone but may need replacement parts and extra transport. Explain what must be compared with buying new.',
		metaDescription:
			'Evaluate refurbished and new phones with a GCSE Chemistry life-cycle comparison covering materials, manufacture, use, transport and disposal.',
		staticAnswers: {
			a: 'Compare raw-material extraction, replacement parts, manufacture, transport, useful lifetime and disposal for both choices. Use the same period of phone service as the basis.',
			b: 'The refurbished phone must be better because no new phone is assembled. Replacement parts, transport, lifetime and disposal cannot change that conclusion.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A includes the complete life cycle and an equivalent period of use. Answer B assumes one avoided stage settles the outcome and excludes relevant impacts.',
		commandWordLesson:
			'A fair evaluation follows both alternatives through materials, manufacture, transport, use and disposal, then compares the same service delivered.',
		diagnosisPrompt: 'Why is Answer B too certain?',
		diagnosisChoices: [
			{
				id: 'refurbished-exists',
				text: 'It accepts that a used phone can receive replacement parts.',
				feedback: 'Replacement parts are a relevant part of the life cycle.',
				correct: false
			},
			{
				id: 'new-assembly',
				text: 'It notes that refurbishing can avoid assembling one new phone.',
				feedback: 'That may be a benefit, but it cannot settle every stage.',
				correct: false
			},
			{
				id: 'one-benefit',
				text: 'It treats one avoided stage as proof of the final result.',
				feedback: 'All stages and equivalent useful life need comparison.',
				correct: true
			}
		],
		repairPrompt: 'Which approach supports a fair evaluation?',
		repairChoices: [
			{
				id: 'whole-life',
				text: 'Compare every stage for the same period of useful service.',
				feedback: 'This covers the full life cycle on an equivalent basis.',
				correct: true
			},
			{
				id: 'purchase-price',
				text: 'Compare purchase prices alone and ignore how long phones last.',
				feedback: 'Price alone does not assess environmental impact or equivalent service.',
				correct: false
			},
			{
				id: 'transport-only',
				text: 'Compare transport alone and assume every other impact is equal.',
				feedback: 'That assumption removes most of the life cycle without evidence.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['raw materials', 'material extraction'],
			['manufacture', 'replacement parts'],
			['useful lifetime', 'same period of use'],
			['disposal', 'end of life']
		],
		repairSuccess:
			'You compared the full life cycles over an equivalent useful period instead of assuming one benefit settles the result.',
		transferPromptLead:
			'A repaired laptop lasts three more years but needs a new battery. Which evidence is required to compare it with replacement?',
		transferChoices: [
			{
				id: 'battery-only',
				text: 'Only the battery impact, because the extra lifetime is irrelevant.',
				feedback: 'Lifetime and avoided replacement are central to the comparison.',
				correct: false
			},
			{
				id: 'price-only',
				text: 'Only the purchase prices, because environmental stages cannot be measured.',
				feedback: 'A life-cycle assessment compares environmental impacts, not price alone.',
				correct: false
			},
			{
				id: 'full-cycle',
				text: 'All stages for each option across the same three-year service.',
				feedback: 'This includes the battery and compares equivalent use.',
				correct: true
			}
		],
		transferExplanation:
			'For phones or laptops, compare materials, manufacture, transport, use and disposal across the same useful service.',
		memoryHandle: 'All stages → same useful service → evidence-led choice'
	}
] satisfies ChallengeDefinition[];

export const chemistryCurriculumAliases = {
	'chemistry-brass-hardness': 'chemistry-alloy-hardness',
	'chemistry-pure-metal-bending': 'chemistry-alloy-hardness',
	'chemistry-concentration-collisions': 'chemistry-collision-rate',
	'chemistry-pressure-collisions': 'chemistry-collision-rate',
	'chemistry-magnesium-oxide-mass': 'chemistry-stoichiometric-mass',
	'chemistry-carbon-dioxide-mass': 'chemistry-stoichiometric-mass',
	'chemistry-river-water-solids': 'chemistry-constant-mass',
	'chemistry-water-solids-comparison': 'chemistry-constant-mass',
	'chemistry-sodium-chloride-bond': 'chemistry-ionic-bonding',
	'chemistry-magnesium-oxide-bond': 'chemistry-ionic-bonding',
	'chemistry-magnesium-chloride-electrolysis': 'chemistry-molten-electrolysis',
	'chemistry-aluminium-oxide-electrolysis': 'chemistry-molten-electrolysis',
	'chemistry-neutralisation-energy': 'chemistry-exothermic-energy',
	'chemistry-cold-pack-energy': 'chemistry-exothermic-energy',
	'chemistry-lithium-flame': 'chemistry-flame-tests',
	'chemistry-mixed-flame-colours': 'chemistry-flame-tests',
	'chemistry-dimer-equilibrium-pressure': 'chemistry-equilibrium-pressure',
	'chemistry-equal-gas-equilibrium': 'chemistry-equilibrium-pressure',
	'chemistry-reusable-bottle-life-cycle': 'chemistry-life-cycle',
	'chemistry-phone-life-cycle': 'chemistry-life-cycle'
} as const;
