export function normalizeComponentCode(value) {
	return String(value ?? '')
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '');
}

export const REVIEWED_OCR_COMPONENT_SOURCE_IDENTITIES = Object.freeze([
	Object.freeze({
		sha256: '4d0cf680859afb7e7cbe9bef46448f38bef81dcadda1835bdac30051f3f3c31c',
		component: 'J351/01',
		document: 'question-paper'
	}),
	Object.freeze({
		sha256: 'd9ed33a9cb8c8184f4782302b3b916561c5f28af1d6d1bd29c0db04d2c85322c',
		component: 'J351/01',
		document: 'mark-scheme'
	}),
	Object.freeze({
		sha256: '9160256044462eb2057540a8dba48e2f6a608022f3a9d991e9b87cdc023a650c',
		component: 'J351/02',
		document: 'question-paper'
	}),
	Object.freeze({
		sha256: '383ee4e0cd4bac26e0bcf1bbfbb933a284df05e4610d426c4f5144755164cd6c',
		component: 'J351/02',
		document: 'mark-scheme'
	}),
	Object.freeze({
		sha256: 'c3d6821647f4a752624a67416fb62571f5bda72479f663bd40ce21e83ba2c160',
		component: 'J352/01',
		document: 'question-paper'
	}),
	Object.freeze({
		sha256: '8ec499a8b6a0665fd3bb8ac5619b501d5f67071f27b75afd4cbeacd030e96a7d',
		component: 'J352/01',
		document: 'mark-scheme'
	}),
	Object.freeze({
		sha256: 'c0f3be806bddf97e106ac6a1c3ff57e676871c83a68a086eaad97cf0f2017574',
		component: 'J352/02',
		document: 'question-paper'
	}),
	Object.freeze({
		sha256: 'c0981d3849667c48d0a9ca553ca312688766058b0c55df66a3a115e3c86be04b',
		component: 'J352/02',
		document: 'mark-scheme'
	})
]);

const reviewedOcrComponentBySha256 = new Map(
	REVIEWED_OCR_COMPONENT_SOURCE_IDENTITIES.map((entry) => [entry.sha256, entry.component])
);

export function findVisibleComponent(text, { sha256 = '' } = {}) {
	const source = String(text ?? '');
	// OCR cover pages print the assessment component as J351/01 etc. The
	// bracketed 601/4575/4 or 601/4872/X value in the footer is a qualification
	// accreditation number, not a paper component. Prefer the board component
	// wherever it is visibly present.
	const ocrMatch = source.match(/\b(J\d{3})\s*\/\s*(\d{2})\b/i);
	if (ocrMatch) {
		return {
			component: `${ocrMatch[1].toUpperCase()}/${ocrMatch[2]}`,
			evidence: ocrMatch[0].replace(/\s+/g, ' ').trim(),
			rule: 'visible_ocr_component_precedence'
		};
	}

	const reviewedComponent = reviewedOcrComponentBySha256.get(String(sha256).toLowerCase());
	if (reviewedComponent) {
		return {
			component: reviewedComponent,
			evidence: `sha256:${String(sha256).toLowerCase()}`,
			rule: 'reviewed_exact_ocr_pdf_hash'
		};
	}

	const withoutBracketedQualificationNumbers = source.replace(/\[[^\]]*\]/g, ' ');
	const match = withoutBracketedQualificationNumbers.match(
		/\b(\d{4})\/([0-9A-Z]+(?:\/[0-9A-Z]+)*)\b/i
	);
	if (!match) return null;
	return {
		component: `${match[1]}/${match[2].toUpperCase()}`,
		evidence: match[0].replace(/\s+/g, ' ').trim(),
		rule: 'visible_numeric_component'
	};
}

export function componentCodeCompatibility(expected, visible) {
	const expectedNormalized = normalizeComponentCode(expected);
	const visibleNormalized = normalizeComponentCode(visible);
	const result = (compatible, rule) => ({
		compatible,
		rule,
		expectedNormalized,
		visibleNormalized
	});

	if (!expectedNormalized || !visibleNormalized) {
		return result(true, 'missing_component_evidence');
	}
	if (expectedNormalized === visibleNormalized) return result(true, 'exact');
	if (
		expectedNormalized.startsWith(visibleNormalized) &&
		/^[A-Z]+$/.test(expectedNormalized.slice(visibleNormalized.length))
	) {
		return result(true, 'trailing_alpha_qualifier');
	}
	if (
		visibleNormalized.startsWith(expectedNormalized) &&
		/^[A-Z]+$/.test(visibleNormalized.slice(expectedNormalized.length))
	) {
		return result(true, 'trailing_alpha_qualifier');
	}

	const expectedCombinedPaper = expectedNormalized.match(/^8464([BCP])([12])([HF])$/);
	const visibleCombinedFamily = visibleNormalized.match(/^8464([BCP])$/);
	if (expectedCombinedPaper && visibleCombinedFamily) {
		return result(
			expectedCombinedPaper[1] === visibleCombinedFamily[1],
			expectedCombinedPaper[1] === visibleCombinedFamily[1]
				? 'aqa_8464_combined_science_family_to_paper_tier'
				: 'incompatible'
		);
	}

	const expectedCombinedFamily = expectedNormalized.match(/^8464([BCP])$/);
	const visibleCombinedPaper = visibleNormalized.match(/^8464([BCP])([12])([HF])$/);
	if (expectedCombinedFamily && visibleCombinedPaper) {
		return result(
			expectedCombinedFamily[1] === visibleCombinedPaper[1],
			expectedCombinedFamily[1] === visibleCombinedPaper[1]
				? 'aqa_8464_combined_science_family_to_paper_tier'
				: 'incompatible'
		);
	}

	return result(false, 'incompatible');
}
