#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const basePath = 'data/study-cards/english-literature/ocr-j352-source-plan.json';
const outputDir = 'data/study-cards/english-literature/deepening-shards';
const masterPath = 'data/study-cards/english-literature/ocr-j352-deepening-source-plan.json';
const manifestPath = 'data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json';
const additiveContextArtifactPath =
	'data/study-cards/releases/ocr-j352-literature-standard-v1/accepted-study-cards.json';
const additiveContextRun = JSON.parse(
	readFileSync(
		'data/study-cards/releases/ocr-j352-literature-standard-v1/generation-run.json',
		'utf8'
	)
);
const base = JSON.parse(readFileSync(basePath, 'utf8'));

const w = (id, sourceId, locator, approvedExcerpt) => ({
	id,
	mode: 'plot',
	sourceId,
	locator,
	approvedExcerpt
});
const p = (id, sourceId, locator, anchor) => ({
	id,
	mode: 'plot',
	sourceId,
	locator,
	anchor
});
const q = (id, sourceId, locator, requiredAnswer, anchor = requiredAnswer) => ({
	id,
	mode: 'quotation',
	sourceId,
	locator,
	anchor,
	requiredAnswer
});
const m = (id, sourceId, locator, approvedExcerpt) => ({
	id,
	mode: 'method',
	sourceId,
	locator,
	approvedExcerpt
});

const wikipediaNeverLetMeGo = {
	id: 'wikipedia-never-let-me-go-plot',
	kind: 'secondary-source',
	retrievalType: 'licensed-web-synopsis',
	url: 'https://en.wikipedia.org/wiki/Never_Let_Me_Go_(novel)',
	title: 'Wikipedia: Never Let Me Go (novel)',
	rightsBasis:
		'Wikipedia text is licensed under CC BY-SA 4.0; short attributed secondary-source plot excerpts are retained with source attribution and share-alike notice.'
};
const wikipediaAnimalFarm = {
	id: 'wikipedia-animal-farm-plot',
	kind: 'secondary-source',
	retrievalType: 'licensed-web-synopsis',
	url: 'https://en.wikipedia.org/wiki/Animal_Farm',
	title: 'Wikipedia: Animal Farm',
	rightsBasis:
		'Wikipedia text is licensed under CC BY-SA 4.0; short attributed secondary-source plot excerpts are retained with source attribution and share-alike notice.'
};
const ocrLeaveTaking = {
	id: 'ocr-leave-taking-teacher-guide',
	kind: 'supporting-document',
	retrievalType: 'official-resource-pdf',
	url: 'https://www.ocr.org.uk/Images/639352-leave-taking.pdf',
	title: 'OCR GCSE English Literature Leave Taking Teacher Guide',
	rightsBasis:
		'Official OCR teaching resource used as short attributed factual evidence; no primary-text quotation is retained.'
};

