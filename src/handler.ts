/**
 * Traitement des commandes reçues via MQTT depuis ollama-sim.
 */

import { DomoticNode, GestionNode, MacroDefinition,
         PlanificationDefinition, MqttReponse, ExecutionPayload } from "./types";
import { saveMacro, getMacro, deleteMacro, listMacros,
         savePlanification, getPlanification, deletePlanification,
         listPlanifications, setPlanificationActive, updatePlanification } from "./store";
import { schedulePlanification, unschedulePlanification } from "./scheduler";
import { executeSequence } from "./ha-api";
import { info, error, debug } from "./logger";

export async function handleCommande(
  payload: DomoticNode & { correlation_id: string }
): Promise<MqttReponse> {

  const corr = payload.correlation_id;

  try {
    switch (payload.type) {

      // ── Macro : définition ─────────────────────────────────────────────────
      case "macro": {
        const macro = payload as MacroDefinition & { correlation_id: string };
        saveMacro(macro);
        return ok(corr, `Macro "${macro.name}" enregistrée avec ${macro.steps.length} étape(s).`);
      }

      // ── Planification : création ───────────────────────────────────────────
      case "planification": {
        const plan = payload as PlanificationDefinition & { correlation_id: string };
        savePlanification(plan);
        if (plan.active) schedulePlanification(plan);
        return ok(corr,
          `Planification "${plan.name}" enregistrée et ${plan.active ? "activée" : "désactivée"}.`
        );
      }

      // ── Gestion ───────────────────────────────────────────────────────────
      case "gestion": {
        const g = payload as GestionNode & { correlation_id: string };
        return handleGestion(corr, g);
      }

      // ── Exécution déployée (séquence plate retournée par Mistral) ──────────
      case "execution": {
        const exec = payload as ExecutionPayload & { correlation_id: string };
        const steps = exec.execution.steps;
        info(`[handler] Exécution "${exec.execution.trigger_name}" — ${steps.length} étapes`);
        executeSequence(steps).catch(e =>
          error("[handler] Erreur exécution : %s", e)
        );
        return ok(corr, `Exécution de "${exec.execution.trigger_name}" lancée.`);
      }

      default:
        return err(corr, `Type inconnu : ${(payload as any).type}`);
    }
  } catch (e: any) {
    error("[handler] Erreur : %s", e.message);
    return err(corr, `Erreur interne : ${e.message}`);
  }
}

// ─── Gestion ──────────────────────────────────────────────────────────────────

function handleGestion(corr: string, g: GestionNode): MqttReponse {
  switch (g.operation) {

    case "lister": {
      if (g.cible === "macro") {
        const list = listMacros().map(m => m.name);
        return ok(corr,
          list.length ? `Macros : ${list.join(", ")}.` : "Aucune macro enregistrée.",
          list
        );
      }
      if (g.cible === "planification") {
        const list = listPlanifications().map(p =>
          `${p.name} (${p.active ? "active" : "inactive"})`
        );
        return ok(corr,
          list.length ? `Planifications : ${list.join(", ")}.` : "Aucune planification enregistrée.",
          list
        );
      }
      if (g.cible === "tout") {
        const m = listMacros().map(m => m.name);
        const p = listPlanifications().map(p => `${p.name} (${p.active ? "✓" : "✗"})`);
        return ok(corr,
          `Macros : ${m.join(", ") || "aucune"}. Planifications : ${p.join(", ") || "aucune"}.`,
          { macros: m, planifications: p }
        );
      }
      return err(corr, `Cible inconnue : ${g.cible}`);
    }

    case "activer": {
      if (!g.name) return err(corr, "Nom requis.");
      if (g.cible === "planification") {
        if (!setPlanificationActive(g.name, true)) return err(corr, `"${g.name}" introuvable.`);
        const plan = getPlanification(g.name)!;
        schedulePlanification(plan);
        return ok(corr, `Planification "${g.name}" activée.`);
      }
      return err(corr, `Activation non supportée pour : ${g.cible}`);
    }

    case "desactiver": {
      if (!g.name) return err(corr, "Nom requis.");
      if (g.cible === "planification") {
        if (!setPlanificationActive(g.name, false)) return err(corr, `"${g.name}" introuvable.`);
        unschedulePlanification(g.name);
        return ok(corr, `Planification "${g.name}" désactivée.`);
      }
      return err(corr, `Désactivation non supportée pour : ${g.cible}`);
    }

    case "supprimer": {
      if (!g.name) return err(corr, "Nom requis.");
      if (g.cible === "macro") {
        return deleteMacro(g.name)
          ? ok(corr,  `Macro "${g.name}" supprimée.`)
          : err(corr, `Macro "${g.name}" introuvable.`);
      }
      if (g.cible === "planification") {
        unschedulePlanification(g.name);
        return deletePlanification(g.name)
          ? ok(corr,  `Planification "${g.name}" supprimée.`)
          : err(corr, `Planification "${g.name}" introuvable.`);
      }
      return err(corr, `Suppression non supportée pour : ${g.cible}`);
    }

    case "modifier": {
      if (!g.name) return err(corr, "Nom requis.");
      if (g.cible === "planification") {
        if (!g.modifications) return err(corr, "Modifications requises.");
        const updated = updatePlanification(g.name, g.modifications as any);
        if (!updated) return err(corr, `"${g.name}" introuvable.`);
        // Reprogrammer si active
        const plan = getPlanification(g.name);
        if (plan?.active) {
          unschedulePlanification(g.name);
          schedulePlanification(plan);
        }
        return ok(corr, `Planification "${g.name}" modifiée.`);
      }
      return err(corr, `Modification non supportée pour : ${g.cible}`);
    }

    default:
      return err(corr, `Opération inconnue : ${g.operation}`);
  }
}

// ─── Helpers réponse ──────────────────────────────────────────────────────────

function ok(corr: string, message: string, data?: unknown): MqttReponse {
  info(`[handler] ✅ ${message}`);
  return { correlation_id: corr, success: true, message, data };
}

function err(corr: string, message: string): MqttReponse {
  error(`[handler] ❌ ${message}`);
  return { correlation_id: corr, success: false, message };
}