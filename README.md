# ts-planner

Gestionnaire de planifications et macros domotiques.
Communique avec `ollama-sim` via MQTT.

## Installation

```bash
cd ts-planner
npm install
```

## Démarrage

```bash
# Développement
MQTT_HOST=192.168.1.51 npm run dev

# Production
npm run build
MQTT_HOST=192.168.1.51 npm start
```

## Variables d'environnement

| Variable    | Défaut        | Description          |
|-------------|---------------|----------------------|
| MQTT_HOST   | 192.168.1.51  | Broker MQTT          |
| MQTT_PORT   | 1883          | Port MQTT            |
| MQTT_USER   |               | Utilisateur MQTT     |
| MQTT_PASS   |               | Mot de passe MQTT    |

## Topics MQTT

| Topic                        | Direction      | Description                    |
|------------------------------|----------------|--------------------------------|
| domotique/mistral/commande   | proxy → TS     | JSON structuré de Mistral      |
| domotique/mistral/reponse    | TS → proxy     | Confirmation texte             |
| domotique/mistral/execution  | TS → proxy     | Déclenchement planifié         |

## Structure

```
src/
├── index.ts      ← point d'entrée, connexion MQTT
├── types.ts      ← types TypeScript partagés
├── store.ts      ← stockage macros et planifications
├── handler.ts    ← traitement des commandes
└── scheduler.ts  ← moteur de planification (timers)
```

## Ce qui reste à implémenter

- [ ] Persistance (fichier JSON ou SQLite)
- [ ] Appels API Home Assistant pour exécution
- [ ] Déclencheurs : date précise, recurrence_complex, window
- [ ] Gestion modification partielle d'une planification
- [ ] Rechargement des planifications au redémarrage
