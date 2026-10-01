// Everything a person might want to change lives here: the owner's name, the letter, the cities.

export const OWNER = 'Juno';

export const SITE_TITLE = `${OWNER}'s Pocket Friends`;

export const LOADING_LINE = 'Checking every coat pocket for my keys.';

export interface LetterContent {
  /** 'today' prints the visitor's date; any other string is printed as is */
  date: string;
  address: string[];
  greeting: string;
  /** paragraphs are wrapped to the letter's width automatically */
  paragraphs: string[];
  signOff: string;
  signature: string;
}

export const LETTER: LetterContent = {
  date: 'today',
  address: ['For the kind stranger', 'holding these keys'],
  greeting: 'Hello there,',
  paragraphs: [
    'You have found my keys, and with them five very small roommates. Each one lives in a glass pebble. None of them pays rent.',
    'Mochi is the pink one, mostly nap and partly rice cake. Pom hops if you hum. Nimbus is a cloud who rains a little when he dreams. Tako waves with every arm at once, so please wave back. Shroom is in charge. Nobody voted.',
    'They like sunsets, a gentle swing and being held up to the light. They do not like pockets.',
    'If you can, bring them home. The brass key knows the door, and the little tag knows my name.',
  ],
  signOff: 'Warmly,',
  signature: OWNER,
};

/** characters per typed line on the letter */
export const LETTER_COLUMNS = 36;

export type TempUnit = 'F' | 'C';
export type LandmarkKind = 'goldenGate' | 'shanghai' | 'beijing' | 'shenzhen' | 'tokyo' | 'london';

export interface City {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  unit: TempUnit;
  landmark: LandmarkKind;
}

export const CITIES: City[] = [
  { id: 'sf', name: 'San Francisco', latitude: 37.7749, longitude: -122.4194, timeZone: 'America/Los_Angeles', unit: 'F', landmark: 'goldenGate' },
  { id: 'shanghai', name: 'Shanghai', latitude: 31.2304, longitude: 121.4737, timeZone: 'Asia/Shanghai', unit: 'C', landmark: 'shanghai' },
  { id: 'beijing', name: 'Beijing', latitude: 39.9042, longitude: 116.4074, timeZone: 'Asia/Shanghai', unit: 'C', landmark: 'beijing' },
  { id: 'shenzhen', name: 'Shenzhen', latitude: 22.5431, longitude: 114.0579, timeZone: 'Asia/Shanghai', unit: 'C', landmark: 'shenzhen' },
  { id: 'tokyo', name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, timeZone: 'Asia/Tokyo', unit: 'C', landmark: 'tokyo' },
  { id: 'london', name: 'London', latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London', unit: 'C', landmark: 'london' },
];

export const DEFAULT_CITY = 'sf';
