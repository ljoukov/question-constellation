// Minimal, tracked source rows for the scoped chained-import repair contract.
// Keep this fixture independent from the repair overlay: identity drift in the
// overlay must fail even in a clean clone where the bulk extraction corpus is
// intentionally absent.

export const chainedImportQuestionRepairSource = {
	questions: [
		{
			id: '8464b1h-nov20-04-2',
			source_document_id: 'aqa-8464b1h-qp-nov20',
			parent_source_question_ref: '04',
			source_question_ref: '04.2'
		},
		{
			id: '8464b1h-jun24-03-3',
			source_document_id: 'aqa-8464b1h-qp-jun24',
			parent_source_question_ref: '03',
			source_question_ref: '03.3',
			prompt_text:
				'Describe how the measles vaccine helps a person to become immune to the\nmeasles pathogen.\n[4 marks]',
			parent_stem:
				'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.',
			self_contained_prompt_text:
				'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.\n\nDescribe how the measles vaccine helps a person to become immune to the\nmeasles pathogen.\n[4 marks]',
			self_contained_prompt_markdown:
				'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.\n\nDescribe how the measles vaccine helps a person to become immune to the\nmeasles pathogen.\n[4 marks]',
			full_prompt_text:
				'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.\n\nDescribe how the measles vaccine helps a person to become immune to the\nmeasles pathogen.\n[4 marks]',
			context_blocks: [
				{
					kind: 'parent_stem',
					text: 'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.',
					required: true
				}
			]
		},
		{
			id: '8464b1h-jun24-04-6',
			source_document_id: 'aqa-8464b1h-qp-jun24',
			parent_source_question_ref: '04',
			source_question_ref: '04.6'
		},
		{
			id: '8464c1h-nov21-04-3',
			source_document_id: 'aqa-8464c1h-qp-nov21',
			parent_source_question_ref: '04',
			source_question_ref: '04.3'
		},
		{
			id: '8464c1h-jun22-05-3',
			source_document_id: 'aqa-8464c1h-qp-jun22',
			parent_source_question_ref: '05',
			source_question_ref: '05.3'
		}
	]
};

export const chainedImportPhysicsRepairSource = {
	answer_chain_candidates: [
		{
			id: 'physics-chain-grid-transformer-efficiency',
			summary: null,
			steps: [
				{
					step_text: 'The transformer increases potential difference.',
					step_role: 'cause',
					supporting_evidence: [
						{ question_id: '8464p1h-jun22-01-4' },
						{ question_id: '8464p1h-jun23-03-1' }
					],
					common_omission:
						'Student names transformers without saying the potential difference is increased.'
				},
				{
					step_text: 'For the same transfer, the current is reduced.',
					step_role: 'link',
					supporting_evidence: [
						{ question_id: '8464p1h-jun22-01-4' },
						{ question_id: '8464p1h-jun23-03-1' }
					],
					common_omission: 'Student omits the current link.'
				},
				{
					step_text: 'Lower current reduces cable heating or energy/power loss.',
					step_role: 'effect',
					supporting_evidence: [
						{ question_id: '8464p1h-jun22-01-4' },
						{ question_id: '8464p1h-jun23-03-1' }
					],
					common_omission: 'Student says efficient without explaining lower losses.'
				}
			]
		},
		{
			id: 'physics-chain-circuit-power-pd-current-calculation',
			steps: [
				{ step_text: 'Identify the electrical power relationship P = I V.' },
				{
					step_text: 'Convert kW, mW, or mA into W or A before substitution.',
					common_omission: 'Substitutes 6.9 for 6.9 kW, 240 for 240 mW, or 290 for 290 mA.'
				},
				{
					step_text:
						'Rearrange P = I V for the missing current or potential difference and calculate.'
				}
			]
		},
		{
			id: 'physics-chain-work-done-force-distance-calculation',
			steps: [
				{ step_text: 'Identify the work done relationship W = F s.' },
				{
					step_text: 'Convert distance into metres where required.',
					common_omission: 'Uses 15 mm as 15 m.'
				},
				{ step_text: 'Rearrange to F = W / s and calculate force in newtons.' }
			]
		},
		{
			id: 'physics-chain-ohms-law-calculation',
			steps: [
				{ step_text: "Select the Ohm's law relationship V = I R." },
				{
					step_text: 'Convert current into amps when the prompt gives milliamps.',
					common_omission: 'Substitutes 480 as amps instead of 0.480 A.'
				},
				{ step_text: 'Substitute the two known quantities and rearrange if needed.' },
				{
					step_text: 'Give the calculated resistance or potential difference with the correct unit.'
				}
			]
		}
	]
};