const rowsByTitle = new Map([
	[
		'Anita and Me',
		{
			evidence: [
				w(
					'anita-and-me-deep-plot-outsider',
					'ocr-anita-and-me-delivery-guide',
					'OCR Delivery Guide, printed page 5; Meena wants to fit in',
					'Feeling like an outsider and desperate to fit in with the other youngsters in the community'
				),
				w(
					'anita-and-me-deep-plot-racial-prejudice',
					'ocr-anita-and-me-delivery-guide',
					'OCR Delivery Guide, printed page 5; Sam and his gang',
					'Meena encounters racial prejudice by many characters, most notably from tearaway Sam Lowbridge and his gang'
				),
				w(
					'anita-and-me-deep-plot-nanima',
					'ocr-anita-and-me-delivery-guide',
					'OCR Delivery Guide, printed page 5; Nanima visits',
					'Nanima, who helps Meena understand her heritage and the reasons her parents came to England'
				),
				w(
					'anita-and-me-deep-plot-eleven-plus',
					'ocr-anita-and-me-delivery-guide',
					'OCR Delivery Guide, printed page 5; Meena at school',
					'At school, Meena must pass the Eleven Plus so that she can attend grammar school.'
				),
				w(
					'anita-and-me-deep-plot-news-camera',
					'ocr-anita-and-me-delivery-guide',
					'OCR Delivery Guide, printed page 5; motorway tensions',
					'Sam shouts a racist slogan into a local news camera.'
				),
				w(
					'anita-and-me-deep-plot-attack',
					'ocr-anita-and-me-delivery-guide',
					'OCR Delivery Guide, printed page 5; attack after the broadcast',
					'The next day, the Indian man is attacked and robbed.'
				)
			]
		}
	],
	[
		'Never Let Me Go',
		{
			sources: [wikipediaNeverLetMeGo],
			evidence: [
				w(
					'never-let-me-go-deep-plot-gallery',
					wikipediaNeverLetMeGo.id,
					'Wikipedia plot synopsis; Madame’s gallery',
					"The students' best pieces are collected by Madame for a mysterious gallery."
				),
				w(
					'never-let-me-go-deep-plot-ruth-tommy',
					wikipediaNeverLetMeGo.id,
					'Wikipedia plot synopsis; Ruth and Tommy',
					'As the students grow older, Tommy and Ruth start dating.'
				),
				w(
					'never-let-me-go-deep-plot-purpose',
					wikipediaNeverLetMeGo.id,
					'Wikipedia plot synopsis; Miss Lucy reveals their purpose',
					'they have been created to donate their vital organs to others upon reaching adulthood'
				),
				w(
					'never-let-me-go-deep-plot-cottages',
					wikipediaNeverLetMeGo.id,
					'Wikipedia plot synopsis; the students leave Hailsham',
					'When the students are 16, they move to the Cottages, a halfway house'
				),
				w(
					'never-let-me-go-deep-plot-couple',
					wikipediaNeverLetMeGo.id,
					'Wikipedia plot synopsis; after Ruth completes',
					"After Ruth completes, Kathy becomes Tommy's carer and they finally become a couple."
				),
				w(
					'never-let-me-go-deep-plot-deferral',
					wikipediaNeverLetMeGo.id,
					'Wikipedia plot synopsis; Miss Emily rejects the deferral rumour',
					'Miss Emily says that rumours of deferral were false'
				)
			]
		}
	],
	[
		'Animal Farm',
		{
			sources: [wikipediaAnimalFarm],
			evidence: [
				w(
					'animal-farm-deep-plot-old-major',
					wikipediaAnimalFarm.id,
					'Wikipedia plot synopsis; Old Major’s meeting',
					'Old Major holds a conference, at which he calls for the overthrow of humans'
				),
				w(
					'animal-farm-deep-plot-commandments',
					wikipediaAnimalFarm.id,
					'Wikipedia plot synopsis; Animalism after the revolt',
					'The animals adopt the Seven Commandments of Animalism'
				),
				w(
					'animal-farm-deep-plot-snowball-exile',
					wikipediaAnimalFarm.id,
					'Wikipedia plot synopsis; Napoleon removes Snowball',
					"Napoleon's dogs chasing Snowball away"
				),
				w(
					'animal-farm-deep-plot-purge',
					wikipediaAnimalFarm.id,
					'Wikipedia plot synopsis; Napoleon’s purge',
					'many animals who are alleged to be helping Snowball in plots are executed'
				),
				w(
					'animal-farm-deep-plot-boxer',
					wikipediaAnimalFarm.id,
					'Wikipedia plot synopsis; Boxer’s fate',
					'Napoleon had engineered the sale of Boxer to the knacker'
				),
				w(
					'animal-farm-deep-plot-final-image',
					wikipediaAnimalFarm.id,
					'Wikipedia plot synopsis; final dinner',
					'they find they have become indistinguishable from one another'
				)
			]
		}
	],
	[
		'An Inspector Calls',
		{
			evidence: [
				w(
					'an-inspector-calls-deep-plot-engagement',
					'pearson-an-inspector-calls-set-text-guide',
					'Pearson prescribed text guide, page 3; Act One opening',
					'A celebration is underway – Arthur Birling’s daughter, Sheila, has become engaged to Gerald Croft'
				),
				w(
					'an-inspector-calls-deep-plot-birling-sacks-eva',
					'pearson-an-inspector-calls-set-text-guide',
					'Pearson prescribed text guide, page 3; Arthur’s link',
					'Arthur Birling sacked Eva from his mill because she led an unsuccessful strike for better pay.'
				),
				w(
					'an-inspector-calls-deep-plot-sheila-sacks-eva',
					'pearson-an-inspector-calls-set-text-guide',
					'Pearson prescribed text guide, page 3; Sheila’s link',
					'in a fit of jealousy, Sheila used her influence to have her sacked.'
				),
				w(
					'an-inspector-calls-deep-plot-gerald-affair',
					'pearson-an-inspector-calls-set-text-guide',
					'Pearson prescribed text guide, page 4; Act Two',
					'The Inspector forces Gerald Croft to reveal that he had a love affair with Daisy Renton'
				),
				w(
					'an-inspector-calls-deep-plot-mrs-birling-charity',
					'pearson-an-inspector-calls-set-text-guide',
					'Pearson prescribed text guide, page 4; Mrs Birling’s link',
					'Mrs Birling used her influence to have the committee refuse to help Eva'
				),
				w(
					'an-inspector-calls-deep-plot-eric',
					'pearson-an-inspector-calls-set-text-guide',
					'Pearson prescribed text guide, page 4; Eric’s link',
					'Eric reveals that he met Eva in a bar and kept her as his mistress.'
				)
			]
		}
	],
	[
		'Leave Taking',
		{
			sources: [ocrLeaveTaking],
			evidence: [
				w(
					'leave-taking-deep-plot-slap',
					ocrLeaveTaking.id,
					'OCR Teacher Guide, scene 2 synopsis',
					'Enid loses her temper and slaps her.'
				),
				w(
					'leave-taking-deep-plot-mooma-dies',
					ocrLeaveTaking.id,
					'OCR Teacher Guide, scene 3 synopsis',
					'Enid receives the news that her mother has died and she must send money for her funeral.'
				),
				w(
					'leave-taking-deep-plot-del-moves',
					ocrLeaveTaking.id,
					'OCR Teacher Guide, scene 5 synopsis',
					'A few weeks later, Del has moved in with Mai and is staying in her estranged son’s old bedroom.'
				),
				w(
					'leave-taking-deep-plot-viv-exam',
					ocrLeaveTaking.id,
					'OCR Teacher Guide, scene 5 synopsis',
					'Viv gives her Enid’s money and tells Del that she has walked out of her English examination'
				),
				w(
					'leave-taking-deep-plot-enid-reading',
					ocrLeaveTaking.id,
					'OCR Teacher Guide, scene 6 synopsis',
					'Enid has come for a reading from Mai. She tells Mai that she is worried about Del'
				),
				w(
					'leave-taking-deep-plot-notebook',
					ocrLeaveTaking.id,
					'OCR Teacher Guide, scene 8 synopsis',
					'Mai passes her notebook to Del and explains that she does not have her own daughter to pass it to.'
				)
			]
		}
	],
	[
		'DNA',
		{
			evidence: [
				w(
					'dna-deep-plot-john-tate-leader',
					'ocr-dna-delivery-guide',
					'OCR Delivery Guide, printed page 7; shifting leadership',
					'Initially it seems John Tate is the leader'
				),
				w(
					'dna-deep-plot-frame-innocent',
					'ocr-dna-delivery-guide',
					'OCR Delivery Guide, printed page 7; Phil’s plan',
					'arriving at the plot to implicate an innocent person in the killing of Adam'
				),
				w(
					'dna-deep-plot-cover-up',
					'ocr-dna-delivery-guide',
					'OCR Delivery Guide, printed page 8; coerced followers',
					'Danny, the would-be dentist, and Brian are both used by Phil in the cover-up.'
				),
				w(
					'dna-deep-plot-adam-killed',
					'ocr-dna-delivery-guide',
					'OCR Delivery Guide, printed page 7; Phil and Adam',
					'Adam’s killing itself'
				),
				w(
					'dna-deep-plot-cathy-leader',
					'ocr-dna-delivery-guide',
					'OCR Delivery Guide, printed page 7; Cathy’s ending',
					'Cathy emerges from the role of follower to become a leader at the end of the play.'
				),
				w(
					'dna-deep-plot-phil-bereft',
					'ocr-dna-delivery-guide',
					'OCR Delivery Guide, printed page 7; Phil’s final appearance',
					'his final appearance in the play – seemingly bereft and removed from the group'
				)
			]
		}
	],
	[
		'Great Expectations',
		pdTopic('gutenberg-great-expectations', [
			p(
				'great-expectations-deep-plot-convict-threat',
				'gutenberg-great-expectations',
				'Chapter I; Pip meets the escaped convict',
				'Keep still, you little devil, or I’ll cut your throat!'
			),
			p(
				'great-expectations-deep-plot-estella-insult',
				'gutenberg-great-expectations',
				'Chapter VIII; Estella humiliates Pip',
				'And what coarse hands he has! And what thick boots!'
			),
			p(
				'great-expectations-deep-plot-expectations',
				'gutenberg-great-expectations',
				'Chapter XVIII; Jaggers announces Pip’s expectations',
				'he be immediately removed from his present sphere of life and from this place, and be brought up as a gentleman'
			),
			p(
				'great-expectations-deep-plot-havisham-fire',
				'gutenberg-great-expectations',
				'Chapter XLIX; Miss Havisham catches fire',
				'she had been in flames, or that the flames were out'
			),
			p(
				'great-expectations-deep-plot-escape-fails',
				'gutenberg-great-expectations',
				'Chapter LIV; Magwitch and Compeyson go overboard',
				'they had gone down fiercely locked in each other’s arms'
			),
			p(
				'great-expectations-deep-plot-magwitch-dies',
				'gutenberg-great-expectations',
				'Chapter LVI; Magwitch dies after learning Estella lives',
				'his head dropped quietly on his breast'
			),
			q(
				'great-expectations-deep-quotation-break-hearts',
				'gutenberg-great-expectations',
				'Chapter XII; Miss Havisham instructs Estella',
				'Break their hearts my pride and hope, break their hearts and have no mercy!'
			),
			q(
				'great-expectations-deep-quotation-against-reason',
				'gutenberg-great-expectations',
				'Chapter XXIX; Pip describes loving Estella',
				'I loved her against reason, against promise, against peace, against hope, against happiness'
			),
			q(
				'great-expectations-deep-quotation-evidence',
				'gutenberg-great-expectations',
				'Chapter XL; Jaggers gives Pip a rule',
				'Take nothing on its looks; take everything on evidence.'
			),
			q(
				'great-expectations-deep-quotation-every-line',
				'gutenberg-great-expectations',
				'Chapter XLIV; Pip addresses Estella',
				'You have been in every line I have ever read since I first came here'
			),
			q(
				'great-expectations-deep-quotation-suffering',
				'gutenberg-great-expectations',
				'Chapter LIX; Estella reflects on suffering',
				'suffering has been stronger than all other teaching'
			),
			q(
				'great-expectations-deep-quotation-bent-broken',
				'gutenberg-great-expectations',
				'Chapter LIX; Estella describes her change',
				'I have been bent and broken, but—I hope—into a better shape.'
			)
		])
	],
	[
		'A Christmas Carol',
		pdTopic('gutenberg-a-christmas-carol', [
			p(
				'a-christmas-carol-deep-plot-charity-refusal',
				'gutenberg-a-christmas-carol',
				'Stave I; Scrooge rejects the charity collectors',
				'Are there no prisons?'
			),
			p(
				'a-christmas-carol-deep-plot-marley-chain',
				'gutenberg-a-christmas-carol',
				'Stave I; Marley explains his punishment',
				'I wear the chain I forged in life'
			),
			p(
				'a-christmas-carol-deep-plot-belle-release',
				'gutenberg-a-christmas-carol',
				'Stave II; Belle ends the engagement',
				'I release you. With a full heart, for the love of him you once were.'
			),
			p(
				'a-christmas-carol-deep-plot-tiny-tim-future',
				'gutenberg-a-christmas-carol',
				'Stave III; the Spirit predicts Tiny Tim’s fate',
				'If these shadows remain unaltered by the Future, the child will die.'
			),
			p(
				'a-christmas-carol-deep-plot-ignorance-want',
				'gutenberg-a-christmas-carol',
				'Stave III; the Spirit reveals two children',
				'This boy is Ignorance. This girl is Want.'
			),
			p(
				'a-christmas-carol-deep-plot-own-grave',
				'gutenberg-a-christmas-carol',
				'Stave IV; Scrooge reads the neglected grave',
				'read upon the stone of the neglected grave his own name, EBENEZER SCROOGE'
			),
			q(
				'a-christmas-carol-deep-quotation-oyster',
				'gutenberg-a-christmas-carol',
				'Stave I; the narrator characterises Scrooge',
				'solitary as an oyster'
			),
			q(
				'a-christmas-carol-deep-quotation-prisons',
				'gutenberg-a-christmas-carol',
				'Stave I; Scrooge rejects charity',
				'Are there no prisons?'
			),
			q(
				'a-christmas-carol-deep-quotation-mankind',
				'gutenberg-a-christmas-carol',
				'Stave I; Marley corrects Scrooge',
				'Mankind was my business.'
			),
			q(
				'a-christmas-carol-deep-quotation-small-matter',
				'gutenberg-a-christmas-carol',
				'Stave II; the Spirit describes Fezziwig’s cost',
				'A small matter'
			),
			q(
				'a-christmas-carol-deep-quotation-surplus',
				'gutenberg-a-christmas-carol',
				'Stave I; Scrooge dismisses poor people',
				'decrease the surplus population.'
			),
			q(
				'a-christmas-carol-deep-quotation-ignorance-want',
				'gutenberg-a-christmas-carol',
				'Stave III; the Spirit names the children',
				'This boy is Ignorance. This girl is Want.'
			)
		])
	],
	[
		'Pride and Prejudice',
		pdTopic('gutenberg-pride-and-prejudice', [
			p(
				'pride-and-prejudice-deep-plot-netherfield',
				'gutenberg-pride-and-prejudice',
				'Chapter I; news reaches Longbourn',
				'Netherfield Park is let at last?'
			),
			p(
				'pride-and-prejudice-deep-plot-darcy-insult',
				'gutenberg-pride-and-prejudice',
				'Chapter III; Darcy refuses to dance with Elizabeth',
				'not handsome enough to tempt'
			),
			p(
				'pride-and-prejudice-deep-plot-collins-refusal',
				'gutenberg-pride-and-prejudice',
				'Chapter XIX; Elizabeth refuses Mr Collins',
				'I am very sensible of the honour of your proposals, but it is impossible for me to do otherwise than decline them.'
			),
			p(
				'pride-and-prejudice-deep-plot-letter-reversal',
				'gutenberg-pride-and-prejudice',
				'Chapter XXXVI; Elizabeth reassesses herself after Darcy’s letter',
				'Till this moment, I never knew myself.'
			),
			p(
				'pride-and-prejudice-deep-plot-lydia-elopes',
				'gutenberg-pride-and-prejudice',
				'Chapter XLVI; Jane’s letter reports Lydia’s flight',
				'My youngest sister has left all her friends--has eloped; has thrown herself into the power of--of Mr. Wickham.'
			),
			p(
				'pride-and-prejudice-deep-plot-second-proposal',
				'gutenberg-pride-and-prejudice',
				'Chapter LVIII; Elizabeth accepts Darcy',
				'her sentiments had undergone so material a change'
			),
			q(
				'pride-and-prejudice-deep-quotation-stubbornness',
				'gutenberg-pride-and-prejudice',
				'Chapter XXXI; Elizabeth answers Darcy',
				'There is a stubbornness about me that never can bear to be frightened at the will of others.'
			),
			q(
				'pride-and-prejudice-deep-quotation-courage',
				'gutenberg-pride-and-prejudice',
				'Chapter XXXI; Elizabeth resists intimidation',
				'My courage always rises with every attempt to intimidate me.'
			),
			q(
				'pride-and-prejudice-deep-quotation-self-knowledge',
				'gutenberg-pride-and-prejudice',
				'Chapter XXXVI; Elizabeth’s self-recognition',
				'Till this moment, I never knew myself.'
			),
			q(
				'pride-and-prejudice-deep-quotation-vanity-pride',
				'gutenberg-pride-and-prejudice',
				'Chapter V; Mary distinguishes two ideas',
				'Vanity and pride are different things, though the words are often used synonymously.'
			),
			q(
				'pride-and-prejudice-deep-quotation-neighbours',
				'gutenberg-pride-and-prejudice',
				'Chapter LVII; Mr Bennet jokes about society',
				'For what do we live, but to make sport for our neighbours, and laugh at them in our turn?'
			),
			q(
				'pride-and-prejudice-deep-quotation-ardently',
				'gutenberg-pride-and-prejudice',
				'Chapter XXXIV; Darcy’s first proposal',
				'You must allow me to tell you how ardently I admire and love you.'
			)
		])
	],
	[
		'The War of the Worlds',
		pdTopic('gutenberg-the-war-of-the-worlds', [
			p(
				'war-of-the-worlds-deep-plot-heat-ray',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter V; the Heat-Ray attacks',
				'It was sweeping round swiftly and steadily, this flaming death, this invisible, inevitable sword of heat.'
			),
			p(
				'war-of-the-worlds-deep-plot-leatherhead',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter X; the narrator takes his wife away',
				'We got to Leatherhead without misadventure about nine'
			),
			p(
				'war-of-the-worlds-deep-plot-curate',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter XIII; the narrator meets the curate',
				'I became aware of him as a seated figure in soot-smudged shirt sleeves'
			),
			p(
				'war-of-the-worlds-deep-plot-rout',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter XVI; London flees',
				'It was the beginning of the rout of civilisation, of the massacre of mankind.'
			),
			p(
				'war-of-the-worlds-deep-plot-thunder-child',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter XVII; the warship intervenes',
				'coming to the rescue of the threatened shipping.'
			),
			p(
				'war-of-the-worlds-deep-plot-curate-struck',
				'gutenberg-the-war-of-the-worlds',
				'Book Two, Chapter IV; the narrator silences the curate',
				'I turned the blade back and struck him with the butt. He went headlong forward and lay stretched on the ground.'
			),
			q(
				'war-of-the-worlds-deep-quotation-intellects',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter I; the Martian minds',
				'intellects vast and cool and unsympathetic'
			),
			q(
				'war-of-the-worlds-deep-quotation-million',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter I; Ogilvy’s estimate',
				'The chances against anything manlike on Mars are a million to one'
			),
			q(
				'war-of-the-worlds-deep-quotation-not-war',
				'gutenberg-the-war-of-the-worlds',
				'Book Two, Chapter VII; the artilleryman’s judgement',
				'This isn’t a war'
			),
			q(
				'war-of-the-worlds-deep-quotation-slay',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter VI; the Heat-Ray',
				'It is still a matter of wonder how the Martians are able to slay men so swiftly and so silently.'
			),
			q(
				'war-of-the-worlds-deep-quotation-stay',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter X; the narrator decides to leave',
				'We can’t possibly stay here'
			),
			q(
				'war-of-the-worlds-deep-quotation-civilisation',
				'gutenberg-the-war-of-the-worlds',
				'Book One, Chapter XVI; London’s flight',
				'the rout of civilisation, of the massacre of mankind'
			)
		])
	],
	[
		'The Strange Case of Dr Jekyll and Mr Hyde',
		pdTopic('gutenberg-jekyll-and-hyde', [
			p(
				'jekyll-and-hyde-deep-plot-will',
				'gutenberg-jekyll-and-hyde',
				'Search for Mr Hyde; Jekyll’s will',
				'all his possessions were to pass into the hands of his “friend and benefactor Edward Hyde,”'
			),
			p(
				'jekyll-and-hyde-deep-plot-utterson-meets-hyde',
				'gutenberg-jekyll-and-hyde',
				'Search for Mr Hyde; Utterson waits by the door',
				'I shall be Mr. Seek.'
			),
			p(
				'jekyll-and-hyde-deep-plot-carew-murder',
				'gutenberg-jekyll-and-hyde',
				'The Carew Murder Case; Hyde attacks Carew',
				'with ape-like fury, he was trampling his victim under foot'
			),
			p(
				'jekyll-and-hyde-deep-plot-forged-letter',
				'gutenberg-jekyll-and-hyde',
				'Incident of the Letter; Utterson suspects Jekyll',
				'Henry Jekyll forge for a murderer!'
			),
			p(
				'jekyll-and-hyde-deep-plot-lanyon-reveal',
				'gutenberg-jekyll-and-hyde',
				'Dr Lanyon’s Narrative; Hyde transforms',
				'there stood Henry Jekyll!'
			),
			p(
				'jekyll-and-hyde-deep-plot-involuntary-change',
				'gutenberg-jekyll-and-hyde',
				'Henry Jekyll’s Full Statement; the change becomes involuntary',
				'I had gone to bed Henry Jekyll, I had awakened Edward Hyde.'
			),
			q(
				'jekyll-and-hyde-deep-quotation-troglodytic',
				'gutenberg-jekyll-and-hyde',
				'Search for Mr Hyde; Utterson describes Hyde',
				'Something troglodytic'
			),
			q(
				'jekyll-and-hyde-deep-quotation-ape',
				'gutenberg-jekyll-and-hyde',
				'The Carew Murder Case; Hyde attacks Carew',
				'with ape-like fury'
			),
			q(
				'jekyll-and-hyde-deep-quotation-satan',
				'gutenberg-jekyll-and-hyde',
				'Search for Mr Hyde; Utterson reads Hyde’s face',
				'Satan’s signature upon a face'
			),
			q(
				'jekyll-and-hyde-deep-quotation-seek',
				'gutenberg-jekyll-and-hyde',
				'Search for Mr Hyde; Utterson’s wordplay',
				'I shall be Mr. Seek.'
			),
			q(
				'jekyll-and-hyde-deep-quotation-duality',
				'gutenberg-jekyll-and-hyde',
				'Henry Jekyll’s Full Statement; Jekyll’s theory',
				'the thorough and primitive duality of man'
			),
			q(
				'jekyll-and-hyde-deep-quotation-devil-caged',
				'gutenberg-jekyll-and-hyde',
				'Henry Jekyll’s Full Statement; Hyde returns',
				'My devil had been long caged, he came out roaring.'
			)
		])
	],
	[
		'Jane Eyre',
		pdTopic('gutenberg-jane-eyre', [
			p(
				'jane-eyre-deep-plot-red-room',
				'gutenberg-jane-eyre',
				'Chapter II; Jane is punished at Gateshead',
				'Take her away to the red-room, and lock her in there.'
			),
			p(
				'jane-eyre-deep-plot-helen-dies',
				'gutenberg-jane-eyre',
				'Chapter IX; Jane wakes beside Helen',
				'I was asleep, and Helen was—dead.'
			),
			p(
				'jane-eyre-deep-plot-new-situation',
				'gutenberg-jane-eyre',
				'Chapter X; Jane seeks a post away from Lowood',
				'I had a prospect of getting a new situation where the salary would be double what I now received'
			),
			p(
				'jane-eyre-deep-plot-proposal',
				'gutenberg-jane-eyre',
				'Chapter XXIII; Rochester proposes',
				'Jane, will you marry me?'
			),
			p(
				'jane-eyre-deep-plot-leaves-thornfield',
				'gutenberg-jane-eyre',
				'Chapter XXVII; Jane resolves to leave',
				'I must leave Adèle and Thornfield. I must part with you for my whole life'
			),
			p(
				'jane-eyre-deep-plot-hears-call',
				'gutenberg-jane-eyre',
				'Chapter XXXV; Jane hears Rochester’s call',
				'I heard a voice somewhere cry— “Jane! Jane! Jane!”—nothing more.'
			),
			q(
				'jane-eyre-deep-quotation-not-angel',
				'gutenberg-jane-eyre',
				'Chapter XXIV; Jane resists idealisation',
				'I am not an angel'
			),
			q(
				'jane-eyre-deep-quotation-automaton',
				'gutenberg-jane-eyre',
				'Chapter XXIII; Jane asserts equality',
				'Do you think I am an automaton?—a machine without feelings?'
			),
			q(
				'jane-eyre-deep-quotation-women-calm',
				'gutenberg-jane-eyre',
				'Chapter XII; Jane reflects on women’s confinement',
				'Women are supposed to be very calm generally: but women feel just as men feel'
			),
			q(
				'jane-eyre-deep-quotation-care-self',
				'gutenberg-jane-eyre',
				'Chapter XXVII; Jane chooses self-respect',
				'The more solitary, the more friendless, the more unsustained I am, the more I will respect myself.'
			),
			q(
				'jane-eyre-deep-quotation-sundered',
				'gutenberg-jane-eyre',
				'Chapter XVII; Jane disciplines her feelings',
				'we are for ever sundered'
			),
			q(
				'jane-eyre-deep-quotation-husbands-life',
				'gutenberg-jane-eyre',
				'Chapter XXXVIII; Jane describes the marriage',
				'I am my husband’s life as fully as he is mine.'
			)
		])
	],
	[
		'Romeo and Juliet',
		pdTopic('gutenberg-romeo-and-juliet', [
			p(
				'romeo-and-juliet-deep-plot-feast-meeting',
				'gutenberg-romeo-and-juliet',
				'Act 1, Scene 5; Romeo and Juliet meet',
				'And palm to palm is holy palmers’ kiss.'
			),
			p(
				'romeo-and-juliet-deep-plot-marriage',
				'gutenberg-romeo-and-juliet',
				'Act 2, Scene 6; Friar Laurence marries them',
				'I married them; and their stol’n marriage day Was Tybalt’s doomsday'
			),
			p(
				'romeo-and-juliet-deep-plot-banishment',
				'gutenberg-romeo-and-juliet',
				'Act 3, Scene 1; the Prince banishes Romeo',
				'Hence from Verona art thou banished.'
			),
			p(
				'romeo-and-juliet-deep-plot-potion',
				'gutenberg-romeo-and-juliet',
				'Act 4, Scene 1; Friar Laurence gives Juliet the plan',
				'Take thou this vial, being then in bed, And this distilled liquor drink thou off'
			),
			p(
				'romeo-and-juliet-deep-plot-juliet-dies',
				'gutenberg-romeo-and-juliet',
				'Act 5, Scene 3; Juliet kills herself',
				'But, as it seems, did violence on herself.'
			),
			p(
				'romeo-and-juliet-deep-plot-reconciliation',
				'gutenberg-romeo-and-juliet',
				'Act 5, Scene 3; Montague memorialises Juliet',
				'I will raise her statue in pure gold'
			),
			q(
				'romeo-and-juliet-deep-quotation-star-crossed',
				'gutenberg-romeo-and-juliet',
				'Prologue; the lovers’ fate',
				'A pair of star-cross’d lovers take their life;'
			),
			q(
				'romeo-and-juliet-deep-quotation-only-love',
				'gutenberg-romeo-and-juliet',
				'Act 1, Scene 5; Juliet learns Romeo’s identity',
				'My only love sprung from my only hate!'
			),
			q(
				'romeo-and-juliet-deep-quotation-name',
				'gutenberg-romeo-and-juliet',
				'Act 2, Scene 2; Juliet questions names',
				'What’s in a name? That which we call a rose'
			),
			q(
				'romeo-and-juliet-deep-quotation-violent-delights',
				'gutenberg-romeo-and-juliet',
				'Act 2, Scene 6; Friar Laurence warns Romeo',
				'These violent delights have violent ends,'
			),
			q(
				'romeo-and-juliet-deep-quotation-fortunes-fool',
				'gutenberg-romeo-and-juliet',
				'Act 3, Scene 1; Romeo reacts after killing Tybalt',
				'O, I am fortune’s fool!'
			),
			q(
				'romeo-and-juliet-deep-quotation-dagger',
				'gutenberg-romeo-and-juliet',
				'Act 5, Scene 3; Juliet takes Romeo’s dagger',
				'O happy dagger.'
			)
		])
	],
	[
		'The Merchant of Venice',
		pdTopic('gutenberg-the-merchant-of-venice', [
			p(
				'merchant-of-venice-deep-plot-loan',
				'gutenberg-the-merchant-of-venice',
				'Act 1, Scene 3; Bassanio asks for the loan',
				'Three thousand ducats for three months, and Antonio bound.'
			),
			p(
				'merchant-of-venice-deep-plot-bond-sealed',
				'gutenberg-the-merchant-of-venice',
				'Act 1, Scene 3; Antonio accepts Shylock’s bond',
				'Yes, Shylock, I will seal unto this bond.'
			),
			p(
				'merchant-of-venice-deep-plot-jessica-elopes',
				'gutenberg-the-merchant-of-venice',
				'Act 2, Scene 8; Shylock learns Jessica fled',
				'My daughter! O my ducats! O my daughter! Fled with a Christian!'
			),
			p(
				'merchant-of-venice-deep-plot-leaden-casket',
				'gutenberg-the-merchant-of-venice',
				'Act 3, Scene 2; Bassanio chooses the lead casket',
				'Fair Portia’s counterfeit!'
			),
			p(
				'merchant-of-venice-deep-plot-ships-fail',
				'gutenberg-the-merchant-of-venice',
				'Act 3, Scene 2; Antonio’s letter reaches Bassanio',
				'my ships have all miscarried, my creditors grow cruel, my estate is very low, my bond to the Jew is forfeit'
			),
			p(
				'merchant-of-venice-deep-plot-ring-revealed',
				'gutenberg-the-merchant-of-venice',
				'Act 5, Scene 1; Portia reveals the ring trick',
				'I had it of him: pardon me, Bassanio, For by this ring, the doctor lay with me.'
			),
			q(
				'merchant-of-venice-deep-quotation-sad',
				'gutenberg-the-merchant-of-venice',
				'Act 1, Scene 1; Antonio’s opening line',
				'In sooth I know not why I am so sad,'
			),
			q(
				'merchant-of-venice-deep-quotation-glisters',
				'gutenberg-the-merchant-of-venice',
				'Act 2, Scene 7; the gold casket scroll',
				'All that glisters is not gold,'
			),
			q(
				'merchant-of-venice-deep-quotation-stage',
				'gutenberg-the-merchant-of-venice',
				'Act 1, Scene 1; Antonio describes the world',
				'I hold the world but as the world, Gratiano,'
			),
			q(
				'merchant-of-venice-deep-quotation-scripture',
				'gutenberg-the-merchant-of-venice',
				'Act 1, Scene 3; Antonio judges Shylock’s argument',
				'The devil can cite Scripture for his purpose.'
			),
			q(
				'merchant-of-venice-deep-quotation-do',
				'gutenberg-the-merchant-of-venice',
				'Act 1, Scene 2; Portia on advice and action',
				'If to do were as easy as to know what were good to do'
			),
			q(
				'merchant-of-venice-deep-quotation-candle',
				'gutenberg-the-merchant-of-venice',
				'Act 5, Scene 1; Portia sees the candle',
				'How far that little candle throws his beams!'
			)
		])
	],
	[
		'Macbeth',
		pdTopic('gutenberg-macbeth', [
			p(
				'macbeth-deep-plot-prophecy',
				'gutenberg-macbeth',
				'Act 1, Scene 3; the third witch greets Macbeth',
				'All hail, Macbeth! that shalt be king hereafter!'
			),
			p(
				'macbeth-deep-plot-lady-plan',
				'gutenberg-macbeth',
				'Act 1, Scene 5; Lady Macbeth tells him to deceive Duncan',
				'look like the innocent flower, But be the serpent under’t.'
			),
			p(
				'macbeth-deep-plot-crowned',
				'gutenberg-macbeth',
				'Act 3, Scene 1; Banquo reflects on Macbeth’s titles',
				'Thou hast it now, King, Cawdor, Glamis, all,'
			),
			p(
				'macbeth-deep-plot-banquo-fleance',
				'gutenberg-macbeth',
				'Act 3, Scene 3; Banquo is killed but Fleance escapes',
				'Fleance escapes.'
			),
			p(
				'macbeth-deep-plot-banquo-ghost',
				'gutenberg-macbeth',
				'Act 3, Scene 4; Banquo’s ghost takes Macbeth’s place',
				'The Ghost of Banquo rises, and sits in Macbeth’s place.'
			),
			p(
				'macbeth-deep-plot-apparitions',
				'gutenberg-macbeth',
				'Act 4, Scene 1; an apparition gives Macbeth confidence',
				'none of woman born Shall harm Macbeth.'
			),
			q(
				'macbeth-deep-quotation-stars',
				'gutenberg-macbeth',
				'Act 1, Scene 4; Macbeth hides his desire',
				'Stars, hide your fires!'
			),
			q(
				'macbeth-deep-quotation-flower-serpent',
				'gutenberg-macbeth',
				'Act 1, Scene 5; Lady Macbeth advises deception',
				'look like the innocent flower, But be the serpent under’t.'
			),
			q(
				'macbeth-deep-quotation-dagger',
				'gutenberg-macbeth',
				'Act 2, Scene 1; Macbeth sees the dagger',
				'Is this a dagger which I see before me,'
			),
			q(
				'macbeth-deep-quotation-neptune',
				'gutenberg-macbeth',
				'Act 2, Scene 2; Macbeth looks at his bloody hands',
				'Will all great Neptune’s ocean wash this blood'
			),
			q(
				'macbeth-deep-quotation-spot',
				'gutenberg-macbeth',
				'Act 5, Scene 1; Lady Macbeth sleepwalks',
				'Out, damned spot! out, I say!'
			),
			q(
				'macbeth-deep-quotation-shadow',
				'gutenberg-macbeth',
				'Act 5, Scene 5; Macbeth responds to the Queen’s death',
				'Life’s but a walking shadow; a poor player,'
			)
		])
	],
	[
		'Much Ado About Nothing',
		pdTopic('gutenberg-much-ado-about-nothing', [
			p(
				'much-ado-deep-plot-hero-match',
				'gutenberg-much-ado-about-nothing',
				'Act 1, Scene 1; Don Pedro agrees to woo Hero for Claudio',
				'I will assume thy part in some disguise, And tell fair Hero I am Claudio'
			),
			p(
				'much-ado-deep-plot-benedick-gull',
				'gutenberg-much-ado-about-nothing',
				'Act 2, Scene 3; Benedick overhears the staged conversation',
				'I should think this a gull, but that the white-bearded fellow speaks it'
			),
			p(
				'much-ado-deep-plot-beatrice-gull',
				'gutenberg-much-ado-about-nothing',
				'Act 3, Scene 1; Beatrice decides to return Benedick’s love',
				'And, Benedick, love on; I will requite thee'
			),
			p(
				'much-ado-deep-plot-window-trick',
				'gutenberg-much-ado-about-nothing',
				'Act 3, Scene 3; Borachio explains the deception',
				'they Margaret was Hero'
			),
			p(
				'much-ado-deep-plot-wedding-shame',
				'gutenberg-much-ado-about-nothing',
				'Act 4, Scene 1; Claudio accuses Hero',
				'Hero itself can blot out Hero’s virtue.'
			),
			p(
				'much-ado-deep-plot-watch-confession',
				'gutenberg-much-ado-about-nothing',
				'Act 3, Scene 3; the Watch hears Borachio confess',
				'I have tonight wooed Margaret, the Lady Hero’s gentlewoman, by the name of Hero'
			),
			q(
				'much-ado-deep-quotation-love-nothing',
				'gutenberg-much-ado-about-nothing',
				'Act 4, Scene 1; Benedick declares love',
				'I do love nothing in the world so well as you: is not that strange?'
			),
			q(
				'much-ado-deep-quotation-silence',
				'gutenberg-much-ado-about-nothing',
				'Act 2, Scene 1; Claudio responds to the match',
				'Silence is the perfectest herald of joy'
			),
			q(
				'much-ado-deep-quotation-giddy',
				'gutenberg-much-ado-about-nothing',
				'Act 5, Scene 4; Benedick reverses his old position',
				'man is a giddy thing'
			),
			q(
				'much-ado-deep-quotation-bachelor',
				'gutenberg-much-ado-about-nothing',
				'Act 2, Scene 3; Benedick changes his mind',
				'When I said I would die a bachelor, I did not think I should live till I were married.'
			),
			q(
				'much-ado-deep-quotation-slander',
				'gutenberg-much-ado-about-nothing',
				'Act 5, Scene 3; Claudio reads the epitaph',
				'Done to death by slanderous tongues'
			),
			q(
				'much-ado-deep-quotation-protest',
				'gutenberg-much-ado-about-nothing',
				'Act 4, Scene 1; Beatrice declares love',
				'I love you with so much of my heart that none is left to protest.'
			)
		])
	],
	...poetryRows()
]);

