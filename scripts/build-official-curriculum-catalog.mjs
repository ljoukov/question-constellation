import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'data', 'curricula', 'source-manifest.json');
const catalogPath = path.join(repoRoot, 'data', 'curricula', 'curriculum-catalog.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function source(id) {
	const match = manifest.sources.find((entry) => entry.id === id);
	if (!match) throw new Error(`Missing curriculum source ${id}`);
	if (!match.sha256 || !match.pageCount) throw new Error(`Source ${id} has not been downloaded`);
	return match;
}

function decodeXml(value) {
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/\s+/g, ' ')
		.trim();
}

async function pdfOutline(inputSource) {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'qc-curriculum-outline-'));
	try {
		const outputBase = path.join(temporaryRoot, 'outline');
		execFileSync(
			'pdftohtml',
			[
				'-f',
				'1',
				'-l',
				'1',
				'-xml',
				'-hidden',
				'-i',
				path.join(repoRoot, inputSource.localPath),
				outputBase
			],
			{ stdio: 'ignore' }
		);
		const xml = await readFile(`${outputBase}.xml`, 'utf8');
		const outline = xml.match(/<outline>([\s\S]*)<\/outline>/)?.[1] ?? '';
		return [...outline.matchAll(/<item page="(\d+)">([\s\S]*?)<\/item>/g)].map((match, index) => ({
			page: Number(match[1]),
			title: decodeXml(match[2].replace(/<[^>]+>/g, '')),
			index
		}));
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

function bodyNumberedHeadings(inputSource, startPage, endPage) {
	const headings = [];
	for (let page = startPage; page <= endPage; page += 1) {
		const text = execFileSync(
			'pdftotext',
			[
				'-f',
				String(page),
				'-l',
				String(page),
				'-layout',
				path.join(repoRoot, inputSource.localPath),
				'-'
			],
			{ encoding: 'utf8' }
		);
		for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
			const match = line.match(/^\s*(\d+(?:\.\d+)+)\s+(.+?)\s*$/);
			if (!match) continue;
			headings.push({
				page,
				title: `${match[1]} ${match[2].trim()}`,
				index: page * 10_000 + lineIndex
			});
		}
	}
	return headings;
}

function compareCodes(left, right) {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		if (leftParts[index] === undefined) return -1;
		if (rightParts[index] === undefined) return 1;
		if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
	}
	return 0;
}

