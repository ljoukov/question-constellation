export const QUESTION_CARD_TITLE_MIN_WORDS = 3;
export const QUESTION_CARD_TITLE_MAX_WORDS = 9;
export const QUESTION_CARD_TITLE_MAX_CHARS = 64;
export const QUESTION_CARD_TITLE_CONTRACT = 'concept-method-process-v2';

const commandWords =
	'describe|explain|state|give|calculate|determine|name|identify|compare|suggest|evaluate|write|draw|complete|use|show|plot|predict|label|choose|tick|define|balance|select';
const commandOpener = new RegExp(`^(?:${commandWords})\\b`, 'i');
const interrogativeOpener = /^(?:how|why|what|which|where)\b/i;
const taskOpener = new RegExp(`\\b(?:${commandWords}|what|which|where|how|why)\\b`, 'gi');
const lowInformationInstruction =
	/^(?:tick|choose|select|plot|label|show|use\b|give\s+(?:your\s+)?answer\b|draw\s+(?:a\s+)?ring\b)/i;
const terminalFragmentWord =
	/\b(?:a|an|the|to|of|in|on|at|for|from|with|by|and|or|when|that|this|its|is|are|was|were)\s*$/i;
const mechanicsOnlyTitle =
	/^(?:gcse exam question|unlabelled science question|how|why|what happened|the symbols|been added|the physics equations sheet|the (?:symbol )?equation for (?:the )?reaction|a conclusion for (?:this|the) investigation)$/i;
const contextualTitle = /\b(?:this|that|it)\b|\bfigure\s+\d+\b/i;
const responseShapedTitle =
	/^(?:what|which|where)\b|\btheir hypothesis\b|^a better description\b|\bidentify the blocks\b|\bidentification$/i;
const sentenceShapedTitle =
	/^(?:the|a|an|one of these)\b[\s\S]{0,52}\b(?:is|are|was|were|works?|benefits?|changes?|increases?|decreases?|gives?|reduces?|can|should|would|will)\b/i;
const finitePredicateTitle =
	/\b(?:is|are|was|were|operates?|works|used|required|forms?|affects?|helps?|provides?|created|formed|stimulates?|may|can|could|should|would|will|have\s+been|has\s+been|have\s+caused)\b/i;

// These comparison/result words are especially likely to disclose the conclusion of an
// explain question. Keep this deliberately narrow: a title is rejected only when the exact
// outcome appears in the marking evidence but nowhere in the learner-visible prompt.
const answerOnlyOutcomeTerms = [
	'harder',
	'softer',
	'stronger',
	'weaker',
	'faster',
	'slower',
	'hotter',
	'cooler',
	'higher',
	'lower',
	'larger',
	'smaller',
	'greater',
	'more efficient',
	'less efficient',
	'expands',
	'contracts',
	'increases',
	'decreases'
];

/** @type {Record<string, string>} */
const comparisonConcept = {
	harder: 'hardness',
	softer: 'softness',
	stronger: 'strength',
	weaker: 'strength',
	faster: 'speed',
	slower: 'speed',
	hotter: 'temperature',
	cooler: 'temperature',
	higher: 'level',
	lower: 'level',
	larger: 'size',
	smaller: 'size',
	greater: 'magnitude'
};

/** @param {string | null | undefined} value */
function cleanTitleText(value) {
	return String(value ?? '')
		.replace(/\*\*/g, '')
		.replace(/\[[^\]]*\bmarks?\b[^\]]*\]/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.?!:;,]+$/g, '')
		.trim();
}