const deepTopics = base.topics.map((topic) =>
	buildTargetTopic(topic, rowsByTitle.get(topic.title))
);
const master = { ...base, topics: deepTopics };

const groups = [
	['modern-prose-01', ['Anita and Me', 'Never Let Me Go', 'Animal Farm']],
	['modern-prose-02', ['An Inspector Calls', 'Leave Taking', 'DNA']],
	...[
		'Great Expectations',
		'A Christmas Carol',
		'Pride and Prejudice',
		'The War of the Worlds',
		'The Strange Case of Dr Jekyll and Mr Hyde',
		'Jane Eyre',
		'Romeo and Juliet',
		'The Merchant of Venice',
		'Macbeth',
		'Much Ado About Nothing'
	].map((title) => [slug(title), [title]]),
	['poetry-public-domain', ['Love and Relationships', 'Conflict', 'Youth and Age']]
];

mkdirSync(outputDir, { recursive: true });
writeJson(masterPath, master);
const shards = groups.map(([name, titles], index) => {
	const targetTitles = new Set(titles);
	const releaseId = `ocr-j352-literature-deepening-${String(index + 1).padStart(2, '0')}-${name}-v1`;
	const sourcePlanPath = path.join(outputDir, `${releaseId}-source-plan.json`);
	const plan = {
		...base,
		topics: base.topics.map((topic) =>
			targetTitles.has(topic.title)
				? buildTargetTopic(topic, rowsByTitle.get(topic.title))
				: buildExcludedTopic(topic)
		)
	};
	writeJson(sourcePlanPath, plan);
	return {
		index: index + 1,
		releaseId,
		sourcePlanPath,
		sourcePlanHash: sha256(readFileSync(sourcePlanPath)),
		titles,
		expectedCardCount: plan.topics.flatMap((topic) => topic.evidence).length
	};
});

