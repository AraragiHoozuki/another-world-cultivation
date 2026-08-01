export type ActionId = "cultivate" | "explore" | "gather" | "alchemy" | "market" | "rest";
export type ActionCategory = "innate" | "location";
export type EventTrigger = ActionId | "travel";
export type LocationRole = "sanctuary" | "market" | "herbal" | "water" | "danger" | "sect" | "secret" | "settlement" | "mine" | "academy" | "rift";
export type CoreStat = "constitution" | "insight" | "spirit" | "fortune";
export type ResourceKey =
  | "health"
  | "stamina"
  | "lifespan"
  | "age"
  | "battlePower"
  | "qi"
  | "mind"
  | "cultivation"
  | "spiritStones"
  | "herbs"
  | "pills";
export type Tone = "neutral" | "good" | "danger" | "mystic";

/** Item quality runs from nine品 (common) to one品 (highest). */
export type ItemRarity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ItemCategory = "consumable" | "material" | "artifact" | "quest";

export type AiProviderFormat = "openai" | "claude";

export interface AiSettings {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  format: AiProviderFormat;
  model: string;
}

export interface AiGeneratedOutcome {
  title?: string;
  text: string;
  tone: Tone;
  effects: Effect[];
  relationshipDelta?: number;
}

export type WorldSize = "small" | "medium" | "large" | "custom";
export type WorldDanger = "calm" | "balanced" | "perilous";

export interface WorldOptions {
  size: WorldSize;
  danger: WorldDanger;
  locationCount: number;
}

export interface CoreStats {
  constitution: number;
  insight: number;
  spirit: number;
  fortune: number;
}

export interface Resources {
  /** Legacy alias retained for imported saves and existing event definitions. */
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  lifespan: number;
  age: number;
  battlePower: number;
  qi: number;
  maxQi: number;
  mind: number;
  maxMind: number;
  cultivation: number;
  cultivationRequired: number;
  spiritStones: number;
  herbs: number;
  pills: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  price: number;
  sellPrice: number;
  effects?: Effect[];
  stackable?: boolean;
}

export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface OriginDefinition {
  id: string;
  name: string;
  description: string;
  unlockAt: number;
  stats?: Partial<CoreStats>;
  resources?: Partial<Resources>;
}

export interface SpiritRootDefinition {
  id: string;
  name: string;
  description: string;
  cultivationBonus: number;
  alchemyBonus?: number;
  explorationBonus?: number;
  stats?: Partial<CoreStats>;
}

export interface TalentDefinition {
  id: string;
  name: string;
  description: string;
  unlockAt: number;
  stats?: Partial<CoreStats>;
  resources?: Partial<Resources>;
  cultivationBonus?: number;
  dangerModifier?: number;
}

export interface CharacterCandidate {
  id: string;
  origin: OriginDefinition;
  spiritRoot: SpiritRootDefinition;
  talent: TalentDefinition;
  stats: CoreStats;
  resources: Resources;
}

export interface Character {
  name: string;
  origin: OriginDefinition;
  spiritRoot: SpiritRootDefinition;
  talent: TalentDefinition;
  stats: CoreStats;
}

export type NpcIdentity = "wanderer" | "sect" | "merchant" | "alchemist" | "hunter" | "hermit" | "artisan";
export type NpcGender = "male" | "female" | "unknown";
export type NpcRelationshipType = "friend" | "mentor" | "disciple" | "swornSibling" | "spouse" | "rival";
export type NpcInteractionId =
  | "converse"
  | "gift"
  | "spar"
  | "assist"
  | "consult"
  | "visit"
  | "seekMentor"
  | "acceptDisciple"
  | "swear"
  | "propose"
  | "dissolve";

export interface NpcIdentityDefinition {
  id: NpcIdentity;
  name: string;
  description: string;
  roles: LocationRole[];
  minStage: number;
  maxStage: number;
  powerBase: number;
  powerPerStage: number;
  relationshipBias: number;
}

export interface NpcInteractionDefinition {
  id: NpcInteractionId;
  name: string;
  description: string;
  resourceCost?: Partial<Record<ResourceKey, number>>;
  durationDays?: number;
  minRelationship?: number;
  setsRelationship?: NpcRelationshipType;
  clearsRelationship?: boolean;
}