function idPart(value) {
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function componentId(specificationId, code) {
	return `${specificationId}:${idPart(code)}`;
}

function baseComponent(specificationId, values) {
	return {
		id: componentId(specificationId, values.code),
		parentId: values.parentId ?? null,
		code: values.code,
		title: values.title,
		kind: values.kind,
		depth: values.depth,
		displayOrder: values.displayOrder,
		selectable: Boolean(values.selectable),
		subjectArea: values.subjectArea ?? null,
		paper: values.paper ?? null,
		tier: values.tier ?? [],
		optionGroupId: values.optionGroupId ?? null,
		sourcePageStart: values.sourcePageStart ?? null,
		sourcePageEnd: values.sourcePageEnd ?? values.sourcePageStart ?? null,
		metadata: values.metadata ?? {}
	};
}

function makeSpecification(sourceRecord, config, components) {
	return {
		id: sourceRecord.id,
		board: sourceRecord.board,
		qualification: sourceRecord.qualification,
		subject: config.subject,
		course: config.course,
		profileSubjects: config.profileSubjects,
		specificationCode: sourceRecord.specificationCode,
		version: sourceRecord.version,
		title: config.title,
		firstTeachingYear: sourceRecord.firstTeachingYear,
		firstExamYear: sourceRecord.firstExamYear,
		lastExamYear: sourceRecord.lastExamYear,
		status: sourceRecord.status,
		landingUrl: sourceRecord.landingUrl,
		pdfUrl: sourceRecord.pdfUrl,
		localPath: sourceRecord.localPath,
		sha256: sourceRecord.sha256,
		pageCount: sourceRecord.pageCount,
		components
	};
}

function sciencePaper(profileSubject, chapterNumber) {
	const boundaries = {
		Biology: 4,
		Chemistry: 5,
		Physics: 4
	};
	if (!Number.isFinite(chapterNumber)) return null;
	return `${profileSubject} Paper ${chapterNumber <= boundaries[profileSubject] ? 1 : 2}`;
}

function aqaPaper(config, code) {
	const parts = code.split('.').map(Number);
	if (config.type === 'science') {
		const profileSubject = config.subjectAreaByRoot[parts[0]];
		if (parts.length < 2) return null;
		return sciencePaper(profileSubject, parts[1]);
	}
	if (config.type === 'computer-science') {
		if (parts.length < 2) return null;
		return parts[1] <= 2
			? 'Paper 1: Computational thinking and programming skills'
			: 'Paper 2: Computing concepts';
	}
	if (config.type === 'geography') {
		if (code === '3.1' || code.startsWith('3.1.'))
			return 'Paper 1: Living with the physical environment';
		if (code === '3.2' || code.startsWith('3.2.'))
			return 'Paper 2: Challenges in the human environment';
		if (code === '3.3' || code.startsWith('3.3.')) return 'Paper 3: Geographical applications';
		if (code === '3.4' || code.startsWith('3.4.')) return 'All written papers';
	}
	return null;
}

function aqaExamComponentCodes(config, code, paper) {
	if (!paper) return [];
	// A paper code is trustworthy only when it identifies one curriculum node. The
	// science and computer-science hierarchies cross-cut papers, so copying their
	// paper codes onto every descendant would make exact question mappings
	// ambiguous (and would pretend that a paper code identifies a topic).
	if (config.type === 'science' || config.type === 'computer-science') return [];
	if (config.type === 'geography') {
		if (code === '3.1') return ['80351'];
		if (code === '3.2') return ['80352'];
		if (code === '3.3') return ['80353'];
	}
	return [];
}

function nextBoundary(nodes, index, fallback) {
	const current = nodes[index];
	for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
		if (nodes[cursor].depth <= current.depth)
			return Math.max(current.sourcePageStart, nodes[cursor].sourcePageStart - 1);
	}
	return fallback;
}

async function buildAqaSpecification(sourceId, config) {
	const sourceRecord = source(sourceId);
	const outline = await pdfOutline(sourceRecord);
	if (config.bodyFallback) {
		outline.push(...bodyNumberedHeadings(sourceRecord, config.contentStart, config.contentEnd));
	}
	const numbered = outline
		.map((entry) => {
			const match = entry.title.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
			return match ? { ...entry, code: match[1], heading: match[2].trim() } : null;
		})
		.filter(Boolean)
		.filter((entry) =>
			config.roots.some((root) => entry.code === root || entry.code.startsWith(`${root}.`))
		);

	const firstByCode = new Map();
	for (const entry of numbered)
		if (!firstByCode.has(entry.code)) firstByCode.set(entry.code, entry);
	const entries = [...firstByCode.values()].sort((left, right) =>
		compareCodes(left.code, right.code)
	);
	for (const root of config.roots) {
		if (!entries.some((entry) => entry.code === root))
			throw new Error(`${sourceId}: outline is missing root ${root}`);
	}

	const specRootId = componentId(sourceId, 'root');
	const components = [
		baseComponent(sourceId, {
			code: 'root',
			title: config.title,
			kind: 'specification',
			depth: 0,
			displayOrder: 0,
			selectable: false,
			sourcePageStart: 1,
			sourcePageEnd: sourceRecord.pageCount,
			metadata: { official: true, untiered: !config.tiered }
		})
	];

	for (const [index, entry] of entries.entries()) {
		const segments = entry.code.split('.');
		const root = segments[0];
		const parentCode = segments.length === 1 ? null : segments.slice(0, -1).join('.');
		const subjectArea =
			config.subjectAreaByRoot[Number(root)] ?? config.subjectAreaByRoot[root] ?? config.subject;
		const paper = aqaPaper(config, entry.code);
		const examComponentCodes = aqaExamComponentCodes(config, entry.code, paper);
		const selectable = config.selectable(entry.code, entry.heading);
		const title = config.titleOverrides?.[entry.code] ?? entry.heading;
		components.push(
			baseComponent(sourceId, {
				code: entry.code,
				parentId: parentCode ? componentId(sourceId, parentCode) : specRootId,
				title,
				kind:
					segments.length === 1
						? config.roots.length > 1
							? 'subject_area'
							: 'subject_content'
						: selectable
							? 'chapter'
							: segments.length === 2
								? 'chapter_group'
								: segments.length === 3
									? 'section'
									: 'topic',
				depth: segments.length,
				displayOrder: index + 1,
				selectable,
				subjectArea,
				paper,
				tier: /\(HT only\)/i.test(title)
					? ['Higher']
					: config.tiered
						? ['Foundation', 'Higher']
						: [],
				sourcePageStart: entry.page,
				sourcePageEnd: entry.page,
				metadata: {
					official: true,
					specRefs: [entry.code],
					...(examComponentCodes.length ? { examComponentCodes } : {}),
					...(!config.tiered ? { untiered: true } : {}),
					...(selectable ? { selectionRole: 'chapter' } : {})
				}
			})
		);
	}

	const content = components.slice(1);
	for (const [index, entry] of content.entries())
		entry.sourcePageEnd = nextBoundary(content, index, config.contentEnd);
	return makeSpecification(sourceRecord, config, components);
}

