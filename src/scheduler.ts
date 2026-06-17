/**
 * Moteur de planification — surveille les déclencheurs.
 * Publie sur domotique/mistral/execution quand un déclencheur est atteint.
 */

import { PlanificationDefinition, Trigger } from "./types";

let _publish: ((topic: string, payload: string) => void) | null = null;
const TOPIC_EXECUTION = "domotique/mistral/execution";
const timers = new Map<string, NodeJS.Timeout>();

export function setPublisher(fn: (topic: string, payload: string) => void) {
  _publish = fn;
}

// ─── Planifier ────────────────────────────────────────────────────────────────

export function schedulePlanification(plan: PlanificationDefinition): void {
  unschedulePlanification(plan.name);

  const ms = triggerToMs(plan.trigger);
  if (ms === null) {
    console.warn(`[scheduler] Déclencheur non supporté : "${plan.name}" → ${plan.trigger.type}`);
    return;
  }

  const recurring = isRecurring(plan.trigger);

  const fire = () => {
    console.log(`[scheduler] 🔔 Déclenchement : "${plan.name}"`);
    _publish?.(TOPIC_EXECUTION, JSON.stringify({
      type:          "execution_request",
      planification: plan,
      triggered_at:  new Date().toISOString(),
    }));

    if (recurring) {
      const next = triggerToMs(plan.trigger);
      if (next !== null) {
        const t = setTimeout(fire, next);
        timers.set(plan.name.toLowerCase(), t);
        console.log(`[scheduler] Prochain déclenchement "${plan.name}" dans ${Math.round(next/1000)}s`);
      }
    } else {
      timers.delete(plan.name.toLowerCase());
    }
  };

  const timer = setTimeout(fire, ms);
  timers.set(plan.name.toLowerCase(), timer);
  console.log(`[scheduler] "${plan.name}" programmée dans ${Math.round(ms/1000)}s (${plan.trigger.type})`);
}

export function unschedulePlanification(name: string): void {
  const key   = name.toLowerCase();
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
    console.log(`[scheduler] "${name}" annulée`);
  }
}

export function listScheduled(): string[] {
  return [...timers.keys()];
}

// ─── Calcul du délai en ms ────────────────────────────────────────────────────

function triggerToMs(trigger: Trigger): number | null {
  const now = new Date();

  switch (trigger.type) {

    // ── Délai relatif ─────────────────────────────────────────────────────────
    case "delay": {
      if (trigger.seconds !== undefined) return trigger.seconds * 1000;
      if (trigger.seconds_min !== undefined && trigger.seconds_max !== undefined) {
        const s = randInt(trigger.seconds_min, trigger.seconds_max);
        console.log(`[scheduler] Aléatoire : ${s}s (${trigger.seconds_min}-${trigger.seconds_max})`);
        return s * 1000;
      }
      return null;
    }

    // ── Heure fixe (quotidien) ────────────────────────────────────────────────
    case "time": {
      const atStr = (trigger.at_min && trigger.at_max)
        ? randTime(trigger.at_min, trigger.at_max)
        : trigger.at;
      if (!atStr) return null;
      return msUntilTime(atStr, now);
    }

    // ── Date précise ─────────────────────────────────────────────────────────
    case "date": {
      if (!trigger.on) return null;
      const [year, month, day] = trigger.on.split("-").map(Number);
      const target = new Date(year, month - 1, day);
      if (trigger.at) {
        const [h, m] = trigger.at.split(":").map(Number);
        target.setHours(h, m, 0, 0);
      }
      const diff = target.getTime() - now.getTime();
      return diff > 0 ? diff : null;
    }

    // ── Récurrence journalière avec jours ─────────────────────────────────────
    case "recurrence": {
      if (!trigger.at) return null;
      const atStr = (trigger.at_min && trigger.at_max)
        ? randTime(trigger.at_min, trigger.at_max)
        : trigger.at;
      const target = new Date(now);
      const [h, m] = atStr.split(":").map(Number);
      target.setHours(h, m, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      // Avancer jusqu'au prochain jour autorisé
      for (let i = 0; i < 7; i++) {
        const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][target.getDay()];
        const allowed   = !trigger.days        || trigger.days.includes(dayKey);
        const excluded  = trigger.except_days?.includes(dayKey);
        if (allowed && !excluded) break;
        target.setDate(target.getDate() + 1);
      }
      return target.getTime() - now.getTime();
    }

    // ── Récurrence complexe ───────────────────────────────────────────────────
    case "recurrence_complex": {
      const target = resolveComplexPattern(trigger.pattern || "", trigger.at, trigger.at_min, trigger.at_max, now);
      return target ? target.getTime() - now.getTime() : null;
    }

    // ── Plage active ─────────────────────────────────────────────────────────
    case "window": {
      if (!trigger.from) return null;
      return msUntilTime(trigger.from, now);
    }

    // ── Durée ─────────────────────────────────────────────────────────────────
    case "duration": {
      if (trigger.seconds !== undefined) return trigger.seconds * 1000;
      if (trigger.seconds_min !== undefined && trigger.seconds_max !== undefined) {
        return randInt(trigger.seconds_min, trigger.seconds_max) * 1000;
      }
      return null;
    }

    default:
      console.warn(`[scheduler] Type non géré : ${trigger.type}`);
      return null;
  }
}

