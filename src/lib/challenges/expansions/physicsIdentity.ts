export const physicsExpansionIdentities = [
	{
		id: 'physics-exp-bike-pump-pressure',
		slug: 'bike-pump-pressure-at-constant-temperature',
		subject: 'physics'
	},
	{
		id: 'physics-exp-sealed-balloon-pressure',
		slug: 'sealed-balloon-volume-and-pressure',
		subject: 'physics'
	},
	{
		id: 'physics-exp-thermometer-half-range',
		slug: 'thermometer-half-range-uncertainty',
		subject: 'physics'
	},
	{
		id: 'physics-exp-extension-half-range',
		slug: 'extension-half-range-uncertainty',
		subject: 'physics'
	},
	{
		id: 'physics-exp-moon-weight',
		slug: 'mass-and-weight-on-the-moon',
		subject: 'physics'
	},
	{
		id: 'physics-exp-lifted-crate-weight',
		slug: 'weight-while-a-crate-accelerates',
		subject: 'physics'
	},
	{
		id: 'physics-exp-trolley-collision-momentum',
		slug: 'trolley-collision-momentum-sharing',
		subject: 'physics'
	},
	{
		id: 'physics-exp-coupled-carts-momentum',
		slug: 'coupled-carts-after-a-collision',
		subject: 'physics'
	},
	{
		id: 'physics-exp-loft-insulation-conductivity',
		slug: 'loft-insulation-and-thermal-conductivity',
		subject: 'physics'
	},
	{
		id: 'physics-exp-pan-handle-conductivity',
		slug: 'pan-handle-thermal-conductivity',
		subject: 'physics'
	},
	{
		id: 'physics-exp-current-wire-motor-effect',
		slug: 'current-carrying-wire-motor-effect',
		subject: 'physics'
	},
	{
		id: 'physics-exp-magnet-force-pair',
		slug: 'magnet-and-conductor-force-pair',
		subject: 'physics'
	},
	{
		id: 'physics-exp-parallel-lamp-current',
		slug: 'parallel-lamp-branch-currents',
		subject: 'physics'
	},
	{
		id: 'physics-exp-parallel-voltage',
		slug: 'parallel-component-potential-difference',
		subject: 'physics'
	},
	{
		id: 'physics-exp-sled-resultant-acceleration',
		slug: 'sled-resultant-force-and-acceleration',
		subject: 'physics'
	},
	{
		id: 'physics-exp-loaded-van-acceleration',
		slug: 'mass-and-acceleration-for-the-same-force',
		subject: 'physics'
	},
	{
		id: 'physics-exp-xray-dose-risk',
		slug: 'x-ray-dose-and-risk',
		subject: 'physics'
	},
	{
		id: 'physics-exp-parachutist-terminal-velocity',
		slug: 'parachutist-drag-and-terminal-velocity',
		subject: 'physics'
	},
	{
		id: 'physics-exp-tired-driver-thinking-distance',
		slug: 'tired-driver-thinking-distance',
		subject: 'physics'
	},
	{
		id: 'physics-exp-tug-of-war-zero-resultant',
		slug: 'equal-pulls-zero-resultant-force',
		subject: 'physics'
	}
] as const satisfies readonly {
	id: string;
	slug: string;
	subject: 'physics';
}[];
