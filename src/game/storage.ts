import {
  DEFAULT_WORLD_OPTIONS,
  battlePowerForStage,
  cultivationRequiredForStage,
  emptyMeta,
  generateNpcs,
  generateWorld,
  initializeQuestSystem,
  lifespanForStage,
  maxMindForStage,
  maxStaminaForStage,
  qiCapacityForStage,
} from "./engine";
import { REALMS, itemMap, traitMap } from "./data";
import type { AiProviderFormat, AiSettings, CoreStats, GameState, MetaProgress, Npc, Resources, SaveEnvelope, TraitDefinition, TraitRarity } from "./types";

const GAME_KEY = "another-world.game.v1";
const META_KEY = "another-world.meta.v1";
const AI_KEY = "another-world.ai.v1";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  endpoint: "",
  apiKey: "",
  format: "openai",
  model: "gpt-4o-mini",
  questGeneration: "manual",
};

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return candidate.version === 1 && typeof candidate.turn === "number" && !!candidate.character && !!candidate.resources;
}

function isMeta(value: unknown): value is MetaProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MetaProgress>;
  return candidate.version === 1 && typeof candidate.totalInsight === "number" && Array.isArray(candidate.discoveredEvents);
}

function normalizeMeta(meta: MetaProgress): MetaProgress {
  const completedRuns = typeof meta.completedRuns === "number" && Number.isFinite(meta.completedRuns) ? Math.max(0, Math.floor(meta.completedRuns)) : 0;
  const storedLevel = typeof meta.simulationLevel === "number" && Number.isFinite(meta.simulationLevel) ? Math.floor(meta.simulationLevel) : 1;
  return { ...meta, completedRuns, simulationLevel: Math.max(1, storedLevel, completedRuns + 1) };
}

function isAiSettings(value: unknown): value is AiSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AiSettings>;
  return typeof candidate.enabled === "boolean"
    && typeof candidate.endpoint === "string"
    && typeof candidate.apiKey === "string"
    && (candidate.format === "openai" || candidate.format === "claude")
    && typeof candidate.model === "string"
    && (candidate.questGeneration === undefined || candidate.questGeneration === "off" || candidate.questGeneration === "manual" || candidate.questGeneration === "continuous");
}

const TRAIT_RARITIES: TraitRarity[] = ["gray", "white", "green", "blue", "purple", "rainbow"];
const TRAIT_STAT_KEYS: Array<keyof CoreStats> = ["constitution", "insight", "spirit", "fortune"];
const TRAIT_RESOURCE_KEYS: Array<keyof Resources> = ["health", "maxHealth", "stamina", "maxStamina", "lifespan", "battlePower", "qi", "maxQi", "mind", "maxMind", "spiritStones", "herbs", "pills"];

function normalizeTrait(value: unknown): TraitDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<TraitDefinition>;
  if (typeof source.id !== "string" || typeof source.name !== "string" || typeof source.description !== "string") return undefined;
  const rarity = TRAIT_RARITIES.includes(source.rarity as TraitRarity) ? source.rarity as TraitRarity : "white";
  const cost = typeof source.cost === "number" && Number.isFinite(source.cost) ? Math.max(1, Math.min(8, Math.round(source.cost))) : 1;
  const stats: Partial<CoreStats> = {};
  TRAIT_STAT_KEYS.forEach((key) => {
    const amount = source.stats?.[key];
    if (typeof amount === "number" && Number.isFinite(amount)) stats[key] = Math.max(-3, Math.min(5, Math.round(amount)));
  });
  const resources: Partial<Resources> = {};
  TRAIT_RESOURCE_KEYS.forEach((key) => {
    const amount = source.resources?.[key];
    if (typeof amount === "number" && Number.isFinite(amount)) resources[key] = Math.max(-300, Math.min(500, Math.round(amount)));
  });
  const finiteBonus = (valueToCheck: unknown) => typeof valueToCheck === "number" && Number.isFinite(valueToCheck) ? Math.max(-0.25, Math.min(0.5, valueToCheck)) : undefined;
  return {
    id: source.id.slice(0, 96),
    name: source.name.trim().slice(0, 36) || "无名命格",
    description: source.description.trim().slice(0, 180) || "一条尚未被命名的命运伏笔。",
    rarity,
    cost,
    stats: Object.keys(stats).length ? stats : undefined,
    resources: Object.keys(resources).length ? resources : undefined,
    cultivationBonus: finiteBonus(source.cultivationBonus),
    alchemyBonus: finiteBonus(source.alchemyBonus),
    explorationBonus: finiteBonus(source.explorationBonus),
    dangerModifier: finiteBonus(source.dangerModifier),
  };
}