const historyOptions = [
	{
		group: '3.2.1',
		groupTitle: 'Section A: Period studies',
		groupPage: 15,
		paper: 'Paper 1: Understanding the modern world',
		options: [
			[
				'AA',
				'America, 1840–1895: Expansion and consolidation',
				15,
				[
					'Expansion: opportunities and challenges',
					'Conflict across America',
					'Consolidation: forging the nation'
				],
				[15, 15, 15]
			],
			[
				'AB',
				'Germany, 1890–1945: Democracy and dictatorship',
				15,
				[
					'Germany and the growth of democracy',
					'Germany and the Depression',
					'The experiences of Germans under the Nazis'
				],
				[16, 16, 16]
			],
			[
				'AC',
				'Russia, 1894–1945: Tsardom and communism',
				16,
				['The end of Tsardom', "Lenin's new society", "Stalin's USSR"],
				[16, 17, 17]
			],
			[
				'AD',
				'America, 1920–1973: Opportunity and inequality',
				17,
				[
					"American people and the 'Boom'",
					"Bust – Americans' experiences of the Depression and New Deal",
					'Post-war America'
				],
				[17, 18, 18]
			]
		]
	},
	{
		group: '3.2.2',
		groupTitle: 'Section B: Wider world depth studies',
		groupPage: 18,
		paper: 'Paper 1: Understanding the modern world',
		options: [
			[
				'BA',
				'Conflict and tension: the First World War, 1894–1918',
				18,
				['The causes of the First World War', 'The First World War: stalemate', 'Ending the war'],
				[18, 19, 19]
			],
			[
				'BB',
				'Conflict and tension: the inter-war years, 1918–1939',
				19,
				[
					'Peacemaking',
					'The League of Nations and international peace',
					'The origins and outbreak of the Second World War'
				],
				[19, 19, 20]
			],
			[
				'BC',
				'Conflict and tension between East and West, 1945–1972',
				20,
				[
					'The origins of the Cold War',
					'The development of the Cold War',
					'Transformation of the Cold War'
				],
				[20, 20, 20]
			],
			[
				'BD',
				'Conflict and tension in Asia, 1950–1975',
				21,
				[
					'Conflict in Korea',
					'Escalation of conflict in Vietnam',
					'The ending of conflict in Vietnam'
				],
				[21, 21, 21]
			],
			[
				'BE',
				'Conflict and tension in the Gulf and Afghanistan, 1990–2009',
				21,
				['Tensions in the Gulf', 'The war on Al-Qaeda', 'The Iraq War'],
				[22, 22, 22]
			]
		]
	},
	{
		group: '3.3.1',
		groupTitle: 'Section A: Thematic studies',
		groupPage: 22,
		paper: 'Paper 2: Shaping the nation',
		options: [
			[
				'AA',
				'Britain: Health and the people: c1000 to the present day',
				22,
				[
					'Medicine stands still',
					'The beginnings of change',
					'A revolution in medicine',
					'Modern medicine'
				],
				[23, 23, 23, 24]
			],
			[
				'AB',
				'Britain: Power and the people: c1170 to the present day',
				24,
				[
					'Challenging authority and feudalism',
					'Challenging royal authority',
					'Reform and reformers',
					'Equality and rights'
				],
				[25, 25, 25, 25]
			],
			[
				'AC',
				'Britain: Migration, empires and the people: c790 to the present day',
				25,
				[
					'Conquered and conquerors',
					'Looking west',
					'Expansion and empire',
					'Britain in the 20th century'
				],
				[26, 26, 27, 27]
			]
		]
	},
	{
		group: '3.3.2',
		groupTitle: 'Section B: British depth studies including the historic environment',
		groupPage: 27,
		paper: 'Paper 2: Shaping the nation',
		options: [
			[
				'BA',
				'Norman England, c1066–c1100',
				27,
				[
					'The Normans: conquest and control',
					'Life under the Normans',
					'The Norman Church and monasticism',
					'The historic environment of Norman England'
				],
				[27, 27, 27, 28]
			],
			[
				'BB',
				'Medieval England: the reign of Edward I, 1272–1307',
				29,
				[
					'Government, the rights of King and people',
					'Life in Medieval England',
					"Edward I's military campaigns in Wales and Scotland",
					'The historic environment of Medieval England'
				],
				[29, 29, 29, 29]
			],
			[
				'BC',
				'Elizabethan England, c1568–1603',
				30,
				[
					"Elizabeth's court and Parliament",
					'Life in Elizabethan times',
					'Troubles at home and abroad',
					'The historic environment of Elizabethan England'
				],
				[30, 31, 31, 31]
			],
			[
				'BD',
				'Restoration England, 1660–1685',
				32,
				[
					'Crown, Parliament, plots and court life',
					'Life in Restoration England',
					'Land, trade and war',
					'The historic environment of Restoration England'
				],
				[32, 32, 32, 32]
			]
		]
	}
];

