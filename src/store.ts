/**
 * Store avec persistance JSON sur disque.
 * Les macros et planifications survivent aux redémarrages.
 */

import * as fs   from "fs";
import * as path from "path";
import { MacroDefinition, PlanificationDefinition } from "./types";

const DATA_DIR  = process.env.DATA_DIR || "./data";
const MACRO_FILE = path.join(DATA_DIR, "macros.json");
const PLAN_FILE  = path.join(DATA_DIR, "planifications.json");

// ─── Init ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const macros         = new Map<string, MacroDefinition>();
const planifications = new Map<string, PlanificationDefinition>();

function loadFromDisk() {
  try {
    if (fs.existsSync(MACRO_FILE)) {
      const data: MacroDefinition[] = JSON.parse(fs.readFileSync(MACRO_FILE, "utf-8"));
      data.forEach(m => macros.set(m.name.toLowerCase(), m));
      console.log(`[store] ${macros.size} macro(s) chargée(s)`);
    }
  } catch (e) { console.error("[store] Erreur chargement macros :", e); }

  try {
    if (fs.existsSync(PLAN_FILE)) {
      const data: PlanificationDefinition[] = JSON.parse(fs.readFileSync(PLAN_FILE, "utf-8"));
      data.forEach(p => planifications.set(p.name.toLowerCase(), p));
      console.log(`[store] ${planifications.size} planification(s) chargée(s)`);
    }
  } catch (e) { console.error("[store] Erreur chargement planifications :", e); }
}

function saveMacrosToDisk() {
  fs.writeFileSync(MACRO_FILE, JSON.stringify([...macros.values()], null, 2), "utf-8");
}

function savePlansToDisk() {
  fs.writeFileSync(PLAN_FILE, JSON.stringify([...planifications.values()], null, 2), "utf-8");
}

// Chargement au démarrage
loadFromDisk();

// ─── Macros ───────────────────────────────────────────────────────────────────

export function saveMacro(macro: MacroDefinition): void {
  macros.set(macro.name.toLowerCase(), macro);
  saveMacrosToDisk();
  console.log(`[store] Macro sauvegardée : "${macro.name}"`);
}

export function getMacro(name: string): MacroDefinition | undefined {
  return macros.get(name.toLowerCase());
}

export function deleteMacro(name: string): boolean {
  const ok = macros.delete(name.toLowerCase());
  if (ok) saveMacrosToDisk();
  return ok;
}

export function listMacros(): MacroDefinition[] {
  return [...macros.values()];
}

// ─── Planifications ───────────────────────────────────────────────────────────

export function savePlanification(plan: PlanificationDefinition): void {
  planifications.set(plan.name.toLowerCase(), plan);
  savePlansToDisk();
  console.log(`[store] Planification sauvegardée : "${plan.name}"`);
}

export function getPlanification(name: string): PlanificationDefinition | undefined {
  return planifications.get(name.toLowerCase());
}

export function deletePlanification(name: string): boolean {
  const ok = planifications.delete(name.toLowerCase());
  if (ok) savePlansToDisk();
  return ok;
}

export function listPlanifications(): PlanificationDefinition[] {
  return [...planifications.values()];
}

export function setPlanificationActive(name: string, active: boolean): boolean {
  const plan = planifications.get(name.toLowerCase());
  if (!plan) return false;
  plan.active = active;
  planifications.set(name.toLowerCase(), plan);
  savePlansToDisk();
  return true;
}

export function updatePlanification(name: string, changes: Partial<PlanificationDefinition>): boolean {
  const plan = planifications.get(name.toLowerCase());
  if (!plan) return false;
  const updated = { ...plan, ...changes };
  planifications.set(name.toLowerCase(), updated);
  savePlansToDisk();
  return true;
}

// ─── Contexte pour Mistral ────────────────────────────────────────────────────

export function getContextForMistral(): object {
  return {
    macros: listMacros().map(m => ({
      name:        m.name,
      steps_count: m.steps.length,
      steps:       m.steps,
    })),
    planifications: listPlanifications().map(p => ({
      name:   p.name,
      active: p.active,
      phrase: p.phrase_originale,
    })),
  };
}
