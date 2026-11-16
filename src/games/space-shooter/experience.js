/**
 * Lifetime experience. Level 0 costs 200 XP; each later level costs ×1.5,
 * rounded down. The same integer division is in supabase/schema.sql
 * (xp_to_next), so the database and the bar agree.
 */
export function xpToNext(level) {
  return Math.floor((200 * 3 ** level) / 2 ** level);
}

export function progressFromXp(totalXp) {
  const xp = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 0;
  let spent = 0;
  let cost = xpToNext(level);
  while (xp - spent >= cost) {
    spent += cost;
    level += 1;
    cost = xpToNext(level);
  }
  return { xp, level, intoLevel: xp - spent, xpToNext: cost };
}

export function xpForLevel(level) {
  const target = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0));
  let total = 0;
  for (let i = 0; i < target; i += 1) total += xpToNext(i);
  return total;
}

export function grantXp(totalXp, amount) {
  const gained = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  return progressFromXp(totalXp + gained);
}
