const RAD = Math.PI / 180;

/** minutes east of UTC for a time zone at a given instant */
export function zoneOffsetMinutes(timeZone: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - (at.getTime() - at.getSeconds() * 1000 - at.getMilliseconds())) / 60000);
}

/** the wall-clock minute of the day (0..1439) in a time zone */
export function localMinute(timeZone: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m + at.getSeconds() / 60;
}

/** approximate local sunrise and sunset (minutes into the day), used until the forecast answers */
export function sunTimes(latitude: number, longitude: number, timeZone: string, at = new Date()) {
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  const day = Math.floor((at.getTime() - start) / 86400000);
  const decl = 23.44 * RAD * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const b = (2 * Math.PI * (day - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const lat = latitude * RAD;
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD;
  const noonUtc = 720 - 4 * longitude - eot;
  const offset = zoneOffsetMinutes(timeZone, at);
  const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
  return { sunrise: wrap(noonUtc - hourAngle * 4 + offset), sunset: wrap(noonUtc + hourAngle * 4 + offset) };
}