export interface Npc {
  id: string;
  name: string;
  gender: NpcGender;
  personality: string[];
  identity: NpcIdentity;
  description: string;
  age: number;
  lifespan: number;
  stats: CoreStats;
  realmStage: number;
  battlePower: number;
  locationId: string;
  relationship: number;
  relationshipType?: NpcRelationshipType;
  attention: boolean;
  alive: boolean;
  deathTurn?: number;
  lastInteractionTurn?: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  remaining: number;
  stats?: Partial<CoreStats>;
  cultivationBonus?: number;
  dangerModifier?: number;
}

export type Effect =
  | { type: "resource"; key: ResourceKey; amount: number }
  | { type: "stat"; key: CoreStat; amount: number }
  | { type: "status"; status: StatusEffect }
  | { type: "flag"; key: string };

export interface Requirement {
  resource?: Partial<Record<ResourceKey, number>>;
  stat?: Partial<Record<CoreStat, number>>;
  minStage?: number;
  flag?: string;
}

export interface EventOutcome {
  weight: number;
  text: string;
  tone?: Tone;
  effects: Effect[];
}

export interface EventResultChange {
  label: string;
  amount: number;
}

export interface EventResult {
  kind?: "event" | "action";
  title: string;
  text: string;
  tone: Tone;
  changes: EventResultChange[];
  durationDays?: number;
}

export interface EventChoice {
  id: string;
  label: string;
  hint: string;
  requirement?: Requirement;
  outcomes: EventOutcome[];
}

export interface EventDefinition {
  id: string;
  title: string;
  body: string;
  actions: EventTrigger[];
  choices: EventChoice[];
  /** Optional automatic outcome for events that do not require a choice. */
  outcomes?: EventOutcome[];
  weight?: number;
  minStage?: number;
  maxStage?: number;
  once?: boolean;
  requireFlag?: string;
  excludeFlag?: string;
  locationRoles?: LocationRole[];
  durationDays?: number;
}

export interface WorldLocation {
  id: string;
  role: LocationRole;
  name: string;
  subtitle: string;
  description: string;
  danger: "安稳" | "尚可" | "凶险" | "绝险";
  icon: "home" | "market" | "forest" | "water" | "ruins" | "sect" | "star";
  actions: ActionId[];
  modifiers?: LocationModifiers;
  connections: string[];
  unlockStage: number;
  travelCost: number;
  position: { x: number; y: number };
}

export interface LocationModifiers {
  /** Additive cultivation multiplier, e.g. 0.25 means 25% more cultivation. */
  cultivationBonus?: number;
  /** Action-specific additive multiplier used by location actions. */
  actionBonuses?: Partial<Record<ActionId, number>>;
  /** Actions that cannot be performed here, including innate actions. */
  blockedActions?: ActionId[];
}

export interface WorldMapState {
  generation: number;
  currentLocationId: string;
  locations: WorldLocation[];
  options: WorldOptions;
}

export interface ChronicleEntry {
  id: string;
  turn: number;
  title: string;
  text: string;
  tone: Tone;
  kind?: "event" | "action";
  detail?: string;
  locationName?: string;
  changes?: EventResultChange[];
  durationDays?: number;
}

export type EndReason = "ascension" | "foundation" | "curse" | "fallen";

export interface RunSummary {
  reason: EndReason;
  title: string;
  epitaph: string;
  score: number;
  insightEarned: number;
}

export interface GameState {
  version: 1;
  seed: number;
  rngState: number;
  status: "playing" | "ended";
  turn: number;
  realmStage: number;
  world: WorldMapState;
  npcs: Npc[];
  character: Character;
  resources: Resources;
  inventory: InventoryEntry[];
  statuses: StatusEffect[];
  flags: string[];
  seenEvents: Record<string, number>;
  pendingEventId?: string;
  /** Remaining destination ids for an automatically planned multi-hop journey. */
  travelPlan?: string[];
  eventResult?: EventResult;
  chronicle: ChronicleEntry[];
  summary?: RunSummary;
  legacyClaimed: boolean;
}

export interface MetaProgress {
  version: 1;
  totalInsight: number;
  completedRuns: number;
  victories: number;
  discoveredEvents: string[];
  bestScore: number;
}

export interface SaveEnvelope {
  version: 1;
  exportedAt: string;
  game: GameState | null;
  meta: MetaProgress;
}

export interface ActionDefinition {
  id: ActionId;
  category: ActionCategory;
  name: string;
  description: string;
  risk: string;
  eventChance: number;
  durationDays: number;
  durationRange?: { min: number; max: number; step: number };
}

export interface MarketOption {
  id: "buyHerbs" | "buyPill" | "sellHerbs";
  name: string;
  description: string;
  requirement: Requirement;
}
