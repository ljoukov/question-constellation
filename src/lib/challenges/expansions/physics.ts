import type { ChallengeDefinition } from '../types';

const reviewStamp = {
	lastReviewed: '2026-07-21',
	version: 1
} as const;

export const physicsExpansion = [
	{
		...reviewStamp,
		id: 'physics-exp-bike-pump-pressure',
		slug: 'bike-pump-pressure-at-constant-temperature',
		subject: 'physics',
		title: 'Why does pressure rise in a bicycle pump?',
		topic: 'Particle model: pressure in gases',
		subjectArtTheme: 'thermal-particles',
		hook: 'A smaller volume changes collision frequency, even when particle speed stays the same.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A sealed bicycle pump contains a fixed mass of air. Its volume is halved slowly while its temperature stays constant. Explain why the gas pressure rises.',
		metaDescription:
			'Practise GCSE Physics gas pressure by repairing a constant-temperature particle explanation and transferring it to a sealed piston.',
		staticAnswers: {
			a: 'Halving the volume makes the particles move twice as fast, so they strike the pump walls harder and raise the pressure.',
			b: 'Halving the volume makes particles strike the pump walls more often; the greater collision rate raises force per area and pressure.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'The fixed temperature means average particle speed stays constant. Compression shortens the distance between wall collisions, so collisions become more frequent and pressure rises.',
		commandWordLesson:
			'For “explain why”, connect the stated volume change to wall collisions and then to pressure. Do not invent a temperature or speed change.',
		diagnosisPrompt: 'Where does Answer A first become scientifically incorrect?',
		diagnosisChoices: [
			{
				id: 'speed-doubles',
				text: 'It says particle speed doubles although the gas temperature stays constant.',
				feedback:
					'Correct. At constant temperature, use collision frequency rather than increased speed.',
				correct: true
			},
			{
				id: 'fixed-mass-valid',
				text: 'It assumes the sealed pump keeps the same mass of gas inside.',
				feedback: 'That assumption is stated and is needed for the pressure comparison.',
				correct: false
			},
			{
				id: 'walls-valid',
				text: 'It links gas pressure to particles colliding with the container walls.',
				feedback: 'That link is valid; the error is the unsupported increase in particle speed.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement supplies the correct particle-model link?',
		repairChoices: [
			{
				id: 'frequency-link',
				text: 'The reduced volume makes particles strike the pump walls more frequently.',
				feedback: 'Yes. More frequent wall collisions increase pressure at constant temperature.',
				correct: true
			},
			{
				id: 'particle-size-link',
				text: 'The reduced volume makes every air particle expand and press outward.',
				feedback: 'Compression changes particle spacing, not the size of individual particles.',
				correct: false
			},
			{
				id: 'particle-number-link',
				text: 'The reduced volume creates extra air particles beside the pump walls.',
				feedback: 'The mass is fixed, so compression does not create additional particles.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['smaller volume', 'reduced volume', 'volume decreases'],
			['more frequent', 'more often', 'collision rate increases'],
			['walls', 'wall collisions']
		],
		repairSuccess:
			'You held particle speed constant and used the shorter distance between wall collisions to explain the pressure increase.',
		transferPromptLead:
			'A fixed mass of gas in a sealed piston expands at constant temperature. Which explanation correctly predicts the pressure change?',
		transferChoices: [
			{
				id: 'pressure-falls-frequency',
				text: 'Pressure falls because particles strike the container walls less frequently after expansion.',
				feedback:
					'Correct. Greater volume means fewer wall collisions per second at constant temperature.',
				correct: true
			},
			{
				id: 'pressure-rises-speed',
				text: 'Pressure rises because the particles speed up as the gas volume increases.',
				feedback: 'Constant temperature means average particle speed does not rise.',
				correct: false
			},
			{
				id: 'pressure-fixed-count',
				text: 'Pressure stays constant because the number of gas particles has not changed.',
				feedback: 'Particle number is fixed, but collision frequency changes with volume.',
				correct: false
			}
		],
		transferExplanation:
			'Compression and expansion reverse the volume change, but the same chain applies: volume changes wall-collision frequency, which changes pressure.',
		memoryHandle: 'Volume → wall-collision frequency → pressure'
	},
	{
		...reviewStamp,
		id: 'physics-exp-sealed-balloon-pressure',
		slug: 'sealed-balloon-volume-and-pressure',
		subject: 'physics',
		title: 'What happens when a fixed gas volume increases?',
		topic: 'Particle model: pressure in gases',
		subjectArtTheme: 'thermal-particles',
		hook: 'The particle count stays fixed, but a larger volume changes how often the wall is hit.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'A flexible sealed container holds a fixed mass of gas at constant temperature. Its volume increases. Explain what happens to the gas pressure.',
		metaDescription:
			'Use GCSE Physics particle ideas to explain how expansion changes gas pressure, then apply the same collision chain to compression.',
		staticAnswers: {
			a: 'The particles travel farther between wall collisions, so they hit the walls less often and the gas pressure decreases.',
			b: 'The particles spread out, so each particle loses mass and the weaker particles make the gas pressure decrease.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Expansion increases particle spacing but does not change an individual particle’s mass. The pressure falls because wall collisions occur less frequently at constant temperature.',
		commandWordLesson:
			'An explanation needs the direction of the pressure change and the particle link that causes it. Keep particle properties separate from particle spacing.',
		diagnosisPrompt: 'What is the decisive error in Answer B?',
		diagnosisChoices: [
			{
				id: 'mass-loss',
				text: 'It claims individual gas particles lose mass when the gas expands.',
				feedback: 'Correct. Expansion changes spacing, not the mass of each particle.',
				correct: true
			},
			{
				id: 'spacing-change',
				text: 'It says particles become more spread out when the volume increases.',
				feedback: 'That spacing change is valid for a fixed number of particles.',
				correct: false
			},
			{
				id: 'pressure-direction',
				text: 'It predicts that gas pressure decreases when the volume becomes larger.',
				feedback: 'That direction is correct; the explanation for it is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which statement replaces the invalid particle-mass claim?',
		repairChoices: [
			{
				id: 'farther-fewer',
				text: 'Particles travel farther and strike the container walls less frequently.',
				feedback: 'This supplies the collision-frequency link that lowers pressure.',
				correct: true
			},
			{
				id: 'cooler-slower',
				text: 'Particles become colder and therefore move more slowly after expansion.',
				feedback: 'The question states that temperature remains constant.',
				correct: false
			},
			{
				id: 'fewer-particles',
				text: 'Particles escape, leaving fewer particles available to make wall collisions.',
				feedback: 'The container is sealed, so the particle number stays fixed.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['volume increases', 'larger volume', 'expands'],
			['less frequent collisions', 'fewer collisions', 'hit less often'],
			['pressure decreases', 'pressure falls', 'lower pressure']
		],
		repairSuccess:
			'You replaced a false change to particle mass with the correct change to wall-collision frequency.',
		transferPromptLead:
			'A fixed mass of gas is compressed at constant temperature. Which chain correctly explains the resulting pressure rise?',
		transferChoices: [
			{
				id: 'smaller-fewer-lower',
				text: 'Smaller volume means fewer wall collisions each second, producing lower pressure.',
				feedback: 'A smaller volume increases, rather than decreases, wall-collision frequency.',
				correct: false
			},
			{
				id: 'smaller-more-higher',
				text: 'Smaller volume means more wall collisions each second, producing higher pressure.',
				feedback: 'Correct. This reverses the expansion chain without changing particle speed.',
				correct: true
			},
			{
				id: 'smaller-mass-higher',
				text: 'Smaller volume gives each particle more mass, producing higher pressure.',
				feedback: 'Particle mass does not depend on the container volume.',
				correct: false
			}
		],
		transferExplanation:
			'Whether volume rises or falls, track the distance between wall collisions, then the collision frequency, then pressure.',
		memoryHandle: 'Volume change → collision frequency → pressure change'
	},
	{
		...reviewStamp,
		id: 'physics-exp-thermometer-half-range',
		slug: 'thermometer-half-range-uncertainty',
		subject: 'physics',
		title: 'Can you calculate uncertainty from temperatures?',
		topic: 'Working scientifically: uncertainty',
		subjectArtTheme: 'radiation-measurement',
		hook: 'The range is useful working, but the estimated uncertainty is only half of it.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Repeated temperature readings are 41.2, 41.8, 41.5 and 41.3 °C. Calculate the uncertainty using half the range.',
		metaDescription:
			'Calculate half-range uncertainty in a GCSE Physics measurement challenge, repair the first wrong step and transfer to timing data.',
		staticAnswers: {
			a: 'The range is 41.8 − 41.2 = 0.6 °C, so the uncertainty is ±0.6 °C.',
			b: 'The range is 41.8 − 41.2 = 0.6 °C, so the uncertainty is 0.6 ÷ 2 = ±0.3 °C.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers find the correct range. Answer A stops one operation too early: the estimated uncertainty is half the range, with a ± sign and the measurement unit.',
		commandWordLesson:
			'For “calculate”, show the extreme-value subtraction, halve the range, then report the result with ± and the original unit.',
		diagnosisPrompt: 'Which is the first invalid step in Answer A?',
		diagnosisChoices: [
			{
				id: 'wrong-high',
				text: 'Choosing 41.8 °C as the highest repeated reading.',
				feedback: 'That is the correct highest value in the set.',
				correct: false
			},
			{
				id: 'wrong-subtraction',
				text: 'Subtracting 41.2 °C from 41.8 °C to obtain the range.',
				feedback: 'That correctly gives a range of 0.6 °C.',
				correct: false
			},
			{
				id: 'full-range',
				text: 'Reporting the full 0.6 °C range as the uncertainty.',
				feedback: 'Correct. The range must be divided by two.',
				correct: true
			}
		],
		repairPrompt: 'Which line correctly replaces the final step?',
		repairChoices: [
			{
				id: 'half-range-correct',
				text: 'Uncertainty = 0.6 ÷ 2 = ±0.3 °C.',
				feedback: 'Correct. This halves the range and keeps the unit.',
				correct: true
			},
			{
				id: 'divide-four',
				text: 'Uncertainty = 0.6 ÷ 4 = ±0.15 °C.',
				feedback: 'Do not divide by the number of repeated readings.',
				correct: false
			},
			{
				id: 'use-mean',
				text: 'Uncertainty = 41.45 ÷ 2 = ±20.725 °C.',
				feedback: 'Half the range is needed, not half the mean.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['range', 'highest minus lowest', '41.8 - 41.2'],
			['half', 'divide by two', '÷ 2'],
			['0.3']
		],
		repairSuccess:
			'You preserved the correct range and fixed only the final operation: divide by two and report ±0.3 °C.',
		transferPromptLead:
			'Repeated times are 8.4, 8.8, 8.5 and 8.6 s. Which result gives the half-range uncertainty?',
		transferChoices: [
			{
				id: 'plus-minus-04',
				text: '±0.4 s because 8.8 − 8.4 = 0.4 s.',
				feedback: 'That is the full range, not half the range.',
				correct: false
			},
			{
				id: 'plus-minus-02',
				text: '±0.2 s because (8.8 − 8.4) ÷ 2 = 0.2 s.',
				feedback: 'Correct. The range is 0.4 s and half is 0.2 s.',
				correct: true
			},
			{
				id: 'plus-minus-01',
				text: '±0.1 s because (8.8 − 8.4) ÷ 4 = 0.1 s.',
				feedback: 'The number of readings does not divide the range here.',
				correct: false
			}
		],
		transferExplanation:
			'The quantities and units changed, but the method did not: highest minus lowest gives the range, then divide by two.',
		memoryHandle: 'Highest − lowest → range ÷ 2 → uncertainty'
	},
	{
		...reviewStamp,
		id: 'physics-exp-extension-half-range',
		slug: 'extension-half-range-uncertainty',
		subject: 'physics',
		title: 'Where does the uncertainty calculation go wrong?',
		topic: 'Working scientifically: uncertainty',
		subjectArtTheme: 'radiation-measurement',
		hook: 'Repeated measurements need the two extremes before any division happens.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'A spring extension is measured as 6.1, 6.5, 6.3 and 6.2 cm. Calculate the uncertainty using half the range.',
		metaDescription:
			'Find and repair the first error in a GCSE Physics half-range uncertainty calculation, then reuse the method for voltage readings.',
		staticAnswers: {
			a: 'The range is 6.5 − 6.1 = 0.4 cm. Half the range is 0.4 ÷ 2, so the uncertainty is ±0.2 cm.',
			b: 'The range is 6.5 − 6.2 = 0.3 cm. Half the range is 0.3 ÷ 2, so the uncertainty is ±0.15 cm.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Answer B chooses the wrong lowest reading before applying a correct half-range operation. The first repair is therefore to use 6.1 cm as the minimum.',
		commandWordLesson:
			'Check the selected maximum and minimum before checking arithmetic. A correct later operation cannot rescue an incorrect range.',
		diagnosisPrompt: 'What is the first wrong step in Answer B?',
		diagnosisChoices: [
			{
				id: 'minimum-wrong',
				text: 'It uses 6.2 cm instead of the lowest reading, 6.1 cm.',
				feedback: 'Correct. The range must use the true highest and lowest values.',
				correct: true
			},
			{
				id: 'maximum-right',
				text: 'It uses 6.5 cm as the highest reading in the repeated set.',
				feedback: 'That maximum is correct and should be kept.',
				correct: false
			},
			{
				id: 'halving-right',
				text: 'It divides its calculated range by two to estimate uncertainty.',
				feedback: 'That operation is correct, but the range entering it is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement working produces the correct uncertainty?',
		repairChoices: [
			{
				id: 'mean-divided',
				text: 'Mean = 6.275 cm, so uncertainty = 6.275 ÷ 2 = 3.1375 cm.',
				feedback: 'The method halves the range, not the mean.',
				correct: false
			},
			{
				id: 'correct-range',
				text: 'Range = 6.5 − 6.1 = 0.4 cm, so uncertainty = ±0.2 cm.',
				feedback: 'Correct. This selects both extremes and halves their difference.',
				correct: true
			},
			{
				id: 'full-range-again',
				text: 'Range = 6.5 − 6.1 = 0.4 cm, so uncertainty = ±0.4 cm.',
				feedback: 'This finds the range but does not halve it.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['6.5', 'highest', 'maximum'],
			['6.1', 'lowest', 'minimum'],
			['0.2', 'half the range']
		],
		repairSuccess:
			'You repaired the earliest error by selecting the true minimum, then kept the valid half-range operation.',
		transferPromptLead:
			'Repeated voltages are 2.41, 2.45, 2.39 and 2.42 V. Which working gives the estimated uncertainty?',
		transferChoices: [
			{
				id: 'voltage-half-range',
				text: '(2.45 − 2.39) ÷ 2 = ±0.03 V',
				feedback: 'Correct. The range is 0.06 V, and half is 0.03 V.',
				correct: true
			},
			{
				id: 'voltage-full-range',
				text: '(2.45 − 2.39) = ±0.06 V',
				feedback: 'This reports the full range rather than half the range.',
				correct: false
			},
			{
				id: 'voltage-wrong-min',
				text: '(2.45 − 2.41) ÷ 2 = ±0.02 V',
				feedback: 'This does not use the lowest reading, 2.39 V.',
				correct: false
			}
		],
		transferExplanation:
			'The same check order works every time: identify both extremes, subtract to find the range, then halve it.',
		memoryHandle: 'Extremes → range → half-range uncertainty'
	},
	{
		...reviewStamp,
		id: 'physics-exp-moon-weight',
		slug: 'mass-and-weight-on-the-moon',
		subject: 'physics',
		title: 'Does mass change on the Moon?',
		topic: 'Forces: mass, weight and gravitational field strength',
		subjectArtTheme: 'forces-motion',
		hook: 'The object carries the same mass, but its weight follows the local gravitational field.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'A 12 kg equipment case is moved from Earth, where g = 9.8 N/kg, to the Moon, where g = 1.6 N/kg. Explain how its mass and weight change.',
		metaDescription:
			'Practise GCSE Physics mass and weight by separating an object’s fixed mass from changing gravitational field strength on the Moon.',
		staticAnswers: {
			a: 'Its mass falls because lunar gravity is weaker. Its weight falls as well, because both mass and gravitational field strength decrease.',
			b: 'Its mass remains 12 kg because the amount of matter is unchanged. Its weight falls because W = mg and lunar g is smaller.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Mass is the amount of matter and does not depend on location. Weight is a force, W = mg, so the lower lunar gravitational field strength reduces weight.',
		commandWordLesson:
			'When asked about both mass and weight, give a separate statement and reason for each. Use kilograms for mass and newtons for weight.',
		diagnosisPrompt: 'Which claim makes Answer A incorrect?',
		diagnosisChoices: [
			{
				id: 'mass-falls',
				text: 'It says the case loses mass when moved to weaker gravity.',
				feedback: 'Correct. Its amount of matter and mass remain unchanged.',
				correct: true
			},
			{
				id: 'weight-falls',
				text: 'It says the case has less weight where gravitational field strength is lower.',
				feedback: 'That is correct because weight is directly proportional to g.',
				correct: false
			},
			{
				id: 'uses-two-factors',
				text: 'It considers both mass and gravitational field strength in the weight relationship.',
				feedback: 'Those are the correct variables; only its claimed mass change is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly distinguishes mass from weight?',
		repairChoices: [
			{
				id: 'mass-same-weight-lower',
				text: 'Mass stays 12 kg; lower g makes W = mg smaller.',
				feedback: 'Correct. This keeps mass fixed and changes weight with g.',
				correct: true
			},
			{
				id: 'mass-lower-weight-same',
				text: 'Mass becomes smaller; lower g keeps W = mg unchanged.',
				feedback: 'Neither claim follows: mass is fixed and weight becomes smaller.',
				correct: false
			},
			{
				id: 'both-same',
				text: 'Mass and weight both stay unchanged because the case is identical.',
				feedback: 'The object is identical, but the local gravitational field is not.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['mass stays the same', 'mass unchanged', '12 kg'],
			['g is lower', 'weaker gravitational field', '1.6 N/kg'],
			['weight decreases', 'weight is lower', 'less weight']
		],
		repairSuccess:
			'You kept mass tied to the object and made only weight respond to the smaller gravitational field strength.',
		transferPromptLead:
			'A 5.0 kg sensor is on a planet where g = 4.0 N/kg. Which pair gives its mass and weight there?',
		transferChoices: [
			{
				id: 'five-twenty',
				text: 'Mass 5.0 kg and weight 20 N, using W = mg.',
				feedback: 'Correct. Mass stays 5.0 kg and 5.0 × 4.0 = 20 N.',
				correct: true
			},
			{
				id: 'twenty-five',
				text: 'Mass 20 kg and weight 5.0 N, using g = Wm.',
				feedback: 'The quantities are reversed and the relationship is incorrect.',
				correct: false
			},
			{
				id: 'one-point-two-five',
				text: 'Mass 1.25 kg and weight 5.0 N, using m = W/g.',
				feedback: 'Moving location does not divide the object’s mass by g.',
				correct: false
			}
		],
		transferExplanation:
			'The location changes g, not mass. Keep the mass in kilograms and multiply it by local g to obtain weight in newtons.',
		memoryHandle: 'Mass stays fixed → local g changes → W = mg'
	},
	{
		...reviewStamp,
		id: 'physics-exp-lifted-crate-weight',
		slug: 'weight-while-a-crate-accelerates',
		subject: 'physics',
		title: 'Does acceleration change an object’s weight?',
		topic: 'Forces: weight and resultant force',
		subjectArtTheme: 'forces-motion',
		hook: 'A larger lifting force changes the resultant, not the definition of weight.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A 20 kg crate accelerates upward near Earth. Explain whether its weight changes while it accelerates, assuming g remains 9.8 N/kg.',
		metaDescription:
			'Use GCSE Physics W = mg to separate weight from resultant force during upward acceleration, then apply it to a descending load.',
		staticAnswers: {
			a: 'Its weight increases because upward acceleration makes g larger. The lifting force must therefore equal the crate’s greater weight.',
			b: 'Its weight remains 196 N because mass and g are unchanged. The lifting force exceeds weight, producing an upward resultant force.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Weight remains W = 20 × 9.8 = 196 N while mass and g stay fixed. Upward acceleration means the lifting force is larger than weight, not that weight increases.',
		commandWordLesson:
			'Distinguish an individual force from the resultant. Calculate weight from mass and g, then use force balance to explain acceleration.',
		diagnosisPrompt: 'What does Answer A confuse?',
		diagnosisChoices: [
			{
				id: 'acceleration-with-g',
				text: 'It treats the crate’s upward acceleration as a larger gravitational field strength.',
				feedback: 'Correct. Local g is stated to remain 9.8 N/kg.',
				correct: true
			},
			{
				id: 'mass-fixed',
				text: 'It assumes the crate keeps the same mass while it is lifted.',
				feedback: 'That is correct; the crate does not lose or gain matter.',
				correct: false
			},
			{
				id: 'force-needed',
				text: 'It recognises that an upward force acts on the accelerating crate.',
				feedback: 'That is valid, although the force comparison is then described incorrectly.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly relates weight and acceleration?',
		repairChoices: [
			{
				id: 'weight-unchanged-resultant',
				text: 'Weight stays 196 N; lifting force exceeds weight, giving an upward resultant.',
				feedback: 'Correct. Weight is fixed while the unequal forces cause acceleration.',
				correct: true
			},
			{
				id: 'weight-zero-resultant',
				text: 'Weight becomes zero; lifting force alone gives the upward resultant.',
				feedback: 'Gravity still acts, so the crate retains its 196 N weight.',
				correct: false
			},
			{
				id: 'weight-equals-lift',
				text: 'Weight stays 196 N; lifting force equals weight during upward acceleration.',
				feedback: 'Equal forces would give zero resultant and no acceleration.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['weight stays the same', 'weight unchanged', '196 N'],
			['lifting force greater', 'lift exceeds weight', 'upward resultant'],
			['mass and g unchanged', 'W = mg']
		],
		repairSuccess:
			'You kept W = mg separate from the force imbalance that produces the crate’s upward acceleration.',
		transferPromptLead:
			'A 10 kg load accelerates downward near Earth while g stays 9.8 N/kg. Which statement is correct?',
		transferChoices: [
			{
				id: 'weight-98-support-less',
				text: 'Weight is 98 N and the upward support force is less than 98 N.',
				feedback: 'Correct. The force imbalance is downward while weight remains W = mg.',
				correct: true
			},
			{
				id: 'weight-less-support-98',
				text: 'Weight becomes less than 98 N and support stays exactly 98 N.',
				feedback: 'Mass and g fix weight at 98 N; support is the smaller force.',
				correct: false
			},
			{
				id: 'weight-98-support-more',
				text: 'Weight is 98 N and the upward support force exceeds 98 N.',
				feedback: 'That would produce an upward rather than downward resultant.',
				correct: false
			}
		],
		transferExplanation:
			'Acceleration direction comes from the resultant force. Weight remains mass × g whenever mass and local gravitational field strength are unchanged.',
		memoryHandle: 'W = mg → compare other force → resultant'
	},
	{
		...reviewStamp,
		id: 'physics-exp-trolley-collision-momentum',
		slug: 'trolley-collision-momentum-sharing',
		subject: 'physics',
		title: 'Where does the trolley’s momentum go?',
		topic: 'Forces: conservation of momentum',
		subjectArtTheme: 'forces-motion',
		hook: 'The moving trolley slows because momentum is redistributed, not destroyed.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A moving trolley collides with a stationary trolley and they move apart. Explain why the first trolley slows, using conservation of momentum.',
		metaDescription:
			'Practise GCSE Physics momentum conservation by repairing a trolley-collision explanation and transferring the chain to ice hockey.',
		staticAnswers: {
			a: 'The first trolley’s momentum is converted into sound, so total momentum falls. Its unchanged mass then gives it a lower velocity.',
			b: 'Total momentum is conserved. The second trolley gains momentum, so the first loses momentum and its velocity falls because its mass is unchanged.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Energy may transfer to sound, but momentum is not converted into sound. In the closed trolley system, total momentum stays constant and is redistributed between the trolleys.',
		commandWordLesson:
			'For a momentum explanation, define the system, state conservation, track each object’s gain or loss, then link momentum to velocity.',
		diagnosisPrompt: 'What is the first incorrect link in Answer A?',
		diagnosisChoices: [
			{
				id: 'sound-conversion',
				text: 'It says momentum is converted into sound and the system total falls.',
				feedback: 'Correct. Energy can become sound, but total momentum remains conserved.',
				correct: true
			},
			{
				id: 'mass-unchanged',
				text: 'It assumes the first trolley keeps the same mass after colliding.',
				feedback: 'That is valid because the trolleys move apart without joining.',
				correct: false
			},
			{
				id: 'velocity-lower',
				text: 'It links lower momentum to lower velocity for an unchanged mass.',
				feedback: 'That p = mv link is correct; the system claim is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly accounts for the trolley system?',
		repairChoices: [
			{
				id: 'momentum-shared',
				text: 'Total momentum stays constant as the second trolley gains momentum from the first.',
				feedback: 'Correct. This describes conservation and redistribution within the system.',
				correct: true
			},
			{
				id: 'momentum-created',
				text: 'The collision creates extra momentum for the second trolley without affecting the first.',
				feedback: 'That would increase the system total and violate conservation.',
				correct: false
			},
			{
				id: 'momentum-stored',
				text: 'The first trolley stores its momentum while giving kinetic energy to the second.',
				feedback: 'The second trolley’s momentum must be balanced by a change elsewhere.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['momentum conserved', 'total momentum stays the same'],
			['second trolley gains momentum', 'momentum transferred'],
			['first trolley loses momentum', 'first slows']
		],
		repairSuccess:
			'You conserved the system total and explained the first trolley’s slowing as momentum transferred to the second.',
		transferPromptLead:
			'A moving ice-hockey puck strikes a stationary puck and slows while the second puck moves. Which explanation is complete?',
		transferChoices: [
			{
				id: 'puck-momentum-shared',
				text: 'Total momentum is conserved; the second puck gains momentum as the first loses momentum.',
				feedback: 'Correct. This accounts for both pucks within one conserved total.',
				correct: true
			},
			{
				id: 'puck-sound-loss',
				text: 'Total momentum falls because some of the first puck’s momentum becomes sound.',
				feedback: 'Sound is an energy transfer, not a destination for momentum.',
				correct: false
			},
			{
				id: 'puck-extra-total',
				text: 'Total momentum rises because the second puck gains momentum during the collision.',
				feedback: 'The first puck loses momentum, keeping the closed-system total constant.',
				correct: false
			}
		],
		transferExplanation:
			'Trolleys and pucks use the same closed-system account: total momentum stays constant while momentum passes from one object to another.',
		memoryHandle: 'Closed system → momentum conserved → momentum redistributed'
	},
	{
		...reviewStamp,
		id: 'physics-exp-coupled-carts-momentum',
		slug: 'coupled-carts-after-a-collision',
		subject: 'physics',
		title: 'Can you conserve momentum when objects join?',
		topic: 'Forces: conservation of momentum',
		subjectArtTheme: 'forces-motion',
		hook: 'After the collision, both masses share one velocity and one total momentum.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 6,
		previewQuestion:
			'A 2.0 kg cart moving at 3.0 m/s collides with a stationary 1.0 kg cart. They join. Calculate their shared velocity.',
		metaDescription:
			'Apply GCSE Physics momentum conservation to joined carts, repair a missing total-mass step and transfer the method to rail wagons.',
		staticAnswers: {
			a: 'Initial momentum is 2.0 × 3.0 = 6.0 kg m/s. Shared velocity is 6.0 ÷ 2.0 = 3.0 m/s.',
			b: 'Initial momentum is 2.0 × 3.0 = 6.0 kg m/s. Shared velocity is 6.0 ÷ 3.0 = 2.0 m/s.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers correctly find the initial momentum. Once the carts join, that conserved momentum belongs to the combined 3.0 kg mass, not only the original 2.0 kg cart.',
		commandWordLesson:
			'For joined objects, calculate total momentum before the event, conserve it, then divide by the total mass moving together afterwards.',
		diagnosisPrompt: 'Where does Answer A first go wrong?',
		diagnosisChoices: [
			{
				id: 'initial-momentum',
				text: 'It calculates the initial moving cart momentum as 6.0 kg m/s.',
				feedback: 'That calculation, 2.0 × 3.0, is correct.',
				correct: false
			},
			{
				id: 'stationary-zero',
				text: 'It treats the stationary cart’s initial momentum as zero before impact.',
				feedback: 'That is correct because its initial velocity is zero.',
				correct: false
			},
			{
				id: 'wrong-final-mass',
				text: 'It divides conserved momentum by 2.0 kg instead of the joined 3.0 kg.',
				feedback: 'Correct. Both carts move together after the collision.',
				correct: true
			}
		],
		repairPrompt: 'Which final line completes the calculation correctly?',
		repairChoices: [
			{
				id: 'divide-combined-mass',
				text: 'Shared velocity = 6.0 ÷ (2.0 + 1.0) = 2.0 m/s.',
				feedback: 'Correct. Conserved momentum is divided by the combined mass.',
				correct: true
			},
			{
				id: 'multiply-combined-mass',
				text: 'Shared velocity = 6.0 × (2.0 + 1.0) = 18 m/s.',
				feedback: 'Velocity is momentum divided by mass, not multiplied by mass.',
				correct: false
			},
			{
				id: 'divide-stationary-mass',
				text: 'Shared velocity = 6.0 ÷ 1.0 = 6.0 m/s.',
				feedback: 'The final moving object contains both original carts.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['momentum conserved', 'total momentum same'],
			['combined mass', 'total mass', '3.0 kg'],
			['2.0 m/s', '2 m/s']
		],
		repairSuccess:
			'You kept the conserved momentum and divided by the full mass of both carts moving together.',
		transferPromptLead:
			'A 4.0 kg wagon moving at 2.0 m/s joins a stationary 4.0 kg wagon. Which shared velocity is correct?',
		transferChoices: [
			{
				id: 'wagon-two',
				text: '2.0 m/s, because the moving wagon keeps its original velocity.',
				feedback: 'The same momentum is shared by twice the original mass.',
				correct: false
			},
			{
				id: 'wagon-one',
				text: '1.0 m/s, because 8.0 kg m/s is divided by 8.0 kg.',
				feedback: 'Correct. Momentum is conserved across the joined 8.0 kg mass.',
				correct: true
			},
			{
				id: 'wagon-four',
				text: '4.0 m/s, because the stationary wagon doubles the system momentum.',
				feedback: 'The stationary wagon adds mass but no initial momentum.',
				correct: false
			}
		],
		transferExplanation:
			'For both joined collisions: total momentum before equals total momentum after, and final velocity equals that momentum divided by combined mass.',
		memoryHandle: 'Initial momentum → conserve → divide by combined mass'
	},
	{
		...reviewStamp,
		id: 'physics-exp-loft-insulation-conductivity',
		slug: 'loft-insulation-and-thermal-conductivity',
		subject: 'physics',
		title: 'Which material slows conduction through a loft?',
		topic: 'Energy: thermal conductivity and insulation',
		subjectArtTheme: 'thermal-particles',
		hook: 'For equal thickness, the lower-conductivity material transfers energy more slowly.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Two loft-insulation materials have equal thickness. Material P has lower thermal conductivity than material Q. Explain which reduces unwanted energy transfer more effectively.',
		metaDescription:
			'Practise GCSE Physics thermal conductivity by choosing effective loft insulation and transferring the same rate comparison to a cool box.',
		staticAnswers: {
			a: 'Material P is better because lower thermal conductivity gives a lower rate of energy transfer by conduction through the same thickness.',
			b: 'Material Q is better because higher thermal conductivity prevents energy from passing through the material and keeps the loft warmer.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Higher thermal conductivity means a higher conduction rate, not better resistance to transfer. For the same thickness, P’s lower conductivity slows unwanted energy transfer more.',
		commandWordLesson:
			'An insulation explanation must connect the material property to the rate of energy transfer and then to the intended outcome.',
		diagnosisPrompt: 'Which relationship is reversed in Answer B?',
		diagnosisChoices: [
			{
				id: 'conductivity-rate',
				text: 'It says higher thermal conductivity gives a lower conduction rate.',
				feedback: 'Correct. Higher conductivity means faster energy transfer by conduction.',
				correct: true
			},
			{
				id: 'same-thickness',
				text: 'It compares the materials while their insulation thicknesses are equal.',
				feedback: 'That is a fair basis for comparing their conductivity.',
				correct: false
			},
			{
				id: 'unwanted-transfer',
				text: 'It treats energy leaving the warm loft as an unwanted transfer.',
				feedback: 'That is the transfer insulation is intended to reduce.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement makes the property-to-rate link correct?',
		repairChoices: [
			{
				id: 'lower-slower',
				text: 'Lower conductivity means a lower conduction rate, so choose material P.',
				feedback: 'Correct. The material property now supports the choice.',
				correct: true
			},
			{
				id: 'higher-slower',
				text: 'Higher conductivity means a lower conduction rate, so choose material Q.',
				feedback: 'This keeps the conductivity relationship reversed.',
				correct: false
			},
			{
				id: 'conductivity-irrelevant',
				text: 'Conductivity never affects conduction rate, so either material works equally.',
				feedback: 'Thermal conductivity directly affects the conduction rate.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['material P', 'P'],
			['lower thermal conductivity', 'lower conductivity'],
			['slower energy transfer', 'lower rate', 'less conduction']
		],
		repairSuccess:
			'You used the correct direction: lower thermal conductivity gives slower energy transfer through equal material thickness.',
		transferPromptLead:
			'A cool box can use equal-thickness panels made from material R or S. R has lower thermal conductivity. Which choice is justified?',
		transferChoices: [
			{
				id: 'choose-r',
				text: 'Choose R because it conducts energy into the cool box at a lower rate.',
				feedback: 'Correct. Lower conductivity slows unwanted energy transfer.',
				correct: true
			},
			{
				id: 'choose-s',
				text: 'Choose S because higher conductivity blocks energy transfer into the cool box.',
				feedback: 'Higher conductivity would increase the conduction rate.',
				correct: false
			},
			{
				id: 'choose-either',
				text: 'Choose either because conductivity affects temperature but never energy-transfer rate.',
				feedback: 'Conductivity is specifically linked to conduction rate.',
				correct: false
			}
		],
		transferExplanation:
			'Loft insulation and cool-box panels serve different settings, but both require low conductivity to reduce unwanted energy transfer by conduction.',
		memoryHandle: 'Lower conductivity → lower conduction rate → less unwanted transfer'
	},
	{
		...reviewStamp,
		id: 'physics-exp-pan-handle-conductivity',
		slug: 'pan-handle-thermal-conductivity',
		subject: 'physics',
		title: 'Why use low conductivity for a pan handle?',
		topic: 'Energy: reducing unwanted energy transfer',
		subjectArtTheme: 'thermal-particles',
		hook: 'The useful heating stays in the pan while the handle slows an unwanted transfer.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'A saucepan has a metal body and a polymer handle with much lower thermal conductivity. Explain why the polymer is suitable for the handle.',
		metaDescription:
			'Explain a low-conductivity saucepan handle in GCSE Physics, repair a reversed rate claim and transfer the idea to oven gloves.',
		staticAnswers: {
			a: 'The polymer has low thermal conductivity, so energy transfers along the handle more slowly and the hand is less likely to be burned.',
			b: 'The polymer has low thermal conductivity, so energy transfers along the handle more quickly and moves safely away from the hand.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Low thermal conductivity reduces the rate of conduction. Answer B names the right property but reverses its effect on energy-transfer rate.',
		commandWordLesson:
			'Name the property, state its effect on transfer rate, then connect that rate to the practical safety outcome.',
		diagnosisPrompt: 'Why does Answer B fail despite naming the correct property?',
		diagnosisChoices: [
			{
				id: 'rate-reversed',
				text: 'It says low thermal conductivity makes conduction along the handle faster.',
				feedback: 'Correct. Low conductivity produces a lower conduction rate.',
				correct: true
			},
			{
				id: 'polymer-used',
				text: 'It identifies the polymer as the material used for the handle.',
				feedback: 'That is stated in the question and is not an error.',
				correct: false
			},
			{
				id: 'energy-transfer',
				text: 'It describes thermal energy being transferred along the saucepan handle.',
				feedback: 'That is the relevant transfer; only its claimed rate is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the correct safety chain?',
		repairChoices: [
			{
				id: 'slow-transfer-safer',
				text: 'Low conductivity slows conduction, so less energy reaches the hand each second.',
				feedback: 'Correct. This connects property, rate and safety.',
				correct: true
			},
			{
				id: 'fast-transfer-safer',
				text: 'Low conductivity speeds conduction, so energy passes the hand before burning it.',
				feedback: 'Low conductivity does not speed conduction.',
				correct: false
			},
			{
				id: 'no-transfer-ever',
				text: 'Low conductivity stops every energy transfer, so the handle remains permanently cold.',
				feedback: 'It reduces the rate; it does not guarantee zero transfer.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['low thermal conductivity', 'low conductivity'],
			['slower transfer', 'lower rate', 'conducts slowly'],
			['less energy reaches hand', 'reduces burn risk', 'safer']
		],
		repairSuccess:
			'You connected low conductivity to a lower transfer rate and then to reduced burn risk.',
		transferPromptLead:
			'An oven glove contains a thick layer of low-conductivity fibres. Which statement best explains its purpose?',
		transferChoices: [
			{
				id: 'slows-hand-transfer',
				text: 'It lowers the rate of energy transfer from the hot tray to the hand.',
				feedback: 'Correct. The glove reduces unwanted conduction to the hand.',
				correct: true
			},
			{
				id: 'speeds-hand-transfer',
				text: 'It raises the rate of energy transfer so the tray cools quickly.',
				feedback: 'That would deliver energy to the hand faster.',
				correct: false
			},
			{
				id: 'raises-tray-energy',
				text: 'It raises the tray’s thermal energy while keeping the hand temperature fixed.',
				feedback: 'The glove reduces transfer; it does not add energy to the tray.',
				correct: false
			}
		],
		transferExplanation:
			'Pan handles and oven gloves both use low conductivity to reduce the rate of unwanted energy transfer to a hand.',
		memoryHandle: 'Low conductivity → slower conduction → reduced heating'
	},
	{
		...reviewStamp,
		id: 'physics-exp-current-wire-motor-effect',
		slug: 'current-carrying-wire-motor-effect',
		subject: 'physics',
		title: 'Why does the wire move when current flows?',
		topic: 'Magnetism: the motor effect',
		subjectArtTheme: 'electricity-magnetism',
		hook: 'The force appears from the interaction between the magnetic field and the current.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A straight wire lies between two magnet poles. The wire moves when a current is switched on. Explain why this happens.',
		metaDescription:
			'Practise the GCSE Physics motor effect by repairing a current-and-field explanation, then transfer it to a loudspeaker coil.',
		staticAnswers: {
			a: 'Current makes the wire magnetic, so it is attracted only toward whichever magnet pole is nearest and moves in that direction.',
			b: 'The current-carrying wire is in a magnetic field, so the magnet and wire exert forces on each other; the wire therefore moves.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'The motor effect is a force interaction between a current-carrying conductor and a magnetic field. It is not simply attraction to the nearest pole.',
		commandWordLesson:
			'Name both conditions for the motor effect: current in a conductor and an external magnetic field. Then state that a force acts.',
		diagnosisPrompt: 'What is missing from Answer A’s explanation?',
		diagnosisChoices: [
			{
				id: 'interaction-missing',
				text: 'It replaces the field-current interaction with simple attraction to one pole.',
				feedback: 'Correct. The conductor and magnet exert forces on each other.',
				correct: true
			},
			{
				id: 'current-mentioned',
				text: 'It says the wire carries a current after the switch is closed.',
				feedback: 'That is a required condition and should remain.',
				correct: false
			},
			{
				id: 'wire-moves',
				text: 'It concludes that the wire moves when a force acts upon it.',
				feedback: 'That outcome is appropriate; the force explanation is weak.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly states the motor effect?',
		repairChoices: [
			{
				id: 'field-current-force',
				text: 'A current-carrying conductor in a magnetic field experiences a force.',
				feedback: 'Correct. This states the two conditions and the result.',
				correct: true
			},
			{
				id: 'current-heating-force',
				text: 'A current heats the conductor until expanding metal pushes it sideways.',
				feedback: 'Heating is not the motor-effect force described here.',
				correct: false
			},
			{
				id: 'field-needs-no-current',
				text: 'A conductor in a magnetic field always moves, even without current.',
				feedback: 'This motor effect requires current in the conductor.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['current-carrying wire', 'current in conductor'],
			['magnetic field', 'between magnet poles'],
			['force', 'motor effect']
		],
		repairSuccess:
			'You replaced a vague attraction claim with the defining current–field interaction and its force.',
		transferPromptLead:
			'A loudspeaker coil sits in a permanent magnetic field. Which statement explains why the coil moves when current flows?',
		transferChoices: [
			{
				id: 'coil-force',
				text: 'The field and current-carrying coil interact, producing a force on the coil.',
				feedback: 'Correct. This is the motor effect in the loudspeaker.',
				correct: true
			},
			{
				id: 'coil-charge-loss',
				text: 'The coil loses electric charge, so the permanent magnet pulls it inward.',
				feedback: 'Current does not make the coil lose its net charge.',
				correct: false
			},
			{
				id: 'coil-only-heats',
				text: 'The current only heats the coil, and thermal expansion drives every movement.',
				feedback: 'The intended movement comes from the motor-effect force.',
				correct: false
			}
		],
		transferExplanation:
			'The wire and loudspeaker contexts share the same chain: a current-carrying conductor in a magnetic field experiences a force.',
		memoryHandle: 'Current in conductor + magnetic field → force'
	},
	{
		...reviewStamp,
		id: 'physics-exp-magnet-force-pair',
		slug: 'magnet-and-conductor-force-pair',
		subject: 'physics',
		title: 'Does only the wire feel the motor-effect force?',
		topic: 'Magnetism: the motor effect',
		subjectArtTheme: 'electricity-magnetism',
		hook: 'The current-carrying conductor and the magnet exert forces on each other.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A current-carrying wire is placed in a magnetic field. A force acts on the wire. Explain what force interaction also involves the magnet.',
		metaDescription:
			'Explore the GCSE Physics motor-effect force pair between a magnet and conductor, then transfer the interaction to a moving coil.',
		staticAnswers: {
			a: 'Only the wire experiences a force because current flows through the wire, while the magnet remains outside the electrical circuit.',
			b: 'The magnet and current-carrying wire exert forces on each other because the conductor lies within the magnet’s field.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'The motor effect is an interaction: the field-producing magnet and the current-carrying conductor exert forces on each other. The magnet need not be part of the circuit.',
		commandWordLesson:
			'When a question asks about an interaction, identify both participating objects and describe the force on each, not just the moving object.',
		diagnosisPrompt: 'Why is Answer A incomplete?',
		diagnosisChoices: [
			{
				id: 'one-sided-force',
				text: 'It treats the motor effect as a one-sided force on the wire only.',
				feedback: 'Correct. The magnet and conductor exert forces on each other.',
				correct: true
			},
			{
				id: 'wire-has-current',
				text: 'It says an electric current flows through the conducting wire.',
				feedback: 'That is one required condition for the motor effect.',
				correct: false
			},
			{
				id: 'magnet-outside-circuit',
				text: 'It notes that the permanent magnet is outside the electrical circuit.',
				feedback: 'That can be true; it does not remove the magnetic interaction.',
				correct: false
			}
		],
		repairPrompt: 'Which addition completes the interaction?',
		repairChoices: [
			{
				id: 'forces-each-other',
				text: 'Add that the magnet and current-carrying wire exert forces on each other.',
				feedback: 'Correct. This supplies both sides of the interaction.',
				correct: true
			},
			{
				id: 'magnet-no-force',
				text: 'Add that the magnet produces force but can never experience any force.',
				feedback: 'That keeps the interaction incorrectly one-sided.',
				correct: false
			},
			{
				id: 'wire-no-field',
				text: 'Add that the wire moves because it is completely outside the magnetic field.',
				feedback: 'The conductor must be within the magnetic field.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['magnet', 'field-producing magnet'],
			['wire', 'conductor', 'current-carrying conductor'],
			['forces on each other', 'force pair', 'interaction']
		],
		repairSuccess:
			'You made the motor effect a two-object interaction instead of describing only the conductor’s force.',
		transferPromptLead:
			'A current flows in a coil placed between magnet poles. Which description correctly accounts for the force interaction?',
		transferChoices: [
			{
				id: 'coil-magnet-interact',
				text: 'The coil and magnet exert forces on each other while current flows.',
				feedback: 'Correct. Both objects participate in the motor-effect interaction.',
				correct: true
			},
			{
				id: 'coil-only-force',
				text: 'Only the coil experiences force because only the coil carries current.',
				feedback: 'The magnet also experiences force through the interaction.',
				correct: false
			},
			{
				id: 'magnet-only-force',
				text: 'Only the magnet experiences force because only the magnet produces the field.',
				feedback: 'The current-carrying coil experiences the motor-effect force too.',
				correct: false
			}
		],
		transferExplanation:
			'Wire, coil and magnet arrangements all use the same motor-effect statement: the magnet and current-carrying conductor exert forces on each other.',
		memoryHandle: 'Magnet + current-carrying conductor → forces on each other'
	},
	{
		...reviewStamp,
		id: 'physics-exp-parallel-lamp-current',
		slug: 'parallel-lamp-branch-currents',
		subject: 'physics',
		title: 'Can you combine currents at a junction?',
		topic: 'Electricity: parallel circuits',
		subjectArtTheme: 'electricity-magnetism',
		hook: 'At a junction, the supply current splits between branches and recombines afterwards.',
		arc: 'mark-the-working',
		mechanic: 'first-wrong-step',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Two lamps are connected in parallel. Their branch currents are 0.40 A and 0.25 A. Calculate the total current from the supply.',
		metaDescription:
			'Calculate current in a GCSE Physics parallel circuit, repair a subtraction error at a junction and transfer the rule to three branches.',
		staticAnswers: {
			a: 'The supply current is the difference between branch currents: 0.40 − 0.25 = 0.15 A.',
			b: 'The supply current is the sum of branch currents: 0.40 + 0.25 = 0.65 A.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Current splits between parallel branches, so the current entering the junction equals the sum leaving through the branches. The values must be added, not subtracted.',
		commandWordLesson:
			'For parallel-current calculations, identify each branch current, add them to obtain the total, and keep the ampere unit.',
		diagnosisPrompt: 'Where does Answer A first go wrong?',
		diagnosisChoices: [
			{
				id: 'uses-branch-values',
				text: 'It uses both branch-current values stated in the question.',
				feedback: 'Those are the correct values to use.',
				correct: false
			},
			{
				id: 'subtracts-branches',
				text: 'It subtracts branch currents instead of adding them at the junction.',
				feedback: 'Correct. The supply current is the sum of branch currents.',
				correct: true
			},
			{
				id: 'uses-amperes',
				text: 'It reports the final current using the unit amperes.',
				feedback: 'Amperes are the correct unit for current.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement working is correct?',
		repairChoices: [
			{
				id: 'add-currents',
				text: 'Total current = 0.40 + 0.25 = 0.65 A.',
				feedback: 'Correct. Current entering equals total current through the branches.',
				correct: true
			},
			{
				id: 'average-currents',
				text: 'Total current = (0.40 + 0.25) ÷ 2 = 0.325 A.',
				feedback: 'The total is a sum, not an average.',
				correct: false
			},
			{
				id: 'multiply-currents',
				text: 'Total current = 0.40 × 0.25 = 0.10 A.',
				feedback: 'Branch currents do not multiply at a junction.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['sum', 'add', 'total'],
			['0.40 + 0.25', '0.4 + 0.25'],
			['0.65 A', '0.65 amperes']
		],
		repairSuccess:
			'You replaced subtraction with the junction rule: total current equals the sum of parallel branch currents.',
		transferPromptLead:
			'Three parallel branches carry 0.12 A, 0.18 A and 0.30 A. Which supply current is correct?',
		transferChoices: [
			{
				id: 'supply-060',
				text: '0.60 A, found by adding all three branch currents together.',
				feedback: 'Correct. 0.12 + 0.18 + 0.30 = 0.60 A.',
				correct: true
			},
			{
				id: 'supply-030',
				text: '0.30 A, because only the largest branch determines supply current.',
				feedback: 'Every branch contributes to the total supply current.',
				correct: false
			},
			{
				id: 'supply-020',
				text: '0.20 A, found by averaging the three branch currents together.',
				feedback: 'The supply current is their sum, not their mean.',
				correct: false
			}
		],
		transferExplanation:
			'With two or three branches, current entering a junction equals the sum of currents leaving through every parallel path.',
		memoryHandle: 'Branch currents → add → supply current'
	},
	{
		...reviewStamp,
		id: 'physics-exp-parallel-voltage',
		slug: 'parallel-component-potential-difference',
		subject: 'physics',
		title: 'Is potential difference shared in parallel?',
		topic: 'Electricity: parallel circuits',
		subjectArtTheme: 'electricity-magnetism',
		hook: 'Parallel branches share the supply potential difference; current is the quantity that splits.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Two resistors are connected in parallel across a 6.0 V battery. State the potential difference across each resistor and explain the parallel-circuit rule.',
		metaDescription:
			'Practise GCSE Physics potential difference in parallel branches, fix the series-sharing misconception and transfer to household lamps.',
		staticAnswers: {
			a: 'Each resistor has 3.0 V because the 6.0 V supply is divided equally between the two parallel branches.',
			b: 'Each resistor has 6.0 V because every parallel branch is connected across the same two battery terminals.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Potential difference is shared between series components, not parallel branches. Each parallel branch spans the same supply terminals, so each has 6.0 V.',
		commandWordLesson:
			'State the value first, then name the circuit rule that supports it. Keep current-splitting and voltage-sharing rules separate.',
		diagnosisPrompt: 'Which circuit rule has Answer A used incorrectly?',
		diagnosisChoices: [
			{
				id: 'series-rule',
				text: 'It applies series potential-difference sharing to two parallel branches.',
				feedback: 'Correct. Each parallel branch gets the full supply potential difference.',
				correct: true
			},
			{
				id: 'two-resistors',
				text: 'It counts two resistors connected across the same battery.',
				feedback: 'The component count is correct; division is not.',
				correct: false
			},
			{
				id: 'volts-unit',
				text: 'It measures potential difference using the unit volts.',
				feedback: 'Volts are the correct unit for potential difference.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the correct potential differences?',
		repairChoices: [
			{
				id: 'six-each',
				text: 'Both resistors have 6.0 V because each parallel branch spans the supply.',
				feedback: 'Correct. Potential difference is the same across parallel branches.',
				correct: true
			},
			{
				id: 'three-each',
				text: 'Both resistors have 3.0 V because equal components divide voltage equally.',
				feedback: 'That division rule describes equal series components.',
				correct: false
			},
			{
				id: 'twelve-each',
				text: 'Both resistors have 12.0 V because parallel branches add supply voltage.',
				feedback: 'Parallel connection does not multiply the battery voltage.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['6.0 V', '6 V'],
			['same potential difference', 'full supply voltage'],
			['parallel branches', 'across the same terminals']
		],
		repairSuccess:
			'You removed the series rule and gave each parallel branch the full supply potential difference.',
		transferPromptLead:
			'Three lamps are connected in parallel to a 12 V supply. Which potential difference acts across each lamp?',
		transferChoices: [
			{
				id: 'lamp-four',
				text: '4 V, because the supply is shared equally between three lamps.',
				feedback: 'That treats the lamps as series components.',
				correct: false
			},
			{
				id: 'lamp-twelve',
				text: '12 V, because each parallel branch spans the complete supply.',
				feedback: 'Correct. Every lamp gets the full supply potential difference.',
				correct: true
			},
			{
				id: 'lamp-thirty-six',
				text: '36 V, because the three parallel branch voltages are added.',
				feedback: 'Branch voltages do not add above the supply value.',
				correct: false
			}
		],
		transferExplanation:
			'Resistors and lamps follow the same parallel rule: every branch has the same potential difference as the supply.',
		memoryHandle: 'Parallel branch → same terminals → full supply p.d.'
	},
	{
		...reviewStamp,
		id: 'physics-exp-sled-resultant-acceleration',
		slug: 'sled-resultant-force-and-acceleration',
		subject: 'physics',
		title: 'Can you calculate acceleration from opposing forces?',
		topic: "Forces: Newton's second law",
		subjectArtTheme: 'forces-motion',
		hook: 'Find the resultant before using F = ma; the larger individual force is not enough.',
		arc: 'track-the-forces',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A 30 kg sled is pulled forward with 120 N while friction is 30 N backward. Calculate its acceleration.',
		metaDescription:
			'Calculate resultant force and acceleration in a GCSE Physics sled problem, repair the first wrong step and transfer to a cart.',
		staticAnswers: {
			a: 'Resultant force = 120 − 30 = 90 N. Acceleration = F/m = 90 ÷ 30 = 3.0 m/s².',
			b: 'Use the pulling force directly: acceleration = F/m = 120 ÷ 30 = 4.0 m/s².'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Newton’s second law uses the resultant force, not one individual force. Friction opposes the pull, leaving 90 N forward before division by mass.',
		commandWordLesson:
			'For force-and-acceleration calculations, combine all forces with directions first. Only then substitute the resultant into F = ma.',
		diagnosisPrompt: 'What step is missing from Answer B?',
		diagnosisChoices: [
			{
				id: 'find-resultant',
				text: 'It does not subtract backward friction to find the resultant force.',
				feedback: 'Correct. F = ma requires the 90 N resultant.',
				correct: true
			},
			{
				id: 'divide-mass',
				text: 'It divides a force measured in newtons by mass in kilograms.',
				feedback: 'That operation is correct once the resultant force is used.',
				correct: false
			},
			{
				id: 'accel-unit',
				text: 'It reports acceleration using metres per second squared.',
				feedback: 'That is the correct unit for acceleration.',
				correct: false
			}
		],
		repairPrompt: 'Which working inserts the missing step?',
		repairChoices: [
			{
				id: 'resultant-then-divide',
				text: 'Resultant = 120 − 30 = 90 N; acceleration = 90 ÷ 30 = 3.0 m/s².',
				feedback: 'Correct. Opposing forces are combined before F = ma.',
				correct: true
			},
			{
				id: 'add-then-divide',
				text: 'Resultant = 120 + 30 = 150 N; acceleration = 150 ÷ 30 = 5.0 m/s².',
				feedback: 'The forces act in opposite directions, so subtract them.',
				correct: false
			},
			{
				id: 'friction-only',
				text: 'Resultant = 30 N; acceleration = 30 ÷ 30 = 1.0 m/s² backward.',
				feedback: 'The larger forward pull must also be included.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['resultant force', 'net force'],
			['90 N', '120 - 30'],
			['3.0 m/s²', '3 m/s²']
		],
		repairSuccess:
			'You combined the opposing forces first and then applied Newton’s second law to the 90 N resultant.',
		transferPromptLead:
			'A 20 kg cart has 70 N forward and 10 N backward. Which acceleration is correct?',
		transferChoices: [
			{
				id: 'cart-three',
				text: '3.0 m/s² forward, because (70 − 10) ÷ 20 = 3.0.',
				feedback: 'Correct. The resultant is 60 N forward.',
				correct: true
			},
			{
				id: 'cart-four',
				text: '4.0 m/s² forward, because (70 + 10) ÷ 20 = 4.0.',
				feedback: 'The forces oppose, so their magnitudes are subtracted.',
				correct: false
			},
			{
				id: 'cart-three-five',
				text: '3.5 m/s² forward, because only 70 ÷ 20 is required.',
				feedback: 'This ignores the 10 N backward force.',
				correct: false
			}
		],
		transferExplanation:
			'Sled or cart, the method is identical: resolve the force directions, find the resultant, then divide by mass.',
		memoryHandle: 'Opposing forces → resultant → a = F/m'
	},
	{
		...reviewStamp,
		id: 'physics-exp-loaded-van-acceleration',
		slug: 'mass-and-acceleration-for-the-same-force',
		subject: 'physics',
		title: 'Why does a loaded van accelerate less?',
		topic: "Forces: Newton's second law",
		subjectArtTheme: 'forces-motion',
		hook: 'With the same resultant force, extra mass gives less acceleration.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'An empty van and a loaded van experience the same forward resultant force. Explain why the loaded van has a smaller acceleration.',
		metaDescription:
			'Explain the inverse mass–acceleration relationship in GCSE Physics, then apply Newton’s second law to two equal-force trolleys.',
		staticAnswers: {
			a: 'For a fixed resultant force, a = F/m. The loaded van has greater mass, so its acceleration is smaller.',
			b: 'The loaded van has greater mass, so the same resultant force gives it greater acceleration and increases speed faster.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'For a fixed resultant force, acceleration is inversely proportional to mass. Adding load increases the denominator in a = F/m, so acceleration falls.',
		commandWordLesson:
			'For a comparison, name the controlled quantity, identify the changed variable, and state the correct proportional effect on acceleration.',
		diagnosisPrompt: 'Which relationship is reversed in Answer B?',
		diagnosisChoices: [
			{
				id: 'mass-accel-reversed',
				text: 'It says greater mass gives greater acceleration for the same resultant force.',
				feedback: 'Correct. Acceleration is inversely proportional to mass.',
				correct: true
			},
			{
				id: 'greater-mass',
				text: 'It says adding a load increases the total mass of the van.',
				feedback: 'That is the valid starting comparison.',
				correct: false
			},
			{
				id: 'same-force',
				text: 'It uses the same resultant force for both van conditions.',
				feedback: 'That condition is stated and should be kept.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement gives the correct proportional reasoning?',
		repairChoices: [
			{
				id: 'greater-mass-smaller-a',
				text: 'Greater mass gives smaller acceleration when the resultant force stays fixed.',
				feedback: 'Correct. This is the inverse relationship from a = F/m.',
				correct: true
			},
			{
				id: 'greater-mass-greater-a',
				text: 'Greater mass gives greater acceleration when the resultant force stays fixed.',
				feedback: 'This keeps the relationship reversed.',
				correct: false
			},
			{
				id: 'mass-no-effect',
				text: 'Greater mass leaves acceleration unchanged whenever resultant force stays fixed.',
				feedback: 'Mass appears in the denominator of a = F/m.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['same resultant force', 'fixed force'],
			['greater mass', 'more mass', 'loaded van'],
			['smaller acceleration', 'less acceleration']
		],
		repairSuccess:
			'You held resultant force constant and used the inverse mass relationship to predict smaller acceleration.',
		transferPromptLead:
			'Two trolleys each receive a 12 N resultant force. One has mass 3 kg and the other 6 kg. Which comparison is correct?',
		transferChoices: [
			{
				id: 'four-and-two',
				text: 'Their accelerations are 4 m/s² and 2 m/s² respectively.',
				feedback: 'Correct. Dividing the same force by double the mass halves acceleration.',
				correct: true
			},
			{
				id: 'four-and-eight',
				text: 'Their accelerations are 4 m/s² and 8 m/s² respectively.',
				feedback: 'Doubling mass halves acceleration for a fixed force.',
				correct: false
			},
			{
				id: 'four-and-four',
				text: 'Their accelerations are both 4 m/s² because force is equal.',
				feedback: 'Equal force does not give equal acceleration when masses differ.',
				correct: false
			}
		],
		transferExplanation:
			'The numerical trolley case confirms the van explanation: for a fixed resultant force, doubling mass halves acceleration.',
		memoryHandle: 'Same resultant force → greater mass → smaller acceleration'
	},
	{
		...reviewStamp,
		id: 'physics-exp-xray-dose-risk',
		slug: 'x-ray-dose-and-risk',
		subject: 'physics',
		title: 'What does a radiation dose tell you?',
		topic: 'Waves: ionising radiation risk',
		subjectArtTheme: 'radiation-measurement',
		hook: 'Dose measures risk of harm, not a guarantee that harm will happen.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'Two medical X-ray procedures give different radiation doses in sieverts. Explain what the larger dose means for the patient’s risk.',
		metaDescription:
			'Practise GCSE Physics radiation risk by interpreting dose in sieverts without claiming certain harm, then transfer the idea to ultraviolet.',
		staticAnswers: {
			a: 'The larger dose means more exposure and a greater risk of harm to body tissue, although it does not guarantee that harm occurs.',
			b: 'The larger dose proves that body tissue will definitely be damaged, because every exposure causes the same certain outcome in every patient.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Radiation dose in sieverts measures the risk of harm from exposure. A larger dose raises risk, but risk is a probability rather than proof of certain damage.',
		commandWordLesson:
			'Use calibrated risk language: state the direction of the risk change and avoid turning increased risk into a guaranteed outcome.',
		diagnosisPrompt: 'Which word makes Answer B overclaim the evidence?',
		diagnosisChoices: [
			{
				id: 'definitely',
				text: 'It says tissue will definitely be harmed after the larger dose.',
				feedback: 'Correct. Dose measures risk, not certainty for one patient.',
				correct: true
			},
			{
				id: 'tissue',
				text: 'It identifies body tissue as something ionising radiation can harm.',
				feedback: 'That hazard is scientifically valid.',
				correct: false
			},
			{
				id: 'larger-dose',
				text: 'It compares the procedure with the larger radiation dose to the other.',
				feedback: 'That is the comparison the question asks for.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly interprets the larger dose?',
		repairChoices: [
			{
				id: 'greater-risk',
				text: 'It gives a greater risk of harm to exposed body tissue.',
				feedback: 'Correct. This uses dose as a measure of risk.',
				correct: true
			},
			{
				id: 'certain-harm',
				text: 'It guarantees identical tissue damage in every exposed patient.',
				feedback: 'A risk measure cannot guarantee an individual outcome.',
				correct: false
			},
			{
				id: 'no-risk-change',
				text: 'It gives exactly the same risk because both procedures use X-rays.',
				feedback: 'Different doses correspond to different levels of risk.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['larger dose', 'more exposure', 'higher dose'],
			['greater risk', 'increased risk', 'more likely'],
			['harm', 'damage', 'body tissue']
		],
		repairSuccess:
			'You interpreted dose as a measure of increased risk while avoiding an unsupported claim of certain harm.',
		transferPromptLead:
			'A person receives more ultraviolet exposure by spending longer in strong sunlight. Which conclusion is scientifically appropriate?',
		transferChoices: [
			{
				id: 'uv-greater-risk',
				text: 'Longer exposure increases the risk of harmful effects on body tissue.',
				feedback: 'Correct. Ultraviolet can harm tissue, and more exposure raises risk.',
				correct: true
			},
			{
				id: 'uv-certain-harm',
				text: 'Longer exposure proves that identical tissue damage occurs every time.',
				feedback: 'Risk increases, but a particular outcome is not guaranteed.',
				correct: false
			},
			{
				id: 'uv-no-hazard',
				text: 'Longer exposure carries no hazard because ultraviolet is not ionising.',
				feedback: 'Ultraviolet can still have hazardous effects on body tissue.',
				correct: false
			}
		],
		transferExplanation:
			'X-rays and ultraviolet have different uses and properties, but both questions require risk language rather than certainty about individual harm.',
		memoryHandle: 'More exposure/dose → greater tissue-harm risk → not certainty'
	},
	{
		...reviewStamp,
		id: 'physics-exp-parachutist-terminal-velocity',
		slug: 'parachutist-drag-and-terminal-velocity',
		subject: 'physics',
		title: 'Why does a falling parachutist stop accelerating?',
		topic: 'Forces: drag and terminal velocity',
		subjectArtTheme: 'forces-motion',
		hook: 'Drag grows until it balances weight, leaving zero resultant force.',
		arc: 'track-the-forces',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'A parachutist falls from rest with the parachute closed. Explain how the forces change until the parachutist reaches terminal velocity.',
		metaDescription:
			'Build the GCSE Physics force chain from falling acceleration to balanced drag and terminal velocity, then transfer it to a raindrop.',
		staticAnswers: {
			a: 'Weight acts downward, so the parachutist accelerates and speeds up. Drag increases until it equals weight, making resultant force and acceleration zero.',
			b: 'Weight acts downward, so the parachutist accelerates and speeds up. Drag disappears at high speed, making the downward force become zero.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Drag increases as the falling object speeds up. Terminal velocity begins when upward drag equals downward weight, so resultant force and acceleration are zero.',
		commandWordLesson:
			'A terminal-velocity explanation needs a sequence: initial force imbalance, speed change, changing drag, balanced forces, then constant velocity.',
		diagnosisPrompt: 'Which force claim in Answer B is incorrect?',
		diagnosisChoices: [
			{
				id: 'drag-disappears',
				text: 'It says drag disappears as the parachutist reaches high speed.',
				feedback: 'Correct. Drag rises until it balances weight.',
				correct: true
			},
			{
				id: 'weight-down',
				text: 'It says the parachutist’s weight acts vertically downward.',
				feedback: 'That direction is correct throughout the fall.',
				correct: false
			},
			{
				id: 'speed-initially-rises',
				text: 'It says the parachutist initially speeds up while falling.',
				feedback: 'That follows from the initial downward resultant force.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement completes the terminal-velocity chain?',
		repairChoices: [
			{
				id: 'drag-equals-weight',
				text: 'Drag increases until it equals weight, so resultant force becomes zero.',
				feedback: 'Correct. Zero resultant means zero acceleration and constant velocity.',
				correct: true
			},
			{
				id: 'weight-disappears',
				text: 'Weight decreases to zero while drag remains unchanged at high speed.',
				feedback: 'Weight does not disappear during the fall.',
				correct: false
			},
			{
				id: 'drag-exceeds-forever',
				text: 'Drag stays greater than weight, so downward speed increases steadily forever.',
				feedback: 'Greater upward drag would reduce downward speed, not increase it.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['drag increases', 'air resistance increases'],
			['drag equals weight', 'forces balance'],
			['zero resultant', 'zero acceleration', 'terminal velocity']
		],
		repairSuccess:
			'You made drag grow with speed until it balanced weight, producing zero acceleration and terminal velocity.',
		transferPromptLead:
			'A raindrop falls through still air and eventually moves at constant speed. Which explanation is complete?',
		transferChoices: [
			{
				id: 'raindrop-balanced',
				text: 'Air resistance equals weight, so resultant force and acceleration are zero.',
				feedback: 'Correct. Constant terminal velocity follows from balanced forces.',
				correct: true
			},
			{
				id: 'raindrop-no-forces',
				text: 'Both air resistance and weight vanish when the speed becomes constant.',
				feedback: 'The forces still act; their resultant is zero.',
				correct: false
			},
			{
				id: 'raindrop-weight-only',
				text: 'Weight remains unbalanced, so the raindrop continues accelerating at constant speed.',
				feedback: 'Constant speed means acceleration is zero, not continuing.',
				correct: false
			}
		],
		transferExplanation:
			'Parachutists and raindrops both reach terminal velocity when fluid resistance grows to equal weight and the resultant becomes zero.',
		memoryHandle: 'Weight unbalanced → speed rises → drag rises → forces balance'
	},
	{
		...reviewStamp,
		id: 'physics-exp-tired-driver-thinking-distance',
		slug: 'tired-driver-thinking-distance',
		subject: 'physics',
		title: 'Does tiredness change braking distance?',
		topic: 'Forces: reaction time and thinking distance',
		subjectArtTheme: 'forces-motion',
		hook: 'Tiredness acts before the brakes: it lengthens reaction time and therefore thinking distance.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'At the same speed, a rested driver has a 9 m thinking distance and a tired driver has a 15 m thinking distance. Explain the difference.',
		metaDescription:
			'Interpret GCSE Physics thinking-distance data, connect tiredness to reaction time and transfer the reasoning to alcohol impairment.',
		staticAnswers: {
			a: 'Tiredness increases reaction time, so the car travels for longer before braking starts and thinking distance increases from 9 m to 15 m.',
			b: 'Tiredness makes the brakes less effective, so braking distance increases from 9 m to 15 m after the driver presses the pedal.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Thinking distance is travelled during reaction time before braking begins. The data therefore support a tiredness–reaction-time link, not a claim about brake performance.',
		commandWordLesson:
			'Identify whether the given distance occurs before or after braking. Then connect the stated factor to reaction time and cite the numerical change.',
		diagnosisPrompt: 'What has Answer B confused?',
		diagnosisChoices: [
			{
				id: 'thinking-vs-braking',
				text: 'It treats the measured thinking distance as distance travelled after braking begins.',
				feedback: 'Correct. Thinking distance occurs before the brakes act.',
				correct: true
			},
			{
				id: 'tiredness-factor',
				text: 'It identifies tiredness as the factor that differs between the drivers.',
				feedback: 'That is the correct comparison stated in the question.',
				correct: false
			},
			{
				id: 'distance-rises',
				text: 'It says the measured distance is larger for the tired driver.',
				feedback: 'That matches the values; the causal explanation is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly explains the increase?',
		repairChoices: [
			{
				id: 'reaction-time-chain',
				text: 'Tiredness lengthens reaction time, so the car travels farther before braking starts.',
				feedback: 'Correct. This is the complete thinking-distance chain.',
				correct: true
			},
			{
				id: 'brake-friction-chain',
				text: 'Tiredness reduces tyre friction, so the car slides farther after braking starts.',
				feedback: 'That describes braking distance, not thinking distance.',
				correct: false
			},
			{
				id: 'speed-chain',
				text: 'Tiredness must increase speed, because reaction time cannot affect distance travelled.',
				feedback: 'The comparison fixes speed; longer reaction time still increases distance.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['tiredness', 'tired driver'],
			['reaction time increases', 'longer reaction time', 'reacts slower'],
			['farther before braking', 'thinking distance increases', '15 m']
		],
		repairSuccess:
			'You located the effect before braking and connected tiredness to longer reaction time and greater thinking distance.',
		transferPromptLead:
			'At one speed, a sober driver’s thinking distance is 12 m and an alcohol-impaired driver’s is 20 m. Which conclusion fits?',
		transferChoices: [
			{
				id: 'alcohol-longer-reaction',
				text: 'Alcohol increased reaction time, so 8 m more was travelled before braking.',
				feedback: 'Correct. The data show a larger thinking distance at equal speed.',
				correct: true
			},
			{
				id: 'alcohol-weaker-brakes',
				text: 'Alcohol weakened the brakes, so 8 m more was travelled while braking.',
				feedback: 'The stated values are thinking distances measured before braking.',
				correct: false
			},
			{
				id: 'alcohol-faster-car',
				text: 'Alcohol made the car faster, because equal speeds cannot give different distances.',
				feedback:
					'Different reaction times can produce different thinking distances at equal speed.',
				correct: false
			}
		],
		transferExplanation:
			'Tiredness and alcohol are different factors, but both can lengthen reaction time and therefore increase thinking distance at the same speed.',
		memoryHandle: 'Impairment → longer reaction time → farther before braking'
	},
	{
		...reviewStamp,
		id: 'physics-exp-tug-of-war-zero-resultant',
		slug: 'equal-pulls-zero-resultant-force',
		subject: 'physics',
		title: 'Do balanced forces disappear?',
		topic: 'Forces: balanced forces and resultants',
		subjectArtTheme: 'forces-motion',
		hook: 'Two real forces can still act while their combined resultant is zero.',
		arc: 'track-the-forces',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Two teams pull a rope in opposite directions with equal forces of 500 N. Explain the resultant force without saying that no forces act.',
		metaDescription:
			'Practise GCSE Physics balanced forces with equal opposite pulls, distinguish forces from their resultant and transfer the idea to a boat.',
		staticAnswers: {
			a: 'The two 500 N forces act in opposite directions and cancel in the vector sum, so the resultant force is 0 N.',
			b: 'The rope has a 0 N resultant because equal pulls make both teams’ individual forces on the rope disappear completely.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Balanced forces still act on the rope. Their equal magnitudes and opposite directions produce a zero vector sum, so the single equivalent resultant is 0 N.',
		commandWordLesson:
			'Name the individual forces and their directions before stating the resultant. “Balanced” describes their combined effect, not their disappearance.',
		diagnosisPrompt: 'Which claim in Answer B is scientifically wrong?',
		diagnosisChoices: [
			{
				id: 'forces-disappear',
				text: 'It says the two individual pulling forces stop existing when balanced.',
				feedback: 'Correct. The forces remain; only their vector sum is zero.',
				correct: true
			},
			{
				id: 'equal-forces',
				text: 'It says the two teams pull with equal force magnitudes.',
				feedback: 'That equality is stated in the question.',
				correct: false
			},
			{
				id: 'zero-resultant',
				text: 'It gives the combined resultant force as zero newtons.',
				feedback: 'That value is correct; only its explanation is wrong.',
				correct: false
			}
		],
		repairPrompt: 'Which replacement correctly explains the 0 N resultant?',
		repairChoices: [
			{
				id: 'equal-opposite-sum',
				text: 'The equal opposite forces still act, but their vector sum is zero.',
				feedback: 'Correct. This separates individual forces from the resultant.',
				correct: true
			},
			{
				id: 'no-force-exists',
				text: 'No force exists anywhere because the rope remains in one position.',
				feedback: 'Position alone does not show that individual forces are absent.',
				correct: false
			},
			{
				id: 'forces-add-thousand',
				text: 'The opposite forces add as scalars, giving a 1000 N resultant.',
				feedback: 'Direction matters, so equal opposite vectors sum to zero.',
				correct: false
			}
		],
		freeTextKeywordGroups: [
			['equal forces', 'same size'],
			['opposite directions', 'opposite'],
			['zero resultant', '0 N', 'balanced']
		],
		repairSuccess:
			'You kept both pulls visible and replaced them only in the combined calculation with a 0 N resultant.',
		transferPromptLead:
			'A boat moves at constant velocity while its engine provides 800 N forward and water resistance is 800 N backward. Which statement is correct?',
		transferChoices: [
			{
				id: 'boat-balanced',
				text: 'Both forces act, but their equal opposite values give zero resultant force.',
				feedback: 'Correct. Zero resultant is consistent with constant velocity.',
				correct: true
			},
			{
				id: 'boat-no-forces',
				text: 'Neither force acts because constant velocity means all forces have disappeared.',
				feedback: 'Constant velocity requires zero resultant, not zero individual forces.',
				correct: false
			},
			{
				id: 'boat-sixteen-hundred',
				text: 'The resultant is 1600 N because both force magnitudes must be added.',
				feedback: 'The forces act in opposite directions and therefore subtract.',
				correct: false
			}
		],
		transferExplanation:
			'The rope and boat each have real equal-and-opposite forces. Replacing them by one equivalent resultant gives 0 N.',
		memoryHandle: 'Individual forces → include directions → vector sum/resultant'
	}
] satisfies readonly ChallengeDefinition[];

type PhysicsCurriculumAliasTarget =
	| 'physics-gas-pressure'
	| 'physics-half-range'
	| 'physics-weight-equation'
	| 'physics-momentum-sharing'
	| 'physics-conductivity-rate'
	| 'physics-motor-force'
	| 'physics-parallel-currents'
	| 'physics-resultant-acceleration'
	| 'physics-radiation-risk'
	| 'physics-drag-balance'
	| 'physics-thinking-distance'
	| 'physics-zero-resultant';

export const physicsCurriculumAliases = {
	'physics-exp-bike-pump-pressure': 'physics-gas-pressure',
	'physics-exp-sealed-balloon-pressure': 'physics-gas-pressure',
	'physics-exp-thermometer-half-range': 'physics-half-range',
	'physics-exp-extension-half-range': 'physics-half-range',
	'physics-exp-moon-weight': 'physics-weight-equation',
	'physics-exp-lifted-crate-weight': 'physics-weight-equation',
	'physics-exp-trolley-collision-momentum': 'physics-momentum-sharing',
	'physics-exp-coupled-carts-momentum': 'physics-momentum-sharing',
	'physics-exp-loft-insulation-conductivity': 'physics-conductivity-rate',
	'physics-exp-pan-handle-conductivity': 'physics-conductivity-rate',
	'physics-exp-current-wire-motor-effect': 'physics-motor-force',
	'physics-exp-magnet-force-pair': 'physics-motor-force',
	'physics-exp-parallel-lamp-current': 'physics-parallel-currents',
	'physics-exp-parallel-voltage': 'physics-parallel-currents',
	'physics-exp-sled-resultant-acceleration': 'physics-resultant-acceleration',
	'physics-exp-loaded-van-acceleration': 'physics-resultant-acceleration',
	'physics-exp-xray-dose-risk': 'physics-radiation-risk',
	'physics-exp-parachutist-terminal-velocity': 'physics-drag-balance',
	'physics-exp-tired-driver-thinking-distance': 'physics-thinking-distance',
	'physics-exp-tug-of-war-zero-resultant': 'physics-zero-resultant'
} as const satisfies Readonly<Record<string, PhysicsCurriculumAliasTarget>>;
