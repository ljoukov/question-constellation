import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const P = {
	faster: /\b(warmer|faster|move faster|moves faster|speed|kinetic)\b/i,
	kinetic: /\b(kinetic energy|more energy|energy increases|more energetic)\b/i,
	collisions: /\b(collide|collision|collisions|hit|strike).*\b(blade|turbine|more often|frequent|harder|force)\b|\b(more frequent|harder) collisions\b/i,
	power: /\b(power|energy each second|per second|rate of energy transfer|p\s*=\s*e\s*\/\s*t)\b/i,

	plum: /\b(plum pudding|positive charge.*spread|electrons embedded|ball of positive)\b/i,
	most: /\b(most|many).*\b(pass|passed|straight through|little deflection|no deflection)\b|\bempty space\b/i,
	few: /\b(few|some|small number).*\b(deflect|deflected|large angle|back)\b|\bpositive charge.*concentrated\b/i,
	nucleus: /\b(nucleus|nuclear model|small dense|dense positive|mass concentrated)\b/i,

	sameCircuit: /\b(same circuit|do not swap|not swap|avoid swapping|continuous range)\b/i,
	variableResistor: /\b(variable resistor|rheostat|adjust resistance|vary resistance|smoothly)\b/i,
	positiveReadings: /\b(record|take|measure).*\b(readings|values|range|positive)\b|\bpositive values\b/i,
	reverse: /\b(reverse|reversed).*\b(connection|supply|led|negative)\b|\bnegative values\b/i,

	blood: /\b(reduced blood flow|less blood|blood flow falls|blocked artery|narrowed artery)\b/i,
	oxygen: /\b(less oxygen|oxygen reaches|reduced oxygen|o2)\b/i,
	respiration: /\b(respiration|aerobic|respire)\b/i,
	energyPain: /\b(less energy|less atp|energy release|chest pain|pain|cannot work|muscle damage)\b/i
};

const flows = [
	{
		id: 'particle-collisions-power',
		title: 'Particle collisions and power',
		patterns: [P.faster, P.kinetic, P.collisions, P.power],
		responses: [
			{
				id: 'blank',
				text: '',
				gold: [false, false, false, false],
				primaryGap: 0
			},
			{
				id: 'spark-draft',
				text: 'When the particles are warmer they move faster. This means kinetic energy increases. This means energy transferred increases, so since P = E / t, power increases.',
				gold: [true, true, false, true],
				primaryGap: 2
			},
			{
				id: 'collision-only',
				text: 'They collide with the turbine blades more often and with more force.',
				gold: [false, false, true, false],
				primaryGap: 0
			},
			{
				id: 'partial-repair',
				text: 'Warmer particles move faster and hit the blades more often, so more energy is transferred each second.',
				gold: [true, false, true, true],
				primaryGap: 1
			},
			{
				id: 'improved',
				text: 'Warmer air makes the particles move faster and gives them more kinetic energy. They collide with the turbine blades more often and harder, so more energy is transferred each second and power increases.',
				gold: [true, true, true, true],
				primaryGap: null
			}
		]
	},
	{
		id: 'alpha-scattering-evidence',
		title: 'Alpha scattering evidence chain',
		patterns: [P.plum, P.most, P.few, P.nucleus],
		responses: [
			{
				id: 'model-recall-only',
				text: 'The plum pudding model was a ball of positive charge with electrons embedded in it.',
				gold: [true, false, false, false],
				primaryGap: 1
			},
			{
				id: 'spark-draft',
				text: 'The plum pudding model was a ball of positive charge with electrons embedded in it. The experiment expected all the particles would go through. It did not predict some particles being deflected. All deflections suggest that the nucleus exists and a small ball of positive charge.',
				gold: [true, false, true, true],
				primaryGap: 1
			},
			{
				id: 'empty-space-only',
				text: 'Most alpha particles passed straight through, showing the atom is mostly empty space.',
				gold: [false, true, false, false],
				primaryGap: 0
			},
			{
				id: 'evidence-paired',
				text: 'The plum pudding model spread positive charge out with electrons embedded. Most alpha particles passed straight through, showing empty space. A few were deflected through large angles, showing a small dense positive nucleus, so the nuclear model replaced plum pudding.',
				gold: [true, true, true, true],
				primaryGap: null
			}
		]
	},
	{
		id: 'circuit-adjustment-method',
		title: 'Circuit adjustment method',
		patterns: [P.sameCircuit, P.variableResistor, P.positiveReadings, P.reverse],
		responses: [
			{
				id: 'battery-swap',
				text: 'Use batteries with different potential differences. Reverse the connections to the power supply.',
				gold: [false, false, false, true],
				primaryGap: 1
			},
			{
				id: 'variable-resistor-only',
				text: 'Use a variable resistor to vary the potential difference smoothly.',
				gold: [false, true, false, false],
				primaryGap: 0
			},
			{
				id: 'method-complete',
				text: 'Keep the same circuit and use a variable resistor to adjust the potential difference smoothly. Record the positive readings across the range, then reverse the supply connections and repeat for negative values.',
				gold: [true, true, true, true],
				primaryGap: null
			},
			{
				id: 'reverse-and-record',
				text: 'Record readings for positive values, then reverse the LED connections for negative values.',
				gold: [false, false, true, true],
				primaryGap: 1
			}
		]
	},
	{
		id: 'coronary-artery-chain',
		title: 'Coronary artery chain',
		patterns: [P.blood, P.oxygen, P.respiration, P.energyPain],
		responses: [
			{
				id: 'weak-start',
				text: 'Less blood gets to the heart.',
				gold: [true, false, false, false],
				primaryGap: 1
			},
			{
				id: 'oxygen-only',
				text: 'Reduced blood flow means less oxygen reaches the heart muscle.',
				gold: [true, true, false, false],
				primaryGap: 2
			},
			{
				id: 'skips-energy',
				text: 'Less blood means less oxygen reaches the heart, so there is less aerobic respiration and the heart hurts.',
				gold: [true, true, true, true],
				primaryGap: null
			},
			{
				id: 'improved',
				text: 'Reduced blood flow means less oxygen reaches the heart muscle. This causes less aerobic respiration, so less energy is released and the muscle cannot work properly, causing chest pain.',
				gold: [true, true, true, true],
				primaryGap: null
			}
		]
	}
];