const evidence = master.topics.flatMap((topic) => topic.evidence);
const counts = countEvidence(evidence);
if (
	master.topics.length !== 19 ||
	evidence.length !== 171 ||
	counts.plot !== 96 ||
	counts.quotation !== 72 ||
	counts.method !== 3 ||
	shards.length !== 13 ||
	shards.some((shard) => shard.expectedCardCount > 20) ||
	shards.reduce((sum, shard) => sum + shard.expectedCardCount, 0) !== 171
) {
	throw new Error(
		`Deepening plan invariant failed: ${JSON.stringify({ topics: master.topics.length, cards: evidence.length, counts, shards })}`
	);
}
writeJson(manifestPath, {
	schemaVersion: 'ocr-j352-literature-deepening-shards-v1',
	baseSourcePlan: basePath,
	masterSourcePlan: masterPath,
	masterSourcePlanHash: sha256(readFileSync(masterPath)),
	additiveContext: {
		artifactPath: additiveContextArtifactPath,
		artifactHash: additiveContextRun.artifactHash
	},
	rightsBoundary: {
		modernPrimaryTextQuotations: 'withheld',
		poetryCompleteness: 'withheld; only edition-verified public-domain poems are included',
		licensedSecondarySynopses: 'plot-only, attributed, no primary-text quotation inference'
	},
	counts,
	totalCards: evidence.length,
	shards
});
console.log(
	JSON.stringify({ masterPath, manifestPath, totalCards: evidence.length, counts, shards }, null, 2)
);

