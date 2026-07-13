export type ChainIllustration = {
	id: string;
	/** Dark-mode source. Kept as `src` so existing route payloads remain readable. */
	src: string;
	/** Light-mode edit of the same composition. Published illustrations always have both themes. */
	lightSrc: string;
	alt: string;
	caption: string;
	width: number;
	height: number;
};
