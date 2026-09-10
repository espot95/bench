/**
 * I POLIGONI delle nazioni (Ufficio Commerciale, richiesta utente: "lo stato si
 * illumina del colore del club dominante"). Confini da world-atlas (TopoJSON 110m,
 * ~100KB, bundlato: zero fetch a runtime), convertiti con topojson-client.
 */

import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countriesTopo from 'world-atlas/countries-110m.json';

/** Codice-nazione del gioco → id ISO 3166-1 numerico (zero-padded, come world-atlas). */
const ISO_N: Record<string, string> = {
  CHN: '156',
  JPN: '392',
  USA: '840',
  KOR: '410',
  IND: '356',
  SAU: '682',
  AUS: '036',
  MEX: '484',
  BRA: '076',
  ARG: '032',
  RSA: '710',
  GER: '276',
  FRA: '250',
  ESP: '724',
  NED: '528',
  POR: '620',
  ITA: '380',
  ENG: '826', // Regno Unito: la risoluzione 110m non separa l'Inghilterra
  BEL: '056',
  CRO: '191',
  SRB: '688',
  MAR: '504',
  SEN: '686',
  URU: '858',
  COL: '170',
};

let cache: Map<string, GeoJSON.Feature> | null = null;

/** Il poligono della nazione (null se il codice non è mappato). */
export function countryFeature(code: string): GeoJSON.Feature | null {
  if (!cache) {
    const topo = countriesTopo as unknown as Topology<{ countries: GeometryCollection }>;
    const fc = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
    cache = new Map();
    for (const f of fc.features) {
      if (f.id != null) cache.set(String(f.id), f);
    }
  }
  const iso = ISO_N[code];
  return iso ? (cache.get(iso) ?? null) : null;
}
