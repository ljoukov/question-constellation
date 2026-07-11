export type AnalyticsEventPayload = {
	eventId: string;
	type: string;
	timestamp: number;
	sequence?: number;
	pageViewId?: string;
	url?: string;
	path?: string;
	query?: string;
	title?: string;
	referrer?: string;
	durationMs?: number;
	engagedMs?: number;
	scrollDepthPercent?: number;
	element?: {
		tag?: string;
		id?: string;
		classes?: string;
		text?: string;
		role?: string;
		name?: string;
		href?: string;
		selector?: string;
	};
	input?: {
		name?: string;
		type?: string;
		value?: string;
		previousValue?: string;
		redacted?: boolean;
	};
	properties?: Record<string, unknown>;
};

export type AnalyticsBatchPayload = {
	sessionId: string;
	anonymousId: string;
	sentAt: number;
	context?: {
		browserName?: string;
		browserVersion?: string;
		operatingSystem?: string;
		deviceType?: string;
		viewportWidth?: number;
		viewportHeight?: number;
		screenWidth?: number;
		screenHeight?: number;
		connectionEffectiveType?: string;
		connectionDownlinkMbps?: number;
		connectionRttMs?: number;
		connectionSaveData?: boolean;
		deviceMemoryGb?: number;
		hardwareConcurrency?: number;
	};
	events: AnalyticsEventPayload[];
};