function predictLinkStates(text, patterns) {
	return patterns.map((pattern) => pattern.test(text));
}

function firstMissing(states) {
	const index = states.findIndex((state) => !state);
	return index === -1 ? null : index;
}

function score() {
	let linkCorrect = 0;
	let linkTotal = 0;
	let exactVectorCorrect = 0;
	let primaryGapCorrect = 0;
	let responseTotal = 0;
	const rows = [];

	for (const flow of flows) {
		for (const response of flow.responses) {
			const predicted = predictLinkStates(response.text, flow.patterns);
			const predictedGap = firstMissing(predicted);
			const linkMatches = predicted.map((state, index) => state === response.gold[index]);
			linkCorrect += linkMatches.filter(Boolean).length;
			linkTotal += linkMatches.length;
			const exact = linkMatches.every(Boolean);
			if (exact) exactVectorCorrect += 1;
			if (predictedGap === response.primaryGap) primaryGapCorrect += 1;
			responseTotal += 1;
			rows.push({
				flowId: flow.id,
				responseId: response.id,
				gold: response.gold,
				predicted,
				goldPrimaryGap: response.primaryGap,
				predictedPrimaryGap: predictedGap,
				exactVectorMatch: exact
			});
		}
	}

	return {
		kind: 'deterministic_simulated_user_link_eval',
		generatedAt: new Date().toISOString(),
		description:
			'Synthetic learner-response fixtures over four Spark guided-gap cases. This is a harness sanity check, not learner-outcome evidence and not an LLM benchmark result.',
		sourceCases: flows.map(({ id, title, responses }) => ({ id, title, responseCount: responses.length })),
		metrics: {
			flowCount: flows.length,
			responseCount: responseTotal,
			linkLabelCount: linkTotal,
			linkStateAccuracy: Number((linkCorrect / linkTotal).toFixed(4)),
			exactVectorAccuracy: Number((exactVectorCorrect / responseTotal).toFixed(4)),
			primaryGapAccuracy: Number((primaryGapCorrect / responseTotal).toFixed(4))
		},
		rows
	};
}

const result = score();
const outputPath = path.join(__dirname, 'simulated-link-eval-results.json');
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.metrics, null, 2));
console.log(`Wrote ${outputPath}`);