function buildHistory() {
	const sourceRecord = source('aqa-gcse-history-8145-v1.3');
	const specificationId = sourceRecord.id;
	let displayOrder = 0;
	const component = (values) =>
		baseComponent(specificationId, { ...values, displayOrder: displayOrder++ });
	const components = [
		component({
			code: 'root',
			title: 'AQA GCSE History (8145)',
			kind: 'specification',
			depth: 0,
			sourcePageStart: 1,
			sourcePageEnd: 44,
			metadata: { official: true, untiered: true }
		}),
		component({
			code: '3',
			parentId: componentId(specificationId, 'root'),
			title: 'Subject content',
			kind: 'subject_content',
			depth: 1,
			subjectArea: 'History',
			sourcePageStart: 11,
			sourcePageEnd: 34,
			metadata: { official: true, specRefs: ['3'], untiered: true }
		}),
		component({
			code: '3.2',
			parentId: componentId(specificationId, '3'),
			title: 'Understanding the modern world',
			kind: 'paper',
			depth: 2,
			subjectArea: 'History',
			paper: 'Paper 1: Understanding the modern world',
			sourcePageStart: 15,
			sourcePageEnd: 22,
			metadata: { official: true, specRefs: ['3.2'], examComponentCodes: ['81451'], untiered: true }
		}),
		component({
			code: '3.3',
			parentId: componentId(specificationId, '3'),
			title: 'Shaping the nation',
			kind: 'paper',
			depth: 2,
			subjectArea: 'History',
			paper: 'Paper 2: Shaping the nation',
			sourcePageStart: 22,
			sourcePageEnd: 34,
			metadata: { official: true, specRefs: ['3.3'], examComponentCodes: ['81452'], untiered: true }
		})
	];

	for (const group of historyOptions) {
		const paperCode = group.group.startsWith('3.2') ? '3.2' : '3.3';
		const groupId = componentId(specificationId, group.group);
		components.push(
			component({
				code: group.group,
				parentId: componentId(specificationId, paperCode),
				title: group.groupTitle,
				kind: 'option_group',
				depth: 3,
				subjectArea: 'History',
				paper: group.paper,
				sourcePageStart: group.groupPage,
				sourcePageEnd: Math.max(
					...group.options.map((option) => Math.max(option[2], ...option[4]))
				),
				metadata: {
					official: true,
					specRefs: [group.group],
					selectionMin: 1,
					selectionMax: 1,
					untiered: true
				}
			})
		);
		for (const [optionCode, title, optionPage, partTitles, partPages] of group.options) {
			const fullCode = `${group.group}.${optionCode}`;
			const examCode = `8145${paperCode === '3.2' ? '1' : '2'}${optionCode}`;
			components.push(
				component({
					code: fullCode,
					parentId: groupId,
					title,
					kind: 'option',
					depth: 4,
					selectable: true,
					subjectArea: 'History',
					paper: group.paper,
					optionGroupId: groupId,
					sourcePageStart: optionPage,
					sourcePageEnd: Math.max(optionPage, ...partPages),
					metadata: {
						official: true,
						specRefs: [fullCode],
						officialOptionCode: optionCode,
						examComponentCodes: [examCode],
						selectionRole: 'course_option',
						untiered: true
					}
				})
			);
			for (const [partIndex, partTitle] of partTitles.entries()) {
				components.push(
					component({
						code: `${fullCode}.part-${partIndex + 1}`,
						parentId: componentId(specificationId, fullCode),
						title: `Part ${['one', 'two', 'three', 'four'][partIndex]}: ${partTitle}`,
						kind: 'topic',
						depth: 5,
						subjectArea: 'History',
						paper: group.paper,
						sourcePageStart: partPages[partIndex],
						sourcePageEnd: partPages[partIndex],
						metadata: { official: true, untiered: true }
					})
				);
			}
		}
	}

	return makeSpecification(
		sourceRecord,
		{
			subject: 'History',
			course: 'GCSE Subject',
			profileSubjects: ['History'],
			title: 'AQA GCSE History (8145)'
		},
		components
	);
}

