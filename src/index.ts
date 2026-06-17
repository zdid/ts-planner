/**
 * ts-planner — Point d'entrée
 * Gestionnaire de planifications et macros domotiques
 * Communication avec ollama-sim via MQTT
 */

import mqtt from "mqtt";
import { handleCommande }    from "./handler";
import { setPublisher }      from "./scheduler";
import { listPlanifications} from "./store";
import { schedulePlanification } from "./scheduler";
import { MqttReponse }       from "./types";

const MQTT_HOST      = process.env.MQTT_HOST  || "192.168.1.51";
const MQTT_PORT      = process.env.MQTT_PORT  || "1883";
const MQTT_USER      = process.env.MQTT_USER  || "";
const MQTT_PASS      = process.env.MQTT_PASS  || "";

const TOPIC_COMMANDE  = "domotique/mistral/commande";
const TOPIC_REPONSE   = "domotique/mistral/reponse";
const TOPIC_EXECUTION = "domotique/mistral/execution";

// ─── Connexion MQTT ───────────────────────────────────────────────────────────

const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
  clientId:        "ts-planner",
  username:        MQTT_USER || undefined,
  password:        MQTT_PASS || undefined,
  clean:           true,
  reconnectPeriod: 3000,
});

// Injecter le publisher dans le scheduler
setPublisher((topic, payload) => client.publish(topic, payload, { qos: 1 }));

client.on("connect", () => {
  console.log(`[mqtt] Connecté à ${MQTT_HOST}:${MQTT_PORT}`);
  client.subscribe(TOPIC_COMMANDE, { qos: 1 }, (err) => {
    if (err) console.error("[mqtt] Erreur subscription :", err);
    else     console.log(`[mqtt] Abonné à ${TOPIC_COMMANDE}`);
  });

  // Reprogrammer les planifications actives au démarrage
  restoreSchedules();
});

client.on("error",      (e) => console.error("[mqtt] Erreur :", e));
client.on("reconnect",  ()  => console.log("[mqtt] Reconnexion..."));
client.on("disconnect", ()  => console.log("[mqtt] Déconnecté"));

// ─── Traitement des messages ───────────────────────────────────────────────────

client.on("message", async (topic, buffer) => {
  if (topic !== TOPIC_COMMANDE) return;

  let payload: any;
  try {
    payload = JSON.parse(buffer.toString());
  } catch {
    console.error("[mqtt] Payload JSON invalide");
    return;
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[mqtt] ← type=${payload.type}  corr=${String(payload.correlation_id).slice(0,8)}...`);
  console.log(JSON.stringify(payload, null, 2));

  const reponse: MqttReponse = await handleCommande(payload);

  console.log(`[mqtt] → ${reponse.message}`);
  client.publish(TOPIC_REPONSE, JSON.stringify(reponse), { qos: 1 });
});

// ─── Restauration au démarrage ────────────────────────────────────────────────

function restoreSchedules() {
  const plans = listPlanifications().filter(p => p.active);
  if (plans.length === 0) {
    console.log("[startup] Aucune planification active à restaurer");
    return;
  }
  console.log(`[startup] Restauration de ${plans.length} planification(s) active(s)`);
  plans.forEach(p => schedulePlanification(p));
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

console.log("═".repeat(60));
console.log("  ts-planner démarré");
console.log(`  MQTT      : ${MQTT_HOST}:${MQTT_PORT}`);
console.log(`  Commandes : ${TOPIC_COMMANDE}`);
console.log(`  Réponses  : ${TOPIC_REPONSE}`);
console.log(`  Exécution : ${TOPIC_EXECUTION}`);
console.log("═".repeat(60));
