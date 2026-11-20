import { describe, expect, it } from 'vitest';
import { classifyWeather } from '../src/campus/weather';

describe('campus weather', () => {
  it('rain, snow, deep cold, heat and strong wind are bad; mild dry weather and fog are not', () => {
    expect(classifyWeather(8, 0.4, 61, 10)).toMatchObject({ bad: true, label: 'Rain, 8 °C' });
    expect(classifyWeather(-3, 0, 73, 10)).toMatchObject({ bad: true, label: 'Snow, -3 °C' });
    expect(classifyWeather(-14, 0, 0, 5).bad).toBe(true);
    expect(classifyWeather(33, 0, 1, 5).bad).toBe(true);
    expect(classifyWeather(12, 0, 2, 55).bad).toBe(true);
    expect(classifyWeather(15, 0, 1, 10)).toMatchObject({ bad: false, label: 'Clear, 15 °C' });
    expect(classifyWeather(6, 0, 45, 5)).toMatchObject({ bad: false, label: 'Fog, 6 °C' });
  });
});