function buildEnglishLanguage() {
	const sourceRecord = source('ocr-gcse-english-language-j351-v2.0');
	const specificationId = sourceRecord.id;
	let displayOrder = 0;
	const component = (values) =>
		baseComponent(specificationId, { ...values, displayOrder: displayOrder++ });
	const rootId = componentId(specificationId, 'root');
	const contentId = componentId(specificationId, '2');
	const components = [
		component({
			code: 'root',
			title: 'Cambridge OCR GCSE English Language (J351)',
			kind: 'specification',
			depth: 0,
			sourcePageStart: 1,
			sourcePageEnd: 34,
			metadata: { official: true, untiered: true }
		}),
		component({
			code: '2',
			parentId: rootId,
			title: 'The specification overview',
			kind: 'subject_content',
			depth: 1,
			subjectArea: 'English Language',
			sourcePageStart: 10,
			sourcePageEnd: 17,
			metadata: { official: true, specRefs: ['2'], untiered: true }
		}),
		component({
			code: '01',
			parentId: contentId,
			title: 'Communicating information and ideas',
			kind: 'chapter',
			depth: 2,
			selectable: true,
			subjectArea: 'English Language',
			paper: 'Component 01: Communicating information and ideas',
			sourcePageStart: 10,
			sourcePageEnd: 13,
			metadata: {
				official: true,
				specRefs: ['01', 'J351/01'],
				examComponentCodes: ['J351/01'],
				selectionRole: 'chapter',
				untiered: true
			}
		}),
		component({
			code: '01.A',
			parentId: componentId(specificationId, '01'),
			title: 'Reading information and ideas',
			kind: 'section',
			depth: 3,
			subjectArea: 'English Language',
			paper: 'Component 01: Communicating information and ideas',
			sourcePageStart: 12,
			sourcePageEnd: 12,
			metadata: {
				official: true,
				specRefs: ['J351/01 Section A'],
				untiered: true
			}
		}),
		component({
			code: '01.B',
			parentId: componentId(specificationId, '01'),
			title: 'Writing for audience, impact and purpose',
			kind: 'section',
			depth: 3,
			subjectArea: 'English Language',
			paper: 'Component 01: Communicating information and ideas',
			sourcePageStart: 13,
			sourcePageEnd: 13,
			metadata: {
				official: true,
				specRefs: ['J351/01 Section B'],
				untiered: true
			}
		}),
		component({
			code: '02',
			parentId: contentId,
			title: 'Exploring effects and impact',
			kind: 'chapter',
			depth: 2,
			selectable: true,
			subjectArea: 'English Language',
			paper: 'Component 02: Exploring effects and impact',
			sourcePageStart: 10,
			sourcePageEnd: 15,
			metadata: {
				official: true,
				specRefs: ['02', 'J351/02'],
				examComponentCodes: ['J351/02'],
				selectionRole: 'chapter',
				untiered: true
			}
		}),
		component({
			code: '02.A',
			parentId: componentId(specificationId, '02'),
			title: 'Reading meaning and effects',
			kind: 'section',
			depth: 3,
			subjectArea: 'English Language',
			paper: 'Component 02: Exploring effects and impact',
			sourcePageStart: 14,
			sourcePageEnd: 14,
			metadata: {
				official: true,
				specRefs: ['J351/02 Section A'],
				untiered: true
			}
		}),
		component({
			code: '02.B',
			parentId: componentId(specificationId, '02'),
			title: 'Writing imaginatively and creatively',
			kind: 'section',
			depth: 3,
			subjectArea: 'English Language',
			paper: 'Component 02: Exploring effects and impact',
			sourcePageStart: 15,
			sourcePageEnd: 15,
			metadata: {
				official: true,
				specRefs: ['J351/02 Section B'],
				untiered: true
			}
		}),
		component({
			code: '03/04',
			parentId: contentId,
			title: 'Spoken language endorsement',
			kind: 'non_exam_assessment',
			depth: 2,
			subjectArea: 'English Language',
			paper: 'Component 03 or 04: Spoken language',
			sourcePageStart: 10,
			sourcePageEnd: 23,
			metadata: {
				official: true,
				specRefs: ['03', '04', 'J351/03', 'J351/04'],
				examComponentCodes: ['J351/03', 'J351/04'],
				untiered: true
			}
		})
	];
	return makeSpecification(
		sourceRecord,
		{
			subject: 'English Language',
			course: 'GCSE Subject',
			profileSubjects: ['English Language'],
			title: 'Cambridge OCR GCSE English Language (J351)'
		},
		components
	);
}

