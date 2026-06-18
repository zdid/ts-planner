// ─── Types JSON partagés avec ollama-sim ──────────────────────────────────────

export interface ActionNode {
  type:  "action";
  order: string;
}

export interface WaitNode {
  type:         "wait";
  duration:     string;
  seconds?:     number;
  seconds_min?: number;
  seconds_max?: number;
}

export interface ConditionNode {
  type:  "condition";
  if:    string;
  then:  DomoticNode;
  else?: DomoticNode;
}

export interface MacroRefNode {
  type: "macro_ref";
  name: string;
}

export interface SequenceNode {
  type:  "sequence";
  steps: DomoticNode[];
}

export interface MacroDefinition {
  type:  "macro";
  name:  string;
  steps: DomoticNode[];
}

export interface Trigger {
  type:           string;
  seconds?:       number;
  seconds_min?:   number;
  seconds_max?:   number;
  at?:            string;
  at_min?:        string;
  at_max?:        string;
  on?:            string;
  every?:         string;
  days?:          string[];
  except_days?:   string[];
  pattern?:       string;
  from?:          string;
  to?:            string;
  description?:   string;
}

export interface PlanificationDefinition {
  type:             "planification";
  name:             string;
  active:           boolean;
  phrase_originale: string;
  trigger:          Trigger;
  action:           DomoticNode;
}

export interface GestionNode {
  type:           "gestion";
  operation:      "lister" | "activer" | "desactiver" | "supprimer" | "modifier";
  cible:          "planification" | "macro" | "tout";
  name?:          string;
  modifications?: Record<string, unknown>;
}

export interface ExecutionStep {
  step:                 number;
  type:                 "action" | "wait";
  order?:               string;
  seconds?:             number;
  resolved_from?:       string;
  delay_before_seconds: number;
}

export interface ExecutionPayload {
  type:      "execution";
  execution: {
    trigger_name:     string;
    triggered_at:     string;
    context_snapshot: Record<string, unknown>;
    steps:            ExecutionStep[];
  };
}

export type DomoticNode =
  | ActionNode
  | WaitNode
  | ConditionNode
  | MacroRefNode
  | SequenceNode
  | MacroDefinition
  | PlanificationDefinition
  | GestionNode
  | ExecutionPayload;

// ─── Messages MQTT ────────────────────────────────────────────────────────────

export interface MqttReponse {
  correlation_id: string;
  success:        boolean;
  message:        string;
  data?:          unknown;
}