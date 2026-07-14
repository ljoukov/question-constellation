export type CurriculumSelectionComponent = {
	id: string;
	code: string;
	title: string;
	kind: string;
	displayOrder: number;
	paper: string | null;
	subjectArea: string | null;
	optionGroupId: string | null;
	sourcePageStart: number | null;
	sourcePageEnd: number | null;
};

export type CurriculumSelectionGroup = {
	id: string;
	title: string;
	kind: string;
	displayOrder: number;
	selectionMin?: number | null;
	selectionMax?: number | null;
	components: CurriculumSelectionComponent[];
};

export type CurriculumSelectionTree = {
	groups: CurriculumSelectionGroup[];
};

export type CurriculumOffering = {
	id: string;
	board: string;
	qualification: string;
	profileSubject: string;
	course: string;
	tier: string;
	label: string;
	specification: {
		id: string;
		code: string;
		version: string;
		title: string;
		officialSourceUrl: string;
		pdfUrl: string;
		firstExamYear: number | null;
		lastExamYear: number | null;
	};
	selectionTree: CurriculumSelectionTree;
	selectableComponentIds: string[];
	snapshotHash: string;
};

export type CurriculumProfileSnapshot = {
	qualification: string;
	subjects: CurriculumProfileSubject[];
};

export type CurriculumProfileSubject = {
	subject: string;
	tierApplies: boolean;
	boards: CurriculumProfileBoard[];
};

export type CurriculumProfileBoard = {
	id: string;
	name: string;
	courses: CurriculumProfileCourse[];
};

export type CurriculumProfileCourse = {
	name: string;
	tiers: CurriculumProfileTier[];
};

export type CurriculumProfileTier = {
	name: string;
	offeringId: string;
	specification: {
		id: string;
		code: string;
		version: string;
		title: string;
		officialSourceUrl: string;
	};
};

export function curriculumOfferingTopics(offering: CurriculumOffering) {
	return offering.selectionTree.groups.flatMap((group) =>
		group.components.map((component) => ({
			...component,
			groupId: group.id,
			groupTitle: group.title,
			groupKind: group.kind
		}))
	);
}
