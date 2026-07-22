import type { ChallengeChoice, ChallengeDefinition } from '../types';

type BiologyChallengeSpec = Omit<
	Extract<ChallengeDefinition, { subject: 'biology' }>,
	'subject' | 'lastReviewed' | 'version'
>;

function reviewedChallenge(spec: BiologyChallengeSpec): ChallengeDefinition {
	return {
		...spec,
		subject: 'biology',
		lastReviewed: '2026-07-21',
		version: 1
	};
}

function choice(id: string, text: string, feedback: string, correct = false): ChallengeChoice {
	return { id, text, feedback, correct };
}

export const biologyExpansion = [
	reviewedChallenge({
		id: 'biology-disinfectant-data-conclusions',
		slug: 'disinfectant-clear-zone-conclusions',
		title: 'What can clear zones really tell you?',
		topic: 'Working scientifically: interpreting data',
		subjectArtTheme: 'cells-practical',
		hook: 'A larger clear zone supports a comparison, but it does not prove that every bacterium died.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Four disinfectants produced mean clear-zone diameters of 3, 8, 14 and 14 mm around identical bacterial cultures. Give two conclusions supported by these results.',
		metaDescription:
			'Practise GCSE Biology data conclusions by comparing bacterial clear zones, rejecting overclaims and transferring the skill to germination results.',
		staticAnswers: {
			a: 'Disinfectants C and D produced the largest mean clear zones at 14 mm, while A produced the smallest at 3 mm; the results support equal effectiveness for C and D.',
			b: 'Disinfectant C was definitely the best because it killed every bacterium, while A was completely useless because its mean clear zone measured only 3 mm.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers use the extreme values, but Answer B claims complete killing and ignores D’s equal result. Answer A stays within what the mean diameters support.',
		commandWordLesson:
			'“Give two conclusions” rewards two distinct statements supported by the measurements. Compare values precisely without turning an observed association into certainty.',
		diagnosisPrompt: 'Which claim makes Answer B exceed the evidence?',
		diagnosisChoices: [
			choice(
				'claims-certainty',
				'It claims complete killing and uselessness, which the measurements do not establish.',
				'Correct: clear-zone means support relative effectiveness, not those absolute claims.',
				true
			),
			choice(
				'needs-range',
				'It compares the highest and lowest values instead of calculating a range.',
				'A supported comparison is a valid conclusion; a range was not requested.'
			),
			choice(
				'needs-centimetres',
				'It reports millimetres instead of converting every diameter into centimetres first.',
				'Millimetres are suitable and allow direct comparison without conversion.'
			)
		],
		repairPrompt: 'Which replacement gives a conclusion the results support?',
		repairChoices: [
			choice(
				'smallest-best',
				'Replace it with “A worked better because its clear zone was smallest”.',
				'A smaller clear zone indicates less inhibition, not greater effectiveness.'
			),
			choice(
				'tied-largest',
				'Replace it with “C and D tied for the largest mean zone”.',
				'This conclusion follows directly from the two 14 mm means.',
				true
			),
			choice(
				'killed-every',
				'Replace it with “C killed every bacterium because its zone was largest”.',
				'The measured diameter does not establish that every bacterium was killed.'
			)
		],
		freeTextKeywordGroups: [
			['c and d', 'disinfectants c and d'],
			['equal', 'same', 'tied'],
			['14 mm', 'largest mean clear zones', 'largest zones']
		],
		repairSuccess:
			'You used the equal largest means as evidence and removed claims the measurements could not establish.',
		transferPromptLead:
			'Seed germination was 18%, 46%, 71% and 71% at 5, 10, 15 and 20 °C. Which conclusion is best supported?',
		transferChoices: [
			choice(
				'always-causes',
				'Germination rises throughout, so warming always causes every seed to germinate.',
				'The final two percentages are equal, and the results do not prove “always”.'
			),
			choice(
				'final-higher',
				'Germination at 20 °C is higher than at 15 °C by 18%.',
				'Both temperatures have 71% germination, so there is no increase.'
			),
			choice(
				'rise-then-level',
				'Germination rises to 71% by 15 °C, then stays at 71%.',
				'This states the pattern and supports it with the relevant values.',
				true
			)
		],
		transferExplanation:
			'The organisms changed, but the method did not: identify the pattern, use precise values and avoid a claim stronger than the results.',
		memoryHandle: 'Pattern → values → supported conclusion'
	}),
	reviewedChallenge({
		id: 'biology-exercise-recovery-conclusions',
		slug: 'pulse-recovery-data-conclusions',
		title: 'When has pulse rate nearly recovered?',
		topic: 'Working scientifically: interpreting data',
		subjectArtTheme: 'regulation-immunity',
		hook: 'A sharp fall is clear evidence; “fully recovered” needs comparison with the resting value.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'A runner’s resting pulse was 70 beats per minute. After exercise it was 150 immediately, 104 after 2 minutes, 78 after 4 minutes and 72 after 6 minutes. Give a conclusion about recovery.',
		metaDescription:
			'Build GCSE Biology data-reading skill with pulse recovery values, careful comparisons and a transfer task using plant-growth measurements.',
		staticAnswers: {
			a: 'The runner was fully recovered after four minutes because the pulse fell sharply to 78 beats per minute, proving that the runner is very fit.',
			b: 'The pulse fell from 150 to 72 beats per minute in six minutes and approached the 70-beat resting value, so recovery was nearly complete.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A notices the fall but calls 78 fully recovered and claims proof of fitness. Answer B compares the six-minute value with rest and makes a proportionate conclusion.',
		commandWordLesson:
			'A conclusion should answer the question using the relevant comparison. Words such as “fully” or “proves” need evidence that rules out reasonable alternatives.',
		diagnosisPrompt: 'Why is Answer A’s conclusion too strong?',
		diagnosisChoices: [
			choice(
				'needs-average',
				'It uses a single runner instead of calculating a class average first.',
				'The given runner data still support a conclusion about this recovery.'
			),
			choice(
				'not-resting',
				'It calls 78 fully recovered although the resting pulse was 70.',
				'Correct: recovery was close, but the pulse had not returned to rest.',
				true
			),
			choice(
				'fall-invalid',
				'It describes a fall even though pulse rate increased after exercise.',
				'The pulse fell during recovery; that pattern is valid.'
			)
		],
		repairPrompt: 'Which ending gives a measured conclusion?',
		repairChoices: [
			choice(
				'fitness-proof',
				'End with “therefore the runner has perfect cardiovascular fitness”.',
				'These readings cannot establish perfect fitness.'
			),
			choice(
				'four-minute-rest',
				'End with “therefore recovery finished exactly after four minutes”.',
				'The four-minute pulse remained above the resting value.'
			),
			choice(
				'nearly-resting',
				'End with “after six minutes, pulse was close to resting”.',
				'This uses the 72 and 70 comparison without overstating certainty.',
				true
			)
		],
		freeTextKeywordGroups: [
			['six minutes', 'after 6 minutes'],
			['72', '72 beats per minute'],
			['close to resting', 'nearly recovered', 'approached the resting value']
		],
		repairSuccess:
			'You anchored recovery to the resting pulse and changed an absolute claim into a measured comparison.',
		transferPromptLead:
			'A seedling grew from 3 cm to 11 cm by day 8, then remained 11 cm on days 10 and 12. Which conclusion fits?',
		transferChoices: [
			choice(
				'growth-levelled',
				'Growth reached 11 cm by day 8, then levelled off.',
				'This states the change and the later plateau using exact values.',
				true
			),
			choice(
				'grew-forever',
				'The seedling kept growing steadily throughout all twelve measured days.',
				'The height stayed at 11 cm for the final observations.'
			),
			choice(
				'died-day-eight',
				'The seedling died on day 8 because its height stopped increasing.',
				'A plateau alone does not establish that the seedling died.'
			)
		],
		transferExplanation:
			'Pulse recovery and seedling growth use the same evidence discipline: compare the relevant values, name the pattern and stop short of unsupported causes.',
		memoryHandle: 'Reference value → comparison → careful conclusion'
	}),
	reviewedChallenge({
		id: 'biology-bacterial-cell-features',
		slug: 'bacterial-and-cheek-cell-differences',
		title: 'Are these differences or shared features?',
		topic: 'Cell biology: prokaryotic and eukaryotic cells',
		subjectArtTheme: 'cells-practical',
		hook: 'Membrane and cytoplasm sound relevant, but they do not distinguish these cells.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Give three ways a bacterial cell differs from a human cheek cell. Write each difference in the direction bacterial cell compared with cheek cell.',
		metaDescription:
			'Compare bacterial and cheek cells in this GCSE Biology challenge, separating real differences from features that both cell types share.',
		staticAnswers: {
			a: 'The bacterial cell is smaller, has no nucleus and has no mitochondria; these are three distinct contrasts with the human cheek cell.',
			b: 'The bacterial cell has cytoplasm, a cell membrane and genetic material; its DNA is inside the cell and it can carry out chemical reactions.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'off-command',
		showdownExplanation:
			'Answer B lists broad features shared with cheek cells. Answer A gives several directional differences, from which three distinct feature categories can earn the requested marks.',
		commandWordLesson:
			'“Differs from” requires a contrast, not a list of cell parts. Count distinct categories and make the direction of every difference clear.',
		diagnosisPrompt: 'What is the central problem with Answer B?',
		diagnosisChoices: [
			choice(
				'genetic-material-wrong',
				'It says bacterial cells contain genetic material, which they never contain.',
				'Bacterial cells do contain genetic material.'
			),
			choice(
				'needs-plant',
				'It compares a bacterial cell with an animal cell rather than plant tissue.',
				'The requested comparison is specifically with a human cheek cell.'
			),
			choice(
				'lists-similarities',
				'It lists shared features instead of three directed differences between cells.',
				'Correct: membrane, cytoplasm and genetic material do not distinguish them.',
				true
			)
		],
		repairPrompt: 'Which set supplies three distinct directed differences?',
		repairChoices: [
			choice(
				'smaller-nucleus-mitochondria',
				'Bacterial cells are smaller, lack a nucleus and lack mitochondria.',
				'These are three distinct differences stated in the required direction.',
				true
			),
			choice(
				'membrane-cytoplasm-dna',
				'Bacterial cells have a membrane, cytoplasm and genetic material.',
				'Human cheek cells share all three features.'
			),
			choice(
				'free-unenclosed-dna',
				'Bacterial cells have free DNA, unenclosed DNA and no nucleus.',
				'These phrases repeat one nucleus-and-DNA difference.'
			)
		],
		freeTextKeywordGroups: [
			['smaller', 'much smaller'],
			['no nucleus', 'lacks a nucleus', 'without a nucleus'],
			['no mitochondria', 'lacks mitochondria', 'without mitochondria']
		],
		repairSuccess:
			'You replaced shared features with three different comparisons: size, nucleus and mitochondria.',
		transferPromptLead:
			'A bacterium is compared with a root hair cell. Which option gives three genuine differences for the bacterium?',
		transferChoices: [
			choice(
				'cell-wall-membrane',
				'It has a cell wall, cell membrane and cytoplasm.',
				'A root hair cell also has all three structures.'
			),
			choice(
				'smaller-no-nucleus',
				'It is smaller, lacks a nucleus and lacks mitochondria.',
				'These are three distinct differences in the bacterial direction.',
				true
			),
			choice(
				'dna-three-ways',
				'Its DNA is free, unenclosed and outside a nucleus.',
				'These descriptions repeat a single DNA-location difference.'
			)
		],
		transferExplanation:
			'The eukaryotic cell changed, but the scoring method remained: name different feature categories and state each contrast in the bacterial direction.',
		memoryHandle: 'Feature category → direction → count'
	}),
	reviewedChallenge({
		id: 'biology-prokaryote-eukaryote-comparison',
		slug: 'bacterium-and-yeast-differences',
		title: 'Have you counted one DNA point twice?',
		topic: 'Cell biology: prokaryotic and eukaryotic cells',
		subjectArtTheme: 'cells-practical',
		hook: '“No nucleus” and “unenclosed DNA” describe one feature category, not two.',
		arc: 'read-the-evidence',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Give three structural differences between a bacterial cell and a yeast cell. State each difference from the bacterial cell’s point of view.',
		metaDescription:
			'Practise precise prokaryote comparisons in GCSE Biology by avoiding repeated DNA points and transferring the method to another eukaryotic cell.',
		staticAnswers: {
			a: 'A bacterium has no nucleus, its DNA is unenclosed in the cytoplasm and its genetic material is not surrounded by a nuclear membrane.',
			b: 'Compared with a yeast cell, a bacterium is much smaller and has neither a nucleus nor mitochondria; these are three separate structural differences.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Answer A gives the nucleus-and-DNA-location difference three times. Answer B separates size, nucleus and mitochondria into distinct structural categories.',
		commandWordLesson:
			'When a question requests three differences, paraphrases do not create extra marks. Move to a new cell feature before counting another point.',
		diagnosisPrompt: 'Why does Answer A earn only one distinct point?',
		diagnosisChoices: [
			choice(
				'repeats-dna-location',
				'Every phrase repeats the same nucleus and DNA-location difference.',
				'Correct: different wording does not create different structural contrasts.',
				true
			),
			choice(
				'yeast-no-nucleus',
				'Yeast cells also have no nucleus, so every statement is false.',
				'Yeast cells are eukaryotic and do have a nucleus.'
			),
			choice(
				'needs-similarities',
				'The answer must begin with three similarities before differences count.',
				'The question requests differences only.'
			)
		],
		repairPrompt: 'Which addition supplies two genuinely new categories?',
		repairChoices: [
			choice(
				'more-dna-wording',
				'Add “its genetic material lies freely outside a nuclear envelope”.',
				'That restates the existing DNA-location point.'
			),
			choice(
				'size-mitochondria',
				'Add “it is smaller and it has no mitochondria”.',
				'Size and mitochondria are two new feature categories.',
				true
			),
			choice(
				'membrane-cytoplasm',
				'Add “it has a cell membrane and contains cytoplasm”.',
				'Yeast cells share both of these features.'
			)
		],
		freeTextKeywordGroups: [
			['smaller', 'much smaller'],
			['no mitochondria', 'lacks mitochondria', 'without mitochondria']
		],
		repairSuccess:
			'You kept one DNA-location point and added size and mitochondria as two genuinely new comparisons.',
		transferPromptLead:
			'A bacterium is compared with a liver cell. Which response contains three separate bacterial differences?',
		transferChoices: [
			choice(
				'dna-repeated',
				'No nucleus, unenclosed DNA and DNA free in cytoplasm.',
				'Those phrases all describe one DNA-location feature.'
			),
			choice(
				'shared-features',
				'Cell membrane, cytoplasm and ribosomes are present in bacteria.',
				'Liver cells also possess these broad features.'
			),
			choice(
				'three-categories',
				'Smaller size, no nucleus and no mitochondria distinguish the bacterium.',
				'This gives three distinct categories in the required direction.',
				true
			)
		],
		transferExplanation:
			'Changing yeast to liver does not change the mark-counting rule: one feature category earns one distinct comparison.',
		memoryHandle: 'One category → one difference → move on'
	}),
	reviewedChallenge({
		id: 'biology-photosynthesis-control-variables',
		slug: 'pondweed-control-variables',
		title: 'Which variables are still uncontrolled?',
		topic: 'Working scientifically: control variables',
		subjectArtTheme: 'cells-practical',
		hook: 'A useful control must affect the outcome, be measurable and not already be fixed.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'Students vary lamp distance and count pondweed bubbles for one minute. They already use the same pondweed species and measuring time. Suggest two other control variables.',
		metaDescription:
			'Choose fair-test controls for a pondweed investigation in this GCSE Biology challenge, then transfer the selection method to enzyme activity.',
		staticAnswers: {
			a: 'Use equal lengths of pondweed and keep the water temperature constant, because both can affect the number of bubbles produced during each minute.',
			b: 'Use the same pondweed species and count bubbles for one minute, because changing either factor would make the lamp-distance comparison unfair.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'off-command',
		showdownExplanation:
			'Answer B repeats the two conditions already fixed. Answer A identifies two additional factors that can change photosynthesis rate and can be kept consistent.',
		commandWordLesson:
			'“Suggest two other control variables” means choose two relevant measurable factors not already named. Do not repeat the independent variable or the outcome.',
		diagnosisPrompt: 'Why does Answer B not answer “two other”?',
		diagnosisChoices: [
			choice(
				'needs-three',
				'It gives two controls when at least three are required.',
				'The question asks for exactly two suggestions.'
			),
			choice(
				'repeats-given',
				'It repeats the species and timing already controlled.',
				'Correct: neither response is an additional control.',
				true
			),
			choice(
				'controls-distance',
				'It should keep lamp distance constant in every trial.',
				'Lamp distance is deliberately varied as the independent variable.'
			)
		],
		repairPrompt: 'Which pair gives two relevant additional controls?',
		repairChoices: [
			choice(
				'distance-bubbles',
				'Keep lamp distance and bubble count the same each time.',
				'Those are the independent variable and the measured outcome.'
			),
			choice(
				'species-time',
				'Keep pondweed species and counting time the same each time.',
				'Both controls are already stated in the question.'
			),
			choice(
				'length-temperature',
				'Keep pondweed length and water temperature the same each time.',
				'Both can affect bubble production and can be held consistent.',
				true
			)
		],
		freeTextKeywordGroups: [
			['pondweed length', 'length of pondweed', 'same length'],
			['water temperature', 'temperature of water', 'same temperature']
		],
		repairSuccess:
			'You chose two additional factors that could affect the outcome and can be kept consistent.',
		transferPromptLead:
			'Students vary pH while timing how long amylase takes to digest starch. Temperature is already controlled. Which additional pair is best?',
		transferChoices: [
			choice(
				'volumes-concentrations',
				'Keep enzyme volume and starch concentration the same in every trial.',
				'Both factors can affect the measured reaction time and are additional.',
				true
			),
			choice(
				'ph-time',
				'Keep pH and digestion time the same in every trial.',
				'pH must vary, while digestion time is the measured outcome.'
			),
			choice(
				'temperature-only',
				'Keep temperature and room number the same in every trial.',
				'Temperature is already controlled and room number is not relevant.'
			)
		],
		transferExplanation:
			'The investigation changed, but each control still has to be relevant, measurable, additional and separate from what is deliberately varied or measured.',
		memoryHandle: 'Relevant → measurable → additional → controlled'
	}),
	reviewedChallenge({
		id: 'biology-osmosis-control-variables',
		slug: 'potato-osmosis-control-variables',
		title: 'What else must stay the same?',
		topic: 'Working scientifically: control variables',
		subjectArtTheme: 'cells-practical',
		hook: 'Repeating a stated condition does not make it an additional control.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 5,
		previewQuestion:
			'Students investigate how sugar concentration affects potato-chip mass. Every chip stays immersed for 30 minutes in 20 cm³ of solution. Suggest two other control variables.',
		metaDescription:
			'Select additional controls for a potato osmosis test in this GCSE Biology challenge, then apply the same fair-test reasoning to transpiration.',
		staticAnswers: {
			a: 'Use 20 cm³ of solution for every chip and leave every chip immersed for 30 minutes, so the stated conditions remain consistent.',
			b: 'Cut every potato chip to the same dimensions and use chips from the same potato, so starting size and biological material remain consistent.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'off-command',
		showdownExplanation:
			'Answer A restates the volume and time already controlled. Answer B adds chip dimensions and potato source, two relevant factors that could otherwise alter mass change.',
		commandWordLesson:
			'Before suggesting controls, cross out every condition already fixed. Then choose factors that could change the outcome and describe how each will be kept consistent.',
		diagnosisPrompt: 'What prevents Answer A from earning the marks?',
		diagnosisChoices: [
			choice(
				'volume-irrelevant',
				'Solution volume and immersion time can never affect osmosis results.',
				'Both can matter, but they are already fixed here.'
			),
			choice(
				'needs-temperature-only',
				'Only temperature can be controlled in a potato investigation.',
				'Several relevant variables can be controlled, including chip dimensions.'
			),
			choice(
				'repeats-stated',
				'It repeats the solution volume and time already stated.',
				'Correct: the question requests two other controls.',
				true
			)
		],
		repairPrompt: 'Which pair supplies two additional controls?',
		repairChoices: [
			choice(
				'dimensions-source',
				'Keep chip dimensions and potato source the same throughout.',
				'Both are relevant, measurable and not already given.',
				true
			),
			choice(
				'concentration-mass',
				'Keep sugar concentration and final chip mass the same throughout.',
				'Concentration is varied and final mass is measured.'
			),
			choice(
				'volume-time',
				'Keep solution volume and immersion time the same throughout.',
				'Those are the controls already specified.'
			)
		],
		freeTextKeywordGroups: [
			['same dimensions', 'same size', 'same length and diameter', 'same surface area'],
			['same potato', 'same potato source', 'same potato variety']
		],
		repairSuccess:
			'You ignored the repeated conditions and selected size and potato source as two genuinely additional controls.',
		transferPromptLead:
			'Students compare water loss from leafy shoots under different wind speeds. Test duration is already controlled. Which additional pair is suitable?',
		transferChoices: [
			choice(
				'wind-water-loss',
				'Keep wind speed and measured water loss the same.',
				'Wind speed is varied and water loss is measured.'
			),
			choice(
				'leaf-area-temperature',
				'Keep leaf area and surrounding temperature the same.',
				'Both can affect transpiration and can be held consistent.',
				true
			),
			choice(
				'duration-location',
				'Keep test duration and classroom location the same.',
				'Duration is already fixed, while location is too vague.'
			)
		],
		transferExplanation:
			'Potato mass and water loss are different outcomes, but good controls remain relevant to the outcome, additional and possible to keep consistent.',
		memoryHandle: 'Remove given controls → choose two new factors'
	}),
	reviewedChallenge({
		id: 'biology-catalase-denaturation',
		slug: 'catalase-high-temperature',
		title: 'Why does catalase slow after overheating?',
		topic: 'Bioenergetics: enzyme action',
		subjectArtTheme: 'biochemistry',
		hook: 'At high temperature, faster collisions no longer tell the whole story.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Catalase releases oxygen from hydrogen peroxide. A sample heated to 70 °C releases almost no oxygen. Explain why excessive heating lowers the reaction rate.',
		metaDescription:
			'Explain catalase denaturation in this GCSE Biology challenge by linking heat, active-site shape and substrate binding before transferring the idea.',
		staticAnswers: {
			a: 'At 70 °C catalase denatures and its active site changes shape. Hydrogen peroxide no longer fits, so fewer enzyme–substrate complexes form and little oxygen is released.',
			b: 'At 70 °C catalase particles move faster and collide more often. The enzyme becomes tired after these collisions, so little oxygen is eventually released.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B correctly expects faster particle movement but invents enzyme tiredness. Answer A explains the high-temperature fall through denaturation, changed active-site shape and failed binding.',
		commandWordLesson:
			'For an enzyme rate falling above its optimum, connect excessive heat to active-site shape, substrate fit and fewer successful reactions.',
		diagnosisPrompt: 'Which idea first makes Answer B scientifically wrong?',
		diagnosisChoices: [
			choice(
				'enzyme-tired',
				'It says enzymes become tired instead of becoming denatured.',
				'Correct: enzymes do not tire; excessive heat changes their structure.',
				true
			),
			choice(
				'particles-move',
				'It says particles move faster when temperature becomes higher.',
				'That statement is valid, but it cannot explain the later decrease.'
			),
			choice(
				'oxygen-product',
				'It says oxygen is produced during hydrogen peroxide breakdown.',
				'Oxygen is a product of this catalase-controlled reaction.'
			)
		],
		repairPrompt: 'Which replacement completes the high-temperature explanation?',
		repairChoices: [
			choice(
				'substrate-denatures',
				'The substrate denatures and cannot reach the unchanged active site.',
				'The required structural change is to the enzyme active site.'
			),
			choice(
				'active-site-changes',
				'Catalase denatures; its active site changes so hydrogen peroxide cannot fit.',
				'This links excessive heat to reduced enzyme–substrate complex formation.',
				true
			),
			choice(
				'cold-collisions',
				'Catalase cools; particles lose energy and stop colliding completely.',
				'The sample was excessively heated, not cooled.'
			)
		],
		freeTextKeywordGroups: [
			['denature', 'denatured', 'denaturation'],
			['active site changes shape', 'changed active site', 'active site changes'],
			['substrate cannot fit', 'hydrogen peroxide cannot fit', 'cannot bind']
		],
		repairSuccess:
			'You replaced enzyme tiredness with the molecular link from heat to altered active site and reduced binding.',
		transferPromptLead:
			'Protease activity falls sharply after the enzyme is kept at 80 °C. Which explanation follows the same science?',
		transferChoices: [
			choice(
				'collisions-increase',
				'More collisions must make protease activity continue rising indefinitely.',
				'Above the optimum, denaturation can outweigh increased collision frequency.'
			),
			choice(
				'protein-evaporates',
				'The protease evaporates, leaving its active sites unchanged.',
				'Enzyme denaturation, not evaporation, changes active-site shape.'
			),
			choice(
				'denatures-fit',
				'Protease denatures, so substrates no longer fit its changed active sites.',
				'This transfers the full heat-to-binding explanation.',
				true
			)
		],
		transferExplanation:
			'The enzyme and substrate changed, but excessive heat still reduces activity through denaturation, altered active sites and poorer substrate binding.',
		memoryHandle: 'Excess heat → denature → poor substrate fit'
	}),
	reviewedChallenge({
		id: 'biology-amylase-denaturation',
		slug: 'amylase-overheating',
		title: 'What changes when amylase gets too hot?',
		topic: 'Bioenergetics: enzyme action',
		subjectArtTheme: 'biochemistry',
		hook: '“The enzyme stops” names the outcome, not the structural reason.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'Amylase digests starch quickly at 37 °C but very slowly after being heated to 65 °C. Explain the decrease in activity at the higher temperature.',
		metaDescription:
			'Follow the active-site explanation for overheated amylase in this GCSE Biology challenge, then transfer it to an enzyme in respiration.',
		staticAnswers: {
			a: 'At 65 °C the amylase stops working because heat removes all starch molecules. With no starch left, the enzyme cannot continue producing sugar.',
			b: 'At 65 °C amylase denatures and its active site changes shape. Starch no longer binds effectively, so fewer successful reactions occur each second.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A wrongly says heat removes the substrate. Answer B follows the required causal sequence from enzyme denaturation to changed active site, reduced binding and slower digestion.',
		commandWordLesson:
			'“Explain the decrease” needs the mechanism between temperature and rate. Name what changes in the enzyme and how that affects substrate binding.',
		diagnosisPrompt: 'What is the first wrong step in Answer A?',
		diagnosisChoices: [
			choice(
				'sugar-produced',
				'It says amylase digestion can produce sugars from starch.',
				'Amylase does break starch into sugars.'
			),
			choice(
				'heat-removes-starch',
				'It says heat removes the starch instead of denaturing amylase.',
				'Correct: the relevant change is to the enzyme’s active site.',
				true
			),
			choice(
				'rate-decreases',
				'It says activity is lower after the higher temperature.',
				'That is the observation the explanation must account for.'
			)
		],
		repairPrompt: 'Which sentence supplies the missing molecular link?',
		repairChoices: [
			choice(
				'starch-denatures',
				'Starch denatures, making every amylase active site more flexible.',
				'The enzyme denatures; starch is the substrate here.'
			),
			choice(
				'particles-stop',
				'All particles stop moving because 65 °C is too high.',
				'Particles move faster at higher temperature; they do not stop.'
			),
			choice(
				'enzyme-denatures',
				'Amylase denatures, changing its active site so starch binds less effectively.',
				'This connects excessive heat to the decrease in reaction rate.',
				true
			)
		],
		freeTextKeywordGroups: [
			['amylase denatures', 'enzyme denatures', 'denatured amylase'],
			['active site changes shape', 'changed active site', 'active site altered'],
			['starch cannot bind', 'starch fits less well', 'substrate cannot fit']
		],
		repairSuccess:
			'You connected overheating to amylase structure, substrate binding and the measured decrease in digestion rate.',
		transferPromptLead:
			'An enzyme controlling a respiration reaction loses activity after 75 °C treatment. Which explanation is most complete?',
		transferChoices: [
			choice(
				'respiration-enzyme',
				'The enzyme denatures, changing its active site and reducing substrate binding.',
				'This follows the complete structural chain to lower activity.',
				true
			),
			choice(
				'oxygen-boils',
				'Oxygen boils away, so every respiration enzyme keeps its original shape.',
				'The question concerns enzyme damage after excessive heating.'
			),
			choice(
				'enzyme-tired',
				'The enzyme becomes tired after making too many product molecules.',
				'Enzymes do not tire; denaturation explains the lasting loss.'
			)
		],
		transferExplanation:
			'Amylase digestion and respiration use different reactions, but an overheated enzyme loses activity through the same active-site mechanism.',
		memoryHandle: 'Too hot → active site changes → binding falls'
	}),
	reviewedChallenge({
		id: 'biology-starch-test-result',
		slug: 'iodine-starch-test-result',
		title: 'Which colour is a positive starch result?',
		topic: 'Organisation: food tests',
		subjectArtTheme: 'biochemistry',
		hook: 'Naming iodine is only half the method; the positive observation must be specific.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe how to test a crushed food sample for starch and state the positive result.',
		metaDescription:
			'Practise the iodine test and its blue-black result in this GCSE Biology challenge, then transfer the reagent-and-observation method to protein.',
		staticAnswers: {
			a: 'Add iodine solution to the crushed food sample. A positive result changes from orange-brown to blue-black, showing that starch is present.',
			b: 'Add iodine solution to the crushed food sample. A positive result is any visible colour change, showing that a nutrient is present.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Both answers select iodine solution. Answer A also names the diagnostic blue-black result, while Answer B’s “any colour change” cannot identify starch.',
		commandWordLesson:
			'For a food test, pair the correct reagent with a named positive observation. “Changes colour” is too vague to identify the substance.',
		diagnosisPrompt: 'Which required detail is missing from Answer B?',
		diagnosisChoices: [
			choice(
				'needs-heating',
				'The iodine mixture must be heated before any observation counts.',
				'Iodine’s starch test does not require heating.'
			),
			choice(
				'needs-mass',
				'The sample mass must be converted into a percentage first.',
				'This qualitative test asks for an observation, not a calculation.'
			),
			choice(
				'blue-black',
				'It never names the blue-black colour that indicates starch.',
				'Correct: the positive result must be specific.',
				true
			)
		],
		repairPrompt: 'Which addition completes the starch test?',
		repairChoices: [
			choice(
				'iodine-blue-black',
				'Add “a positive result changes from orange-brown to blue-black”.',
				'This names the diagnostic observation for starch.',
				true
			),
			choice(
				'iodine-purple',
				'Add “a positive result changes from blue to purple”.',
				'That describes the Biuret protein result, not iodine.'
			),
			choice(
				'iodine-red',
				'Add “a positive result forms a brick-red precipitate”.',
				'That belongs to a heated Benedict’s test.'
			)
		],
		freeTextKeywordGroups: [['blue-black', 'blue black', 'dark blue-black']],
		repairSuccess:
			'You kept the correct reagent and added the precise blue-black observation that identifies starch.',
		transferPromptLead:
			'A liquid food sample must be tested for protein. Which reagent-and-result pair is correct?',
		transferChoices: [
			choice(
				'benedicts-red',
				'Use Benedict’s solution; a positive result becomes brick red.',
				'That identifies reducing sugar after heating.'
			),
			choice(
				'biuret-purple',
				'Use Biuret solution; a positive result becomes mauve or purple.',
				'This correctly pairs the protein reagent with its observation.',
				true
			),
			choice(
				'iodine-black',
				'Use iodine solution; a positive result becomes blue-black.',
				'That identifies starch, not protein.'
			)
		],
		transferExplanation:
			'The nutrient changed, but the method stayed the same: select the correct reagent and name its diagnostic positive observation.',
		memoryHandle: 'Correct reagent → diagnostic result'
	}),
	reviewedChallenge({
		id: 'biology-lipid-test-result',
		slug: 'ethanol-emulsion-test-result',
		title: 'What makes an emulsion test positive?',
		topic: 'Organisation: food tests',
		subjectArtTheme: 'biochemistry',
		hook: 'A cloudy white emulsion is evidence; “the liquid changes” is not specific enough.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe the emulsion test for lipids using ethanol and water, and state the positive result.',
		metaDescription:
			'Complete the ethanol emulsion test in this GCSE Biology challenge by naming its milky result, then apply the same evidence rule to starch.',
		staticAnswers: {
			a: 'Shake the food sample with ethanol, then add water. If the liquid changes appearance, this gives a positive result for lipids in the sample.',
			b: 'Shake the food sample with ethanol, then add water. A cloudy white or milky emulsion is a positive result for lipids in the sample.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Both answers give the ethanol-then-water sequence. Only Answer B identifies the cloudy white or milky emulsion that makes the result interpretable.',
		commandWordLesson:
			'When asked for a positive result, name the observation precisely. General phrases such as “changes appearance” do not identify the tested substance.',
		diagnosisPrompt: 'What is missing from Answer A?',
		diagnosisChoices: [
			choice(
				'specific-emulsion',
				'It omits the cloudy white or milky emulsion result.',
				'Correct: that observation identifies a positive lipid test.',
				true
			),
			choice(
				'boiling-step',
				'It omits boiling the ethanol mixture over a flame.',
				'Heating flammable ethanol over a flame would be unsafe and unnecessary.'
			),
			choice(
				'iodine-first',
				'It omits adding iodine before the ethanol and water.',
				'Iodine tests for starch and is not part of this method.'
			)
		],
		repairPrompt: 'Which observation makes the positive result specific?',
		repairChoices: [
			choice(
				'purple-solution',
				'A clear purple solution forms after adding the water.',
				'Purple is associated with the Biuret protein test.'
			),
			choice(
				'milky-emulsion',
				'A cloudy white or milky emulsion forms after adding water.',
				'This is the diagnostic positive observation for lipids.',
				true
			),
			choice(
				'blue-black',
				'A blue-black colour appears after adding the water.',
				'Blue-black is the positive iodine result for starch.'
			)
		],
		freeTextKeywordGroups: [
			['cloudy white', 'milky', 'white emulsion', 'cloudy emulsion'],
			['add water', 'water added', 'then water']
		],
		repairSuccess:
			'You completed the correct sequence with the cloudy white or milky observation that identifies lipids.',
		transferPromptLead:
			'Another sample must be tested for starch. Which option uses a specific positive observation?',
		transferChoices: [
			choice(
				'any-change',
				'Add iodine and record any change in the liquid.',
				'An unspecified change cannot identify starch.'
			),
			choice(
				'biuret-purple',
				'Add Biuret solution and record a purple positive result.',
				'That is the protein test, not the starch test.'
			),
			choice(
				'iodine-blue-black',
				'Add iodine solution and record a blue-black positive result.',
				'This gives both the correct reagent and diagnostic observation.',
				true
			)
		],
		transferExplanation:
			'Lipids and starch use different tests, but each answer must pair the correct action with a positive observation specific enough to identify the substance.',
		memoryHandle: 'Test sequence → named positive observation'
	}),
	reviewedChallenge({
		id: 'biology-banana-benedicts-test',
		slug: 'banana-benedicts-heating',
		title: 'Have you heated the Benedict’s mixture?',
		topic: 'Organisation: food tests',
		subjectArtTheme: 'biochemistry',
		hook: 'The reagent and colour can both be right while the practical method is still incomplete.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe how to test mashed banana for reducing sugar using Benedict’s solution, including the required treatment and a positive result.',
		metaDescription:
			'Complete a Benedict’s test on banana in this GCSE Biology challenge by restoring the heating step and transferring the full test sequence.',
		staticAnswers: {
			a: 'Mix the banana liquid with Benedict’s solution and heat the mixture in a hot water bath. A positive result changes away from blue towards brick red.',
			b: 'Mix the banana liquid with Benedict’s solution and leave the mixture at room temperature. A positive result changes away from blue towards brick red.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incomplete',
		showdownExplanation:
			'Both answers name Benedict’s solution and a valid positive colour range. Only Answer A includes appropriate heating of the sample-and-reagent mixture.',
		commandWordLesson:
			'A usable Benedict’s method needs three linked parts: add the reagent to the sample, heat the mixture appropriately and observe the positive colour change.',
		diagnosisPrompt: 'Which method step is missing from Answer B?',
		diagnosisChoices: [
			choice(
				'add-iodine',
				'Add iodine solution before mixing in Benedict’s solution.',
				'Iodine tests for starch and is not needed here.'
			),
			choice(
				'heat-mixture',
				'Heat the sample-and-Benedict’s mixture using an appropriate method.',
				'Correct: the reagent and sample must be heated together.',
				true
			),
			choice(
				'cool-first',
				'Freeze the banana liquid before adding any reagent.',
				'Freezing is not part of Benedict’s test.'
			)
		],
		repairPrompt: 'Which replacement restores a complete method?',
		repairChoices: [
			choice(
				'heat-reagent-alone',
				'Heat Benedict’s solution alone, cool it, then add banana liquid.',
				'The reagent and sample should be heated as a mixture.'
			),
			choice(
				'hand-warm',
				'Hold the tube by hand until the mixture feels warm.',
				'Hand warmth is not a clear appropriate heating method.'
			),
			choice(
				'hot-water-bath',
				'Heat the mixture appropriately, for example in a hot water bath.',
				'This supplies the missing treatment safely and clearly.',
				true
			)
		],
		freeTextKeywordGroups: [
			[
				'heat the mixture',
				'heated mixture',
				'hot water bath',
				'heating block',
				'electric test tube heater'
			],
			['not blue', 'green', 'yellow', 'orange', 'brick red']
		],
		repairSuccess:
			'You restored the reagent–heat–colour sequence without treating one suitable heating apparatus as the only valid route.',
		transferPromptLead:
			'A student tests apple juice for reducing sugar. Which sequence is complete?',
		transferChoices: [
			choice(
				'benedicts-heat-colour',
				'Add Benedict’s solution, heat the mixture and observe any change from blue.',
				'This transfers the complete reagent, treatment and observation sequence.',
				true
			),
			choice(
				'iodine-heat-colour',
				'Add iodine solution, heat the mixture and observe blue-black.',
				'Iodine tests for starch and does not need this heating step.'
			),
			choice(
				'biuret-room-purple',
				'Add Biuret solution, leave it unheated and observe purple.',
				'That is a protein test rather than a reducing-sugar test.'
			)
		],
		transferExplanation:
			'The food sample changed, but a complete reducing-sugar test still needs Benedict’s solution, appropriate heating and an accepted positive colour change.',
		memoryHandle: 'Benedict’s → heat mixture → colour changes'
	}),
	reviewedChallenge({
		id: 'biology-reducing-sugar-test-sequence',
		slug: 'reducing-sugar-test-correct-order',
		title: 'Is the Benedict’s test in the right order?',
		topic: 'Organisation: food tests',
		subjectArtTheme: 'biochemistry',
		hook: 'Heating the reagent before adding the sample does not complete the required test.',
		arc: 'complete-the-method',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'A student must test a leaf extract for reducing sugar with Benedict’s solution. Describe the order of mixing, heating and observing the result.',
		metaDescription:
			'Order a Benedict’s reducing-sugar test correctly in this GCSE Biology challenge, then transfer the same reagent–heat–observation sequence to milk.',
		staticAnswers: {
			a: 'Heat Benedict’s solution by itself, let it cool and then add the leaf extract. A brick-red colour after mixing indicates reducing sugar.',
			b: 'Mix the leaf extract with Benedict’s solution, then heat the mixture appropriately. A change from blue towards brick red indicates reducing sugar.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A separates heating from the sample and reagent mixture. Answer B gives the usable order: combine them, heat the mixture, then judge the colour.',
		commandWordLesson:
			'For a practical sequence, put each action where it does its job. Benedict’s solution must be heated with the sample before the result is observed.',
		diagnosisPrompt: 'Where does Answer A first go wrong?',
		diagnosisChoices: [
			choice(
				'brick-red',
				'It accepts brick red as a positive reducing-sugar result.',
				'Brick red is an accepted strong positive result.'
			),
			choice(
				'leaf-extract',
				'It uses leaf extract instead of an animal food sample.',
				'Plant extracts can be tested for reducing sugars.'
			),
			choice(
				'heats-alone',
				'It heats Benedict’s solution alone rather than heating the mixture.',
				'Correct: sample and reagent need to be heated together.',
				true
			)
		],
		repairPrompt: 'Which opening puts the method in the right order?',
		repairChoices: [
			choice(
				'mix-then-heat',
				'Mix extract with Benedict’s solution, then heat the mixture appropriately.',
				'This correctly orders reagent, sample and heating.',
				true
			),
			choice(
				'heat-then-sample',
				'Boil Benedict’s solution alone, then add the cold extract.',
				'The sample is absent during the required heating.'
			),
			choice(
				'observe-then-heat',
				'Record the final colour first, then heat the mixture.',
				'The observation must follow the treatment.'
			)
		],
		freeTextKeywordGroups: [
			['mix extract with benedict’s', 'add benedict’s to the extract', 'sample and benedict’s'],
			['heat the mixture', 'heated together', 'hot water bath'],
			['change from blue', 'not blue', 'brick red']
		],
		repairSuccess:
			'You placed mixing before heating and observation after heating, making the result interpretable.',
		transferPromptLead:
			'Milk must be tested for reducing sugar. Which method follows the same order?',
		transferChoices: [
			choice(
				'observe-unheated',
				'Add Benedict’s solution and judge the colour without heating.',
				'The mixture still needs appropriate heating.'
			),
			choice(
				'mix-heat-observe',
				'Mix milk with Benedict’s solution, heat, then judge the colour.',
				'This preserves the required order in the new sample.',
				true
			),
			choice(
				'heat-milk-first',
				'Boil the milk alone, cool it, then add Benedict’s.',
				'The reagent must be present during the test heating.'
			)
		],
		transferExplanation:
			'Leaf extract and milk differ, but the operational chain remains mix sample with Benedict’s, heat the mixture and then observe the colour.',
		memoryHandle: 'Mix → heat together → observe'
	}),
	reviewedChallenge({
		id: 'biology-ivf-laboratory-fertilisation',
		slug: 'ivf-laboratory-fertilisation',
		title: 'Where does IVF fertilisation happen?',
		topic: 'Hormonal coordination: fertility treatment',
		subjectArtTheme: 'inheritance-reproduction',
		hook: 'Collecting eggs is not enough; “in vitro” identifies where fertilisation happens.',
		arc: 'complete-the-method',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 4,
		estimatedMinutes: 4,
		previewQuestion:
			'Describe the IVF stages after mature eggs have been collected, including where fertilisation occurs and what happens to the embryos.',
		metaDescription:
			'Place fertilisation and embryo transfer correctly in this GCSE Biology IVF challenge, then apply the ordered sequence after hormone treatment.',
		staticAnswers: {
			a: 'The collected eggs are fertilised with sperm in a laboratory. The embryos begin dividing, and one or two embryos are then transferred into the uterus.',
			b: 'The collected eggs and sperm are placed together inside the uterus. Fertilisation and embryo division happen there, so no later embryo transfer is needed.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B moves fertilisation into the uterus and removes embryo transfer. Answer A preserves the defining IVF locations and keeps embryo development in order.',
		commandWordLesson:
			'An ordered process answer must retain both stage and location: fertilise collected eggs in a laboratory, allow embryos to form, then transfer embryo(s) to the uterus.',
		diagnosisPrompt: 'Which first step takes Answer B outside IVF?',
		diagnosisChoices: [
			choice(
				'fertilises-uterus',
				'It places fertilisation in the uterus instead of a laboratory.',
				'Correct: laboratory fertilisation is the defining in-vitro stage.',
				true
			),
			choice(
				'embryos-divide',
				'It allows fertilised eggs to begin dividing into embryos.',
				'Embryo division is a valid stage before transfer.'
			),
			choice(
				'uses-sperm',
				'It uses sperm to fertilise the collected mature eggs.',
				'Fertilisation with sperm is required; the location is wrong.'
			)
		],
		repairPrompt: 'Which sequence restores both correct locations?',
		repairChoices: [
			choice(
				'uterus-fertilisation',
				'Insert eggs and sperm into the uterus for fertilisation.',
				'This still omits the laboratory fertilisation stage.'
			),
			choice(
				'lab-then-uterus',
				'Fertilise eggs in a laboratory, then transfer embryos to the uterus.',
				'This restores the defining location sequence.',
				true
			),
			choice(
				'lab-only',
				'Fertilise eggs in a laboratory and keep embryos there permanently.',
				'Embryos must be transferred to the uterus for pregnancy.'
			)
		],
		freeTextKeywordGroups: [
			['laboratory', 'in a lab', 'outside the body', 'in vitro'],
			['embryos divide', 'embryo formation', 'embryos form'],
			['transfer to the uterus', 'inserted into uterus', 'embryos transferred']
		],
		repairSuccess:
			'You restored the two defining locations: fertilisation in a laboratory and embryo transfer to the uterus.',
		transferPromptLead:
			'FSH and LH treatment has produced mature eggs. Which remaining sequence can lead to pregnancy through IVF?',
		transferChoices: [
			choice(
				'insert-gametes',
				'Insert eggs and sperm together into the uterus for fertilisation.',
				'That skips fertilisation outside the body.'
			),
			choice(
				'keep-embryos-lab',
				'Fertilise eggs in a laboratory and keep every embryo there.',
				'Embryos must later enter the uterus.'
			),
			choice(
				'collect-lab-transfer',
				'Collect eggs, fertilise them in a laboratory, then transfer formed embryos.',
				'This keeps the stages and locations in order.',
				true
			)
		],
		transferExplanation:
			'The prompt begins after hormones, but the transferable core is unchanged: collect eggs, fertilise outside the body, form embryos and transfer them.',
		memoryHandle: 'Lab fertilisation → embryo formation → uterus transfer'
	}),
	reviewedChallenge({
		id: 'biology-ivf-embryo-transfer-sequence',
		slug: 'ivf-embryo-transfer-order',
		title: 'Which IVF stage comes after fertilisation?',
		topic: 'Hormonal coordination: fertility treatment',
		subjectArtTheme: 'inheritance-reproduction',
		hook: 'Fertilisation starts embryo development; it does not finish the treatment.',
		arc: 'complete-the-method',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Put these IVF events into a complete account after egg collection: laboratory fertilisation, embryo division and transfer to the uterus.',
		metaDescription:
			'Order embryo development and transfer in this GCSE Biology IVF challenge, then transfer the same sequence to a different treatment description.',
		staticAnswers: {
			a: 'Eggs are fertilised with sperm in a laboratory and immediately placed back into an ovary. The embryos then divide and move naturally into the uterus.',
			b: 'Eggs are fertilised with sperm in a laboratory and develop into dividing embryos. One or two embryos are then transferred into the uterus.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A sends fertilised eggs to an ovary and relies on an invented route. Answer B keeps development in the laboratory before direct embryo transfer to the uterus.',
		commandWordLesson:
			'For a sequence, check every transition: fertilisation produces a zygote, division produces an embryo and transfer places selected embryo(s) in the uterus.',
		diagnosisPrompt: 'Where does Answer A first leave the IVF sequence?',
		diagnosisChoices: [
			choice(
				'lab-fertilisation',
				'It fertilises the collected eggs with sperm in a laboratory.',
				'That is the correct in-vitro stage.'
			),
			choice(
				'places-in-ovary',
				'It places fertilised eggs into an ovary instead of developing embryos.',
				'Correct: embryos develop before transfer directly to the uterus.',
				true
			),
			choice(
				'embryos-divide',
				'It says embryos divide after fertilisation has taken place.',
				'Division after fertilisation is a valid developmental stage.'
			)
		],
		repairPrompt: 'Which continuation gives the correct final stages?',
		repairChoices: [
			choice(
				'ovary-route',
				'Place fertilised eggs in an ovary and wait for migration.',
				'This is not the IVF embryo-transfer route.'
			),
			choice(
				'keep-lab',
				'Let embryos divide in the laboratory and leave them there.',
				'Embryos still need transfer to the uterus.'
			),
			choice(
				'divide-transfer',
				'Let embryos divide, then transfer selected embryos into the uterus.',
				'This completes development and transfer in order.',
				true
			)
		],
		freeTextKeywordGroups: [
			['embryos divide', 'dividing embryos', 'embryo development'],
			['transfer into the uterus', 'insert embryos into uterus', 'uterus transfer']
		],
		repairSuccess:
			'You removed the invented ovary route and connected laboratory embryo development directly to uterus transfer.',
		transferPromptLead:
			'Collected eggs have just been fertilised in a laboratory. Which next steps complete IVF?',
		transferChoices: [
			choice(
				'divide-then-transfer',
				'Allow embryos to divide, then transfer selected embryos into the uterus.',
				'This continues from fertilisation through development to transfer.',
				true
			),
			choice(
				'transfer-sperm',
				'Transfer remaining sperm into the uterus and discard every embryo.',
				'IVF transfers formed embryos, not remaining sperm.'
			),
			choice(
				'place-ovary',
				'Place fertilised eggs in an ovary before any cell division.',
				'The IVF sequence develops embryos before uterus transfer.'
			)
		],
		transferExplanation:
			'Whether the account begins with egg collection or laboratory fertilisation, the final chain remains embryo division followed by transfer to the uterus.',
		memoryHandle: 'Fertilise → embryo divides → transfer to uterus'
	}),
	reviewedChallenge({
		id: 'biology-flu-vaccine-memory',
		slug: 'flu-vaccine-memory-cells',
		title: 'What keeps vaccine protection ready?',
		topic: 'Infection and response: vaccination',
		subjectArtTheme: 'regulation-immunity',
		hook: 'The first antibodies need not last forever; memory cells make the later response faster.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Explain how a flu vaccine containing harmless viral antigens can protect a person during later exposure to the matching flu strain.',
		metaDescription:
			'Build the antigen–antibody–memory sequence for a flu vaccine in this GCSE Biology challenge, then transfer the immunity reasoning to hepatitis.',
		staticAnswers: {
			a: 'Harmless flu antigens stimulate lymphocytes to make specific antibodies and memory cells. Later exposure triggers a faster antibody response that can prevent illness.',
			b: 'Harmless flu antigens make every white blood cell permanently store antibodies. Later exposure is harmless because those first antibodies can never disappear.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B relies on permanent first antibodies and gives every white blood cell the same role. Answer A explains specificity and lasting readiness through memory cells.',
		commandWordLesson:
			'An immunity explanation needs two exposures: antigen stimulates a specific response now, memory cells remain, then a faster response follows later exposure.',
		diagnosisPrompt: 'Which missing link matters most in Answer B?',
		diagnosisChoices: [
			choice(
				'needs-antibiotics',
				'It should say antibiotics remain ready to kill flu viruses.',
				'Antibiotics do not treat viruses and are not vaccine memory.'
			),
			choice(
				'needs-phagocytes',
				'It should say phagocytes make all specific antibodies permanently.',
				'Lymphocytes make antibodies; phagocytes do not create immune memory.'
			),
			choice(
				'needs-memory',
				'It replaces memory cells with permanently surviving first antibodies.',
				'Correct: memory cells enable the rapid later response.',
				true
			)
		],
		repairPrompt: 'Which replacement explains lasting protection accurately?',
		repairChoices: [
			choice(
				'memory-response',
				'Memory cells remain and trigger faster production of matching antibodies later.',
				'This supplies the specific cellular basis of protection.',
				true
			),
			choice(
				'antibodies-reproduce',
				'Antibodies reproduce themselves whenever the flu virus returns later.',
				'Antibodies do not reproduce; lymphocytes produce them.'
			),
			choice(
				'phagocytes-store',
				'Phagocytes store the first antibodies and release them on demand.',
				'Phagocytes do not store antibodies for later exposure.'
			)
		],
		freeTextKeywordGroups: [
			['memory cells', 'memory lymphocytes'],
			['faster', 'rapid', 'quicker'],
			['specific antibodies', 'matching antibodies']
		],
		repairSuccess:
			'You linked harmless antigen exposure to memory cells and a faster matching-antibody response during later infection.',
		transferPromptLead:
			'A hepatitis vaccine introduces harmless antigens. Which sequence best explains later protection?',
		transferChoices: [
			choice(
				'first-antibodies',
				'First antibodies stay permanently and attack every future pathogen equally.',
				'Antibody responses are specific, and protection relies on memory cells.'
			),
			choice(
				'antigen-memory-response',
				'Specific lymphocytes form memory cells, enabling faster matching-antibody production later.',
				'This transfers the complete first-exposure and later-response sequence.',
				true
			),
			choice(
				'antibiotic-memory',
				'Antigens teach antibiotics to reproduce whenever hepatitis returns later.',
				'Antibiotics neither reproduce nor create vaccine memory.'
			)
		],
		transferExplanation:
			'The pathogen changed, but vaccination still uses harmless antigens, specific lymphocytes, memory cells and a faster response on later exposure.',
		memoryHandle: 'Antigen → specific response → memory → faster response'
	}),
	reviewedChallenge({
		id: 'biology-booster-vaccine-response',
		slug: 'booster-vaccine-response',
		title: 'Why can a booster response be faster?',
		topic: 'Infection and response: vaccination',
		subjectArtTheme: 'regulation-immunity',
		hook: 'A booster does not strengthen antibodies; it re-exposes the immune system to matching antigens.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 4,
		estimatedMinutes: 5,
		previewQuestion:
			'Explain why a booster vaccine containing the same harmless antigens can produce a faster antibody response than the first vaccine dose.',
		metaDescription:
			'Explain a faster booster response through memory lymphocytes in this GCSE Biology challenge, then transfer the same immunity sequence to tetanus.',
		staticAnswers: {
			a: 'The booster makes the first antibodies stronger and keeps them circulating forever. These stronger antibodies divide rapidly whenever the same pathogen enters.',
			b: 'The first dose formed memory lymphocytes. Matching antigens in the booster activate them quickly, producing many specific antibodies in a faster secondary response.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer A treats antibodies as dividing permanent cells. Answer B correctly gives memory lymphocytes the role of recognising matching antigens and driving rapid antibody production.',
		commandWordLesson:
			'To compare first and later responses, identify what remains after the first exposure and show how it speeds the specific response after re-exposure.',
		diagnosisPrompt: 'Which claim first makes Answer A inaccurate?',
		diagnosisChoices: [
			choice(
				'antibodies-divide',
				'It says antibodies become stronger and divide like living cells.',
				'Correct: lymphocytes make antibodies; antibodies do not divide.',
				true
			),
			choice(
				'same-antigens',
				'It says the booster contains antigens matching the first dose.',
				'Matching antigens are what activate the established memory cells.'
			),
			choice(
				'faster-response',
				'It says later exposure can produce a faster immune response.',
				'A faster secondary response is the outcome to explain.'
			)
		],
		repairPrompt: 'Which sentence explains the faster response?',
		repairChoices: [
			choice(
				'phagocytes-copy',
				'Phagocytes copy stored antibodies whenever matching antigens return.',
				'Phagocytes do not copy or store antibodies.'
			),
			choice(
				'memory-activate',
				'Memory lymphocytes recognise matching antigens and produce specific antibodies rapidly.',
				'This gives the cellular link behind the faster response.',
				true
			),
			choice(
				'antigens-attack',
				'Harmless antigens attack the pathogen before lymphocytes become involved.',
				'Antigens stimulate an immune response; they do not attack pathogens.'
			)
		],
		freeTextKeywordGroups: [
			['memory lymphocytes', 'memory cells'],
			['recognise matching antigen', 'matching antigens', 'specific antigen'],
			['rapid antibodies', 'faster antibody production', 'produce antibodies quickly']
		],
		repairSuccess:
			'You replaced dividing antibodies with memory lymphocytes that recognise matching antigen and produce antibodies rapidly.',
		transferPromptLead:
			'A tetanus booster contains the same antigen used previously. Which explanation best predicts the response?',
		transferChoices: [
			choice(
				'general-permanent',
				'Permanent antibodies attack every pathogen at the same increased speed.',
				'Antibody responses are specific and first antibodies are not permanent.'
			),
			choice(
				'antibiotics-remember',
				'Antibiotics remember the antigen and multiply during later exposure.',
				'Antibiotics do not form memory or reproduce.'
			),
			choice(
				'memory-secondary',
				'Memory lymphocytes trigger rapid production of specific antibodies after re-exposure.',
				'This is the expected faster secondary response.',
				true
			)
		],
		transferExplanation:
			'Flu and tetanus antigens differ, but a booster response uses the same sequence: specific memory cells recognise antigen and rapidly produce matching antibodies.',
		memoryHandle: 'First dose → memory cells → booster → rapid antibodies'
	}),
	reviewedChallenge({
		id: 'biology-temperature-homeostasis-loop',
		slug: 'temperature-homeostasis-control-loop',
		title: 'Who detects and corrects overheating?',
		topic: 'Homeostasis and response: control systems',
		subjectArtTheme: 'regulation-immunity',
		hook: 'Effectors change the body’s response; they do not force the environment to cool down.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'starter',
		marks: 3,
		estimatedMinutes: 4,
		previewQuestion:
			'Explain how a homeostatic control system responds when body temperature rises above its normal level during exercise.',
		metaDescription:
			'Build a receptor–coordination centre–effector loop for temperature control in this GCSE Biology challenge, then transfer it to water balance.',
		staticAnswers: {
			a: 'Temperature receptors detect the rise and a coordination centre processes the information. Effectors increase heat loss, helping return body temperature towards its normal level.',
			b: 'Effectors detect that the surrounding air is hot and force the environment to cool. Receptors then keep body temperature completely unchanged during exercise.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Answer B swaps receptor and effector roles, targets the outside environment and promises perfect constancy. Answer A gives detection, coordination and a corrective response within limits.',
		commandWordLesson:
			'A control explanation should follow information and action: receptor detects change, coordination centre processes it, then an effector moves the condition back towards normal.',
		diagnosisPrompt: 'Which role is assigned incorrectly in Answer B?',
		diagnosisChoices: [
			choice(
				'centres-process',
				'Coordination centres process information received from receptors.',
				'That is a correct role in the control system.'
			),
			choice(
				'effectors-detect',
				'It says effectors detect change and control the outside environment.',
				'Correct: receptors detect change, while effectors act inside the body.',
				true
			),
			choice(
				'response-lowers',
				'It expects a response that lowers an elevated body temperature.',
				'A corrective response should oppose the rise.'
			)
		],
		repairPrompt: 'Which sequence gives the correct control loop?',
		repairChoices: [
			choice(
				'effector-first',
				'Effectors detect heat, receptors respond and the environment cools.',
				'This reverses the biological roles and targets the environment.'
			),
			choice(
				'brain-constant',
				'The brain keeps every internal condition perfectly constant alone.',
				'Conditions vary within limits and control systems include several components.'
			),
			choice(
				'receptor-centre-effector',
				'Receptors detect the rise, a coordination centre processes it, then effectors respond.',
				'This correctly follows detection, processing and corrective action.',
				true
			)
		],
		freeTextKeywordGroups: [
			['receptors detect', 'temperature receptors', 'receptor detects'],
			['coordination centre', 'control centre'],
			['effectors respond', 'effector response', 'increase heat loss']
		],
		repairSuccess:
			'You restored the information pathway and put the corrective action in the body rather than the outside environment.',
		transferPromptLead:
			'Blood water concentration falls after heavy sweating. Which statement follows the general homeostatic control loop?',
		transferChoices: [
			choice(
				'detect-coordinate-act',
				'Receptors detect the change, coordination occurs and effectors conserve more water.',
				'This transfers detection, processing and corrective action to water balance.',
				true
			),
			choice(
				'effectors-sense',
				'Effectors sense the change and force the air to become wetter.',
				'Effectors do not detect change or control external humidity.'
			),
			choice(
				'never-varies',
				'Receptors prevent blood water concentration from ever changing at all.',
				'Homeostasis regulates within limits; it does not prevent every fluctuation.'
			)
		],
		transferExplanation:
			'Temperature and water balance use different effectors, but each control system detects change, coordinates information and produces an opposing response.',
		memoryHandle: 'Change → receptor → centre → effector response'
	}),
	reviewedChallenge({
		id: 'biology-blood-glucose-control-loop',
		slug: 'blood-glucose-control-loop',
		title: 'How does insulin close the control loop?',
		topic: 'Homeostasis and response: control systems',
		subjectArtTheme: 'regulation-immunity',
		hook: 'Insulin is the signal; the response must actually lower the elevated blood glucose.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'Blood glucose concentration rises after a meal. Explain how the body detects the change and brings the concentration back towards normal.',
		metaDescription:
			'Complete the insulin control loop after a meal in this GCSE Biology challenge, then transfer receptor–signal–response thinking to temperature.',
		staticAnswers: {
			a: 'The pancreas detects the rise and releases insulin. Insulin makes liver cells release stored glucose, so blood glucose rises further above normal.',
			b: 'The pancreas detects the rise and releases insulin. Insulin increases glucose uptake by cells and promotes glycogen formation, lowering blood glucose towards normal.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incorrect-claim',
		showdownExplanation:
			'Both answers identify the detected rise and insulin release. Answer A gives a response that amplifies the change; Answer B gives uptake and storage that oppose it.',
		commandWordLesson:
			'In a homeostatic explanation, finish by checking direction: the response should move the changed condition back towards its normal level.',
		diagnosisPrompt: 'What makes Answer A’s final link wrong?',
		diagnosisChoices: [
			choice(
				'pancreas-detects',
				'It says the pancreas detects a rise in blood glucose.',
				'The pancreas does detect and respond to blood glucose changes.'
			),
			choice(
				'insulin-released',
				'It says insulin is released after blood glucose rises.',
				'Insulin release is the correct hormonal response to a rise.'
			),
			choice(
				'raises-further',
				'It makes insulin raise glucose further instead of lowering it.',
				'Correct: the response should oppose the original rise.',
				true
			)
		],
		repairPrompt: 'Which replacement gives the corrective response?',
		repairChoices: [
			choice(
				'uptake-glycogen',
				'Insulin increases glucose uptake and promotes glycogen formation in the liver.',
				'This response lowers the elevated blood glucose concentration.',
				true
			),
			choice(
				'release-glycogen',
				'Insulin converts glycogen into glucose and releases it into blood.',
				'That would raise glucose rather than correct the rise.'
			),
			choice(
				'stops-pancreas',
				'Insulin permanently stops the pancreas detecting blood glucose again.',
				'Control continues as concentrations change; detection is not permanently stopped.'
			)
		],
		freeTextKeywordGroups: [
			['glucose uptake', 'cells take in glucose', 'increases uptake'],
			['glycogen formation', 'glucose converted to glycogen', 'stored as glycogen'],
			['lowers blood glucose', 'returns towards normal', 'reduces concentration']
		],
		repairSuccess:
			'You kept detection and insulin release, then added uptake and storage that oppose the original rise.',
		transferPromptLead:
			'Body temperature rises above normal. Which response follows the same corrective-control principle?',
		transferChoices: [
			choice(
				'generate-more-heat',
				'Effectors generate more heat, increasing the temperature further.',
				'This amplifies the change rather than opposing it.'
			),
			choice(
				'increase-heat-loss',
				'Effectors increase heat loss, moving temperature back towards normal.',
				'This response opposes the original rise.',
				true
			),
			choice(
				'stop-receptors',
				'Receptors stop detecting temperature so the rise cannot continue.',
				'Stopping detection does not correct the elevated temperature.'
			)
		],
		transferExplanation:
			'Glucose uptake and heat loss are different responses, but both must oppose the detected change and move an internal condition towards normal.',
		memoryHandle: 'Detect rise → signal → opposing response → normal'
	}),
	reviewedChallenge({
		id: 'biology-cystic-fibrosis-inheritance',
		slug: 'cystic-fibrosis-carrier-cross',
		title: 'Does carrying the allele mean affected?',
		topic: 'Inheritance, variation and evolution: genetic inheritance',
		subjectArtTheme: 'inheritance-reproduction',
		hook: 'A carrier has the recessive allele, but the dominant allele masks its effect.',
		arc: 'read-the-evidence',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'Cystic fibrosis is caused by recessive allele f. Two unaffected carriers, Ff and Ff, have a child. Explain the probability that the child is affected.',
		metaDescription:
			'Interpret a carrier cross for cystic fibrosis in this GCSE Biology challenge, then transfer genotype-to-phenotype reasoning to albinism.',
		staticAnswers: {
			a: 'The possible genotypes are FF, Ff, Ff and ff. Only ff is affected, so the probability of cystic fibrosis is one in four.',
			b: 'The possible genotypes are FF, Ff, Ff and ff. Three contain allele f, so the probability of cystic fibrosis is three in four.'
		},
		strongerAnswer: 'a',
		weakAnswer: 'b',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Both answers list the four genotypes correctly. Answer B then counts the two unaffected heterozygous carriers as affected, although the condition requires ff.',
		commandWordLesson:
			'After listing offspring genotypes, translate each into phenotype before counting. Possessing one recessive allele is not the same as expressing a recessive condition.',
		diagnosisPrompt: 'Which step first makes Answer B wrong?',
		diagnosisChoices: [
			choice(
				'counts-carriers',
				'It counts Ff carriers as affected by the recessive condition.',
				'Correct: only ff expresses this recessive condition.',
				true
			),
			choice(
				'lists-outcomes',
				'It lists FF, Ff, Ff and ff as possible outcomes.',
				'Those are the correct outcomes of Ff crossed with Ff.'
			),
			choice(
				'uses-four',
				'It treats four equally likely outcomes as the denominator.',
				'Four equally likely outcomes are appropriate for this cross.'
			)
		],
		repairPrompt: 'Which statement correctly links genotype and phenotype?',
		repairChoices: [
			choice(
				'any-f-affected',
				'Any genotype containing f is affected, including both carriers.',
				'A dominant F masks f in a carrier.'
			),
			choice(
				'ff-quarter',
				'Only ff is affected, giving a one-in-four probability.',
				'This correctly connects two recessive alleles with the phenotype.',
				true
			),
			choice(
				'ff-unaffected',
				'Only ff is unaffected, giving a three-in-four affected probability.',
				'ff expresses the recessive condition rather than avoiding it.'
			)
		],
		freeTextKeywordGroups: [
			['ff', 'two recessive alleles'],
			['one in four', '1 in 4', '25%', 'one-quarter'],
			['affected', 'cystic fibrosis']
		],
		repairSuccess:
			'You separated unaffected carriers from the affected ff genotype and counted one affected outcome in four.',
		transferPromptLead:
			'Albinism is caused by recessive allele a. Two unaffected carriers are Aa. Which conclusion is correct?',
		transferChoices: [
			choice(
				'half-affected',
				'Two in four are affected because Aa carriers contain allele a.',
				'Carriers do not express this recessive phenotype.'
			),
			choice(
				'all-affected',
				'All offspring are affected because both parents contain allele a.',
				'Only offspring inheriting a from both parents are affected.'
			),
			choice(
				'quarter-affected',
				'One in four is affected because only aa expresses albinism.',
				'This correctly transfers genotype-to-phenotype counting.',
				true
			)
		],
		transferExplanation:
			'The condition and allele letters changed, but the logic did not: heterozygotes are carriers and only the double-recessive genotype is affected.',
		memoryHandle: 'Cross → genotype → phenotype → probability'
	}),
	reviewedChallenge({
		id: 'biology-recessive-flower-inheritance',
		slug: 'recessive-flower-colour-cross',
		title: 'Which offspring show the recessive colour?',
		topic: 'Inheritance, variation and evolution: genetic inheritance',
		subjectArtTheme: 'inheritance-reproduction',
		hook: 'Count phenotypes after genotypes; a heterozygote carries recessive p but remains purple.',
		arc: 'read-the-evidence',
		mechanic: 'first-wrong-step',
		difficulty: 'standard',
		marks: 3,
		estimatedMinutes: 5,
		previewQuestion:
			'Purple flower allele P is dominant to white allele p. Two purple heterozygous plants, Pp and Pp, are crossed. Explain the probability of white offspring.',
		metaDescription:
			'Work from genotype to recessive flower colour in this GCSE Biology challenge, then transfer the same probability reasoning to mouse fur.',
		staticAnswers: {
			a: 'The offspring genotypes are PP, Pp, Pp and pp. Three contain p, so three quarters will have white flowers and one quarter purple.',
			b: 'The offspring genotypes are PP, Pp, Pp and pp. Only pp has white flowers, so one quarter will be white and three quarters purple.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'wrong-value',
		showdownExplanation:
			'Answer A counts Pp plants as white because they carry p. Answer B applies dominance before counting and recognises that only pp expresses white flowers.',
		commandWordLesson:
			'Probability follows phenotype assignment. Decide which genotypes express the named characteristic, then count those outcomes rather than every genotype containing its allele.',
		diagnosisPrompt: 'Why does Answer A count too many white offspring?',
		diagnosisChoices: [
			choice(
				'wrong-cross',
				'It writes Pp for each heterozygous purple parent.',
				'Pp correctly represents each heterozygous parent.'
			),
			choice(
				'counts-carriers',
				'It counts Pp carriers as showing the recessive white phenotype.',
				'Correct: dominant P makes Pp flowers purple.',
				true
			),
			choice(
				'four-outcomes',
				'It lists four outcomes instead of exactly two possible genotypes.',
				'Four equally likely boxes are useful even when genotypes repeat.'
			)
		],
		repairPrompt: 'Which conclusion follows from the four genotypes?',
		repairChoices: [
			choice(
				'any-p-white',
				'Any genotype with p is white, so three quarters are white.',
				'Dominant P makes both Pp outcomes purple.'
			),
			choice(
				'pp-purple',
				'Only pp is purple, so one quarter is purple.',
				'pp has no dominant allele and therefore is white.'
			),
			choice(
				'pp-white',
				'Only pp is white, so one quarter is white.',
				'This correctly links the recessive phenotype to pp.',
				true
			)
		],
		freeTextKeywordGroups: [
			['pp', 'two recessive alleles'],
			['white', 'white flowers'],
			['one quarter', 'one in four', '25%', '1 in 4']
		],
		repairSuccess:
			'You applied dominance before counting and identified pp as the single white-flower outcome.',
		transferPromptLead:
			'Black fur B is dominant to brown b. Two black carriers are Bb. Which statement is correct?',
		transferChoices: [
			choice(
				'bb-quarter',
				'One in four is brown because only bb expresses brown fur.',
				'This correctly connects the recessive phenotype to bb.',
				true
			),
			choice(
				'bb-three',
				'Three in four are brown because three outcomes contain b.',
				'The two Bb outcomes are black carriers.'
			),
			choice(
				'all-brown',
				'Every offspring is brown because both parents carry b.',
				'Each parent can pass dominant B instead.'
			)
		],
		transferExplanation:
			'Flower colour and fur colour use the same chain: assign genotype outcomes, apply dominance, then count only the double-recessive phenotype.',
		memoryHandle: 'Genotypes → apply dominance → count recessive phenotype'
	})
] satisfies ChallengeDefinition[];

type ReviewedBiologyChallengeId =
	| 'biology-data-conclusions'
	| 'biology-working-scientifically-data-conclusions'
	| 'biology-cell-differences'
	| 'biology-extra-controls'
	| 'biology-enzyme-denature'
	| 'biology-enzyme-action'
	| 'biology-reagent-colour'
	| 'biology-heated-food-test'
	| 'biology-ivf-sequence'
	| 'biology-vaccine-immunity'
	| 'biology-homeostasis-control'
	| 'biology-blood-glucose-control'
	| 'biology-recessive-inheritance';

export const biologyCurriculumAliases = {
	'biology-disinfectant-data-conclusions': 'biology-working-scientifically-data-conclusions',
	'biology-exercise-recovery-conclusions': 'biology-working-scientifically-data-conclusions',
	'biology-bacterial-cell-features': 'biology-cell-differences',
	'biology-prokaryote-eukaryote-comparison': 'biology-cell-differences',
	'biology-photosynthesis-control-variables': 'biology-extra-controls',
	'biology-osmosis-control-variables': 'biology-extra-controls',
	'biology-catalase-denaturation': 'biology-enzyme-action',
	'biology-amylase-denaturation': 'biology-enzyme-action',
	'biology-starch-test-result': 'biology-reagent-colour',
	'biology-lipid-test-result': 'biology-reagent-colour',
	'biology-banana-benedicts-test': 'biology-heated-food-test',
	'biology-reducing-sugar-test-sequence': 'biology-heated-food-test',
	'biology-ivf-laboratory-fertilisation': 'biology-ivf-sequence',
	'biology-ivf-embryo-transfer-sequence': 'biology-ivf-sequence',
	'biology-flu-vaccine-memory': 'biology-vaccine-immunity',
	'biology-booster-vaccine-response': 'biology-vaccine-immunity',
	'biology-temperature-homeostasis-loop': 'biology-homeostasis-control',
	'biology-blood-glucose-control-loop': 'biology-blood-glucose-control',
	'biology-cystic-fibrosis-inheritance': 'biology-recessive-inheritance',
	'biology-recessive-flower-inheritance': 'biology-recessive-inheritance'
} as const satisfies Record<(typeof biologyExpansion)[number]['id'], ReviewedBiologyChallengeId>;