const literatureGroups = [
	{
		code: '01.modern',
		parentCode: '01',
		title: 'Modern prose or drama',
		page: 12,
		options: [
			'Anita and Me',
			'Never Let Me Go',
			'Animal Farm',
			'An Inspector Calls',
			'Leave Taking',
			'DNA'
		]
	},
	{
		code: '01.nineteenth-century',
		parentCode: '01',
		title: '19th century prose',
		page: 15,
		options: [
			'Great Expectations',
			'A Christmas Carol',
			'Pride and Prejudice',
			'The War of the Worlds',
			'The Strange Case of Dr Jekyll and Mr Hyde',
			'Jane Eyre'
		]
	},
	{
		code: '02.poetry',
		parentCode: '02',
		title: 'OCR Poetry Anthology thematic cluster',
		page: 17,
		options: ['Love and Relationships', 'Conflict', 'Youth and Age']
	},
	{
		code: '02.shakespeare',
		parentCode: '02',
		title: 'Shakespeare play',
		page: 19,
		options: ['Romeo and Juliet', 'The Merchant of Venice', 'Macbeth', 'Much Ado About Nothing']
	}
];

function buildEnglishLiterature() {
	const sourceRecord = source('ocr-gcse-english-literature-j352-v3.0');
	const specificationId = sourceRecord.id;
	let displayOrder = 0;
	const component = (values) =>
		baseComponent(specificationId, { ...values, displayOrder: displayOrder++ });
	const rootId = componentId(specificationId, 'root');
	const contentId = componentId(specificationId, '2');
	const components = [
		component({
			code: 'root',
			title: 'Cambridge OCR GCSE English Literature (J352)',
			kind: 'specification',
			depth: 0,
			sourcePageStart: 1,
			sourcePageEnd: 32,
			metadata: { official: true, untiered: true }
		}),
		component({
			code: '2',
			parentId: rootId,
			title: 'The specification overview',
			kind: 'subject_content',
			depth: 1,
			subjectArea: 'English Literature',
			sourcePageStart: 10,
			sourcePageEnd: 21,
			metadata: { official: true, specRefs: ['2'], untiered: true }
		}),
		component({
			code: '01',
			parentId: contentId,
			title: 'Exploring modern and literary heritage texts',
			kind: 'paper',
			depth: 2,
			subjectArea: 'English Literature',
			paper: 'Component 01: Exploring modern and literary heritage texts',
			sourcePageStart: 10,
			sourcePageEnd: 16,
			metadata: {
				official: true,
				specRefs: ['01', 'J352/01'],
				examComponentCodes: ['J352/01'],
				untiered: true
			}
		}),
		component({
			code: '02',
			parentId: contentId,
			title: 'Exploring poetry and Shakespeare',
			kind: 'paper',
			depth: 2,
			subjectArea: 'English Literature',
			paper: 'Component 02: Exploring poetry and Shakespeare',
			sourcePageStart: 10,
			sourcePageEnd: 21,
			metadata: {
				official: true,
				specRefs: ['02', 'J352/02'],
				examComponentCodes: ['J352/02'],
				untiered: true
			}
		})
	];
	for (const group of literatureGroups) {
		const groupId = componentId(specificationId, group.code);
		const paperCode = group.parentCode;
		const paper =
			paperCode === '01'
				? 'Component 01: Exploring modern and literary heritage texts'
				: 'Component 02: Exploring poetry and Shakespeare';
		components.push(
			component({
				code: group.code,
				parentId: componentId(specificationId, paperCode),
				title: group.title,
				kind: 'option_group',
				depth: 3,
				subjectArea: 'English Literature',
				paper,
				sourcePageStart: group.page,
				sourcePageEnd: group.page,
				metadata: {
					official: true,
					selectionMin: 1,
					selectionMax: 1,
					untiered: true
				}
			})
		);
		for (const title of group.options) {
			const code = `${group.code}.${idPart(title)}`;
			components.push(
				component({
					code,
					parentId: groupId,
					title,
					kind: 'option',
					depth: 4,
					selectable: true,
					subjectArea: 'English Literature',
					paper,
					optionGroupId: groupId,
					sourcePageStart: group.page,
					sourcePageEnd: group.page,
					metadata: {
						official: true,
						selectionRole: 'course_option',
						untiered: true
					}
				})
			);
		}
	}
	return makeSpecification(
		sourceRecord,
		{
			subject: 'English Literature',
			course: 'GCSE Subject',
			profileSubjects: ['English Literature'],
			title: 'Cambridge OCR GCSE English Literature (J352)'
		},
		components
	);
}

