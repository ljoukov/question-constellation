import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlas from 'world-atlas/countries-110m.json';
import { COUNTRY_REFERENCES, type CountryReference } from './country-map-data';

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 500;
export const MAP_VIEW_BOX = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;

type WorldAtlasTopology = Topology<{
	countries: GeometryCollection;
	land: GeometryCollection;
}>;

export type ProjectedCountry = CountryReference & {
	x: number;
	y: number;
};

const topology = worldAtlas as unknown as WorldAtlasTopology;
const projection = geoNaturalEarth1().fitExtent(
	[
		[12, 12],
		[MAP_WIDTH - 12, MAP_HEIGHT - 12]
	],
	{ type: 'Sphere' }
);
const path = geoPath(projection).digits(1);

// Natural Earth 1:110m country geometry is bundled by world-atlas. No map data is
// fetched at runtime, and the map deliberately has no precise-location layer.
export const LAND_PATH = path(feature(topology, topology.objects.land)) ?? '';
export const BORDER_PATH =
	path(mesh(topology, topology.objects.countries, (left, right) => left !== right)) ?? '';

export const PROJECTED_COUNTRIES: readonly ProjectedCountry[] = COUNTRY_REFERENCES.flatMap(
	(country) => {
		const point = projection([country.longitude, country.latitude]);
		if (!point) return [];
		return [{ ...country, x: point[0], y: point[1] }];
	}
);

function lookupKey(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, ' ')
		.trim();
}

const countryLookup = new Map<string, ProjectedCountry>();

for (const country of PROJECTED_COUNTRIES) {
	countryLookup.set(lookupKey(country.code), country);
	countryLookup.set(lookupKey(country.alpha3), country);
	countryLookup.set(lookupKey(country.name), country);
}

const aliases: Record<string, string> = {
	UK: 'GB',
	'UNITED STATES OF AMERICA': 'US',
	'CZECH REPUBLIC': 'CZ',
	'COTE D IVOIRE': 'CI',
	'DEMOCRATIC REPUBLIC OF THE CONGO': 'CD',
	'CONGO KINSHASA': 'CD',
	'CONGO BRAZZAVILLE': 'CG',
	'REPUBLIC OF KOREA': 'KR',
	'RUSSIAN FEDERATION': 'RU',
	TURKEY: 'TR',
	'VIET NAM': 'VN'
};

for (const [alias, code] of Object.entries(aliases)) {
	const country = countryLookup.get(code);
	if (country) countryLookup.set(lookupKey(alias), country);
}

export function resolveCountry(value: string): ProjectedCountry | undefined {
	return countryLookup.get(lookupKey(value));
}
