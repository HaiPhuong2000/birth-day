/** Lenient day/month[/year] birthday matcher. birthday = YYYY-MM-DD. */
export function matchBirthday(input: string, birthday: string): boolean {
  const b = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(birthday.trim());
  if (!b) return false;
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];

  const groups = input.trim().match(/\d+/g);
  if (!groups || /[^\d\s/.\-]/.test(input.trim())) return false;

  const [g0 = '', g1 = '', g2] = groups;
  let d: string, m: string, y: string | undefined;
  if (groups.length === 1) {
    if (g0.length === 8) [d, m, y] = [g0.slice(0, 2), g0.slice(2, 4), g0.slice(4)];
    else if (g0.length === 4) [d, m] = [g0.slice(0, 2), g0.slice(2)];
    else return false;
  } else if (groups.length === 2 || groups.length === 3) {
    [d, m, y] = [g0, g1, g2];
  } else return false;

  if (d.length > 2 || m.length > 2) return false;
  if (Number(d) !== bd || Number(m) !== bm) return false;
  if (y === undefined) return true;
  if (y.length === 4) return Number(y) === by;
  if (y.length === 2) return Number(y) === by % 100;
  return false;
}