// ─── Patterns complexes ───────────────────────────────────────────────────────

function resolveComplexPattern(
  pattern: string,
  at?: string,
  at_min?: string,
  at_max?: string,
  now: Date = new Date()
): Date | null {
  const atStr = (at_min && at_max) ? randTime(at_min, at_max) : (at || "00:00");
  const [h, m] = atStr.split(":").map(Number);

  const setTime = (d: Date) => { d.setHours(h, m, 0, 0); return d; };

  if (pattern === "last_day_of_month") {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0); // dernier jour du mois
    setTime(d);
    if (d <= now) {
      const next = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      setTime(next);
      return next;
    }
    return d;
  }

  if (pattern.startsWith("first_") || pattern.startsWith("last_")) {
    const parts    = pattern.split("_");
    const position = parts[0];  // first | last
    const dayName  = parts[1];  // monday | tuesday | ...
    const days: Record<string,number> = {
      sunday:0, monday:1, tuesday:2, wednesday:3,
      thursday:4, friday:5, saturday:6
    };
    const targetDay = days[dayName];
    if (targetDay === undefined) return null;

    const d = findNthWeekday(now.getFullYear(), now.getMonth(), targetDay, position === "first" ? 1 : -1);
    setTime(d);
    if (d <= now) {
      const nextMonth = now.getMonth() + 1;
      const nextYear  = nextMonth > 11 ? now.getFullYear() + 1 : now.getFullYear();
      const d2 = findNthWeekday(nextYear, nextMonth % 12, targetDay, position === "first" ? 1 : -1);
      setTime(d2);
      return d2;
    }
    return d;
  }

  return null;
}

function findNthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    // Premier weekday du mois, puis avancer
    const d = new Date(year, month, 1);
    while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + (nth - 1) * 7);
    return d;
  } else {
    // Dernier weekday du mois : partir de la fin
    const d = new Date(year, month + 1, 0);
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return d;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msUntilTime(timeStr: string, from: Date): number {
  const [h, m]  = timeStr.split(":").map(Number);
  const target  = new Date(from);
  target.setHours(h, m, 0, 0);
  if (target <= from) target.setDate(target.getDate() + 1);
  return target.getTime() - from.getTime();
}

function isRecurring(trigger: Trigger): boolean {
  return ["recurrence", "recurrence_complex", "window", "time"].includes(trigger.type);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randTime(from: string, to: string): string {
  const [h1, m1] = from.split(":").map(Number);
  const [h2, m2] = to.split(":").map(Number);
  const rand = randInt(h1 * 60 + m1, h2 * 60 + m2);
  return `${String(Math.floor(rand / 60)).padStart(2,"0")}:${String(rand % 60).padStart(2,"0")}`;
}