function pdTopic(sourceId, evidence) {
	return { sourceId, evidence };
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function poetryRows() {
	const sharedMethodExcerpt = 'use textual references and quotations effectively to support views';
	return [
		[
			'Love and Relationships',
			{
				evidence: [
					q(
						'love-poetry-deep-quotation-song-love',
						'ocr-anthology-public-domain-love',
						'A Song by Helen Maria Williams, lines 7–8, anthology page 7',
						'I only meant his love.'
					),
					q(
						'love-poetry-deep-quotation-song-storm',
						'ocr-anthology-public-domain-love',
						'A Song by Helen Maria Williams, line 24, anthology page 7',
						'The storm is in my soul.'
					),
					q(
						'love-poetry-deep-quotation-bright-star-breast',
						'ocr-anthology-public-domain-love',
						'Bright Star by John Keats, line 10, anthology page 8',
						'Pillow’d upon my fair love’s ripening breast,'
					),
					q(
						'love-poetry-deep-quotation-bright-star-unrest',
						'ocr-anthology-public-domain-love',
						'Bright Star by John Keats, line 12, anthology page 8',
						'Awake for ever in a sweet unrest,'
					),
					m(
						'love-poetry-deep-method-quote-to-interpretation',
						'ocr-j352-specification-love-poetry',
						'J352 specification, physical PDF page 19; effective use of quotations',
						sharedMethodExcerpt
					)
				]
			}
		],
		[
			'Conflict',
			{
				evidence: [
					q(
						'conflict-poetry-deep-quotation-boat-cliff',
						'ocr-anthology-public-domain-conflict',
						'Boat Stealing by William Wordsworth, lines 27–28, anthology page 20',
						'a huge cliff, As if with voluntary power instinct,'
					),
					q(
						'conflict-poetry-deep-quotation-boat-dreams',
						'ocr-anthology-public-domain-conflict',
						'Boat Stealing by William Wordsworth, line 48, anthology page 20',
						'By day, and were the trouble of my dreams.'
					),
					q(
						'conflict-poetry-deep-quotation-sennacherib-autumn',
						'ocr-anthology-public-domain-conflict',
						'The Destruction of Sennacherib by Lord Byron, line 7, anthology page 21',
						'Like the leaves of the forest when Autumn hath blown,'
					),
					q(
						'conflict-poetry-deep-quotation-sennacherib-snow',
						'ocr-anthology-public-domain-conflict',
						'The Destruction of Sennacherib by Lord Byron, line 24, anthology page 21',
						'Hath melted like snow in the glance of the Lord!'
					),
					m(
						'conflict-poetry-deep-method-quote-to-interpretation',
						'ocr-j352-specification-conflict-poetry',
						'J352 specification, physical PDF page 19; effective use of quotations',
						sharedMethodExcerpt
					)
				]
			}
		],
		[
			'Youth and Age',
			{
				evidence: [
					q(
						'youth-poetry-deep-quotation-holy-flowers',
						'ocr-anthology-public-domain-youth',
						'Holy Thursday by William Blake, line 5, anthology page 32',
						'O what a multitude they seemed, these flowers of London town!'
					),
					q(
						'youth-poetry-deep-quotation-holy-hands',
						'ocr-anthology-public-domain-youth',
						'Holy Thursday by William Blake, line 8, anthology page 32',
						'Thousands of little boys and girls raising their innocent hands.'
					),
					q(
						'youth-poetry-deep-quotation-bluebell-spirit',
						'ocr-anthology-public-domain-youth',
						'The Bluebell by Anne Brontë, lines 1–2, anthology page 34',
						'A fine and subtle spirit dwells In every little flower,'
					),
					q(
						'youth-poetry-deep-quotation-bluebell-childhood',
						'ocr-anthology-public-domain-youth',
						'The Bluebell by Anne Brontë, line 34, anthology page 34',
						'My happy childhood’s hours'
					),
					m(
						'youth-poetry-deep-method-quote-to-interpretation',
						'ocr-j352-specification-youth-poetry',
						'J352 specification, physical PDF page 19; effective use of quotations',
						sharedMethodExcerpt
					)
				]
			}
		]
	];
}

function buildTargetTopic(topic, definition) {
	if (!definition) throw new Error(`No deepening definition for ${topic.title}`);
	const sources = definition.sources ?? topic.sources;
	if (definition.sourceId && !sources.some((source) => source.id === definition.sourceId)) {
		throw new Error(`${topic.title} is missing source ${definition.sourceId}`);
	}
	const modes = countEvidence(definition.evidence);
	const isPoetry = ['Love and Relationships', 'Conflict', 'Youth and Age'].includes(topic.title);
	return {
		topicComponentId: topic.topicComponentId,
		title: topic.title,
		coverage: isPoetry
			? {
					plot: {
						status: 'withheld',
						expectedCardCount: 0,
						reason: 'Plot recall is not applicable to a thematic poetry cluster.'
					},
					quotation: {
						status: 'withheld',
						expectedCardCount: 0,
						partialCardCount: modes.quotation,
						reason:
							'Only edition-verified public-domain poems are included; full anthology quotation coverage remains withheld because the current cluster includes in-copyright poems.'
					},
					method: { status: 'ready', expectedCardCount: modes.method }
				}
			: {
					plot: { status: 'ready', expectedCardCount: modes.plot },
					quotation:
						modes.quotation > 0
							? { status: 'ready', expectedCardCount: modes.quotation }
							: {
									status: 'withheld',
									expectedCardCount: 0,
									reason:
										'The set text remains in copyright and no licensed primary-text quotation source is available to this pipeline.'
								}
				},
		sources,
		evidence: definition.evidence
	};
}

function buildExcludedTopic(topic) {
	const reason = 'This immutable additive shard targets other OCR J352 options.';
	return {
		topicComponentId: topic.topicComponentId,
		title: topic.title,
		coverage: {
			plot: { status: 'withheld', expectedCardCount: 0, reason },
			quotation: { status: 'withheld', expectedCardCount: 0, reason }
		},
		sources: [],
		evidence: []
	};
}

function countEvidence(evidence) {
	return evidence.reduce((counts, row) => ({ ...counts, [row.mode]: counts[row.mode] + 1 }), {
		plot: 0,
		quotation: 0,
		method: 0
	});
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
