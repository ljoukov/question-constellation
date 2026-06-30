export const ALLOWED_STEP_ROLES = new Set([
	'given',
	'cause',
	'process',
	'link',
	'effect',
	'evidence',
	'method',
	'calculation',
	'conclusion'
]);

const FORBIDDEN_PLACEHOLDER_LABELS = [
	/\bresource gained\b/i,
	/\bbiological use\b/i,
	/\bproduct (?:one|two|three)\b/i,
	/\bfirst (?:difference|cause|claim|feature)\b/i,
	/\bsecond (?:difference|cause|claim|feature)\b/i,
	/\bthird (?:difference|cause|claim|feature)\b/i,
	/\bfunction cue\b/i,
	/\bprocess name\b/i,
	/\bprocess cue\b/i,
	/\bsource material\b/i,
	/\bcondition present\b/i,
	/\bproduct made\b/i,
	/\bsource absent\b/i,
	/\bdefence cue\b/i,
	/\bresponse category\b/i,
	/\bnutrient gained\b/i
];

const SENTENCE_START =
	/^(?:when|for|if|in|use|identify|select|state|give|explain|describe|calculate)\b/i;

export function wordCount(text) {
	return String(text ?? '').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

export function canonicalLinks(text) {
	return String(text ?? '')
		.split(/\s*->\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
}

export function isForbiddenPlaceholder(text) {
	return FORBIDDEN_PLACEHOLDER_LABELS.some((pattern) => pattern.test(String(text ?? '')));
}

export function publicChainStyleIssues(chain, options = {}) {
	const issues = [];
	const chainId = chain.id ?? null;
	const publicPapers = Number(chain.publicPapers ?? chain.public_papers ?? 0);
	const publicQuestions = Number(chain.publicQuestions ?? chain.public_questions ?? 0);

	const title = String(chain.title ?? '').trim();
	const titleWords = wordCount(title);
	if (!title) {
		issues.push(issue('error', 'missing_title', chainId, 'title', 'Missing chain title.'));
	} else {
		if (titleWords > 5 || title.length > 56) {
			issues.push(
				issue(
					'error',
					'title_too_long',
					chainId,
					'title',
					`${titleWords} words, ${title.length} chars`
				)
			);
		} else if (titleWords > 3) {
			issues.push(
				issue('warning', 'title_not_memory_handle', chainId, 'title', `${titleWords} words`)
			);
		}
		if (isForbiddenPlaceholder(title)) {
			issues.push(issue('error', 'placeholder_title', chainId, 'title', title));
		}
	}

	const canonical = String(chain.canonicalChainText ?? chain.canonical_chain_text ?? '').trim();
	const links = canonicalLinks(canonical);
	if (!canonical) {
		issues.push(
			issue(
				'error',
				'missing_canonical_chain',
				chainId,
				'canonicalChainText',
				'Missing canonical chain.'
			)
		);
	} else if (!canonical.includes('->') || links.length < 2 || links.length > 5) {
		issues.push(
			issue(
				'error',
				'canonical_not_links',
				chainId,
				'canonicalChainText',
				'Use 2-5 compact links joined by ->.'
			)
		);
	}
	for (const [index, link] of links.entries()) {
		const words = wordCount(link);
		if (words > 4 || link.length > 34) {
			issues.push(
				issue(
					'error',
					'canonical_link_too_long',
					chainId,
					`canonicalChainText[${index}]`,
					`${words} words, ${link.length} chars: ${link}`
				)
			);
		}
		if (SENTENCE_START.test(link) && words > 3) {
			issues.push(
				issue(
					'error',
					'canonical_link_reads_like_instruction',
					chainId,
					`canonicalChainText[${index}]`,
					link
				)
			);
		}
		if (isForbiddenPlaceholder(link)) {
			issues.push(
				issue('error', 'placeholder_canonical_link', chainId, `canonicalChainText[${index}]`, link)
			);
		}
	}
	if (canonical.length > 120 || /[.!?]\s+[A-Z]/.test(canonical)) {
		issues.push(
			issue(
				'error',
				'canonical_paragraph_like',
				chainId,
				'canonicalChainText',
				`${canonical.length} chars`
			)
		);
	}

	const summary = String(chain.summary ?? '').trim();
	if (summary) {
		const summaryWords = wordCount(summary);
		if (summaryWords > 12 || summary.length > 78) {
			issues.push(
				issue(
					'error',
					'summary_too_long',
					chainId,
					'summary',
					`${summaryWords} words, ${summary.length} chars`
				)
			);
		} else if (summaryWords > 8 || summary.length > 56) {
			issues.push(
				issue(
					'warning',
					'summary_not_memory_cue',
					chainId,
					'summary',
					`${summaryWords} words, ${summary.length} chars`
				)
			);
		}
		if (SENTENCE_START.test(summary) && summaryWords > 5) {
			issues.push(issue('warning', 'summary_reads_like_instruction', chainId, 'summary', summary));
		}
	}

	for (const [index, step] of (chain.steps ?? []).entries()) {
		const stepText = String(step.stepText ?? step.step_text ?? '').trim();
		const stepRole = step.stepRole ?? step.step_role ?? '';
		if (!stepText) {
			issues.push(
				issue(
					'error',
					'missing_step_text',
					chainId,
					`steps[${index}].stepText`,
					'Missing step label.'
				)
			);
			continue;
		}
		const stepWords = wordCount(stepText);
		if (stepWords > 5 || stepText.length > 48) {
			issues.push(
				issue(
					'error',
					'step_label_too_long',
					chainId,
					`steps[${index}].stepText`,
					`${stepWords} words, ${stepText.length} chars: ${stepText}`
				)
			);
		} else if (stepWords > 4 || stepText.length > 34) {
			issues.push(
				issue(
					'warning',
					'step_label_not_tiny',
					chainId,
					`steps[${index}].stepText`,
					`${stepWords} words, ${stepText.length} chars: ${stepText}`
				)
			);
		}
		if (SENTENCE_START.test(stepText) && stepWords > 3) {
			issues.push(
				issue('error', 'step_reads_like_instruction', chainId, `steps[${index}].stepText`, stepText)
			);
		}
		if (isForbiddenPlaceholder(stepText)) {
			issues.push(
				issue('error', 'placeholder_step_label', chainId, `steps[${index}].stepText`, stepText)
			);
		}
		if (!ALLOWED_STEP_ROLES.has(stepRole)) {
			issues.push(
				issue(
					'error',
					'unsupported_step_role',
					chainId,
					`steps[${index}].stepRole`,
					String(stepRole || 'missing')
				)
			);
		}
	}

	if (options.includeReuseWarnings && publicQuestions > 0 && publicPapers <= 1) {
		issues.push(
			issue(
				'warning',
				'single_public_paper',
				chainId,
				'publicPapers',
				`${publicQuestions} public question(s), ${publicPapers} public paper(s)`
			)
		);
	}

	return issues;
}

function issue(severity, code, chainId, field, evidence) {
	return { severity, code, chainId, field, evidence };
}