const separateScienceConfigs = [
	['aqa-gcse-biology-8461-v1.0', 'Biology', 76, 'AQA GCSE Biology (8461)'],
	['aqa-gcse-chemistry-8462-v1.1', 'Chemistry', 89, 'AQA GCSE Chemistry (8462)'],
	['aqa-gcse-physics-8463-v1.1', 'Physics', 76, 'AQA GCSE Physics (8463)']
];

const specifications = [];
for (const [sourceId, subject, contentEnd, title] of separateScienceConfigs) {
	specifications.push(
		await buildAqaSpecification(sourceId, {
			type: 'science',
			subject,
			course: 'Separate Science',
			profileSubjects: [subject],
			title,
			roots: ['4'],
			contentStart: 14,
			contentEnd,
			tiered: true,
			subjectAreaByRoot: { 4: subject },
			bodyFallback: subject === 'Biology',
			selectable: (code, heading) => code.split('.').length === 2 && !/Key ideas/i.test(heading)
		})
	);
}

specifications.push(
	await buildAqaSpecification('aqa-gcse-combined-science-trilogy-8464-v1.1', {
		type: 'science',
		subject: 'Combined Science: Trilogy',
		course: 'Combined Science',
		profileSubjects: ['Biology', 'Chemistry', 'Physics'],
		title: 'AQA GCSE Combined Science: Trilogy (8464)',
		roots: ['4', '5', '6'],
		contentEnd: 170,
		tiered: true,
		subjectAreaByRoot: { 4: 'Biology', 5: 'Chemistry', 6: 'Physics' },
		selectable: (code, heading) => code.split('.').length === 2 && !/Key ideas/i.test(heading)
	})
);

for (const [sourceId, title] of [
	[
		'aqa-gcse-computer-science-8525-v1.3-2027',
		'AQA GCSE Computer Science (8525) — exams 2027 onwards'
	],
	['aqa-gcse-computer-science-8525-v1.2-2026', 'AQA GCSE Computer Science (8525) — last exams 2026']
]) {
	specifications.push(
		await buildAqaSpecification(sourceId, {
			type: 'computer-science',
			subject: 'Computer Science',
			course: 'GCSE Subject',
			profileSubjects: source(sourceId).status === 'current' ? ['Computer Science'] : [],
			title,
			roots: ['3'],
			contentEnd: 34,
			tiered: false,
			subjectAreaByRoot: { 3: 'Computer Science' },
			selectable: (code) => code.split('.').length === 2
		})
	);
}

