export type ExamPaperAsset = {
	id: string;
	label: string;
	src: string;
	alt: string;
	width?: number;
};

export type ExamTableCell = {
	text: string;
	header?: boolean;
	colspan?: number;
	rowspan?: number;
	align?: 'left' | 'center' | 'right';
};

export type ExamQuestionBlock =
	| {
			kind: 'paragraph';
			text: string;
	  }
	| {
			kind: 'figure';
			assetId: string;
			label?: string;
			width?: number;
	  }
	| {
			kind: 'table';
			label?: string;
			columns: string[];
			rows: string[][];
			compact?: boolean;
	  }
	| {
			kind: 'structured-table';
			label?: string;
			rows: ExamTableCell[][];
			compact?: boolean;
			wide?: boolean;
	  }
	| {
			kind: 'key';
			items: {
				marker: string;
				text: string;
			}[];
	  }
	| {
			kind: 'ordered-list';
			items: string[];
	  }
	| {
			kind: 'bullet-list';
			items: string[];
	  }
	| {
			kind: 'equation';
			text: string;
	  };

export type ExamResponse =
	| {
			kind: 'none';
	  }
	| {
			kind: 'lines';
			count: number;
	  }
	| {
			kind: 'labeled-lines';
			labels: string[];
			fields?: Array<{
				label: string;
				lineCount?: number;
			}>;
			lineCount?: number;
			choicePrompt?: string;
			choiceOptions?: string[];
			choiceLayout?: 'vertical' | 'horizontal';
			correctAnswers?: Record<string, string>;
	  }
	| {
			kind: 'number-line';
			label: string;
			prefix?: string;
			unit?: string;
	  }
	| {
			kind: 'choice';
			options: string[];
			layout?: 'vertical' | 'horizontal';
			maxSelections?: number;
	  }
	| {
			kind: 'choice-table';
			columns: string[];
			rows: string[][];
	  }
	| {
			kind: 'matching';
			leftTitle?: string | null;
			rightTitle?: string | null;
			left: string[];
			right: string[];
	  }
	| {
			kind: 'asset-canvas';
			assetId: string;
			label?: string;
			width?: number;
			labelBank?: string[];
	  }
	| {
			kind: 'drawing-box';
			label?: string;
			width?: number;
			height?: number;
	  }
	| {
			kind: 'equation-blanks';
			segments: (
				| {
						kind: 'text';
						text: string;
				  }
				| {
						kind: 'math';
						text: string;
				  }
				| {
						kind: 'blank';
						id: string;
						label: string;
						width?: number;
				  }
			)[];
			unorderedGroups?: Array<{
				targetIds: string[];
				answers: string[];
			}>;
	  }
	| {
			kind: 'image-label-zones';
			assetId: string;
			labels: string[];
			allowRepeats?: boolean;
			correctAnswers?: Record<string, string>;
			zones: {
				id: string;
				label: string;
				x: number;
				y: number;
				width: number;
				height: number;
			}[];
			width?: number;
	  };

export type ExamQuestionPart = {
	questionId?: string;
	ref: string;
	marks: number;
	stemBlocks?: ExamQuestionBlock[];
	leadBlocks?: ExamQuestionBlock[];
	blocks: ExamQuestionBlock[];
	response: ExamResponse;
	afterResponseBlocks?: ExamQuestionBlock[];
};

export type ExamQuestion = {
	ref: string;
	blocks: ExamQuestionBlock[];
	parts: ExamQuestionPart[];
};

export type ExamPaper = {
	id: string;
	title: string;
	subtitle: string;
	source: string;
	assets: Record<string, ExamPaperAsset>;
	questions: ExamQuestion[];
};