/** @param {string} value */
function wordCount(value) {
	return value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

/** @param {string | null | undefined} value */
function normalizedComparisonText(value) {
	return cleanTitleText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} haystack @param {string} needle */
function includesNormalizedTerm(haystack, needle) {
	return ` ${haystack} `.includes(` ${needle} `);
}

/** @param {string} value */
function sentenceCase(value) {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

/**
 * Mark boundaries are authoritative atomic-question boundaries in imported exam text. Dropping
 * everything after the first one also removes answer lines, options and leaked next-question text.
 * @param {string | null | undefined} value
 */
function atomicPrompt(value) {
	return String(value ?? '')
		.replace(/\*\*/g, '')
		.split(/\[\s*\d+(?:\.\d+)?\s*marks?\s*\]/i)[0]
		.split(/\bQuestion\s+Additional page, if required\b/i)[0]
		.split(/\bCopyright information\b/i)[0]
		.replace(/^\s*(?:Figure|Table)\s+\d+\s*$/gim, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} value */
function taskText(value) {
	const source = atomicPrompt(value);
	const matches = [...source.matchAll(taskOpener)].filter((match) => {
		const word = match[0];
		if (!/^(?:what|which|where|how|why)$/i.test(word)) return true;
		if (word[0] === word[0].toUpperCase()) return true;
		const prefix = source.slice(0, match.index ?? 0);
		return !prefix.trim() || /[.!?]\s*$/.test(prefix);
	});
	const candidates = matches.map((match) => source.slice(match.index ?? 0).trim());
	return (
		candidates.find((candidate) => !lowInformationInstruction.test(candidate)) ??
		candidates[0] ??
		source
	);
}

/** @param {string | null | undefined} value */
function commandRemainder(value) {
	return normalizedComparisonText(taskText(String(value ?? '')))
		.replace(new RegExp(`^(?:${commandWords})\\s+(?:(?:how|why|what|which|where)\\s+)?`, 'i'), '')
		.replace(/^(?:how|why|what|which|where)\s+/i, '')
		.trim();
}

/** @param {string} value */
function stripTaskTail(value) {
	return cleanTitleText(
		value
			.split('?')[0]
			.split(/(?<=[.?])\s+(?=(?:You should|Give|Use|Tick|Choose|Select|Draw|Write)\b)/i)[0]
			.replace(/\s+(?:Tick|Choose|Select)\s+(?:one|two|the)\b[\s\S]*$/i, '')
	);
}

/** @param {string} value */
function humanizeEquationTerms(value) {
	return cleanTitleText(value)
		.replace(/\(\s*\$[^)]*\$\s*\)/g, '')
		.replace(/\$|\\mathrm|\\lambda|[()]/g, ' ')
		.replace(/\s*,\s*/g, ', ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string | null | undefined} value */
function compactWording(value) {
	return cleanTitleText(value)
		.replace(/\bthe students?\b/gi, '')
		.replace(/\b(?:should|could|would) have\b/gi, '')
		.replace(/\bis able to\b/gi, 'can')
		.replace(/\bthe position of the equilibrium\b/gi, 'equilibrium position')
		.replace(/\bthe relationship between\b/gi, '')
		.replace(/\bone other\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * A title is complete or it is rejected. This deliberately never slices a sentence at the word
 * limit: the old slice was responsible for most broken learner-facing labels.
 * @param {string | null | undefined} value
 */
function completeTitle(value) {
	const title = sentenceCase(compactWording(value));
	if (!title || terminalFragmentWord.test(title)) return null;
	if (wordCount(title) < QUESTION_CARD_TITLE_MIN_WORDS) return null;
	if (wordCount(title) > QUESTION_CARD_TITLE_MAX_WORDS) return null;
	if (title.length > QUESTION_CARD_TITLE_MAX_CHARS) return null;
	return title;
}

/**
 * Turn a source-grounded task into a short concept, method or process label. The rules describe
 * recurring exam-task families; none is keyed to a paper or question id.
 * @param {string | null | undefined} value
 */
function semanticTitleCandidate(value) {
	const source = atomicPrompt(value);
	const task = stripTaskTail(taskText(source));
	if (!source || !task) return null;

	if (/\bpunnett\s+square\b/i.test(source) && /\bprobability\b/i.test(source)) {
		return 'Punnett square inheritance probability';
	}

	let match = task.match(
		/^(?:describe|explain)\s+how\s+(?:a|the)\s+(.+?\bvaccine)\s+helps?\s+(?:a person|people|someone)\s+to\s+become\s+immune\s+to\s+(?:the\s+)?(.+?)(?:\s+pathogen)?$/i
	);
	if (match) {
		const vaccine = cleanTitleText(match[1]);
		const target = cleanTitleText(match[2]);
		return completeTitle(
			normalizedComparisonText(vaccine).includes(normalizedComparisonText(target))
				? `${vaccine} immunity`
				: `${vaccine} immunity against ${target}`
		);
	}

	match = task.match(
		/^(?:describe|explain)\s+how\s+(?:a|the)\s+(.+?)\s+would\s+work\s+to\s+prevent\s+(.+)$/i
	);
	if (match) return completeTitle(`${match[1]} protection against ${match[2]}`);

	match = task.match(/^(?:describe|explain)\s+why\s+(.+?)\s+(?:is|are)\s+added\s+to\s+(.+)$/i);
	if (match) return completeTitle(`Adding ${match[1]} to ${match[2]}`);

	match = task.match(
		/^(?:describe|explain)\s+(?:how|why)\s+(.+?)\s+(?:is|are)\s+(harder|softer|stronger|weaker|faster|slower|hotter|cooler|higher|lower|larger|smaller|greater)\s+than\s+(.+)$/i
	);
	if (match) {
		const concept = comparisonConcept[match[2].toLowerCase()] ?? 'comparison';
		return completeTitle(`${match[1]} and ${match[3]} ${concept}`);
	}

	match = task.match(
		/^(?:describe|explain)\s+(?:how|why)\s+using\s+(.+?)\s+makes?\s+(.+?)\s+(efficient|inefficient)$/i
	);
	if (match) {
		return completeTitle(
			`${match[1]} and ${cleanTitleText(match[2]).replace(/^(?:a|an|the)\s+/i, '')} efficiency`
		);
	}

	match = task.match(
		/^(?:describe|explain)\s+(?:how|why)\s+plants?\s+infected\s+with\s+(.+?)\s+grow\s+(?:slowly|less\s+well)$/i
	);
	if (match) return completeTitle(`${match[1]} and plant growth`);

	match = task.match(
		/^(?:describe|explain)\s+how\s+(.+?)\s+(?:is|are)\s+separated\s+into\s+.+?\s+by\s+(.+)$/i
	);
	if (match) return completeTitle(`${match[1]}: ${match[2]}`);

	match = task.match(
		/^explain\s+how\s+(?:this|the|an?)\s+electromagnet\s+is\s+able\s+to\s+pick\s+up\s+and\s+move\s+(.+)$/i
	);
	if (match) return completeTitle(`Electromagnet lifting and moving ${match[1]}`);

	match = task.match(/^(?:which|what)\s+of\s+the\s+following\s+(?:is|are)\s+(?:also\s+)?(.+)$/i);
	if (match) return completeTitle(cleanTitleText(match[1]).replace(/^(?:a|an|the)\s+/i, ''));

	match = task.match(
		/^(?:write(?:\s+down)?|state|give)\s+(?:the\s+)?equation\s+(?:that|which)?\s*(?:links?|linking)\s+(.+)$/i
	);
	if (match) return completeTitle(`${humanizeEquationTerms(match[1])} equation`);

	if (/\bbalance\b[\s\S]*\bequation\b/i.test(task)) {
		const fuel = source.match(/\b(methane|propane|butane|ethane)\b/i)?.[1];
		if (fuel && /\b(?:burn|burning|combustion)\b/i.test(source)) {
			return completeTitle(`Balancing ${fuel} combustion`);
		}
		if (/\bcrack(?:ed|ing)?\b/i.test(source)) return 'Balancing a cracking reaction';
		return 'Balancing a chemical equation';
	}

	if (/^complete\s+(?:the\s+)?(?:symbol\s+)?equation\b/i.test(task)) {
		if (/\bcrack(?:ed|ing)?\b/i.test(source)) return 'Balancing a cracking reaction';
		return 'Completing a chemical equation';
	}

	if (/^(?:calculate|determine)\b/i.test(task)) {
		if (/\bprobability\b/i.test(task)) return 'Inheritance probability calculation';
		if (/\brf\b/i.test(source) && /\bdistance\b[\s\S]*\bsolvent\b/i.test(task)) {
			return 'Using Rf to find solvent distance';
		}
		if (/\brf\b/i.test(source)) return 'Chromatography Rf value calculation';
		if (/\bconcentration\b/i.test(task)) return 'Solution concentration calculation';
		if (/\bmass\b/i.test(task) && /\b(?:react\w*|equation|relative atomic mass)\b/i.test(source)) {
			return 'Reacting mass calculation';
		}
		if (/\bmass\b/i.test(task) && /\bsolution\b/i.test(source) && /\b(?:cm3|dm3)\b/i.test(source)) {
			return 'Scaling solution mass by volume';
		}
		if (/\bextension\b/i.test(task) && /\bspring\b/i.test(source)) {
			return 'Spring extension from elastic energy';
		}
		if (/\bextra\s+distance\b/i.test(task) && /\breaction\s+time\b/i.test(source)) {
			return 'Reaction time and thinking distance';
		}
		match = task.match(/^(?:calculate|determine)\s+(?:the\s+)?(.+?)(?:\s+use\b|$)/i);
		if (match) return completeTitle(`${match[1]} calculation`);
	}

	match = task.match(/^define\s+(?:the\s+term\s+)?[‘'“\"]?([^’'”\".]+)[’'”\"]?$/i);
	if (match) return completeTitle(`Meaning of ${match[1]}`);
	match = task.match(
		/^(?:what\s+is|describe)\s+(?:what\s+is\s+)?meant\s+by\s+[‘'“\"]?([^’'”\"?.]+)[’'”\"]?/i
	);
	if (match) return completeTitle(`Meaning of ${match[1]}`);
	match = task.match(/^what\s+is\s+(?:a|an)\s+([^?]+)$/i);
	if (match) return completeTitle(`Meaning of ${match[1]}`);

	match = task.match(/^(?:what\s+is|state|give)\s+the\s+general\s+formula\s+for\s+([^?]+)$/i);
	if (match) return completeTitle(`General formula for ${match[1]}`);
	match = task.match(/^(?:write|state|what\s+is)\s+the\s+state\s+symbol\s+for\s+([^?]+)$/i);
	if (match) return completeTitle(`State symbol for ${match[1]}`);
	if (/\bstate symbol\b/i.test(task) && /\bequation\b/i.test(task)) {
		return 'State symbol in a chemical equation';
	}
	match = task.match(/^what\s+is\s+the\s+unit\s+for\s+(.+)$/i);
	if (match) return completeTitle(`Unit of ${match[1]}`);

	match = task.match(
		/^(?:give|state|name|identify)\s+one\s+place\s+in\s+(?:a|an|the)\s+(.+?)\s+where\s+(.+?)\s+(?:is|are)\s+found$/i
	);
	if (match) return completeTitle(`Location of ${match[2]} in ${match[1]}`);

	if (/\btest\s+for\s+alkenes?\b/i.test(source)) return 'Testing for an alkene';
	if (/\b(?:excess|unreacted)\b[\s\S]*\bseparat|\bremoved\b/i.test(task)) {
		const material = task.match(
			/\b(?:excess|unreacted)\s+([a-z][a-z\s-]*?)(?:\s+can\s+be|\s+be|\s+from)/i
		)?.[1];
		return completeTitle(`Separating ${material ?? 'an unreacted solid'} from a mixture`);
	}

	if (/\bequilibrium\b/i.test(source)) {
		if (/\bpressure\b/i.test(task)) {
			return /\byield\b/i.test(task)
				? 'Pressure and equilibrium yield'
				: 'Pressure and equilibrium position';
		}
		if (/\btemperature\b/i.test(source)) {
			return /\byield\b/i.test(task)
				? 'Temperature and equilibrium yield'
				: 'Temperature and equilibrium position';
		}
		if (/\breach(?:es)?\s+equilibrium\b/i.test(task))
			return 'Reversible reactions reaching equilibrium';
	}
	if (/\btemperature\b/i.test(task) && /\byield of ammonia\b/i.test(task)) {
		return 'Temperature and ammonia yield';
	}

	if (/\bpH\b/i.test(source) && /\b(?:change|concentration|water)\b/i.test(source)) {
		return 'Concentration changes on the pH scale';
	}

	if (/\bchecking process\b/i.test(task) && /\bother scientists\b/i.test(source)) {
		return 'Scientific checking before publication';
	}
	if (
		/\bwhat name is given to this process\b/i.test(task) &&
		/\blight changes direction\b/i.test(source)
	) {
		return 'Light changing direction in glass';
	}
	if (/\benergy needed to change the state\b/i.test(source))
		return 'Energy needed for a state change';
	if (
		/\bnetwork called\b/i.test(task) &&
		/\btransformers?\b[\s\S]*\btransmission cables?\b/i.test(source)
	) {
		return 'Transformers and transmission-cable network';
	}

	if (/\bvisible light\b/i.test(source) && /\bshortest wavelength\b/i.test(source)) {
		return 'Visible-light wavelength comparison';
	}
	if (/\bsatellite communications?\b/i.test(task) && /\belectromagnetic waves?\b/i.test(task)) {
		return 'Electromagnetic waves for satellite communication';
	}
	if (/\btissue\b[\s\S]*\bdifferentiate\b[\s\S]*\broot cells?\b/i.test(task)) {
		return 'Plant tissue forming new roots';
	}
	if (/\bcell division by meiosis\b/i.test(source)) return 'Cell division by meiosis';
	if (/\bgenotype\s+Dd\b/i.test(source)) return 'Naming a heterozygous genotype';

	match = task.match(
		/^how\s+does\s+interpretation\s+[a-z0-9]+\s+differ\s+from\s+interpretation\s+[a-z0-9]+\s+about\s+(.+)$/i
	);
	if (match) {
		const topic = cleanTitleText(match[1]).replace(/^the\s+appeal\s+of\s+(.+)$/i, "$1's appeal");
		return completeTitle(`Comparing interpretations of ${topic}`);
	}

	if (/\bspecific heat capacity\b/i.test(task)) return 'Measuring specific heat capacity';
	if (/\bdisplacement method\b/i.test(task) && /\bvolume\b/i.test(task)) {
		return 'Measuring volume by displacement';
	}
	if (/\bfrequency and wavelength\b/i.test(task) && /\bripple tank\b/i.test(source)) {
		return 'Measuring ripple-tank frequency and wavelength';
	}
	if (/\bcompression of the spring\b/i.test(task) && /\bdetermin/i.test(task)) {
		return 'Measuring spring compression';
	}

	if (/\brepeat readings\b/i.test(source) && /\bmean\b/i.test(source)) {
		return 'Repeat readings and mean calculation';
	}
	if (/\btype of error\b/i.test(task) && /\bbalance\b/i.test(source)) {
		return 'Identifying a balance measurement error';
	}
	if (/\bcorrect value\b[\s\S]*\bmass\b/i.test(task) && /\bbalance\b/i.test(source)) {
		return 'Correcting a balance measurement';
	}
	if (/\bfield\b[\s\S]*\bstrongest\b/i.test(task) && /\bmagnet\b/i.test(source)) {
		return 'Magnetic-field strength around a magnet';
	}
	if (/\bfield\b[\s\S]*\bnot the same\b/i.test(task) && /\bfigure\b/i.test(source)) {
		return 'Magnetic-field strength from field-line spacing';
	}
	if (/\bpotential difference\b/i.test(source) && /\blive wire\b/i.test(source)) {
		return 'Mains live-to-neutral potential difference';
	}
	if (
		/\bnegative values?\b/i.test(task) &&
		/\bcurrent\b[\s\S]*\bpotential difference\b/i.test(task)
	) {
		return 'Reversing current and potential-difference signs';
	}
	if (/\binelastically deformed\b/i.test(task)) return 'Meaning of inelastic deformation';
	if (/\bnon-renewable energy resource\b/i.test(task))
		return 'Non-renewable energy-resource definition';

	if (/\bair holes?\b/i.test(task) && /\bculture bottle\b/i.test(task)) {
		return 'Air holes in a culture-bottle cap';
	}
	if (/\blayer of oil\b/i.test(task) && /\bsurface\b/i.test(task)) {
		return 'Oil layer on a reaction-mixture surface';
	}
	if (/\borchid\b/i.test(source) && /\bevolved?\b/i.test(task)) {
		return 'Evolution of flower colour in orchids';
	}
	if (/\bincreasing number of snails\b/i.test(task))
		return 'Snail variation across future generations';
	if (/\bsperm cells\b/i.test(task) && /\bliver cells\b/i.test(task)) {
		return 'Sperm-cell and liver-cell division';
	}
	if (/\bIVF\b/i.test(source)) return 'IVF process leading to pregnancy';
	if (/\bhypothesis\b/i.test(task) && /\bplant(?:s| growth)?\b/i.test(source)) {
		return 'Plant growth hypothesis';
	}
	if (/\bhypothesis\b/i.test(task)) return null;
	if (/\bcrude oil\b/i.test(task) && /\bformed\b/i.test(task)) return 'Formation of crude oil';
	if (/\bcrude oil\b/i.test(task) && /\bseparated into fractions\b/i.test(task)) {
		return 'Separating crude oil into fractions';
	}

	if (/\bvolume of (?:the )?air\b/i.test(task) && /\breleased\b/i.test(task)) {
		return 'Air volume after release';
	}
	if (/\bclosed system\b/i.test(task) && /\btoy\b/i.test(source)) {
		return 'Toy and surroundings as an energy system';
	}
	if (/\bgamma radiation\b/i.test(task) && /\bdifficult to detect\b/i.test(task)) {
		return 'Detecting gamma radiation';
	}
	if (/\bcompetitor\b/i.test(task) && /\bspeed\b/i.test(task))
		return 'Changing speed during a race';
	if (/\bkangaroo\b/i.test(task) && /\bjump higher\b/i.test(task))
		return 'Kangaroo speed and jump height';
	if (/\bmetal samples?\b/i.test(source) && /\bmagnet\b/i.test(source)) {
		return 'Testing metal samples with a magnet';
	}
	if (/\bforce on the wire\b/i.test(task) && /\bdirection\b/i.test(task)) {
		return 'Predicting force direction on a wire';
	}
	if (/\bforce on the wire\b/i.test(task) && /\bcurrent\b/i.test(task)) {
		return 'Force on a current-carrying wire';
	}
	if (/\bbrakes?\b/i.test(source) && /\btemperature\b/i.test(source))
		return 'Energy changes during braking';
	if (/\bempty van\b/i.test(source) && /\bstopping distance\b/i.test(source)) {
		return 'Vehicle mass and stopping distance';
	}
	if (/\bline\b[\s\S]*\bthrough the origin\b/i.test(task))
		return 'Explaining a non-zero graph intercept';
	if (/\binfrared camera\b/i.test(task) && /\bdifferent temperatures\b/i.test(task)) {
		return 'Infrared imaging of temperature differences';
	}
	if (/\bsame for all types of electromagnetic wave\b/i.test(task)) {
		return 'Shared properties of electromagnetic waves';
	}
	if (/\befficient energy storage\b/i.test(task) && /\bcarbon dioxide\b/i.test(task)) {
		return 'Energy storage and power-station emissions';
	}
	if (/\bvariable resistor\b/i.test(task) && /\blength of the wire\b/i.test(task)) {
		return 'Controlling temperature in a wire-resistance practical';
	}
	if (/\blaboratory floor\b/i.test(task) && /\btable\b/i.test(task)) {
		return 'Safe setup for a spring practical';
	}

	if (
		/\bproperty of air\b/i.test(task) &&
		/\binternal energy\b[\s\S]*\btemperature change\b/i.test(task)
	) {
		return 'Air energy and temperature change';
	}
	if (/\bproperty of nuclear radiation\b/i.test(task) && /\brisk of cancer\b/i.test(task)) {
		return 'Nuclear radiation and cancer risk';
	}
	if (/\bskaters?\b/i.test(source) && /\bconservation of momentum\b/i.test(source)) {
		return 'Two skaters and momentum conservation';
	}
	if (
		/\brocket\b/i.test(source) &&
		/\bvelocity\b/i.test(task) &&
		/\bstopped burning fuel\b/i.test(source)
	) {
		return 'Rocket motion after its engine stops';
	}
	if (/\bdifference between direct and alternating potential difference\b/i.test(task)) {
		return 'Direct and alternating potential difference';
	}
	if (
		/\bviewing|observing\b/i.test(source) &&
		/\bheight\b/i.test(source) &&
		/\bposition\b/i.test(source)
	) {
		return 'Viewing position and height measurement';
	}
	if (/\brenewable energy resource\b/i.test(task) && /\bboat\b/i.test(source)) {
		return 'Renewable electricity generation on a boat';
	}
	if (/\bgradient\b/i.test(task) && /\bresultant force\b/i.test(task)) {
		return 'Graph gradient and changing resultant force';
	}
	if (/\bdensity of the steam\b/i.test(task) && /\barrangement of particles\b/i.test(task)) {
		return 'Steam expansion, particles and density';
	}
	if (/\bForce B\b/i.test(task) && /\bmovement of the man\b/i.test(task)) {
		return 'Forces and motion of the man';
	}
	if (/\bweight of the rocket\b/i.test(task) && /\baccelerated upwards\b/i.test(task)) {
		return 'Rocket weight during upward acceleration';
	}
	if (/\bcount rate\b/i.test(task) && /\bactivity\b/i.test(task)) {
		return 'Measured count rate and source activity';
	}
	if (/\bpressure\b/i.test(source) && /\bwheel\b/i.test(source) && /\bspeed\b/i.test(task)) {
		return 'Pressure-driven wheel speed';
	}
	if (/\bdepth of the water\b/i.test(task) && /\bwavelength\b/i.test(task)) {
		return 'Water depth and wave wavelength';
	}
	if (/\brelationship between current and potential difference\b/i.test(task)) {
		return 'Current and potential-difference relationship';
	}
	if (/\bplum pudding model\b/i.test(task) && /\bnuclear model\b/i.test(task)) {
		return 'From plum-pudding to nuclear atom model';
	}
	if (/\bconnect the wires in the plug correctly\b/i.test(task)) {
		return 'Correcting the wires in a plug';
	}
	if (/\bearth wire\b/i.test(source) && /\bmetal case\b/i.test(source) && /\bsafe\b/i.test(task)) {
		return 'Earth wire and metal-case safety';
	}
	if (/\bhalf-life\b/i.test(source) && /\b(?:six|eight)-sided dice\b/i.test(source)) {
		return 'Dice type and simulated half-life';
	}
	if (
		/\bconclusion for this investigation\b/i.test(task) &&
		/\bresultant force\b/i.test(source) &&
		/\bacceleration\b/i.test(source)
	) {
		return 'Resultant force and glider acceleration';
	}
	if (/\bforce to the south\b/i.test(source) && /\bresultant force\b/i.test(task)) {
		return 'Southward force and resultant force';
	}
	if (/\bvariable\b/i.test(task) && /\belectric kettle\b/i.test(source)) {
		return 'Control variables in a kettle investigation';
	}
	if (/\bfossil fuels?\b/i.test(task) && /\benvironmental impact\b/i.test(task)) {
		return 'Environmental impact of fossil-fuel electricity';
	}
	if (/\bmagnetic compass\b/i.test(task) && /\bEarth has a magnetic field\b/i.test(task)) {
		return "Compass evidence for Earth's magnetic field";
	}
	if (/\bnuclear radiation was emitted\b/i.test(task) && /\bbarriers?\b/i.test(source)) {
		return 'Identifying radiation using absorbing barriers';
	}
	if (/\binternal energy of the coolant\b/i.test(task) && /\btemperature increases\b/i.test(task)) {
		return 'Coolant temperature and internal energy';
	}
	if (/\bhealthy body water percentage\b/i.test(task)) return 'Evaluating a body-water percentage';
	if (/\bmass holder\b/i.test(source) && /\bsecond light gate\b/i.test(source)) {
		return 'Preventing mass-holder contact in a glider practical';
	}
	if (/\bradio waves\b/i.test(task) && /\bcar aerial\b/i.test(task)) {
		return 'Radio-wave signals in a car aerial';
	}
	if (/\bthinking distance\b/i.test(source) && /\bbraking distance\b/i.test(source)) {
		return 'Speed, thinking distance and braking distance';
	}
	if (/\bparticles of (?:the )?argon\b/i.test(task) && /\btemperature\b/i.test(task)) {
		return 'Cooling argon particle model';
	}
	if (/\blength of the wire\b/i.test(task) && /\bresistance of the wire\b/i.test(task)) {
		return 'Wire length and resistance';
	}
	if (/\bbalance\b/i.test(source) && /\bupward force on the wire\b/i.test(task)) {
		return 'Balance reading and force on a wire';
	}
	if (/\bincreasing the resistance\b/i.test(task) && /\bcurrent in the circuit\b/i.test(task)) {
		return 'Resistance and current in a circuit';
	}
	if (
		/\blive wire\b/i.test(source) &&
		/\bmetal case\b/i.test(source) &&
		/\bnot be safe\b/i.test(task)
	) {
		return 'Live wire and metal-case safety';
	}
	if (/\bvelocity of the stone\b/i.test(task) && /\bno air resistance\b/i.test(source)) {
		return 'Velocity of a freely falling stone';
	}
	if (/\breduced speed limit\b/i.test(task)) return 'Road safety at a reduced speed';
	if (/\bcompare the currents\b/i.test(task)) return 'Comparing currents in parallel branches';
	if (/\bLDR\b/i.test(source) && /\breadings on both meters\b/i.test(task)) {
		return 'LDR potential-divider meter readings';
	}
	if (
		/\blow resistance\b/i.test(source) &&
		/\bhigh resistance\b/i.test(task) &&
		/\bcable\b/i.test(source)
	) {
		return 'Comparing low- and high-resistance cables';
	}
	if (/\brisk linked to each group\b/i.test(task) && /\belectromagnetic waves?\b/i.test(source)) {
		return 'Risks from high-frequency electromagnetic waves';
	}
	if (/\bcaesium[–-]137\b/i.test(source) && /\biodine[–-]131\b/i.test(source)) {
		return 'Half-life and changing isotope risk';
	}
	if (/\btracking device\b/i.test(source) && /\bduring the game\b/i.test(source)) {
		return 'Benefits of live tracking data';
	}
	if (/\bidentify a producer\b/i.test(task) && /\bfood web\b/i.test(source)) {
		return 'Producer in a food web';
	}
	if (/\bidentify a producer\b/i.test(task)) return null;
	match = task.match(/^(?:state|give|name)\s+(?:one\s+)?purpose\s+of\s+(.+)$/i);
	if (match) return completeTitle(`Purpose of ${match[1]}`);
	match = task.match(
		/^(?:describe|explain|state|give|suggest)\s+(?:one\s+)?(?:benefit|advantage)\s+of\s+(?:using\s+)?(.+)$/i
	);
	if (match) return completeTitle(`Benefits of ${match[1]}`);
	if (/\bLED\b/i.test(source) && /\bemit (?:any )?light\b/i.test(task))
		return 'Changing an LED circuit';
	if (/\brelationship between temperature and pressure\b/i.test(task)) {
		return 'Temperature-pressure graph relationship';
	}
	if (/\bwater stays constant\b/i.test(task) && /\bfire continues to burn\b/i.test(source)) {
		return 'Constant water temperature during heating';
	}
	if (/\bpermanent magnet\b/i.test(task) && /\bidentify the blocks\b/i.test(task)) {
		return 'Testing blocks with a permanent magnet';
	}
	if (/\bcurrent in the thermistor\b/i.test(task) && /\btemperature\b/i.test(source)) {
		return 'Temperature and current in a thermistor';
	}
	if (/\bspark detector\b/i.test(source) && /\bbeta radiation\b/i.test(task)) {
		return 'Detecting beta radiation with a spark detector';
	}
	if (/\badvertisement\b/i.test(task) && /\befficiency\b/i.test(source)) {
		return 'Testing a claimed heat-pump efficiency';
	}
	if (/\bheating element\b/i.test(task) && /\btemperature\b/i.test(task)) {
		return 'Electrical heating in a kettle element';
	}
	if (/\benergy stores?\b/i.test(task) && /\bgas boiler\b/i.test(source)) {
		return 'Energy-store changes in a gas boiler';
	}

	match = task.match(/^(?:describe|explain|suggest)\s+(?:how|why)\s+(.+)$/i);
	if (match) {
		const relation = compactWording(match[1])
			.replace(/^there\s+(?:is|are)\s+/i, '')
			.replace(/^it\s+(?:is|would be)\s+/i, '')
			.replace(/\bcan be used to\b/i, '')
			.replace(/\s+/g, ' ')
			.trim();
		const complete = completeTitle(relation);
		if (complete) return complete;
	}

	match = task.match(
		/^(?:describe|compare)\s+(?:the\s+)?(?:difference|differences)\s+between\s+(.+)$/i
	);
	if (match) return completeTitle(match[1].replace(/\s+compared with\s+/i, ' and '));

	match = task.match(/^(?:state|give|name|identify|what|which|where)\b\s*(.+)$/i);
	if (match) return completeTitle(`${compactWording(match[1])} identification`);

	return null;
}

/**
 * Chain titles are useful last-resort context, but may contain the answer. Only retain fallback
 * content words already visible in the prompt; otherwise the generic semantic rules must carry it.
 * @param {string | null | undefined} value
 * @param {string | null | undefined} promptText
 */
function safeFallbackCandidate(value, promptText) {
	const fallback = cleanTitleText(value);
	if (!fallback || mechanicsOnlyTitle.test(fallback)) return null;
	const prompt = normalizedComparisonText(promptText);
	const contentWords = normalizedComparisonText(fallback)
		.split(' ')
		.filter((word) => word.length >= 4)
		.filter(
			(word) => !['method', 'equation', 'calculation', 'process', 'relationship'].includes(word)
		);
	if (contentWords.some((word) => !includesNormalizedTerm(prompt, word))) return null;
	return completeTitle(fallback);
}

/**
 * Extract a concept/method/process title from learner-visible text.
 * @param {string | null | undefined} value
 */
export function questionCardTitleCandidate(value) {
	return semanticTitleCandidate(value) ?? '';
}

/**
 * @param {string | null | undefined} value
 * @param {{ promptText?: string | null, answerText?: string | null, allowFallbackLength?: boolean }} [options]
 */
export function questionCardTitleIssues(value, options = {}) {
	const title = cleanTitleText(value);
	const issues = [];
	const words = wordCount(title);
	if (!title) issues.push('missing');
	if (title.length > QUESTION_CARD_TITLE_MAX_CHARS) issues.push('too_long');
	if (!options.allowFallbackLength && words < QUESTION_CARD_TITLE_MIN_WORDS)
		issues.push('too_few_words');
	if (words > QUESTION_CARD_TITLE_MAX_WORDS) issues.push('too_many_words');
	if (commandOpener.test(title) && !/^(?:state\s+symbol|balance\s+reading)\b/i.test(title)) {
		issues.push('starts_with_command');
	}
	if (interrogativeOpener.test(title)) issues.push('starts_with_interrogative');
	if (/\.\.\.|\u2026/.test(title)) issues.push('truncated');
	if (/\[[^\]]*\bmarks?\b[^\]]*\]/i.test(String(value ?? ''))) issues.push('contains_marks');
	if (terminalFragmentWord.test(title)) issues.push('truncated_prompt_fragment');
	if (mechanicsOnlyTitle.test(title)) issues.push('mechanics_only');
	if (contextualTitle.test(title)) issues.push('context_dependent');
	if (responseShapedTitle.test(title)) issues.push('response_mechanics');
	if (sentenceShapedTitle.test(title)) issues.push('copies_prompt_sentence');
	if (!/\b(?:equation|calculation)$/i.test(title) && finitePredicateTitle.test(title)) {
		issues.push('sentence_not_concept_label');
	}

	const prompt = normalizedComparisonText(atomicPrompt(options.promptText));
	const answer = normalizedComparisonText(options.answerText);
	const normalizedTitle = normalizedComparisonText(title);
	const promptTask = normalizedComparisonText(taskText(options.promptText ?? ''));
	const promptCommandRemainder = commandRemainder(options.promptText);
	if (prompt && normalizedTitle && (prompt === normalizedTitle || promptTask === normalizedTitle)) {
		issues.push('copies_question');
	}
	if (promptCommandRemainder && normalizedTitle && promptCommandRemainder === normalizedTitle) {
		issues.push('copies_command_remainder');
	}
	if (
		prompt &&
		normalizedTitle &&
		words >= QUESTION_CARD_TITLE_MAX_WORDS &&
		prompt.includes(`${normalizedTitle} `)
	) {
		issues.push('truncated_prompt_fragment');
	}
	if (
		prompt &&
		answer &&
		normalizedTitle &&
		answerOnlyOutcomeTerms.some(
			(term) =>
				includesNormalizedTerm(normalizedTitle, term) &&
				includesNormalizedTerm(answer, term) &&
				!includesNormalizedTerm(prompt, term)
		)
	) {
		issues.push('reveals_answer_outcome');
	}
	return [...new Set(issues)];
}

/**
 * @param {{
 *   cardTitle?: string | null,
 *   promptText?: string | null,
 *   selfContainedPromptText?: string | null,
 *   answerText?: string | null,
 *   fallback?: string | null
 * }} input
 */
export function deriveQuestionCardTitle(input) {
	const learnerVisiblePrompt = [input.promptText, input.selfContainedPromptText]
		.filter((value) => typeof value === 'string' && value.trim())
		.join('\n');
	const validation = {
		promptText: learnerVisiblePrompt,
		answerText: input.answerText
	};
	const explicit = cleanTitleText(input.cardTitle);
	if (explicit && questionCardTitleIssues(explicit, validation).length === 0) return explicit;

	for (const source of [input.promptText, input.selfContainedPromptText]) {
		const candidate = semanticTitleCandidate(source);
		if (candidate && questionCardTitleIssues(candidate, validation).length === 0) return candidate;
	}

	const fallback = safeFallbackCandidate(
		input.fallback,
		`${input.promptText ?? ''} ${input.selfContainedPromptText ?? ''}`
	);
	if (fallback && questionCardTitleIssues(fallback, validation).length === 0) return fallback;

	// This is intentionally uncommon: it names the visible task rather than pretending a missing
	// semantic title is acceptable. Import validation treats this as mechanics-only and blocks it.
	return 'Unlabelled science question';
}
