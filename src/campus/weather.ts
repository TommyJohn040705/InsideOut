/**
 * Current weather on campus (Open-Meteo: free, no key, no personal data sent — only the campus
 * centre). Bad weather makes trips prefer indoor connections and tunnels.
 */
const URL_ = 'https://api.open-meteo.com/v1/forecast?latitude=43.4723&longitude=-80.5449&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=America%2FToronto';

export interface CampusWeather { tempC: number; precipMm: number; code: number; windKmh: number; bad: boolean; label: string }

const KIND: [number[], string][] = [
  [[45, 48], 'Fog'], [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'Snow'], [[95, 96, 99], 'Thunderstorm'],
];

/** Pure: is this weather worth staying indoors for, and how to say it. */
export function classifyWeather(tempC: number, precipMm: number, code: number, windKmh: number): CampusWeather {
  const kind = KIND.find(([codes]) => codes.includes(code))?.[1];
  const wet = precipMm > 0 || (kind != null && kind !== 'Fog');
  const cold = tempC <= -10, hot = tempC >= 32, windy = windKmh >= 50;
  const what = wet ? kind || 'Rain' : cold ? 'Very cold' : hot ? 'Very hot' : windy ? 'Strong wind' : kind || 'Clear';
  return { tempC, precipMm, code, windKmh, bad: wet || cold || hot || windy, label: `${what}, ${Math.round(tempC)} °C` };
}

let cache: { at: number; w: CampusWeather | null } | null = null;

/** Null when offline or the service fails; trips then use the normal indoor preference. Cached 10 min. */
export async function campusWeather(): Promise<CampusWeather | null> {
  if (cache && Date.now() - cache.at < 600_000) return cache.w;
  let w: CampusWeather | null = null;
  try {
    const r = await fetch(URL_, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const c = (await r.json()).current;
      if (c && typeof c.temperature_2m === 'number') w = classifyWeather(c.temperature_2m, c.precipitation ?? 0, c.weather_code ?? 0, c.wind_speed_10m ?? 0);
    }
  } catch { /* offline: no weather */ }
  cache = { at: Date.now(), w };
  return w;
}