specifications.push(
	await buildAqaSpecification('aqa-gcse-geography-8035-v1.1', {
		type: 'geography',
		subject: 'Geography',
		course: 'GCSE Subject',
		profileSubjects: ['Geography'],
		title: 'AQA GCSE Geography (8035)',
		roots: ['3'],
		contentEnd: 32,
		tiered: false,
		subjectAreaByRoot: { 3: 'Geography' },
		selectable: (code) =>
			['3.1.1', '3.1.2', '3.1.3', '3.2.1', '3.2.2', '3.2.3', '3.3.1', '3.3.2', '3.4'].includes(code)
	})
);

specifications.push(buildHistory(), buildEnglishLanguage(), buildEnglishLiterature());

function selectableIds(specification, predicate = () => true) {
	return specification.components
		.filter((component) => component.selectable && predicate(component))
		.map((component) => component.id);
}

const offerings = [];
function addOffering(values) {
	offerings.push({
		id: values.id,
		board: values.board,
		qualification: 'GCSE',
		profileSubject: values.profileSubject,
		course: values.course,
		tier: values.tier,
		specificationId: values.specification.id,
		rootComponentId: values.rootComponentId,
		selectableComponentIds: values.selectableComponentIds,
		label: values.label,
		isDefault: values.isDefault
	});
}

for (const specification of specifications.filter(
	(entry) =>
		['Biology', 'Chemistry', 'Physics'].includes(entry.subject) &&
		entry.course === 'Separate Science'
)) {
	for (const tier of ['Foundation', 'Higher'])
		addOffering({
			id: `${specification.id}:${tier.toLowerCase()}`,
			board: 'AQA',
			profileSubject: specification.subject,
			course: 'Separate Science',
			tier,
			specification,
			rootComponentId: componentId(specification.id, '4'),
			selectableComponentIds: selectableIds(specification),
			label: `AQA GCSE ${specification.subject} ${tier}`,
			isDefault: tier === 'Higher'
		});
}

const combined = specifications.find(
	(entry) => entry.id === 'aqa-gcse-combined-science-trilogy-8464-v1.1'
);
for (const [profileSubject, rootCode] of [
	['Biology', '4'],
	['Chemistry', '5'],
	['Physics', '6']
]) {
	for (const tier of ['Foundation', 'Higher'])
		addOffering({
			id: `${combined.id}:${profileSubject.toLowerCase()}:${tier.toLowerCase()}`,
			board: 'AQA',
			profileSubject,
			course: 'Combined Science',
			tier,
			specification: combined,
			rootComponentId: componentId(combined.id, rootCode),
			selectableComponentIds: selectableIds(
				combined,
				(component) => component.subjectArea === profileSubject
			),
			label: `AQA Combined Science: Trilogy · ${profileSubject} · ${tier}`,
			isDefault: tier === 'Higher'
		});
}

for (const specification of specifications.filter(
	(entry) =>
		entry.status === 'current' &&
		!['Biology', 'Chemistry', 'Physics', 'Combined Science: Trilogy'].includes(entry.subject)
)) {
	addOffering({
		id: `${specification.id}:higher`,
		board: specification.board,
		profileSubject: specification.profileSubjects[0],
		course: 'GCSE Subject',
		tier: 'Higher',
		specification,
		rootComponentId: componentId(
			specification.id,
			specification.subject === 'History' ? '3' : 'root'
		),
		selectableComponentIds: selectableIds(specification),
		label: specification.title,
		isDefault: specification.status === 'current'
	});
}

const catalog = {
	schemaVersion: '1',
	generatedAt: manifest.generatedAt,
	specifications,
	offerings
};

await writeFile(catalogPath, `${JSON.stringify(catalog, null, '\t')}\n`);
console.log(
	`Wrote ${path.relative(repoRoot, catalogPath)} (${specifications.length} specifications, ${specifications.reduce((sum, specification) => sum + specification.components.length, 0)} components, ${offerings.length} offerings)`
);
