import type { City } from '../content';
import { clamp } from '../util/math';
import { sunTimes } from './solar';

export interface Conditions {
  cover: number;
  fog: number;
  rain: number;
  snow: number;
  /** cloud drift speed multiplier from the wind */
  drift: number;
  wind: number;
  temperatureC: number | null;
  code: number | null;
  sunrise: number;
  sunset: number;
  checkedAt: number;
}

export type WeatherChoice = 'sunny' | 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow';

export const WEATHER_PRESETS: Record<WeatherChoice, Partial<Conditions>> = {
  sunny: { cover: 0.04, fog: 0, rain: 0, snow: 0, code: 0 },
  clear: { cover: 0.14, fog: 0, rain: 0, snow: 0, code: 1 },
  cloudy: { cover: 0.88, fog: 0, rain: 0, snow: 0, code: 3 },
  fog: { cover: 0.55, fog: 1, rain: 0, snow: 0, code: 45 },
  rain: { cover: 0.95, fog: 0.1, rain: 0.8, snow: 0, code: 61 },
  snow: { cover: 0.9, fog: 0.15, rain: 0, snow: 0.8, code: 73 },
};

export function placeholderConditions(city: City): Conditions {
  const { sunrise, sunset } = sunTimes(city.latitude, city.longitude, city.timeZone);
  return { cover: 0.32, fog: 0, rain: 0, snow: 0, drift: 1, wind: 8, temperatureC: null, code: null, sunrise, sunset, checkedAt: 0 };
}

const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** current conditions from Open-Meteo (no key needed); throws on network or parse failure */
export async function fetchConditions(city: City, signal?: AbortSignal): Promise<Conditions> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${city.latitude}&longitude=${city.longitude}` +
    '&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,visibility,precipitation' +
    `&daily=sunrise,sunset&timezone=${encodeURIComponent(city.timeZone)}&forecast_days=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const data = await res.json();
  const cur = data.current;
  const code: number = cur.weather_code;
  const visibility: number = cur.visibility ?? 20000;
  const rain =
    code >= 95 ? 1 : code >= 80 && code <= 82 ? 0.7 : code >= 61 && code <= 67 ? 0.55 + 0.15 * ((code - 61) / 2) : code >= 51 && code <= 57 ? 0.35 : 0;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86 ? 0.75 : 0;
  return {
    cover: clamp((cur.cloud_cover ?? 30) / 100),
    fog: code === 45 || code === 48 ? 1 : clamp((4000 - visibility) / 3200, 0, 0.8),
    rain: clamp(rain),
    snow,
    wind: cur.wind_speed_10m ?? 8,
    drift: 0.5 + (cur.wind_speed_10m ?? 8) / 20,
    temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
    code,
    sunrise: minutesOf(data.daily.sunrise[0]),
    sunset: minutesOf(data.daily.sunset[0]),
    checkedAt: Date.now(),
  };
}

export function weatherWords(code: number | null, isDay: boolean): string {
  if (code === null) return 'the weather';
  if (code === 0) return isDay ? 'sunny' : 'clear';
  if (code === 1) return isDay ? 'mostly sunny' : 'mostly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code === 85 || code === 86) return 'snow showers';
  if (code >= 95) return 'thunderstorm';
  return 'the weather';
}
