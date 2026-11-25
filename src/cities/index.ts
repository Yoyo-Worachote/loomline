import type { CityPack } from '../engine/types';
import { london } from './london';
import { tokyo } from './tokyo';
import { paris } from './paris';
import { berlin } from './berlin';

/** Order here is the order shown in the gallery. Add a pack by adding it to this list. */
export const CITIES: readonly CityPack[] = [london, tokyo, paris, berlin];

export function getCity(id: string): CityPack | undefined {
  return CITIES.find((c) => c.id === id);
}
