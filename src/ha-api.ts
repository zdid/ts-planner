/**
 * Client API REST Home Assistant.
 * Exécute les actions retournées par Mistral.
 */

import https from "https";
import http  from "http";
import { ExecutionStep } from "./types";

const HA_URL   = process.env.HA_URL   || "http://192.168.1.51:8123";
const HA_TOKEN = process.env.HA_TOKEN || "";

// ─── Requête HTTP vers HA ─────────────────────────────────────────────────────

async function haRequest(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const url     = new URL(HA_URL + path);
    const payload = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        "Authorization": `Bearer ${HA_TOKEN}`,
        "Content-Type":  "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end",  () => {
        try   { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Exécution d'un step ──────────────────────────────────────────────────────

export async function executeStep(step: ExecutionStep): Promise<void> {
  if (step.type === "wait") {
    const ms = (step.seconds || 0) * 1000;
    console.log(`[ha-api] Attente ${step.seconds}s (résolu depuis: ${step.resolved_from || "fixe"})`);
    await sleep(ms);
    return;
  }

  if (step.type === "action" && step.order) {
    console.log(`[ha-api] Exécution : "${step.order}"`);
    // On envoie l'ordre à Mistral pour qu'il le convertisse en appel HA
    // TODO : appel direct HA si l'ordre est déjà un service connu
    await callHaConversation(step.order);
  }
}

// ─── Exécution d'une séquence complète ───────────────────────────────────────

export async function executeSequence(steps: ExecutionStep[]): Promise<void> {
  console.log(`[ha-api] Début séquence (${steps.length} étapes)`);
  for (const step of steps) {
    if (step.delay_before_seconds > 0) {
      await sleep(step.delay_before_seconds * 1000);
    }
    await executeStep(step);
  }
  console.log(`[ha-api] Séquence terminée`);
}

// ─── Appels HA directs ────────────────────────────────────────────────────────

export async function turnOn(entity_id: string): Promise<void> {
  await haRequest("POST", "/api/services/homeassistant/turn_on", { entity_id });
}

export async function turnOff(entity_id: string): Promise<void> {
  await haRequest("POST", "/api/services/homeassistant/turn_off", { entity_id });
}

export async function getState(entity_id: string): Promise<any> {
  return haRequest("GET", `/api/states/${entity_id}`);
}

export async function getAllStates(): Promise<any[]> {
  return haRequest("GET", "/api/states");
}

export async function callService(
  domain: string, service: string, data: object
): Promise<void> {
  await haRequest("POST", `/api/services/${domain}/${service}`, data);
}

// ─── Conversation HA (pour les ordres en langage naturel) ────────────────────

async function callHaConversation(text: string): Promise<string> {
  try {
    const result = await haRequest("POST", "/api/conversation/process", {
      text,
      language: "fr",
    });
    return result?.response?.speech?.plain?.speech || "ok";
  } catch (e) {
    console.error(`[ha-api] Erreur conversation : ${e}`);
    return "erreur";
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
