/**
 * ts-planner — Point d'entrée
 * Gestionnaire de planifications et macros domotiques
 * Communication avec ollama-sim via MQTT
 */

import mqtt from "mqtt";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import express from "express";
import { handleCommande } from "./handler";
import { setPublisher } from "./scheduler";
import { listPlanifications } from "./store";
import { schedulePlanification } from "./scheduler";
import { MqttReponse } from "./types";
import { info, error, warn, debug } from "./logger";

const MQTT_HOST = process.env.MQTT_HOST || "192.168.1.51";
const MQTT_PORT = process.env.MQTT_PORT || "1883";
const MQTT_USER = process.env.MQTT_USER || "";
const MQTT_PASS = process.env.MQTT_PASS || "";
const RULES_FILE = process.env.RULES_FILE || join(dirname(__dirname), "../rules/regles_mistral.txt");

const TOPIC_COMMANDE = "domotique/mistral/commande";
const TOPIC_REPONSE = "domotique/mistral/reponse";
const TOPIC_EXECUTION = "domotique/mistral/execution";
const TOPIC_STATUS = "domotique/mistral/status/ts-planner"; // LWT
const TOPIC_RULES = "domotique/mistral/rules"; // Règles avec retain

// Exporter le client MQTT pour qu'il soit accessible depuis scheduler.ts
export const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
  clientId: "ts-planner",
  username: MQTT_USER || undefined,
  password: MQTT_PASS || undefined,
  clean: true,
  reconnectPeriod: 3000,
  will: {
    topic: TOPIC_STATUS,
    payload: "offline",
    qos: 1,
    retain: true,
  },
  protocolVersion: 3, // MQTT v3.1
});

// Initialiser Express pour l'API HTTP (optionnelle, pour une éventuelle gestion future)
const app = express();
app.use(express.json());

// Démarrer le serveur HTTP sur le port 3002
const HTTP_PORT = 3002;
app.listen(HTTP_PORT, () => {
  info(`[http] Serveur démarré sur le port ${HTTP_PORT}`);
});

// Injecter le publisher dans le scheduler
setPublisher((topic, payload) => client.publish(topic, payload, { qos: 1 }));

// Fonction pour publier les règles avec retain
function publishRules(): void {
  try {
    if (existsSync(RULES_FILE)) {
      const rules = readFileSync(RULES_FILE, 'utf-8');
      client.publish(TOPIC_RULES, rules, { qos: 1, retain: true });
      info(`[rules] Règles publiées sur ${TOPIC_RULES} (retain: true)`);
    } else {
      warn(`[rules] Fichier introuvable: ${RULES_FILE}`);
    }
  } catch (e: any) {
    error(`[rules] Erreur lecture: %s`, e.message);
  }
}

client.on("connect", () => {
  info(`[mqtt] Connecté à ${MQTT_HOST}:${MQTT_PORT} (MQTT v3.1)`);
  client.subscribe(TOPIC_COMMANDE, { qos: 1 }, (err) => {
    if (err) error("[mqtt] Erreur subscription: %s", err);
    else info(`[mqtt] Abonné à ${TOPIC_COMMANDE}`);
  });

  // Publier "online" pour indiquer que ts-planner est en ligne
  client.publish(TOPIC_STATUS, "online", { qos: 1, retain: true });
  info(`[mqtt] Statut publié: online`);

  // Publier les règles avec retain
  publishRules();

  // Reprogrammer les planifications actives au démarrage
  restoreSchedules();
});

client.on("error", (e) => error("[mqtt] Erreur: %s", e));
client.on("reconnect", () => info("[mqtt] Reconnexion..."));
client.on("disconnect", () => info("[mqtt] Déconnecté"));

// ─── Traitement des messages ───────────────────────────────────────────────────

client.on("message", async (topic, buffer) => {
  if (topic !== TOPIC_COMMANDE) return;

  let payload: any;
  try {
    payload = JSON.parse(buffer.toString());
  } catch {
    error("[mqtt] Payload JSON invalide");
    return;
  }

  info(`\n${"─".repeat(60)}`);
  info(`[mqtt] ← type=${payload.type}  corr=${String(payload.correlation_id).slice(0,8)}...`);
  debug(JSON.stringify(payload, null, 2));

  const reponse: MqttReponse = await handleCommande(payload);

  info(`[mqtt] → ${reponse.message}`);
  client.publish(TOPIC_REPONSE, JSON.stringify(reponse), { qos: 1 });
});

// ─── Restauration au démarrage ────────────────────────────────────────────────

function restoreSchedules() {
  const plans = listPlanifications().filter(p => p.active);
  if (plans.length === 0) {
    info("[startup] Aucune planification active à restaurer");
    return;
  }
  info(`[startup] Restauration de ${plans.length} planification(s) active(s)`);
  plans.forEach(p => schedulePlanification(p));
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

info("═".repeat(60));
info("  ts-planner démarré");
info(`  MQTT      : ${MQTT_HOST}:${MQTT_PORT}`);
info(`  Commandes : ${TOPIC_COMMANDE}`);
info(`  Réponses  : ${TOPIC_REPONSE}`);
info(`  Exécution : ${TOPIC_EXECUTION}`);
info(`  Statut    : ${TOPIC_STATUS}`);
info(`  Règles    : ${TOPIC_RULES}`);
info("═".repeat(60));