function normalizeGame(game: GameState): GameState {
  const legacy = game.resources as GameState["resources"] & Partial<{
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
  }>;
  const realmStage = typeof game.realmStage === "number" ? Math.max(1, Math.min(REALMS.length, Math.round(game.realmStage))) : 1;
  const maxStamina = typeof legacy.maxStamina === "number" ? legacy.maxStamina : (typeof legacy.maxHealth === "number" ? legacy.maxHealth : maxStaminaForStage(realmStage));
  const stamina = typeof legacy.stamina === "number" ? legacy.stamina : (typeof legacy.health === "number" ? legacy.health : maxStamina);
  const maxQi = typeof legacy.maxQi === "number" ? legacy.maxQi : qiCapacityForStage(realmStage);
  const qi = typeof legacy.qi === "number" ? legacy.qi : maxQi;
  const maxMind = typeof legacy.maxMind === "number" ? legacy.maxMind : maxMindForStage(realmStage);
  const mind = typeof legacy.mind === "number" ? legacy.mind : maxMind;
  const resources = {
    ...legacy,
    maxStamina,
    stamina,
    lifespan: typeof legacy.lifespan === "number" ? legacy.lifespan : Math.max(lifespanForStage(realmStage), (legacy.age ?? 18) + 40),
    age: typeof legacy.age === "number" ? legacy.age : 18 + game.turn / 365,
    battlePower: typeof legacy.battlePower === "number" ? legacy.battlePower : battlePowerForStage(realmStage),
    qi,
    maxQi,
    mind,
    maxMind,
    cultivation: typeof legacy.cultivation === "number" ? legacy.cultivation : 0,
    cultivationRequired: typeof legacy.cultivationRequired === "number" ? legacy.cultivationRequired : cultivationRequiredForStage(realmStage),
    herbs: typeof legacy.herbs === "number" ? Math.max(0, Math.floor(legacy.herbs)) : 0,
    pills: typeof legacy.pills === "number" ? Math.max(0, Math.floor(legacy.pills)) : 0,
  };
  const savedOptions = game.world?.options;
  const options = savedOptions && ["small", "medium", "large", "custom"].includes(savedOptions.size) && ["calm", "balanced", "perilous"].includes(savedOptions.danger)
    ? {
      ...savedOptions,
      locationCount: Math.max(5, Math.min(100, Math.round(savedOptions.locationCount || 7))),
      aiContentChance: typeof savedOptions.aiContentChance === "number" && Number.isFinite(savedOptions.aiContentChance)
        ? Math.max(0, Math.min(1, savedOptions.aiContentChance))
        : DEFAULT_WORLD_OPTIONS.aiContentChance,
    }
    : DEFAULT_WORLD_OPTIONS;
  const world = game.world?.locations?.length && game.world.currentLocationId
    ? { ...game.world, options }
    : generateWorld(game.seed, DEFAULT_WORLD_OPTIONS);
  const rawNpcs = (game as Partial<GameState>).npcs;
  const defaultStats: CoreStats = { constitution: 3, insight: 3, spirit: 3, fortune: 3 };
  const savedNpcs: Npc[] = Array.isArray(rawNpcs)
    ? rawNpcs.flatMap((rawNpc) => {
      if (!rawNpc || typeof rawNpc !== "object") return [];
      const npc = rawNpc as Partial<Npc>;
      if (typeof npc.id !== "string" || typeof npc.name !== "string" || typeof npc.relationship !== "number") return [];
      const locationId = typeof npc.locationId === "string" && world.locations.some((location) => location.id === npc.locationId)
        ? npc.locationId
        : world.locations[0]?.id;
      if (!locationId) return [];
      const stats = npc.stats && typeof npc.stats === "object"
        ? {
          constitution: Number.isFinite(npc.stats.constitution) ? Math.max(1, Math.round(npc.stats.constitution)) : defaultStats.constitution,
          insight: Number.isFinite(npc.stats.insight) ? Math.max(1, Math.round(npc.stats.insight)) : defaultStats.insight,
          spirit: Number.isFinite(npc.stats.spirit) ? Math.max(1, Math.round(npc.stats.spirit)) : defaultStats.spirit,
          fortune: Number.isFinite(npc.stats.fortune) ? Math.max(1, Math.round(npc.stats.fortune)) : defaultStats.fortune,
        }
        : { ...defaultStats };
      const age = typeof npc.age === "number" && Number.isFinite(npc.age) ? Math.max(0, npc.age) : 24;
      const lifespan = typeof npc.lifespan === "number" && Number.isFinite(npc.lifespan) ? Math.max(age + 1, npc.lifespan) : Math.max(age + 1, 100);
      return [{
        ...npc,
        gender: npc.gender === "male" || npc.gender === "female" ? npc.gender : "unknown",
        personality: Array.isArray(npc.personality) && npc.personality.length ? npc.personality.filter((item): item is string => typeof item === "string").slice(0, 3) : ["沉稳"],
        identity: npc.identity ?? "wanderer",
        description: typeof npc.description === "string" ? npc.description : "来自异界的过客。",
        age,
        lifespan,
        stats,
        realmStage: typeof npc.realmStage === "number" ? Math.max(1, Math.min(REALMS.length - 1, Math.round(npc.realmStage))) : 1,
        battlePower: typeof npc.battlePower === "number" ? Math.max(1, Math.round(npc.battlePower)) : 20,
        locationId,
        relationship: Math.max(-100, Math.min(100, Math.round(npc.relationship))),
        relationshipType: npc.relationshipType,
        attention: Boolean(npc.attention),
        alive: npc.alive !== false,
        deathTurn: typeof npc.deathTurn === "number" ? npc.deathTurn : undefined,
      } as Npc];
    })
    : [];
  const npcs = savedNpcs.length ? savedNpcs : generateNpcs(game.seed, world.locations);
  const rawInventory = (game as Partial<GameState>).inventory;
  const rawGeneratedItems = (game as Partial<GameState>).generatedItems;
  const generatedItemIds = new Set(Array.isArray(rawGeneratedItems) ? rawGeneratedItems.flatMap((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? [(item as { id: string }).id] : []) : []);
  const inventory = Array.isArray(rawInventory)
    ? rawInventory.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const itemId = (entry as Partial<{ itemId: unknown }>).itemId;
      const quantity = (entry as Partial<{ quantity: unknown }>).quantity;
      if (typeof itemId !== "string" || (!itemMap.has(itemId) && !generatedItemIds.has(itemId)) || typeof quantity !== "number" || !Number.isFinite(quantity)) return [];
      const normalizedQuantity = Math.floor(quantity);
      return normalizedQuantity > 0 ? [{ itemId, quantity: normalizedQuantity }] : [];
    })
    : [];
  const inventoryMap = new Map<string, number>();
  inventory.forEach((entry) => inventoryMap.set(entry.itemId, (inventoryMap.get(entry.itemId) ?? 0) + entry.quantity));
  const legacyResourceItems: Array<[string, number]> = [["spirit-herb", resources.herbs], ["barrier-pill", resources.pills]];
  legacyResourceItems.forEach(([itemId, quantity]) => {
    if (!inventoryMap.has(itemId) && quantity > 0) inventoryMap.set(itemId, quantity);
  });
  const normalizedInventory = Array.from(inventoryMap, ([itemId, quantity]) => ({ itemId, quantity })).filter((entry) => entry.quantity > 0);
  const normalizedResources = {
    ...resources,
    herbs: inventoryMap.get("spirit-herb") ?? 0,
    pills: inventoryMap.get("barrier-pill") ?? 0,
  };
  const rawTraits = (game.character as Partial<GameState["character"]>).traits;
  const character = {
    ...game.character,
    gender: game.character.gender === "male" || game.character.gender === "female" ? game.character.gender : "unknown",
    traits: Array.isArray(rawTraits) ? Array.from(new Map(rawTraits.flatMap((trait) => {
      const known = trait && typeof trait === "object" && typeof (trait as { id?: unknown }).id === "string" ? traitMap.get((trait as { id: string }).id) : undefined;
      const normalized = known ?? normalizeTrait(trait);
      return normalized ? [[normalized.id, normalized] as const] : [];
    })).values()) : [],
  } as GameState["character"];
  const travelPlan = Array.isArray(game.travelPlan)
    ? game.travelPlan.filter((id): id is string => typeof id === "string" && world.locations.some((location) => location.id === id))
    : undefined;
  const questOffers = Array.isArray((game as Partial<GameState>).questOffers) ? game.questOffers : [];
  const quests = Array.isArray((game as Partial<GameState>).quests) ? game.quests : [];
  const generatedQuests = Array.isArray((game as Partial<GameState>).generatedQuests) ? game.generatedQuests : [];
  const generatedEvents = Array.isArray((game as Partial<GameState>).generatedEvents) ? game.generatedEvents : [];
  const generatedItems = Array.isArray((game as Partial<GameState>).generatedItems) ? game.generatedItems : [];
  const normalized = { ...game, character, resources: normalizedResources, world, npcs, inventory: normalizedInventory, travelPlan: travelPlan?.length ? travelPlan : undefined, questOffers, quests, generatedQuests, generatedEvents, generatedItems } as GameState;
  return initializeQuestSystem(normalized);
}

export function loadGame(): GameState | null {
  try {
    const value = localStorage.getItem(GAME_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return isGameState(parsed) ? normalizeGame(parsed) : null;
  } catch { return null; }
}

export function loadMeta(): MetaProgress {
  try {
    const value = localStorage.getItem(META_KEY);
    if (!value) return emptyMeta();
    const parsed: unknown = JSON.parse(value);
    return isMeta(parsed) ? normalizeMeta(parsed) : emptyMeta();
  } catch { return emptyMeta(); }
}

export function saveGame(game: GameState | null): void {
  if (game) localStorage.setItem(GAME_KEY, JSON.stringify(game));
  else localStorage.removeItem(GAME_KEY);
}

export function saveMeta(meta: MetaProgress): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function loadAiSettings(): AiSettings {
  try {
    const value = localStorage.getItem(AI_KEY);
    if (!value) return { ...DEFAULT_AI_SETTINGS };
    const parsed: unknown = JSON.parse(value);
    return isAiSettings(parsed) ? { ...DEFAULT_AI_SETTINGS, ...parsed } : { ...DEFAULT_AI_SETTINGS };
  } catch { return { ...DEFAULT_AI_SETTINGS }; }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_KEY, JSON.stringify(settings));
}

export function exportSave(game: GameState | null, meta: MetaProgress): string {
  const envelope: SaveEnvelope = { version: 1, exportedAt: new Date().toISOString(), game, meta };
  return JSON.stringify(envelope, null, 2);
}

export function importSave(raw: string): SaveEnvelope {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("存档不是有效对象");
  const envelope = parsed as Partial<SaveEnvelope>;
  if (envelope.version !== 1 || !isMeta(envelope.meta)) throw new Error("存档版本无效或轮回数据损坏");
  if (envelope.game !== null && !isGameState(envelope.game)) throw new Error("本局数据损坏");
  return { ...envelope, meta: normalizeMeta(envelope.meta), game: envelope.game ? normalizeGame(envelope.game) : null } as SaveEnvelope;
}
