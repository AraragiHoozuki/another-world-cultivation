import { ACTIONS, EVENTS, INITIAL_INVENTORY, ITEMS, LOCATION_POOLS, NPC_GIVEN_NAMES, NPC_INTERACTIONS, NPC_PERSONALITIES, NPC_SURNAMES, ORIGINS, QUESTS, REALMS, SPIRIT_ROOTS, TALENTS, TRAITS, eventMap, identityForRole, NPC_IDENTITIES, itemMap, questMap } from "./data";
import type {
  ActionId,
  AiGeneratedContentBundle,
  AiGeneratedLocationDraft,
  AiGeneratedOutcome,
  CharacterCandidate,
  CharacterGender,
  ChronicleEntry,
  CoreStats,
  Effect,
  EventChoice,
  EventDefinition,
  EventResult,
  EventTrigger,
  EventResultChange,
  GameState,
  InventoryEntry,
  ItemDefinition,
  LocationRole,
  LocationModifiers,
  MetaProgress,
  Npc,
  NpcGender,
  NpcInteractionId,
  NpcRelationshipType,
  QuestChoice,
  QuestDefinition,
  QuestOffer,
  QuestProgress,
  QuestStageDefinition,
  Requirement,
  ResourceKey,
  Resources,
  RunSummary,
  Tone,
  TraitDefinition,
  TraitRarity,
  WorldLocation,
  WorldMapState,
  WorldOptions,
} from "./types";

export const DEFAULT_WORLD_OPTIONS: WorldOptions = { size: "medium", danger: "balanced", locationCount: 7, aiContentChance: 0.3 };
export const DAYS_PER_YEAR = 365;
const CULTIVATION_QI_COST_PER_DAY = 2;
const CULTIVATION_MIND_COST_PER_DAY = 1;
const REALM_QI_CAPACITY = [20, 140, 980, 6860, 48020, 336140] as const;
// Different resources grow at different rates. Qi follows the steepest curve;
// physical and mental capacity, lifespan, and combat power grow more slowly.
const REALM_STAMINA_CAPACITY = [70, 110, 180, 300, 500, 850] as const;
const REALM_MIND_CAPACITY = [55, 100, 180, 330, 600, 1080] as const;
const REALM_LIFESPAN = [80, 150, 300, 600, 1200, 2400] as const;
const REALM_BATTLE_POWER = [40, 100, 250, 625, 1560, 3900] as const;
// Each major realm needs roughly seven times the cultivation of the previous
// one, matching the order of magnitude of the qi-capacity curve.
const REALM_CULTIVATION_REQUIRED = [40, 280, 1960, 13720, 96040, 672280] as const;

function realmCurveValue(curve: readonly number[], stage: number, terminalMultiplier: number): number {
  const normalizedStage = Math.max(1, Math.min(REALMS.length, Math.round(stage)));
  if (normalizedStage >= REALMS.length) {
    const terminal = curve[curve.length - 1] * terminalMultiplier;
    return Math.round(terminal);
  }
  const majorRealm = Math.min(curve.length - 1, Math.floor((normalizedStage - 1) / 9));
  const layer = (normalizedStage - 1) % 9;
  const start = curve[majorRealm];
  const end = curve[majorRealm + 1] ?? start * terminalMultiplier;
  return Math.max(start, Math.round(start + (end - start) * (layer / 9)));
}

/** Returns the intended maximum qi for a realm layer, including gradual layer growth. */
export function qiCapacityForStage(stage: number): number {
  const normalizedStage = Math.max(1, Math.min(REALMS.length, Math.round(stage)));
  const majorRealm = Math.min(REALM_QI_CAPACITY.length - 1, Math.floor((normalizedStage - 1) / 9));
  const layer = (normalizedStage - 1) % 9;
  const start = REALM_QI_CAPACITY[majorRealm];
  const end = REALM_QI_CAPACITY[majorRealm + 1] ?? start * 7;
  return Math.max(start, Math.round(start + (end - start) * (layer / 9)));
}

export function maxStaminaForStage(stage: number): number {
  return realmCurveValue(REALM_STAMINA_CAPACITY, stage, 1.8);
}

export function maxMindForStage(stage: number): number {
  return realmCurveValue(REALM_MIND_CAPACITY, stage, 1.8);
}

export function lifespanForStage(stage: number): number {
  return realmCurveValue(REALM_LIFESPAN, stage, 1.8);
}

export function battlePowerForStage(stage: number): number {
  return realmCurveValue(REALM_BATTLE_POWER, stage, 1.8);
}

export function cultivationRequiredForStage(stage: number): number {
  return realmCurveValue(REALM_CULTIVATION_REQUIRED, stage, 7);
}

/** Cultivation income scales sub-linearly so higher realms take longer without becoming unreachable. */
export function cultivationGainMultiplierForStage(stage: number): number {
  return Math.sqrt(cultivationRequiredForStage(stage) / cultivationRequiredForStage(1));
}

export const emptyMeta = (): MetaProgress => ({
  version: 1,
  totalInsight: 0,
  completedRuns: 0,
  simulationLevel: 1,
  victories: 0,
  discoveredEvents: [],
  bestScore: 0,
});

export interface SimulationProgression {
  level: number;
  optionCount: number;
  startingCost: number;
  refreshCost: number;
  rarityLuck: number;
}

export function getSimulationProgression(meta: MetaProgress): SimulationProgression {
  const level = Math.max(1, Math.min(20, Math.round(meta.simulationLevel ?? meta.completedRuns + 1)));
  return {
    level,
    optionCount: Math.min(12, 5 + Math.min(7, level - 1)),
    startingCost: 8 + (level - 1) * 2,
    refreshCost: 1 + Math.floor((level - 1) / 4),
    rarityLuck: level - 1,
  };
}

const baseStats = (): CoreStats => ({ constitution: 4, insight: 4, spirit: 4, fortune: 4 });
const baseResources = (): Resources => ({
  health: maxStaminaForStage(1),
  maxHealth: maxStaminaForStage(1),
  stamina: maxStaminaForStage(1),
  maxStamina: maxStaminaForStage(1),
  lifespan: lifespanForStage(1),
  age: 18,
  battlePower: battlePowerForStage(1),
  qi: qiCapacityForStage(1),
  maxQi: qiCapacityForStage(1),
  mind: maxMindForStage(1),
  maxMind: maxMindForStage(1),
  cultivation: 0,
  cultivationRequired: cultivationRequiredForStage(1),
  spiritStones: 10,
  herbs: 1,
  pills: 0,
});

export function nextRandom(state: number): [number, number] {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const next = x >>> 0 || 0x9e3779b9;
  return [next / 4294967296, next];
}

/** Consume one deterministic roll to decide whether an event creates new AI-authored content. */
export function rollAiContentChance(game: GameState): { game: GameState; shouldGenerate: boolean } {
  const chance = Math.max(0, Math.min(1, game.world.options?.aiContentChance ?? DEFAULT_WORLD_OPTIONS.aiContentChance ?? 0));
  let roll: number;
  let rngState: number;
  [roll, rngState] = nextRandom(game.rngState);
  return { game: { ...game, rngState }, shouldGenerate: roll < chance };
}

function draw<T>(items: T[], state: number): [T, number] {
  const [roll, next] = nextRandom(state);
  return [items[Math.floor(roll * items.length)] ?? items[0], next];
}

function addPartial<T extends object>(base: T, patch?: Partial<T>): T {
  const result = { ...base };
  if (patch) Object.entries(patch).forEach(([key, value]) => {
    const typedKey = key as keyof T;
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const baseValue = result[typedKey];
    const numericBase = typeof baseValue === "number" && Number.isFinite(baseValue) ? baseValue : 0;
    result[typedKey] = (numericBase + value) as T[keyof T];
  });
  return result;
}

const TRAIT_RARITY_WEIGHTS: Record<TraitRarity, number> = {
  gray: 34,
  white: 29,
  green: 20,
  blue: 11,
  purple: 5,
  rainbow: 1,
};

function weightedTraitDraw(pool: TraitDefinition[], rngState: number, luck: number): [TraitDefinition, number] {
  const total = pool.reduce((sum, trait) => {
    const rarityIndex = ["gray", "white", "green", "blue", "purple", "rainbow"].indexOf(trait.rarity);
    return sum + TRAIT_RARITY_WEIGHTS[trait.rarity] * (1 + luck * rarityIndex * 0.12);
  }, 0);
  let roll: number; let rng: number;
  [roll, rng] = nextRandom(rngState);
  let cursor = roll * total;
  for (const trait of pool) {
    const rarityIndex = ["gray", "white", "green", "blue", "purple", "rainbow"].indexOf(trait.rarity);
    cursor -= TRAIT_RARITY_WEIGHTS[trait.rarity] * (1 + luck * rarityIndex * 0.12);
    if (cursor <= 0) return [trait, rng];
  }
  return [pool[pool.length - 1] ?? TRAITS[0], rng];
}

export function createTraitOptions(seed: number, meta: MetaProgress): TraitDefinition[] {
  const progression = getSimulationProgression(meta);
  let rng = (seed ^ 0x7f4a7c15 ^ (progression.level * 0x45d9f3b)) >>> 0 || 0x2468ace1;
  const options: TraitDefinition[] = [];
  while (options.length < progression.optionCount && options.length < TRAITS.length) {
    const available = TRAITS.filter((trait) => !options.some((option) => option.id === trait.id));
    const [trait, next] = weightedTraitDraw(available, rng, progression.rarityLuck);
    rng = next;
    if (!trait) break;
    options.push(trait);
  }
  return options;
}

export function applyStartingTraits(candidate: CharacterCandidate, traits: TraitDefinition[]): CharacterCandidate {
  const selected = Array.from(new Map(traits.filter((trait) => trait && typeof trait.id === "string").map((trait) => [trait.id, trait])).values());
  const traitStats = selected.reduce((stats, trait) => addPartial(stats, trait.stats), {} as CoreStats);
  const traitResources = selected.reduce((resources, trait) => addPartial(resources, trait.resources), {} as Partial<Resources>);
  const finiteBonus = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const traitCultivation = selected.reduce((sum, trait) => sum + finiteBonus(trait.cultivationBonus), 0);
  const traitAlchemy = selected.reduce((sum, trait) => sum + finiteBonus(trait.alchemyBonus), 0);
  const traitExploration = selected.reduce((sum, trait) => sum + finiteBonus(trait.explorationBonus), 0);
  const traitDanger = selected.reduce((sum, trait) => sum + finiteBonus(trait.dangerModifier), 0);
  const stats = addPartial(candidate.stats, traitStats);
  const resources = addPartial(candidate.resources, traitResources);
  resources.maxStamina = Math.max(resources.maxStamina, resources.maxHealth);
  resources.maxHealth = resources.maxStamina;
  resources.stamina = Math.max(0, Math.min(resources.maxStamina, resources.stamina));
  resources.health = resources.stamina;
  resources.maxQi = Math.max(1, resources.maxQi);
  resources.qi = Math.max(0, Math.min(resources.maxQi, resources.qi));
  resources.maxMind = Math.max(1, resources.maxMind);
  resources.mind = Math.max(0, Math.min(resources.maxMind, resources.mind));
  resources.battlePower += (traitStats.constitution ?? 0) * 4 + (traitStats.spirit ?? 0) * 2;
  return {
    ...candidate,
    stats,
    resources,
    spiritRoot: {
      ...candidate.spiritRoot,
      cultivationBonus: candidate.spiritRoot.cultivationBonus + traitCultivation,
      alchemyBonus: (candidate.spiritRoot.alchemyBonus ?? 0) + traitAlchemy,
      explorationBonus: (candidate.spiritRoot.explorationBonus ?? 0) + traitExploration,
    },
    talent: { ...candidate.talent, dangerModifier: (candidate.talent.dangerModifier ?? 0) + traitDanger },
  };
}

export function createCandidates(seed: number, meta: MetaProgress): CharacterCandidate[] {
  const origins = ORIGINS.filter((item) => item.unlockAt <= meta.totalInsight);
  const talents = TALENTS.filter((item) => item.unlockAt <= meta.totalInsight);
  let rng = seed >>> 0 || 0x12345678;
  const candidates: CharacterCandidate[] = [];
  for (let i = 0; i < 3; i += 1) {
    let origin: (typeof ORIGINS)[number];
    let root: (typeof SPIRIT_ROOTS)[number];
    let talent: (typeof TALENTS)[number];
    [origin, rng] = draw(origins, rng);
    [root, rng] = draw(SPIRIT_ROOTS, rng);
    [talent, rng] = draw(talents, rng);
    while (candidates.some((candidate) => candidate.origin.id === origin.id && candidate.talent.id === talent.id)) {
      [talent, rng] = draw(talents, rng);
    }
    const stats = addPartial(addPartial(addPartial(baseStats(), origin.stats), root.stats), talent.stats);
    const resources = addPartial(addPartial(baseResources(), origin.resources), talent.resources);
    resources.health = Math.min(resources.health, resources.maxHealth);
    resources.stamina = resources.health;
    resources.maxStamina = resources.maxHealth;
    resources.battlePower += stats.constitution * 4 + stats.spirit * 2;
    resources.mind = Math.min(resources.mind, resources.maxMind);
    candidates.push({ id: `${seed}-${i}`, origin, spiritRoot: root, talent, stats, resources });
  }
  return candidates;
}

const WORLD_ROLES: LocationRole[] = ["sanctuary", "market", "herbal", "settlement", "water", "danger", "sect", "mine", "academy", "secret", "rift"];
const WORLD_SIZE_COUNT: Record<WorldOptions["size"], number> = { small: 5, medium: 7, large: 9, custom: 30 };
const WORLD_DANGER_MODIFIER: Record<WorldOptions["danger"], number> = { calm: -0.16, balanced: 0, perilous: 0.16 };
const LOCATION_ROLE_DEFAULTS: Record<LocationRole, LocationModifiers> = {
  sanctuary: { cultivationBonus: 0.08 },
  market: { actionBonuses: { market: 0.1 } },
  herbal: { actionBonuses: { gather: 0.25 } },
  water: { actionBonuses: { gather: 0.08 } },
  danger: { actionBonuses: { explore: 0.15 }, blockedActions: ["rest"] },
  sect: { cultivationBonus: 0.28, actionBonuses: { alchemy: 0.12 } },
  secret: { cultivationBonus: 0.4, actionBonuses: { explore: 0.2 }, blockedActions: ["rest"] },
  settlement: { actionBonuses: { market: 0.18 } },
  mine: { actionBonuses: { gather: 0.35 }, blockedActions: ["rest"] },
  academy: { cultivationBonus: 0.32, actionBonuses: { alchemy: 0.18 } },
  rift: { cultivationBonus: 0.5, actionBonuses: { explore: 0.25 }, blockedActions: ["rest"] },
};

function locationModifiers(location: WorldLocation): LocationModifiers {
  const defaults = LOCATION_ROLE_DEFAULTS[location.role];
  const custom = location.modifiers;
  return {
    ...defaults,
    ...custom,
    actionBonuses: { ...(defaults.actionBonuses ?? {}), ...(custom?.actionBonuses ?? {}) },
    blockedActions: [...new Set([...(defaults.blockedActions ?? []), ...(custom?.blockedActions ?? [])])],
  };
}

export function getLocationModifiers(location: WorldLocation): LocationModifiers {
  return locationModifiers(location);
}

export function generateWorld(seed: number, options: WorldOptions = DEFAULT_WORLD_OPTIONS): WorldMapState {
  let rng = (seed ^ 0xa511e9b3) >>> 0 || 0x6d2b79f5;
  let mirrorRoll; [mirrorRoll, rng] = nextRandom(rng);
  const mirrored = mirrorRoll > 0.5;
  const locationCount = Math.max(5, Math.min(100, Math.round(options.locationCount || WORLD_SIZE_COUNT[options.size])));
  const gridColumns = Math.ceil(Math.sqrt(locationCount));
  const gridRows = Math.ceil(locationCount / gridColumns);
  const usedTemplateIds = new Set<string>();
  const locations: WorldLocation[] = Array.from({ length: locationCount }, (_, index) => {
    const role = WORLD_ROLES[index % WORLD_ROLES.length];
    const available = LOCATION_POOLS[role].filter((item) => !usedTemplateIds.has(item.id));
    let template; [template, rng] = draw(available.length ? available : LOCATION_POOLS[role], rng);
    const locationId = usedTemplateIds.has(template.id) ? `${template.id}-${index + 1}` : template.id;
    usedTemplateIds.add(template.id);
    let jitterX; let jitterY;
    [jitterX, rng] = nextRandom(rng); [jitterY, rng] = nextRandom(rng);
    const column = index % gridColumns;
    const row = Math.floor(index / gridColumns);
    const stagger = row % 2 === 1 && gridColumns > 1 ? 0.35 : 0;
    const slot = {
      x: gridColumns === 1 ? 50 : 8 + ((column + stagger) / (gridColumns - 1)) * 84,
      y: gridRows === 1 ? 50 : 10 + (row / (gridRows - 1)) * 80,
    };
    const cellWidth = 84 / Math.max(1, gridColumns - 1);
    const cellHeight = 80 / Math.max(1, gridRows - 1);
    const jitterXRange = Math.min(10, cellWidth * 0.32);
    const jitterYRange = Math.min(10, cellHeight * 0.32);
    return {
      ...template,
      id: locationId,
      actions: [...template.actions],
      modifiers: locationModifiers({ ...template, connections: [], position: { x: 0, y: 0 } }),
      connections: [],
      position: {
        x: Math.max(7, Math.min(93, (mirrored ? 100 - slot.x : slot.x) + (jitterX - 0.5) * jitterXRange)),
        y: Math.max(12, Math.min(88, slot.y + (jitterY - 0.5) * jitterYRange)),
      },
    };
  });
  const connect = (a: number, b: number) => {
    const first = locations[a]; const second = locations[b];
    if (!first.connections.includes(second.id)) first.connections.push(second.id);
    if (!second.connections.includes(first.id)) second.connections.push(first.id);
  };
  const distance = (a: WorldLocation, b: WorldLocation) => ((a.position.x - b.position.x) ** 2) + ((a.position.y - b.position.y) ** 2);
  // Build a short-edge spanning tree first, then add a few local loops for a less linear world.
  for (let index = 1; index < locations.length; index += 1) {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < index; candidate += 1) {
      const candidateDistance = distance(locations[index], locations[candidate]);
      if (candidateDistance < nearestDistance) { nearest = candidate; nearestDistance = candidateDistance; }
    }
    connect(index, nearest);
  }
  for (let index = 0; index < locations.length; index += 1) {
    const neighbors = locations
      .map((location, candidate) => ({ candidate, distance: candidate === index ? Number.POSITIVE_INFINITY : distance(locations[index], location) }))
      .sort((left, right) => left.distance - right.distance);
    let loopRoll; [loopRoll, rng] = nextRandom(rng);
    if (neighbors[1] && loopRoll < 0.42) connect(index, neighbors[1].candidate);
  }
  return { generation: seed, currentLocationId: locations[0].id, locations, options };
}

export function generateNpcs(seed: number, locations: WorldLocation[]): Npc[] {
  if (!locations.length) return [];
  let rng = (seed ^ 0x4f1bbcdc) >>> 0 || 0x13579bdf;
  const count = Math.max(6, Math.min(80, Math.round(locations.length * 1.5)));
  const placements = locations.slice();
  while (placements.length < count) {
    let location; [location, rng] = draw(locations, rng);
    placements.push(location);
  }
  const usedNames = new Set<string>();
  return placements.map((location, index) => {
    const available = identityForRole(location.role);
    let identity; [identity, rng] = draw(available.length ? available : NPC_IDENTITIES, rng);
    const minStage = Math.max(1, location.unlockStage, identity.minStage);
    const maxStage = Math.max(minStage, Math.min(REALMS.length - 1, identity.maxStage));
    let stageRoll; [stageRoll, rng] = nextRandom(rng);
    const realmStage = minStage + Math.floor(stageRoll * (maxStage - minStage + 1));
    let powerRoll; [powerRoll, rng] = nextRandom(rng);
    const stats: CoreStats = {
      constitution: Math.max(1, Math.round(3 + realmStage * 0.08 + powerRoll * 4)),
      insight: Math.max(1, Math.round(3 + realmStage * 0.07 + powerRoll * 4)),
      spirit: Math.max(1, Math.round(3 + realmStage * 0.06 + powerRoll * 4)),
      fortune: Math.max(1, Math.round(2 + powerRoll * 6)),
    };
    let genderRoll; [genderRoll, rng] = nextRandom(rng);
    const gender: NpcGender = genderRoll < 0.47 ? "male" : genderRoll < 0.94 ? "female" : "unknown";
    let personalityRoll; [personalityRoll, rng] = nextRandom(rng);
    const firstPersonality = NPC_PERSONALITIES[Math.floor(personalityRoll * NPC_PERSONALITIES.length)] ?? NPC_PERSONALITIES[0];
    let secondPersonalityRoll; [secondPersonalityRoll, rng] = nextRandom(rng);
    const secondPersonality = NPC_PERSONALITIES[Math.floor(secondPersonalityRoll * NPC_PERSONALITIES.length)] ?? NPC_PERSONALITIES[1];
    const personality = firstPersonality === secondPersonality ? [firstPersonality] : [firstPersonality, secondPersonality];
    let ageRoll; [ageRoll, rng] = nextRandom(rng);
    const age = Math.round((16 + ageRoll * (identity.id === "hermit" ? 95 : 58)) * 10) / 10;
    let lifespanRoll; [lifespanRoll, rng] = nextRandom(rng);
    const lifespan = Math.round(Math.max(age + 8, 68 + stats.constitution * 3 + lifespanRoll * 44) * 10) / 10;
    const battlePower = Math.max(8, Math.round(identity.powerBase + realmStage * identity.powerPerStage + powerRoll * 12 + stats.constitution * 2 + stats.spirit));
    let surname; let given; [surname, rng] = draw(NPC_SURNAMES, rng); [given, rng] = draw(NPC_GIVEN_NAMES, rng);
    let name = `${surname}${given}`;
    let nameRolls = 0;
    while (usedNames.has(name) && nameRolls < 8) {
      [surname, rng] = draw(NPC_SURNAMES, rng); [given, rng] = draw(NPC_GIVEN_NAMES, rng);
      name = `${surname}${given}`;
      nameRolls += 1;
    }
    if (usedNames.has(name)) name = `${name}${index + 1}`;
    usedNames.add(name);
    let relationRoll; [relationRoll, rng] = nextRandom(rng);
    const relationship = Math.max(-20, Math.min(20, identity.relationshipBias + Math.floor((relationRoll - 0.5) * 12)));
    return {
      id: `npc-${seed}-${index}`,
      name,
      gender,
      personality,
      identity: identity.id,
      description: identity.description,
      age,
      lifespan,
      stats,
      realmStage,
      battlePower,
      locationId: location.id,
      relationship,
      attention: false,
      alive: true,
    };
  });
}

const RESOURCE_ITEM_IDS = { herbs: "spirit-herb", pills: "barrier-pill" } as const;

export function startGame(candidate: CharacterCandidate, name: string, seed: number, worldOptions: WorldOptions = DEFAULT_WORLD_OPTIONS, gender: CharacterGender = "unknown", startingTraits: TraitDefinition[] = []): GameState {
  const enrichedCandidate = applyStartingTraits(candidate, startingTraits);
  const world = generateWorld(seed, worldOptions);
  const inventoryMap = new Map(INITIAL_INVENTORY.map((entry) => [entry.itemId, entry.quantity]));
  (Object.keys(RESOURCE_ITEM_IDS) as Array<keyof typeof RESOURCE_ITEM_IDS>).forEach((resourceKey) => {
    const itemId = RESOURCE_ITEM_IDS[resourceKey];
    const quantity = Math.max(0, Math.floor(enrichedCandidate.resources[resourceKey] ?? 0));
    if (quantity > 0) inventoryMap.set(itemId, (inventoryMap.get(itemId) ?? 0) + quantity);
  });
  const normalizedTraits = Array.from(new Map(startingTraits.filter((trait) => trait && typeof trait.id === "string").map((trait) => [trait.id, trait])).values());
  const game: GameState = {
    version: 1,
    seed,
    rngState: seed >>> 0 || 0x12345678,
    status: "playing",
    turn: 0,
    realmStage: 1,
    world,
    npcs: generateNpcs(seed, world.locations),
    character: {
      name: name.trim() || "无名",
      gender,
      origin: enrichedCandidate.origin,
      spiritRoot: enrichedCandidate.spiritRoot,
      talent: enrichedCandidate.talent,
      stats: enrichedCandidate.stats,
      traits: normalizedTraits,
    },
    resources: { ...enrichedCandidate.resources },
    inventory: Array.from(inventoryMap, ([itemId, quantity]) => ({ itemId, quantity })),
    statuses: [],
    flags: [],
    seenEvents: {},
    questOffers: [],
    quests: [],
    generatedQuests: [],
    generatedEvents: [],
    generatedItems: [],
    chronicle: [{ id: "arrival", turn: 0, title: "坠入异界", text: "醒来时，你掌心多了一道界蚀印。没有天命，也没有期限；这一生要走向哪里，由你自己决定。", tone: "mystic" }],
    legacyClaimed: false,
  };
  return initializeQuestSystem(game);
}

function hasPendingNarrative(game: GameState): boolean {
  return Boolean(game.pendingEventId || game.pendingQuestId || game.pendingEventQueue?.length);
}

function queuePendingEvent(game: GameState, eventId: string): GameState {
  if (!eventId) return game;
  if (!game.pendingEventId) return { ...game, pendingEventId: eventId };
  const queue = game.pendingEventQueue ?? [];
  if (game.pendingEventId === eventId || queue.includes(eventId)) return game;
  return { ...game, pendingEventQueue: [...queue, eventId] };
}

function promotePendingEvent(game: GameState): GameState {
  if (game.pendingEventId || !game.pendingEventQueue?.length) return game;
  const [pendingEventId, ...remaining] = game.pendingEventQueue;
  return { ...game, pendingEventId, pendingEventQueue: remaining.length ? remaining : undefined };
}

function itemDefinitions(game: GameState): ItemDefinition[] {
  return [...ITEMS, ...(game.generatedItems ?? [])].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
}

function itemDefinitionFor(game: GameState, itemId: string): ItemDefinition | undefined {
  return itemDefinitions(game).find((item) => item.id === itemId);
}

export function getItems(game: GameState): ItemDefinition[] {
  return itemDefinitions(game);
}

function eventDefinitions(game: GameState): EventDefinition[] {
  return [...EVENTS, ...(game.generatedEvents ?? [])].filter((event, index, events) => events.findIndex((candidate) => candidate.id === event.id) === index);
}

function eventDefinitionFor(game: GameState, eventId: string): EventDefinition | undefined {
  return eventDefinitions(game).find((event) => event.id === eventId);
}

export function getEventDefinition(game: GameState, eventId: string): EventDefinition | undefined {
  return eventDefinitionFor(game, eventId);
}

function questDefinitions(game: GameState): QuestDefinition[] {
  return [...QUESTS, ...(game.generatedQuests ?? [])].filter((quest, index, quests) => quests.findIndex((candidate) => candidate.id === quest.id) === index);
}

function questDefinitionFor(game: GameState, questId: string): QuestDefinition | undefined {
  return questDefinitions(game).find((quest) => quest.id === questId);
}

function effectiveStats(game: GameState): CoreStats {
  return game.statuses.reduce((stats, status) => addPartial(stats, status.stats), { ...game.character.stats });
}

function clampResources(resources: Resources): Resources {
  const stamina = Math.max(0, Math.min(resources.maxStamina, resources.stamina));
  return {
    ...resources,
    health: stamina,
    stamina,
    maxHealth: resources.maxStamina,
    qi: Math.max(0, Math.min(resources.maxQi, resources.qi)),
    mind: Math.max(0, Math.min(resources.maxMind, resources.mind)),
    cultivation: Math.max(0, resources.cultivation),
    spiritStones: Math.max(0, resources.spiritStones),
    herbs: Math.max(0, resources.herbs),
    pills: Math.max(0, resources.pills),
  };
}

function applyEffects(game: GameState, effects: Effect[]): GameState {
  let next: GameState = { ...game, resources: { ...game.resources }, character: { ...game.character, stats: { ...game.character.stats } }, statuses: [...game.statuses], flags: [...game.flags], inventory: [...(game.inventory ?? [])] };
  effects.forEach((effect) => {
    if (effect.type === "resource") {
      if (effect.key === "health" || effect.key === "stamina") {
        next.resources.stamina += effect.amount;
      } else if (effect.key === "herbs" || effect.key === "pills") {
        next = changeInventory(next, RESOURCE_ITEM_IDS[effect.key], effect.amount);
      } else {
        next.resources[effect.key] += effect.amount;
      }
    }
    if (effect.type === "stat") next.character.stats[effect.key] = Math.max(1, next.character.stats[effect.key] + effect.amount);
    if (effect.type === "status") next.statuses = [...next.statuses.filter((status) => status.id !== effect.status.id), { ...effect.status }];
    if (effect.type === "flag" && !next.flags.includes(effect.key)) next.flags.push(effect.key);
  });
  next.resources = clampResources(next.resources);
  return next;
}

function inventoryQuantity(game: GameState, itemId: string): number {
  return Math.max(0, game.inventory?.find((entry) => entry.itemId === itemId)?.quantity ?? 0);
}

function changeInventory(game: GameState, itemId: string, delta: number): GameState {
  const current = game.inventory ?? [];
  const hasEntry = current.some((entry) => entry.itemId === itemId);
  const legacyQuantity = itemId === RESOURCE_ITEM_IDS.herbs ? game.resources.herbs : itemId === RESOURCE_ITEM_IDS.pills ? game.resources.pills : 0;
  const quantity = Math.max(0, (hasEntry ? inventoryQuantity(game, itemId) : legacyQuantity) + Math.trunc(delta));
  const withoutItem = current.filter((entry) => entry.itemId !== itemId);
  const inventory: InventoryEntry[] = quantity > 0 ? [...withoutItem, { itemId, quantity }] : withoutItem;
  const resources = { ...game.resources };
  if (itemId === RESOURCE_ITEM_IDS.herbs) resources.herbs = quantity;
  if (itemId === RESOURCE_ITEM_IDS.pills) resources.pills = quantity;
  return { ...game, inventory, resources };
}

function resourceQuantity(game: GameState, key: ResourceKey): number {
  if (key === "herbs" || key === "pills") {
    const itemId = RESOURCE_ITEM_IDS[key];
    return game.inventory?.some((entry) => entry.itemId === itemId) ? inventoryQuantity(game, itemId) : Math.max(0, game.resources[key]);
  }
  return game.resources[key];
}

function itemChange(item: ItemDefinition, amount: number): EventResultChange {
  return { label: item.name, amount };
}

function itemActionResult(before: GameState, after: GameState, title: string, text: string, tone: Tone, durationDays = 0): GameState {
  const changes = eventChanges(before, after);
  let next = addLog(after, title, text, tone, { kind: "action", locationName: getCurrentLocation(before).name, changes, durationDays });
  next = { ...next, eventResult: { kind: "action", title, text, tone, changes, durationDays } };
  return checkEnding(next);
}

export function getItem(itemId: string): ItemDefinition | undefined;
export function getItem(game: GameState, itemId: string): ItemDefinition | undefined;
export function getItem(gameOrId: GameState | string, itemId?: string): ItemDefinition | undefined {
  return typeof gameOrId === "string" ? itemMap.get(gameOrId) : itemDefinitionFor(gameOrId, itemId ?? "");
}

export function getItemQuantity(game: GameState, itemId: string): number {
  if (itemId === RESOURCE_ITEM_IDS.herbs && !game.inventory?.some((entry) => entry.itemId === itemId)) return Math.max(0, game.resources.herbs);
  if (itemId === RESOURCE_ITEM_IDS.pills && !game.inventory?.some((entry) => entry.itemId === itemId)) return Math.max(0, game.resources.pills);
  return inventoryQuantity(game, itemId);
}

export function canUseItem(game: GameState, itemId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "请先处理眼前之事" };
  const item = itemDefinitionFor(game, itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  if (item.category !== "consumable" || !item.effects?.length) return { allowed: false, reason: "此物品不能直接使用" };
  if (inventoryQuantity(game, itemId) < 1) return { allowed: false, reason: "物品栏中没有此物品" };
  return { allowed: true };
}

function canTrade(game: GameState): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "请先处理眼前之事" };
  if (!actionAvailable(getCurrentLocation(game), "market")) return { allowed: false, reason: "抵达提供坊市交易的地点后方可交易" };
  return { allowed: true };
}

export function canBuyItem(game: GameState, itemId: string, quantity = 1): { allowed: boolean; reason?: string } {
  const item = itemDefinitionFor(game, itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  const trade = canTrade(game);
  if (!trade.allowed) return trade;
  if (item.category === "quest" || item.price <= 0) return { allowed: false, reason: "此物品不在坊市出售" };
  const count = Math.max(1, Math.floor(quantity));
  if (game.resources.spiritStones < item.price * count) return { allowed: false, reason: `至少需要 ${item.price * count} 灵石` };
  return { allowed: true };
}

export function canSellItem(game: GameState, itemId: string, quantity = 1): { allowed: boolean; reason?: string } {
  const item = itemDefinitionFor(game, itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  const trade = canTrade(game);
  if (!trade.allowed) return trade;
  if (item.category === "quest" || item.sellPrice <= 0) return { allowed: false, reason: "剧情物品不可出售" };
  const count = Math.max(1, Math.floor(quantity));
  if (inventoryQuantity(game, itemId) < count) return { allowed: false, reason: "物品数量不足" };
  return { allowed: true };
}

export function canGiftItem(game: GameState, npcId: string, itemId: string, quantity = 1): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "请先处理眼前之事" };
  const item = itemDefinitionFor(game, itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  if (item.category === "quest") return { allowed: false, reason: "剧情物品不能随意转赠" };
  const npc = game.npcs.find((entry) => entry.id === npcId);
  if (!npc || !npc.alive || npc.locationId !== getCurrentLocation(game).id) return { allowed: false, reason: "对方不在此处" };
  const count = Math.max(1, Math.floor(quantity));
  if (inventoryQuantity(game, itemId) < count) return { allowed: false, reason: "物品数量不足" };
  return { allowed: true };
}

export function useItem(game: GameState, itemId: string): GameState {
  const access = canUseItem(game, itemId);
  const item = itemDefinitionFor(game, itemId);
  if (!access.allowed || !item) return game;
  const before = game;
  let next = changeInventory(game, itemId, -1);
  next = applyEffects(next, item.effects ?? []);
  return itemActionResult(before, next, `使用${item.name}`, `你取出${item.name}，药力或灵息在经脉中慢慢散开。`, "good");
}

export function buyItem(game: GameState, itemId: string, quantity = 1): GameState {
  const count = Math.max(1, Math.floor(quantity));
  const access = canBuyItem(game, itemId, count);
  const item = itemDefinitionFor(game, itemId);
  if (!access.allowed || !item) return game;
  const before = game;
  let next = game;
  next = applyEffects(next, [{ type: "resource", key: "spiritStones", amount: -item.price * count }]);
  next = changeInventory(next, itemId, count);
  return itemActionResult(before, next, `购入${item.name}`, `你在坊市以 ${item.price * count} 灵石购入${item.name}。`, "neutral", 0);
}

export function sellItem(game: GameState, itemId: string, quantity = 1): GameState {
  const count = Math.max(1, Math.floor(quantity));
  const access = canSellItem(game, itemId, count);
  const item = itemDefinitionFor(game, itemId);
  if (!access.allowed || !item) return game;
  const before = game;
  let next = game;
  next = changeInventory(next, itemId, -count);
  next = applyEffects(next, [{ type: "resource", key: "spiritStones", amount: item.sellPrice * count }]);
  return itemActionResult(before, next, `出售${item.name}`, `摊主验过货后，以 ${item.sellPrice * count} 灵石收下${item.name}。`, "good", 0);
}

export function giftItem(game: GameState, npcId: string, itemId: string, quantity = 1): GameState {
  const count = Math.max(1, Math.floor(quantity));
  const access = canGiftItem(game, npcId, itemId, count);
  const item = itemDefinitionFor(game, itemId);
  const npc = game.npcs.find((entry) => entry.id === npcId);
  if (!access.allowed || !item || !npc) return game;
  const before = game;
  let next = tick({ ...game, npcs: game.npcs.map((entry) => ({ ...entry })) }, 1);
  next = changeInventory(next, itemId, -count);
  const relationshipDelta = Math.max(4, 13 - item.rarity + Math.floor(item.price / 40)) * count;
  const npcAfterTick = next.npcs.find((entry) => entry.id === npcId) ?? npc;
  const updatedNpc = { ...npcAfterTick, relationship: npcRelationshipDelta(npcAfterTick, relationshipDelta), lastInteractionTurn: next.turn };
  next = { ...next, npcs: next.npcs.map((entry) => entry.id === npcId ? updatedNpc : entry) };
  const changes = [...eventChanges(before, next), { label: `${npc.name}关系`, amount: relationshipDelta }];
  const title = `赠送${item.name}`;
  const text = `你将${item.name}赠给${npc.name}，这份心意让彼此的因果又近了一步。`;
  next = addLog(next, title, text, "good", { kind: "action", locationName: getCurrentLocation(before).name, changes, detail: `赠予${npc.name}`, durationDays: 1 });
  next = { ...next, eventResult: { kind: "action", title, text, tone: "good", changes, durationDays: 1 } };
  return checkEnding(next);
}

const eventResourceLabels: Partial<Record<ResourceKey, string>> = {
  stamina: "体力",
  lifespan: "寿元（年）",
  age: "年龄（年）",
  battlePower: "战力",
  qi: "灵力",
  mind: "心境",
  cultivation: "修为",
  spiritStones: "灵石",
  herbs: "灵草",
  pills: "破障丹",
};

const eventStatLabels: Record<keyof CoreStats, string> = {
  constitution: "根骨",
  insight: "悟性",
  spirit: "神识",
  fortune: "气运",
};

function eventChanges(before: GameState, after: GameState): EventResultChange[] {
  const changes: EventResultChange[] = [];
  const resourceKeys: ResourceKey[] = ["stamina", "lifespan", "age", "battlePower", "qi", "mind", "cultivation", "spiritStones"];
  resourceKeys.forEach((key) => {
    const previous = before.resources[key];
    const current = after.resources[key];
    const rawAmount = current - previous;
    const amount = key === "age" || key === "lifespan" ? Math.round(rawAmount * 100) / 100 : rawAmount;
    if (amount !== 0) changes.push({ label: eventResourceLabels[key] ?? key, amount });
  });
  const capacityChanges: Array<[string, number, number]> = [
    ["体力上限", before.resources.maxStamina, after.resources.maxStamina],
    ["灵力上限", before.resources.maxQi, after.resources.maxQi],
    ["心境上限", before.resources.maxMind, after.resources.maxMind],
    ["修为门槛", before.resources.cultivationRequired, after.resources.cultivationRequired],
  ];
  capacityChanges.forEach(([label, previous, current]) => {
    const amount = current - previous;
    if (amount !== 0) changes.push({ label, amount });
  });
  const inventoryBefore = new Map((before.inventory ?? []).map((entry) => [entry.itemId, entry.quantity]));
  const inventoryAfter = new Map((after.inventory ?? []).map((entry) => [entry.itemId, entry.quantity]));
  new Set([...inventoryBefore.keys(), ...inventoryAfter.keys()]).forEach((itemId) => {
    const amount = (inventoryAfter.get(itemId) ?? 0) - (inventoryBefore.get(itemId) ?? 0);
    const item = itemDefinitionFor(before, itemId) ?? itemDefinitionFor(after, itemId);
    if (amount !== 0 && item) changes.push(itemChange(item, amount));
  });
  (Object.keys(eventStatLabels) as Array<keyof CoreStats>).forEach((key) => {
    const amount = after.character.stats[key] - before.character.stats[key];
    if (amount !== 0) changes.push({ label: eventStatLabels[key], amount });
  });
  return changes;
}

function withResult(before: GameState, after: GameState, title: string, text: string, tone: Tone, kind: EventResult["kind"] = "action", durationDays = 1): GameState {
  return { ...after, eventResult: { kind, title, text, tone, changes: eventChanges(before, after), durationDays } };
}

function addLog(game: GameState, title: string, text: string, tone: Tone = "neutral", details: Pick<ChronicleEntry, "kind" | "detail" | "locationName" | "changes" | "durationDays"> = {}): GameState {
  const baseId = `${game.turn}-${game.rngState}-${game.chronicle.length}`;
  let id = baseId;
  let suffix = 1;
  while (game.chronicle.some((entry) => entry.id === id)) id = `${baseId}-${suffix++}`;
  const entry: ChronicleEntry = { id, turn: game.turn, title, text, tone, ...details };
  return { ...game, chronicle: [entry, ...game.chronicle].slice(0, 60) };
}

function requirementMet(game: GameState, requirement?: Requirement): boolean {
  if (!requirement) return true;
  if (requirement.minStage && game.realmStage < requirement.minStage) return false;
  if (requirement.flag && !game.flags.includes(requirement.flag)) return false;
  if (requirement.resource && Object.entries(requirement.resource).some(([key, value]) => resourceQuantity(game, key as ResourceKey) < value)) return false;
  if (requirement.stat) {
    const stats = effectiveStats(game);
    if (Object.entries(requirement.stat).some(([key, value]) => stats[key as keyof CoreStats] < value)) return false;
  }
  return true;
}

export function canChoose(game: GameState, choice: EventChoice): boolean {
  return requirementMet(game, choice.requirement);
}

function normalizeDuration(action: (typeof ACTIONS)[number], requested?: number): number {
  const range = action.durationRange;
  const raw = Number.isFinite(requested) ? Math.round(requested as number) : action.durationDays;
  if (!range) return action.durationDays;
  const stepped = range.min + Math.round((raw - range.min) / range.step) * range.step;
  return Math.max(range.min, Math.min(range.max, stepped));
}

function actionAvailable(location: WorldLocation, actionId: ActionId): boolean {
  const action = ACTIONS.find((item) => item.id === actionId);
  if (!action) return false;
  const modifiers = locationModifiers(location);
  if (modifiers.blockedActions?.includes(actionId)) return false;
  return action.category === "innate" || location.actions.includes(actionId);
}

export function canPerformAction(game: GameState, actionId: ActionId, requestedDurationDays?: number): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "先处理眼前之事" };
  const location = getCurrentLocation(game);
  const action = ACTIONS.find((item) => item.id === actionId);
  if (!action) return { allowed: false, reason: "没有这种行动" };
  if (!actionAvailable(location, actionId)) {
    const name = action?.name ?? "此行动";
    if (locationModifiers(location).blockedActions?.includes(actionId)) return { allowed: false, reason: `${location.name}无法进行${name}` };
    return { allowed: false, reason: `需前往提供${name}的地点` };
  }
  const durationDays = normalizeDuration(action, requestedDurationDays);
  if (actionId === "cultivate" && game.resources.qi < CULTIVATION_QI_COST_PER_DAY * durationDays) return { allowed: false, reason: `闭关${durationDays}天至少需要 ${CULTIVATION_QI_COST_PER_DAY * durationDays} 点灵力` };
  if (actionId === "alchemy" && resourceQuantity(game, "herbs") < 2) return { allowed: false, reason: "至少需要 2 株灵草" };
  return { allowed: true };
}

interface NpcLifeNote {
  npc: Npc;
  kind: "death" | "growth";
  previousStage?: number;
}

function advanceNpcs(game: GameState, days: number): { npcs: Npc[]; rngState: number; notes: NpcLifeNote[] } {
  let rng = game.rngState;
  const nextTurn = game.turn + days;
  const locationMap = new Map(game.world.locations.map((location) => [location.id, location]));
  const notes: NpcLifeNote[] = [];
  const npcs = game.npcs.map((npc) => {
    if (!npc.alive) return { ...npc };
    let growthRoll; [growthRoll, rng] = nextRandom(rng);
    let moveRoll; [moveRoll, rng] = nextRandom(rng);
    let personalityRoll; [personalityRoll, rng] = nextRandom(rng);
    const age = Math.round((npc.age + days / DAYS_PER_YEAR) * 10) / 10;
    if (age >= npc.lifespan) {
      const dead = { ...npc, age: npc.lifespan, alive: false, deathTurn: nextTurn };
      notes.push({ npc: dead, kind: "death" });
      return dead;
    }
    let updated: Npc = { ...npc, age };
    const growthChance = Math.min(0.35, (days / DAYS_PER_YEAR) * 0.72);
    if (growthRoll < growthChance && updated.realmStage < REALMS.length - 1) {
      const previousStage = updated.realmStage;
      const nextStage = previousStage + 1;
      const statKey = (growthRoll < 0.25 ? "constitution" : growthRoll < 0.5 ? "insight" : growthRoll < 0.75 ? "spirit" : "fortune") as keyof CoreStats;
      updated = {
        ...updated,
        realmStage: nextStage,
        battlePower: updated.battlePower + 5 + Math.round(nextStage * 0.8),
        stats: { ...updated.stats, [statKey]: updated.stats[statKey] + 1 },
      };
      notes.push({ npc: updated, kind: "growth", previousStage });
    }
    if (personalityRoll < Math.min(0.12, (days / DAYS_PER_YEAR) * 0.16)) {
      const nextPersonality = NPC_PERSONALITIES[Math.floor(moveRoll * NPC_PERSONALITIES.length)] ?? NPC_PERSONALITIES[0];
      updated = { ...updated, personality: [updated.personality[0] ?? nextPersonality, nextPersonality].filter((value, index, values) => values.indexOf(value) === index) };
    }
    const currentLocation = locationMap.get(updated.locationId);
    const movementChance = Math.min(0.4, days / 60);
    if (moveRoll < movementChance && currentLocation?.connections.length) {
      const connected = currentLocation.connections
        .map((id) => locationMap.get(id))
        .filter((location): location is WorldLocation => Boolean(location));
      if (connected.length) {
        let destination; [destination, rng] = draw(connected, rng);
        updated = { ...updated, locationId: destination.id };
      }
    }
    return updated;
  });
  return { npcs, rngState: rng, notes };
}

function tick(game: GameState, elapsedDays = 1): GameState {
  const days = Math.max(1, Math.round(elapsedDays));
  const npcLife = advanceNpcs(game, days);
  const lifeEntries: ChronicleEntry[] = npcLife.notes.map((note, index) => note.kind === "death"
    ? {
      id: `npc-death-${npcLife.npcs.length}-${game.turn + days}-${index}`,
      turn: game.turn + days,
      title: `${note.npc.name}离世`,
      text: `${note.npc.name}走完了自己的寿元。世间少了一道身影，但留下的因果仍在你的记忆里。`,
      tone: "neutral",
      kind: "event",
      durationDays: days,
    }
    : {
      id: `npc-growth-${note.npc.id}-${game.turn + days}`,
      turn: game.turn + days,
      title: `${note.npc.name}修为有进`,
      text: `${note.npc.name}在你未曾留意的日子里有所精进，踏入${REALMS[note.npc.realmStage - 1] ?? "新的境界"}。`,
      tone: "mystic",
      kind: "event",
      durationDays: days,
    });
  const next: GameState = {
    ...game,
    turn: game.turn + days,
    rngState: npcLife.rngState,
    resources: { ...game.resources, age: game.resources.age + days / DAYS_PER_YEAR },
    statuses: game.statuses.map((status) => ({ ...status, remaining: status.remaining - days })).filter((status) => status.remaining > 0),
    npcs: npcLife.npcs,
    chronicle: lifeEntries.length ? [...lifeEntries, ...game.chronicle].slice(0, 60) : game.chronicle,
  };
  return refreshQuestOffers(expireActiveQuests(next), days, false);
}

function actionOutcome(game: GameState, actionId: ActionId, durationDays: number): [GameState, string, Tone] {
  let next = game;
  let roll; [roll, next.rngState] = nextRandom(next.rngState);
  const stats = effectiveStats(next);
  const root = next.character.spiritRoot;
  const talent = next.character.talent;
  const modifiers = locationModifiers(getCurrentLocation(next));
  const actionBonus = modifiers.actionBonuses?.[actionId] ?? 0;
  if (actionId === "cultivate") {
    const statusBonus = next.statuses.reduce((sum, status) => sum + (status.cultivationBonus ?? 0), 0);
    const realmGrowth = cultivationGainMultiplierForStage(next.realmStage);
    const gain = Math.round((13 + stats.insight * 1.4 + roll * 7) * durationDays * realmGrowth * (1 + root.cultivationBonus + (talent.cultivationBonus ?? 0) + statusBonus + (modifiers.cultivationBonus ?? 0)));
    next = applyEffects(next, [{ type: "resource", key: "qi", amount: -CULTIVATION_QI_COST_PER_DAY * durationDays }, { type: "resource", key: "mind", amount: -CULTIVATION_MIND_COST_PER_DAY * durationDays }, { type: "resource", key: "cultivation", amount: gain }]);
    return [next, `你运转周天，炼化异界灵气，修为增长 ${gain}。`, "mystic"];
  }
  if (actionId === "explore") {
    const stones = Math.max(2, Math.round((3 + roll * 8 + stats.fortune * 0.6 + (root.explorationBonus ?? 0) * 10) * (1 + actionBonus)));
    next = applyEffects(next, [{ type: "resource", key: "qi", amount: -6 }, { type: "resource", key: "spiritStones", amount: stones }]);
    const foundItemId = roll > 0.82 ? "cloud-silk" : roll > 0.62 ? "spirit-iron" : undefined;
    if (foundItemId) next = changeInventory(next, foundItemId, 1);
    return [next, `你从荒野带回 ${stones} 枚灵石，鞋底也带回半座山。`, "good"];
  }
  if (actionId === "gather") {
    const herbs = Math.max(1, Math.floor((1 + roll * 2 + stats.spirit / 6) * (1 + actionBonus)));
    next = applyEffects(next, [{ type: "resource", key: "qi", amount: -4 }, { type: "resource", key: "herbs", amount: herbs }]);
    if (roll > 0.35) next = changeInventory(next, "moon-dew", 1);
    return [next, `你辨得药性，采回 ${herbs} 株可用灵草。`, "good"];
  }
  if (actionId === "alchemy") {
    const chance = Math.min(0.9, 0.42 + stats.spirit * 0.045 + (root.alchemyBonus ?? 0) + (talent.id === "alchemist" ? 0.15 : 0) + actionBonus);
    const success = roll < chance;
    next = applyEffects(next, [{ type: "resource", key: "herbs", amount: -2 }, ...(success ? [{ type: "resource", key: "pills", amount: 1 } as Effect] : [{ type: "resource", key: "mind", amount: -4 } as Effect])]);
    return success
      ? [next, "火候恰到好处，一枚破障丹在炉底滴溜溜打转。", "good"]
      : [next, "炉中升起一缕很有主见的黑烟。灵草没了，经验留下了。", "danger"];
  }
  if (actionId === "rest") {
    const stamina = (14 + stats.constitution) * durationDays;
    const qi = (20 + stats.spirit) * durationDays;
    const mind = (15 + stats.insight) * durationDays;
    next = applyEffects(next, [{ type: "resource", key: "stamina", amount: stamina }, { type: "resource", key: "qi", amount: qi }, { type: "resource", key: "mind", amount: mind }]);
    return [next, "你闭门静养。门外的麻烦没有消失，但至少暂时进不来。", "good"];
  }
  return [next, "你在浮云集听取四方传闻：北坳近日有妖兽出没，西岭旧宗门似乎又亮起了灯火。", "neutral"];
}

function finishAction(game: GameState, actionId: ActionId, durationDays: number, generated?: AiGeneratedOutcome): GameState {
  const action = ACTIONS.find((item) => item.id === actionId)!;
  let next = tick({ ...game, pendingEventId: undefined, pendingQuestId: undefined }, durationDays);
  let message: string;
  let tone: Tone;
  let title = action.name;
  if (generated) {
    next = applyEffects(next, generated.effects);
    message = generated.text;
    tone = generated.tone;
    title = generated.title ?? action.name;
  } else {
    [next, message, tone] = actionOutcome(next, actionId, durationDays);
  }
  next = addLog(next, title, message, tone, { kind: "action", locationName: getCurrentLocation(game).name, changes: eventChanges(game, next), durationDays });
  if (actionId !== "market") {
    let eventRoll; [eventRoll, next.rngState] = nextRandom(next.rngState);
    const baseEventChance = Math.min(0.96, action.eventChance + worldDangerModifier(next));
    const eventChance = Math.min(0.96, 1 - Math.pow(1 - baseEventChance, durationDays));
    if (eventRoll < eventChance) {
      let eventId; [eventId, next.rngState] = selectEvent(next, actionId);
      if (eventId) {
        next = queuePendingEvent(next, eventId);
        next.seenEvents = { ...next.seenEvents, [eventId]: (next.seenEvents[eventId] ?? 0) + 1 };
      }
    }
  }
  next = withResult(game, next, title, message, tone, "action", durationDays);
  return checkEnding(next);
}

function eventEligible(event: EventDefinition, game: GameState, trigger: EventTrigger): boolean {
  if (!event.actions.includes(trigger)) return false;
  if (event.minStage && game.realmStage < event.minStage) return false;
  if (event.maxStage && game.realmStage > event.maxStage) return false;
  if (event.once && game.seenEvents[event.id]) return false;
  if (event.requireFlag && !game.flags.includes(event.requireFlag)) return false;
  if (event.excludeFlag && game.flags.includes(event.excludeFlag)) return false;
  if (event.locationRoles && !event.locationRoles.includes(getCurrentLocation(game).role)) return false;
  return true;
}

function worldDangerModifier(game: GameState): number {
  return WORLD_DANGER_MODIFIER[game.world.options?.danger ?? DEFAULT_WORLD_OPTIONS.danger];
}

function selectEvent(game: GameState, trigger: EventTrigger): [string | undefined, number] {
  if (trigger === "market") return ["market-day", game.rngState];
  const eligible = eventDefinitions(game).filter((event) => event.id !== "market-day" && eventEligible(event, game, trigger));
  if (!eligible.length) return [undefined, game.rngState];
  const total = eligible.reduce((sum, event) => sum + (event.weight ?? 1), 0);
  let roll; let rng; [roll, rng] = nextRandom(game.rngState);
  let cursor = roll * total;
  for (const event of eligible) {
    cursor -= event.weight ?? 1;
    if (cursor <= 0) return [event.id, rng];
  }
  return [eligible[eligible.length - 1].id, rng];
}

function questRolesSupported(game: GameState, roles?: LocationRole[]): boolean {
  return !roles?.length || roles.some((role) => game.world.locations.some((location) => location.role === role));
}

function questSupportedByWorld(game: GameState, quest: QuestDefinition): boolean {
  return quest.stages.every((stage) => {
    if (!questRolesSupported(game, stage.locationRoles)) return false;
    const objectiveRoles = stage.objective?.type === "visit" || stage.objective?.type === "resource" ? stage.objective.locationRoles : undefined;
    return questRolesSupported(game, objectiveRoles);
  });
}

function questAlreadyKnown(game: GameState, quest: QuestDefinition): boolean {
  if (game.questOffers.some((offer) => offer.questId === quest.id)) return true;
  return game.quests.some((progress) => progress.questId === quest.id && (progress.status === "active" || quest.once !== false));
}

function questEligibleForOffer(game: GameState, quest: QuestDefinition, location?: WorldLocation): boolean {
  if (game.status !== "playing" || questAlreadyKnown(game, quest)) return false;
  if (quest.minStage && game.realmStage < quest.minStage) return false;
  if (quest.maxStage && game.realmStage > quest.maxStage) return false;
  if (quest.requireFlag && !game.flags.includes(quest.requireFlag)) return false;
  if (quest.excludeFlag && game.flags.includes(quest.excludeFlag)) return false;
  if (location && !quest.offerRoles.includes(location.role)) return false;
  return questSupportedByWorld(game, quest);
}

function chooseQuest(quests: QuestDefinition[], rngState: number): [QuestDefinition | undefined, number] {
  if (!quests.length) return [undefined, rngState];
  const total = quests.reduce((sum, quest) => sum + (quest.weight ?? 1), 0);
  let roll; let rng; [roll, rng] = nextRandom(rngState);
  let cursor = roll * total;
  for (const quest of quests) {
    cursor -= quest.weight ?? 1;
    if (cursor <= 0) return [quest, rng];
  }
  return [quests[quests.length - 1], rng];
}

function addQuestOffer(game: GameState, quest: QuestDefinition, location: WorldLocation): GameState {
  const lifetime = Math.max(16, Math.min(60, Math.round((quest.timeLimitDays ?? 30) * .8)));
  const offer: QuestOffer = { questId: quest.id, locationId: location.id, discoveredTurn: game.turn, expiresTurn: game.turn + lifetime };
  return { ...game, questOffers: [...game.questOffers, offer] };
}

function refreshQuestOffers(game: GameState, elapsedDays = 1, initial = false): GameState {
  if (game.status !== "playing") return game;
  let next: GameState = {
    ...game,
    questOffers: (game.questOffers ?? []).filter((offer) => offer.expiresTurn >= game.turn && questDefinitionFor(game, offer.questId) && game.world.locations.some((location) => location.id === offer.locationId)),
    quests: game.quests ?? [],
  };
  const availableLocations = next.world.locations.filter((location) => location.unlockStage <= next.realmStage && !next.questOffers.some((offer) => offer.locationId === location.id));

  // Story follow-ups appear as soon as their prerequisite flag exists.
  for (const quest of questDefinitions(next).filter((candidate) => Boolean(candidate.requireFlag) && questEligibleForOffer(next, candidate))) {
    const location = availableLocations.find((candidate) => quest.offerRoles.includes(candidate.role) && !next.questOffers.some((offer) => offer.locationId === candidate.id));
    if (location) next = addQuestOffer(next, quest, location);
  }

  const desiredOffers = Math.min(8, Math.max(2, Math.ceil(next.world.locations.length / 16) + 2));
  const spawnChance = initial ? 1 : Math.min(.82, .06 + Math.max(1, elapsedDays) * .035);
  const candidates = availableLocations.filter((location) => !next.questOffers.some((offer) => offer.locationId === location.id));
  while (next.questOffers.length < desiredOffers && candidates.length) {
    let locationRoll; [locationRoll, next.rngState] = nextRandom(next.rngState);
    const locationIndex = Math.min(candidates.length - 1, Math.floor(locationRoll * candidates.length));
    const [location] = candidates.splice(locationIndex, 1);
    let spawnRoll; [spawnRoll, next.rngState] = nextRandom(next.rngState);
    if (spawnRoll > spawnChance) continue;
    const eligible = questDefinitions(next).filter((quest) => questEligibleForOffer(next, quest, location));
    let quest; [quest, next.rngState] = chooseQuest(eligible, next.rngState);
    if (quest) next = addQuestOffer(next, quest, location);
  }
  return next;
}

function generatedLocationPosition(existing: WorldLocation[], anchor: WorldLocation, rngState: number): [{ x: number; y: number }, number] {
  // The map renders cards in percentage coordinates. Keep a larger exclusion
  // radius in small worlds, where each card occupies more of the canvas, and
  // relax it only for dense worlds whose map layer is already much larger.
  const minimumDistance = existing.length > 60 ? 9 : existing.length > 24 ? 12 : 17;
  const minimumDistanceSquared = minimumDistance ** 2;
  const clampX = (value: number) => Math.max(7, Math.min(93, value));
  const clampY = (value: number) => Math.max(12, Math.min(88, value));
  const score = (x: number, y: number) => existing.reduce((minimum, location) => Math.min(minimum, (location.position.x - x) ** 2 + (location.position.y - y) ** 2), Number.POSITIVE_INFINITY);
  let rng = rngState;
  let bestPosition = { x: clampX(anchor.position.x + minimumDistance), y: clampY(anchor.position.y) };
  let bestScore = score(bestPosition.x, bestPosition.y);
  // Sample enough directions to find an open pocket even when the current
  // location sits near a map edge. The best candidate is retained as a safe
  // fallback if the world is already unusually dense.
  for (let attempt = 0; attempt < 72; attempt += 1) {
    let angleRoll; let distanceRoll;
    [angleRoll, rng] = nextRandom(rng);
    [distanceRoll, rng] = nextRandom(rng);
    const angle = angleRoll * Math.PI * 2;
    const distance = minimumDistance * (1.15 + distanceRoll * 1.55);
    const x = clampX(anchor.position.x + Math.cos(angle) * distance);
    const y = clampY(anchor.position.y + Math.sin(angle) * distance);
    const candidateScore = score(x, y);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestPosition = { x, y };
    }
    if (candidateScore >= minimumDistanceSquared) return [{ x, y }, rng];
  }
  return [bestPosition, rng];
}

function defaultGeneratedLocationActions(role: LocationRole): ActionId[] {
  if (role === "herbal" || role === "water" || role === "mine") return ["gather"];
  if (role === "market" || role === "settlement") return ["market"];
  if (role === "sect" || role === "academy" || role === "sanctuary") return ["cultivate"];
  return ["explore"];
}

export function addGeneratedContent(game: GameState, bundle: AiGeneratedContentBundle, announce = true): GameState {
  if (game.status !== "playing") return game;
  let next: GameState = {
    ...game,
    world: { ...game.world, locations: game.world.locations.map((location) => ({ ...location, actions: [...location.actions], connections: [...location.connections], position: { ...location.position } })) },
    npcs: [...game.npcs],
    generatedQuests: [...(game.generatedQuests ?? [])],
    generatedEvents: [...(game.generatedEvents ?? [])],
    generatedItems: [...(game.generatedItems ?? [])],
  };
  let rng = next.rngState;
  const existingIds = new Set(next.world.locations.map((location) => location.id));
  const current = getCurrentLocation(next);
  const createdLocations: WorldLocation[] = [];
  bundle.locations.slice(0, 3).forEach((draft) => {
    if (!draft.id || existingIds.has(draft.id)) return;
    let position: { x: number; y: number };
    [position, rng] = generatedLocationPosition([...next.world.locations, ...createdLocations], current, rng);
    const nearest = [...next.world.locations, ...createdLocations]
      .filter((location) => location.id !== current.id)
      .sort((left, right) => {
        const leftDistance = (left.position.x - position.x) ** 2 + (left.position.y - position.y) ** 2;
        const rightDistance = (right.position.x - position.x) ** 2 + (right.position.y - position.y) ** 2;
        return leftDistance - rightDistance;
      })[0];
    const location: WorldLocation = {
      id: draft.id,
      role: draft.role,
      name: draft.name,
      subtitle: draft.subtitle,
      description: draft.description,
      danger: draft.danger,
      icon: draft.icon,
      actions: draft.actions.length ? [...draft.actions] : defaultGeneratedLocationActions(draft.role),
      modifiers: locationModifiers({ ...draft, id: draft.id, connections: [], position } as WorldLocation),
      connections: [current.id, ...(nearest && nearest.id !== current.id ? [nearest.id] : [])],
      unlockStage: Math.max(1, Math.min(REALMS.length - 1, draft.unlockStage ?? next.realmStage)),
      travelCost: Math.max(1, Math.min(200, draft.travelCost ?? 5)),
      position,
    };
    createdLocations.push(location);
    existingIds.add(location.id);
  });
  const locationIds = new Set(next.world.locations.map((location) => location.id));
  createdLocations.forEach((location) => location.connections.forEach((connectionId) => {
    const target = next.world.locations.find((candidate) => candidate.id === connectionId) ?? createdLocations.find((candidate) => candidate.id === connectionId);
    if (target && !target.connections.includes(location.id)) target.connections.push(location.id);
  }));
  next.world.locations.push(...createdLocations);
  createdLocations.forEach((location) => locationIds.add(location.id));
  const existingItemIds = new Set(itemDefinitions(next).map((item) => item.id));
  const newItems = bundle.items.filter((item) => {
    if (!item.id || existingItemIds.has(item.id)) return false;
    existingItemIds.add(item.id);
    return true;
  });
  next.generatedItems.push(...newItems.map((item) => ({ ...item, effects: item.effects ? [...item.effects] : undefined })));
  const existingEventIds = new Set(eventDefinitions(next).map((event) => event.id));
  const newEvents = bundle.events.filter((event) => {
    if (!event.id || existingEventIds.has(event.id)) return false;
    existingEventIds.add(event.id);
    return true;
  });
  next.generatedEvents.push(...newEvents);
  const existingQuestIds = new Set(questDefinitions(next).map((quest) => quest.id));
  const newQuests = bundle.quests.filter((quest) => {
    if (!quest.id || existingQuestIds.has(quest.id)) return false;
    existingQuestIds.add(quest.id);
    return true;
  });
  next.generatedQuests.push(...newQuests);
  const existingNpcIds = new Set(next.npcs.map((npc) => npc.id));
  const newNpcs = bundle.npcs.filter((npc) => {
    if (!npc.id || existingNpcIds.has(npc.id)) return false;
    existingNpcIds.add(npc.id);
    return true;
  });
  next.npcs.push(...newNpcs.map((npc) => ({
    ...npc,
    locationId: locationIds.has(npc.locationId) ? npc.locationId : current.id,
    lifespan: Math.max(npc.age + 1, npc.lifespan),
    personality: npc.personality.length ? [...npc.personality] : ["沉稳"],
  })));
  next.rngState = rng;
  next.aiContentLastTurn = next.turn;
  const createdCount = createdLocations.length + newItems.length + newEvents.length + newQuests.length + newNpcs.length;
  if (!createdCount) return next;
  const generatedContent = {
    locations: createdLocations.map((location) => location.name),
    npcs: newNpcs.map((npc) => npc.name),
    quests: newQuests.map((quest) => quest.title),
    events: newEvents.map((event) => event.title),
    items: newItems.map((item) => item.name),
  };
  const text = bundle.narrative || `天机翻页，新的因果正在${current.name}周围成形。${createdLocations.length ? `地图上出现了 ${createdLocations.length} 处新地点。` : ""}`;
  next = addLog(next, "天机生成新的世界", text, "mystic", { kind: "event", locationName: current.name, detail: "AI 世界内容", durationDays: 0 });
  if (announce) {
    next = { ...next, eventResult: { kind: "event", title: "新的世界因果", text, tone: "mystic", changes: [], durationDays: 0, generatedContent } };
  } else if (next.eventResult) {
    const previous = next.eventResult.generatedContent;
    next = {
      ...next,
      eventResult: {
        ...next.eventResult,
        generatedContent: {
          locations: [...(previous?.locations ?? []), ...generatedContent.locations],
          npcs: [...(previous?.npcs ?? []), ...generatedContent.npcs],
          quests: [...(previous?.quests ?? []), ...generatedContent.quests],
          events: [...(previous?.events ?? []), ...generatedContent.events],
          items: [...(previous?.items ?? []), ...generatedContent.items],
        },
      },
    };
  }
  return refreshQuestOffers(next, 1, false);
}

export function initializeQuestSystem(game: GameState): GameState {
  const rawOffers = Array.isArray((game as Partial<GameState>).questOffers) ? game.questOffers : [];
  const rawQuests = Array.isArray((game as Partial<GameState>).quests) ? game.quests : [];
  const generatedQuests = Array.isArray((game as Partial<GameState>).generatedQuests) ? game.generatedQuests : [];
  const knownQuestIds = new Set([...QUESTS, ...generatedQuests].map((quest) => quest.id));
  const quests = rawQuests.filter((progress) => progress && typeof progress.questId === "string" && knownQuestIds.has(progress.questId));
  const offers = rawOffers.filter((offer) => offer && typeof offer.questId === "string" && knownQuestIds.has(offer.questId));
  const pendingQuestId = typeof game.pendingQuestId === "string" && quests.some((progress) => progress.questId === game.pendingQuestId && progress.status === "active") ? game.pendingQuestId : undefined;
  const normalized = { ...game, generatedQuests, questOffers: offers, quests, pendingQuestId };
  return refreshQuestOffers(normalized, 1, offers.length === 0 && quests.length === 0);
}

function expireActiveQuests(game: GameState): GameState {
  let next = game;
  for (const progress of next.quests.filter((quest) => quest.status === "active" && quest.deadlineTurn !== undefined && next.turn > quest.deadlineTurn)) {
    const definition = questDefinitionFor(next, progress.questId);
    if (!definition) continue;
    const before = next;
    next = applyEffects(next, definition.failureEffects ?? []);
    const failed: QuestProgress = { ...progress, status: "failed", updatedTurn: next.turn, finishedTurn: next.turn, failureReason: "未能在期限内完成" };
    next = { ...next, pendingQuestId: next.pendingQuestId === progress.questId ? undefined : next.pendingQuestId, quests: next.quests.map((quest) => quest === progress ? failed : quest) };
    next = addLog(next, `${definition.title} · 已逾期`, `任务期限已过，这条线索在时间中失去了回应。`, "danger", { kind: "quest", locationName: getCurrentLocation(next).name, changes: eventChanges(before, next), detail: "任务失败：超过期限", durationDays: 0 });
  }
  return next;
}

export function getLocationQuestOffers(game: GameState, locationId = getCurrentLocation(game).id): Array<{ offer: QuestOffer; quest: QuestDefinition }> {
  return game.questOffers.flatMap((offer) => {
    const quest = offer.locationId === locationId ? questDefinitionFor(game, offer.questId) : undefined;
    return quest ? [{ offer, quest }] : [];
  });
}

export function getQuestDefinition(game: GameState, questId: string): QuestDefinition | undefined;
export function getQuestDefinition(questId: string): QuestDefinition | undefined;
export function getQuestDefinition(gameOrId: GameState | string, questId?: string): QuestDefinition | undefined {
  return typeof gameOrId === "string" ? questMap.get(gameOrId) : questDefinitionFor(gameOrId, questId ?? "");
}

export function getQuestStage(game: GameState, questId: string): { quest: QuestDefinition; progress: QuestProgress; stage: QuestStageDefinition } | undefined {
  const quest = questDefinitionFor(game, questId);
  const progress = game.quests.find((candidate) => candidate.questId === questId && candidate.status === "active");
  const stage = quest?.stages[progress?.stageIndex ?? -1];
  return quest && progress && stage ? { quest, progress, stage } : undefined;
}

export function getCurrentQuestStage(game: GameState): { quest: QuestDefinition; progress: QuestProgress; stage: QuestStageDefinition } | undefined {
  return game.pendingQuestId ? getQuestStage(game, game.pendingQuestId) : undefined;
}

export function canAcceptQuest(game: GameState, questId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "请先处理眼前之事" };
  const quest = questDefinitionFor(game, questId);
  if (!quest) return { allowed: false, reason: "任务已经消失" };
  if (!game.questOffers.some((offer) => offer.questId === questId && offer.locationId === getCurrentLocation(game).id)) return { allowed: false, reason: "需前往任务出现的地点" };
  if (game.quests.filter((progress) => progress.status === "active").length >= 4) return { allowed: false, reason: "同时最多追踪 4 个任务" };
  return { allowed: true };
}

export function acceptQuest(game: GameState, questId: string): GameState {
  if (!canAcceptQuest(game, questId).allowed) return game;
  const quest = questDefinitionFor(game, questId)!;
  const progress: QuestProgress = {
    questId,
    status: "active",
    stageIndex: 0,
    acceptedTurn: game.turn,
    updatedTurn: game.turn,
    deadlineTurn: quest.timeLimitDays ? game.turn + quest.timeLimitDays : undefined,
  };
  let next: GameState = { ...game, questOffers: game.questOffers.filter((offer) => offer.questId !== questId), quests: [...game.quests, progress] };
  const text = `你接下了“${quest.title}”。${quest.summary}${progress.deadlineTurn !== undefined ? ` 此事需在第 ${progress.deadlineTurn} 天前完成。` : ""}`;
  next = addLog(next, `接取任务 · ${quest.title}`, text, "mystic", { kind: "quest", locationName: getCurrentLocation(game).name, detail: `阶段 1 / ${quest.stages.length}`, durationDays: 0 });
  return { ...next, eventResult: { kind: "quest", title: `已接取 · ${quest.title}`, text, tone: "mystic", changes: [], durationDays: 0 } };
}

function objectiveReady(game: GameState, objective: QuestStageDefinition["objective"]): { allowed: boolean; reason?: string } {
  if (!objective) return { allowed: true };
  const location = getCurrentLocation(game);
  if (objective.type === "visit") {
    return objective.locationRoles.includes(location.role) ? { allowed: true } : { allowed: false, reason: objective.description };
  }
  if (objective.type === "resource") {
    if (objective.locationRoles?.length && !objective.locationRoles.includes(location.role)) return { allowed: false, reason: `需在指定地点完成：${objective.description}` };
    return resourceQuantity(game, objective.key) >= objective.amount ? { allowed: true } : { allowed: false, reason: `${objective.description}（当前 ${Math.floor(resourceQuantity(game, objective.key))} / ${objective.amount}）` };
  }
  return game.realmStage >= objective.minStage ? { allowed: true } : { allowed: false, reason: objective.description };
}

export function canAdvanceQuest(game: GameState, questId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "请先处理眼前之事" };
  const current = getQuestStage(game, questId);
  if (!current) return { allowed: false, reason: "任务不在进行中" };
  if (current.progress.deadlineTurn !== undefined && game.turn > current.progress.deadlineTurn) return { allowed: false, reason: "任务已经逾期" };
  if (current.stage.locationRoles?.length && !current.stage.locationRoles.includes(getCurrentLocation(game).role)) return { allowed: false, reason: "需前往任务指定类型的地点" };
  return objectiveReady(game, current.stage.objective);
}

function finalizeQuestFailure(before: GameState, after: GameState, quest: QuestDefinition, progress: QuestProgress, text: string, title: string, durationDays: number): GameState {
  let next = applyEffects(after, quest.failureEffects ?? []);
  const failed: QuestProgress = { ...progress, status: "failed", updatedTurn: next.turn, finishedTurn: next.turn, failureReason: text };
  next = { ...next, pendingQuestId: undefined, quests: next.quests.map((candidate) => candidate.questId === progress.questId && candidate.status === "active" ? failed : candidate) };
  const changes = eventChanges(before, next);
  next = addLog(next, `${quest.title} · 失败`, text, "danger", { kind: "quest", locationName: getCurrentLocation(next).name, changes, detail: title, durationDays });
  return { ...next, eventResult: { kind: "quest", title: `${quest.title} · 失败`, text, tone: "danger", changes, durationDays } };
}

function finalizeQuestAdvance(before: GameState, after: GameState, quest: QuestDefinition, progress: QuestProgress, text: string, tone: Tone, durationDays: number): GameState {
  const nextStageIndex = progress.stageIndex + 1;
  let next = after;
  if (nextStageIndex >= quest.stages.length) {
    next = applyEffects(next, quest.completionEffects ?? []);
    if (quest.completionFlag) next = applyEffects(next, [{ type: "flag", key: quest.completionFlag }]);
    const completed: QuestProgress = { ...progress, status: "completed", stageIndex: nextStageIndex, updatedTurn: next.turn, finishedTurn: next.turn };
    next = { ...next, pendingQuestId: undefined, quests: next.quests.map((candidate) => candidate.questId === progress.questId && candidate.status === "active" ? completed : candidate) };
    const changes = eventChanges(before, next);
    const completionText = `${text}\n\n“${quest.title}”已经完成，新的因果也由此展开。`;
    next = addLog(next, `${quest.title} · 完成`, completionText, "good", { kind: "quest", locationName: getCurrentLocation(next).name, changes, detail: "任务完成", durationDays });
    next = { ...next, eventResult: { kind: "quest", title: `${quest.title} · 完成`, text: completionText, tone: "good", changes, durationDays } };
    return refreshQuestOffers(next, 1, false);
  }
  const updated: QuestProgress = { ...progress, stageIndex: nextStageIndex, updatedTurn: next.turn };
  next = { ...next, pendingQuestId: undefined, quests: next.quests.map((candidate) => candidate.questId === progress.questId && candidate.status === "active" ? updated : candidate) };
  const changes = eventChanges(before, next);
  next = addLog(next, `${quest.title} · ${quest.stages[nextStageIndex].title}`, text, tone, { kind: "quest", locationName: getCurrentLocation(next).name, changes, detail: `阶段 ${nextStageIndex + 1} / ${quest.stages.length}`, durationDays });
  return { ...next, eventResult: { kind: "quest", title: quest.stages[nextStageIndex].title, text, tone, changes, durationDays } };
}

export function advanceQuest(game: GameState, questId: string): GameState {
  if (!canAdvanceQuest(game, questId).allowed) return game;
  const current = getQuestStage(game, questId)!;
  if (current.stage.kind === "encounter") return { ...game, pendingQuestId: questId };
  let next = game;
  const objective = current.stage.objective;
  if (objective?.type === "resource" && objective.consume) next = applyEffects(next, [{ type: "resource", key: objective.key, amount: -objective.amount }]);
  return checkEnding(finalizeQuestAdvance(game, next, current.quest, current.progress, current.stage.body, "mystic", 0));
}

export function abandonQuest(game: GameState, questId: string): GameState {
  if (game.status !== "playing" || hasPendingNarrative(game)) return game;
  const current = getQuestStage(game, questId);
  if (!current) return game;
  const abandoned: QuestProgress = { ...current.progress, status: "abandoned", updatedTurn: game.turn, finishedTurn: game.turn, failureReason: "主动放弃" };
  let next: GameState = { ...game, quests: game.quests.map((candidate) => candidate === current.progress ? abandoned : candidate) };
  const text = `你放弃了“${current.quest.title}”。线索仍留在世间，但这一次不会再等你。`;
  next = addLog(next, `${current.quest.title} · 放弃`, text, "neutral", { kind: "quest", locationName: getCurrentLocation(game).name, detail: "主动放弃", durationDays: 0 });
  return { ...next, eventResult: { kind: "quest", title: `已放弃 · ${current.quest.title}`, text, tone: "neutral", changes: [], durationDays: 0 } };
}

function summary(reason: RunSummary["reason"], game: GameState): RunSummary {
  const score = Math.max(0, Math.round(game.realmStage * 150 + game.turn * 4 + game.resources.spiritStones * 2 + game.character.stats.insight * 10));
  if (reason === "ascension") return { reason, title: "羽化飞升", epitaph: `${game.character.name}历经六境九层，终于褪去凡躯，乘天光羽化飞升。此世至此圆满，新的天地在云外展开。`, score: score + 5000, insightEarned: 20 };
  if (reason === "foundation") return { reason, title: "一念筑基", epitaph: `${game.character.name}踏过界蚀，在陌生天地中留下了第一个真正属于自己的道号。`, score: score + 1000, insightEarned: 5 };
  if (reason === "curse") return { reason, title: "界蚀归墟", epitaph: `界蚀印终于吞没了${game.character.name}。这段人生没有预设终点，却留下了无法抹去的痕迹。`, score, insightEarned: Math.max(1, Math.floor(game.realmStage / 2)) };
  if (game.resources.age >= game.resources.lifespan) return { reason, title: "寿元已尽", epitaph: `${game.character.name}走完了寿元，享年约 ${Math.floor(game.resources.age)} 岁。天地仍在运转，而你的故事停在了第 ${game.turn} 天。`, score, insightEarned: Math.max(1, Math.floor(game.realmStage / 3)) };
  if (game.resources.stamina <= 0) return { reason, title: "体力耗尽", epitaph: `${game.character.name}的体力终于耗尽，没能再从这片异界大地上站起。`, score, insightEarned: Math.max(1, Math.floor(game.realmStage / 3)) };
  return { reason, title: "道途止步", epitaph: `${game.character.name}倒在求道路上。储物袋被后来者捡走，里面的欠条令对方肃然起敬。`, score, insightEarned: Math.max(1, Math.floor(game.realmStage / 3)) };
}

function checkEnding(game: GameState): GameState {
  if (game.resources.stamina <= 0 || game.resources.age >= game.resources.lifespan) return { ...game, status: "ended", pendingEventId: undefined, pendingEventQueue: undefined, pendingQuestId: undefined, summary: summary("fallen", game) };
  return game;
}

export function performAction(game: GameState, actionId: ActionId, requestedDurationDays?: number): GameState {
  const action = ACTIONS.find((item) => item.id === actionId)!;
  const durationDays = normalizeDuration(action, requestedDurationDays);
  if (!canPerformAction(game, actionId, durationDays).allowed) return game;
  return finishAction(game, actionId, durationDays);
}

export function performActionWithAi(game: GameState, actionId: ActionId, requestedDurationDays: number, generated: AiGeneratedOutcome): GameState {
  const action = ACTIONS.find((item) => item.id === actionId);
  if (!action) return game;
  const durationDays = normalizeDuration(action, requestedDurationDays);
  if (!canPerformAction(game, actionId, durationDays).allowed) return game;
  return finishAction(game, actionId, durationDays, generated);
}

export function getCurrentLocation(game: GameState): WorldLocation {
  return game.world.locations.find((location) => location.id === game.world.currentLocationId) ?? game.world.locations[0];
}

export function getLocationNpcs(game: GameState, locationId = getCurrentLocation(game).id): Npc[] {
  return game.npcs.filter((npc) => npc.alive && npc.locationId === locationId);
}

export function getNpcRelationshipLabel(value: number): string {
  if (value <= -60) return "死敌";
  if (value <= -20) return "敌视";
  if (value < 10) return "陌生";
  if (value < 30) return "相识";
  if (value < 55) return "友善";
  if (value < 80) return "亲近";
  return "莫逆之交";
}

const NPC_RELATIONSHIP_LABELS: Record<NpcRelationshipType, string> = {
  friend: "知交好友",
  mentor: "师徒·师父",
  disciple: "师徒·弟子",
  swornSibling: "结拜兄弟",
  spouse: "道侣夫妻",
  rival: "宿敌对手",
};

export function getNpcSpecialRelationshipLabel(type?: NpcRelationshipType): string | undefined {
  return type ? NPC_RELATIONSHIP_LABELS[type] : undefined;
}

export function toggleNpcAttention(game: GameState, npcId: string): GameState {
  if (!game.npcs.some((npc) => npc.id === npcId)) return game;
  return { ...game, npcs: game.npcs.map((npc) => npc.id === npcId ? { ...npc, attention: !npc.attention } : npc) };
}

export function canInteractWithNpc(game: GameState, npcId: string, interactionId: NpcInteractionId): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "先处理眼前之事" };
  const npc = game.npcs.find((item) => item.id === npcId);
  if (!npc) return { allowed: false, reason: "此人已不在此处" };
  if (!npc.alive) return { allowed: false, reason: "此人已经离世，只能查看其人物档案" };
  if (npc.locationId !== getCurrentLocation(game).id) return { allowed: false, reason: "抵达此地后方可交往" };
  const interaction = NPC_INTERACTIONS.find((item) => item.id === interactionId);
  if (!interaction) return { allowed: false, reason: "没有这种交往方式" };
  if (interaction.minRelationship !== undefined && npc.relationship < interaction.minRelationship) {
    return { allowed: false, reason: `关系至少达到${interaction.minRelationship}才能进行` };
  }
  if (interaction.id === "dissolve" && !npc.relationshipType) return { allowed: false, reason: "你们还没有特殊关系" };
  if ((interaction.id === "seekMentor" && npc.realmStage <= game.realmStage) || (interaction.id === "acceptDisciple" && npc.realmStage >= game.realmStage)) {
    return { allowed: false, reason: interaction.id === "seekMentor" ? "对方境界不高于你，无法拜师" : "对方境界不低于你，不必收为弟子" };
  }
  const missing = Object.entries(interaction.resourceCost ?? {}).find(([key, value]) => resourceQuantity(game, key as ResourceKey) < value);
  if (missing) {
    const labels: Partial<Record<keyof typeof game.resources, string>> = { spiritStones: "灵石", herbs: "灵草", qi: "灵力", stamina: "体力", mind: "心境", cultivation: "修为" };
    return { allowed: false, reason: `至少需要 ${missing[1]} 点${labels[missing[0] as keyof typeof labels] ?? missing[0]}` };
  }
  return { allowed: true };
}

function npcRelationshipDelta(npc: Npc, amount: number): number {
  return Math.max(-100, Math.min(100, npc.relationship + amount));
}

function finishNpcInteraction(game: GameState, npcId: string, interactionId: NpcInteractionId, generated?: AiGeneratedOutcome): GameState {
  if (!canInteractWithNpc(game, npcId, interactionId).allowed) return game;
  const npc = game.npcs.find((item) => item.id === npcId)!;
  const interaction = NPC_INTERACTIONS.find((item) => item.id === interactionId)!;
  const durationDays = interaction.durationDays ?? 1;
  let roll; let rng; [roll, rng] = nextRandom(game.rngState);
  let next = tick({ ...game, rngState: rng, npcs: game.npcs.map((item) => ({ ...item })) }, durationDays);
  const costs: Effect[] = Object.entries(interaction.resourceCost ?? {}).map(([key, amount]) => ({ type: "resource", key: key as ResourceKey, amount: -amount }));
  next = applyEffects(next, costs);
  let delta = 0;
  let message = "";
  let tone: Tone = "neutral";
  let title = `${npc.name} · ${interaction.name}`;
  if (generated) {
    next = applyEffects(next, generated.effects);
    delta = generated.relationshipDelta ?? 0;
    message = generated.text;
    tone = generated.tone;
    title = generated.title ?? title;
  } else if (interactionId === "converse") {
    delta = 5 + (npc.relationship < 0 ? 2 : 0);
    next = applyEffects(next, [{ type: "resource", key: "mind", amount: 2 }]);
    message = `你与${npc.name}在檐下闲谈，从彼此的来处聊到眼前的山河。几句真话，让关系多了一点温度。`;
    tone = "good";
  } else if (interactionId === "gift") {
    delta = 9 + Math.max(0, Math.round(npc.relationship / 20));
    message = `你送出三枚灵石，${npc.name}没有推辞，只把这份人情郑重收下。`;
    tone = "good";
  } else if (interactionId === "assist") {
    delta = 13;
    next = applyEffects(next, [{ type: "resource", key: "mind", amount: 3 }]);
    message = `你拿出灵草替${npc.name}解了燃眉之急。对方记下你的名字，也记下了这份不合算的善意。`;
    tone = "good";
  } else if (interactionId === "consult") {
    delta = 6;
    next = applyEffects(next, [{ type: "resource", key: "cultivation", amount: 12 + npc.stats.insight * 2 }, { type: "resource", key: "mind", amount: -2 }]);
    message = `${npc.name}将一段功法心得讲给你听。你未必立刻领悟，却在经脉运转间找到了新的角度。`;
    tone = "mystic";
  } else if (interactionId === "visit") {
    delta = 7;
    next = applyEffects(next, [{ type: "resource", key: "mind", amount: 3 }]);
    message = `你陪${npc.name}走过一段安静的山路。没有惊天动地的事发生，但彼此都把这段时光记在心里。`;
    tone = "good";
  } else if (interactionId === "seekMentor") {
    delta = 12;
    next = applyEffects(next, [{ type: "resource", key: "cultivation", amount: 18 + npc.stats.insight * 3 }]);
    message = `你向${npc.name}行弟子礼。对方沉默许久，终于接过你的拜师帖，从此你的修行多了一位引路人。`;
    tone = "mystic";
  } else if (interactionId === "acceptDisciple") {
    delta = 12;
    next = applyEffects(next, [{ type: "resource", key: "mind", amount: 6 }]);
    message = `${npc.name}在你面前行礼。你传下第一句口诀，也承担起一段师徒因果。`;
    tone = "mystic";
  } else if (interactionId === "swear") {
    delta = 14;
    message = `你与${npc.name}在山河见证下结拜。往后若有一人遇险，另一人便多一份必须赴约的理由。`;
    tone = "good";
  } else if (interactionId === "propose") {
    delta = 16;
    next = applyEffects(next, [{ type: "resource", key: "mind", amount: 8 }]);
    message = `你向${npc.name}坦白心意。对方没有回答得很快，却在暮色里与你并肩而立，许下共同求道的誓言。`;
    tone = "good";
  } else if (interactionId === "dissolve") {
    delta = -18;
    message = `你与${npc.name}把旧日的誓言一一说清，最终解开了彼此身上的因果。往后再见，也许只剩一声问候。`;
    tone = "danger";
  } else {
    const advantage = game.resources.battlePower - npc.battlePower;
    const chance = Math.max(0.15, Math.min(0.86, 0.45 + advantage * 0.01));
    if (roll < chance) {
      delta = 8;
      next = applyEffects(next, [{ type: "resource", key: "stamina", amount: -4 }]);
      message = `你与${npc.name}在空地上过了数十招。胜负点到即止，彼此都对对方的路数多了几分敬意。`;
      tone = "mystic";
    } else {
      delta = -5;
      next = applyEffects(next, [{ type: "resource", key: "stamina", amount: -10 }]);
      message = `你与${npc.name}切磋时低估了对方，最后只得带着酸痛收招。对方没有嘲笑你，但距离感明显多了一层。`;
      tone = "danger";
    }
  }
  const npcAfterTick = next.npcs.find((item) => item.id === npc.id) ?? npc;
  const updatedNpc = {
    ...npcAfterTick,
    relationship: npcRelationshipDelta(npc, delta),
    relationshipType: interaction.clearsRelationship
      ? undefined
      : interaction.setsRelationship ?? npc.relationshipType ?? (npcRelationshipDelta(npc, delta) >= 55 ? "friend" : undefined),
    lastInteractionTurn: next.turn,
  };
  next = { ...next, npcs: next.npcs.map((item) => item.id === npc.id ? updatedNpc : item) };
  const changes = eventChanges(game, next);
  if (delta !== 0) changes.push({ label: `${npc.name}关系`, amount: delta });
  if (interaction.setsRelationship) changes.push({ label: "特殊关系", amount: 1 });
  if (interaction.clearsRelationship) changes.push({ label: "特殊关系", amount: -1 });
  next = addLog(next, title, message, tone, { kind: "action", locationName: getCurrentLocation(game).name, changes, detail: interaction.setsRelationship ? `与${npc.name}结为${getNpcSpecialRelationshipLabel(interaction.setsRelationship)}` : `与${npc.name}建立关系`, durationDays });
  next = { ...next, eventResult: { kind: "action", title, text: message, tone, changes, durationDays } };
  return checkEnding(next);
}

export function interactWithNpc(game: GameState, npcId: string, interactionId: NpcInteractionId): GameState {
  return finishNpcInteraction(game, npcId, interactionId);
}

export function interactWithNpcWithAi(game: GameState, npcId: string, interactionId: NpcInteractionId, generated: AiGeneratedOutcome): GameState {
  return finishNpcInteraction(game, npcId, interactionId, generated);
}

export function getTravelPath(game: GameState, targetId: string): WorldLocation[] | undefined {
  const current = getCurrentLocation(game);
  const target = game.world.locations.find((location) => location.id === targetId);
  if (!target) return undefined;
  if (target.id === current.id) return [current];
  if (game.realmStage < target.unlockStage) return undefined;
  const locations = new Map(game.world.locations.map((location) => [location.id, location]));
  const queue = [current.id];
  const previous = new Map<string, string | undefined>([[current.id, undefined]]);
  while (queue.length) {
    const locationId = queue.shift()!;
    const location = locations.get(locationId);
    if (!location) continue;
    for (const nextId of location.connections) {
      const next = locations.get(nextId);
      if (!next || previous.has(nextId) || next.unlockStage > game.realmStage) continue;
      previous.set(nextId, locationId);
      if (nextId === target.id) {
        queue.length = 0;
        break;
      }
      queue.push(nextId);
    }
  }
  if (!previous.has(target.id)) return undefined;
  const pathIds: string[] = [];
  let cursor: string | undefined = target.id;
  while (cursor) {
    pathIds.unshift(cursor);
    cursor = previous.get(cursor);
  }
  return pathIds.map((id) => locations.get(id)!).filter(Boolean);
}

function canTravelLeg(game: GameState, targetId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "先处理眼前之事" };
  const current = getCurrentLocation(game);
  const target = game.world.locations.find((location) => location.id === targetId);
  if (!target) return { allowed: false, reason: "地图上没有此地" };
  if (target.id === current.id) return { allowed: false, reason: "你已身在此处" };
  if (!current.connections.includes(target.id)) return { allowed: false, reason: "此处没有直达道路" };
  if (game.realmStage < target.unlockStage) return { allowed: false, reason: `炼气${target.unlockStage}层方可踏足` };
  return { allowed: true };
}

export function canTravel(game: GameState, targetId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || hasPendingNarrative(game)) return { allowed: false, reason: "先处理眼前之事" };
  const current = getCurrentLocation(game);
  const target = game.world.locations.find((location) => location.id === targetId);
  if (!target) return { allowed: false, reason: "地图上没有此地" };
  if (target.id === current.id) return { allowed: false, reason: "你已身在此处" };
  if (game.realmStage < target.unlockStage) return { allowed: false, reason: `炼气${target.unlockStage}层方可踏足` };
  if (!getTravelPath(game, targetId)) return { allowed: false, reason: "没有可通行的路线" };
  return { allowed: true };
}

function finishTravelLeg(game: GameState, targetId: string, generated?: AiGeneratedOutcome): GameState {
  if (!canTravelLeg(game, targetId).allowed) return game;
  const origin = getCurrentLocation(game);
  const target = game.world.locations.find((location) => location.id === targetId)!;
  const durationDays = 1;
  let next = tick({ ...game, world: { ...game.world, currentLocationId: target.id } }, durationDays);
  next = applyEffects(next, [{ type: "resource", key: "qi", amount: -target.travelCost }]);
  const localTone: Tone = target.danger === "绝险" || target.danger === "凶险" ? "danger" : "neutral";
  const localText = `你离开${origin.name}，沿山道抵达${target.name}。行路消耗 ${target.travelCost} 点灵力。`;
  if (generated) next = applyEffects(next, generated.effects);
  const travelTone = generated?.tone ?? localTone;
  const travelText = generated?.text ?? localText;
  const title = generated?.title ?? "踏上行途";
  next = addLog(next, title, travelText, travelTone, { kind: "action", locationName: target.name, changes: eventChanges(game, next), detail: `从${origin.name}前往${target.name}`, durationDays });
  let eventRoll; [eventRoll, next.rngState] = nextRandom(next.rngState);
  const eventChance = Math.min(0.96, 0.48 + target.travelCost * 0.035 + (target.danger === "绝险" ? 0.1 : 0) + worldDangerModifier(next));
  if (eventRoll < eventChance) {
    let eventId; [eventId, next.rngState] = selectEvent(next, "travel");
    if (eventId) {
      next = queuePendingEvent(next, eventId);
      next.seenEvents = { ...next.seenEvents, [eventId]: (next.seenEvents[eventId] ?? 0) + 1 };
    }
  }
  next = withResult(game, next, title, travelText, travelTone, "action", durationDays);
  return checkEnding(next);
}

function travelSteps(game: GameState, steps: string[], generated?: AiGeneratedOutcome): GameState {
  let next: GameState = { ...game, travelPlan: undefined };
  for (let index = 0; index < steps.length; index += 1) {
    next = finishTravelLeg(next, steps[index], index === 0 ? generated : undefined);
    const remaining = steps.slice(index + 1);
    if (next.status !== "playing" || hasPendingNarrative(next)) {
      return remaining.length && next.status === "playing" ? { ...next, travelPlan: remaining } : { ...next, travelPlan: undefined };
    }
  }
  return { ...next, travelPlan: undefined };
}

function finishTravel(game: GameState, targetId: string, generated?: AiGeneratedOutcome): GameState {
  if (!canTravel(game, targetId).allowed) return game;
  const path = getTravelPath(game, targetId);
  if (!path || path.length < 2) return game;
  return travelSteps(game, path.slice(1).map((location) => location.id), generated);
}

export function travelTo(game: GameState, targetId: string): GameState {
  return finishTravel(game, targetId);
}

export function travelToWithAi(game: GameState, targetId: string, generated: AiGeneratedOutcome): GameState {
  return finishTravel(game, targetId, generated);
}

function isCombatChoice(choice: EventChoice): boolean {
  return /战|猎|夺回|挑战|硬抗|劫修|妖兽/.test(`${choice.label}${choice.hint}`);
}

function adjustedOutcomeWeights(game: GameState, choice: EventChoice): number[] {
  const stats = effectiveStats(game);
  const isCombat = isCombatChoice(choice);
  const combatBias = isCombat ? (game.resources.battlePower - 40) * 0.012 : 0;
  const positiveBias = (stats.fortune - 4) * 0.035 + (stats.spirit - 4) * 0.018 + combatBias - (game.character.talent.dangerModifier ?? 0);
  return choice.outcomes.map((outcome, index) => {
    if (choice.outcomes.length === 1) return outcome.weight;
    const isGood = (outcome.tone ?? "neutral") !== "danger";
    return Math.max(0.4, outcome.weight * (1 + (isGood ? positiveBias : -positiveBias)) + (index === 0 ? stats.constitution * 0.02 : 0));
  });
}

function chooseQuestOutcome(game: GameState, choice: QuestChoice): [QuestChoice["outcomes"][number], number] {
  const weights = adjustedOutcomeWeights(game, choice);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll; let rng; [roll, rng] = nextRandom(game.rngState);
  let cursor = roll * total;
  let index = 0;
  for (let i = 0; i < weights.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) { index = i; break; }
  }
  return [choice.outcomes[index], rng];
}

function resolveQuestStageInternal(game: GameState, choiceId: string, generated?: AiGeneratedOutcome): GameState {
  const current = getCurrentQuestStage(game);
  const choice = current?.stage.choices?.find((candidate) => candidate.id === choiceId);
  const continueWithoutChoice = choiceId === "__continue__" && !current?.stage.choices?.length;
  if (!current || current.stage.kind !== "encounter" || (!choice && !continueWithoutChoice) || (choice && !requirementMet(game, choice.requirement))) return game;
  let localOutcome: QuestChoice["outcomes"][number];
  let rngState = game.rngState;
  if (choice) {
    [localOutcome, rngState] = chooseQuestOutcome(game, choice);
  } else {
    localOutcome = { weight: 1, text: current.stage.body, tone: "mystic", result: "advance", effects: [] };
  }
  const durationDays = Math.max(1, Math.round(current.stage.durationDays ?? 1));
  let next = tick({ ...game, rngState, pendingQuestId: undefined }, durationDays);
  const afterClock = next.quests.find((progress) => progress.questId === current.quest.id && progress.status === "active");
  if (!afterClock) {
    const text = `你赶到关键处时，任务期限已经过去。“${current.quest.title}”没能继续。`;
    const changes = eventChanges(game, next);
    return { ...next, eventResult: { kind: "quest", title: `${current.quest.title} · 已逾期`, text, tone: "danger", changes, durationDays } };
  }
  const outcome = generated
    ? { ...localOutcome, text: generated.text, tone: generated.tone, effects: generated.effects }
    : localOutcome;
  next = applyEffects(next, outcome.effects);
  const result = localOutcome.result ?? "advance";
  if (result === "fail") return checkEnding(finalizeQuestFailure(game, next, current.quest, afterClock, outcome.text, current.stage.title, durationDays));
  if (result === "stay") {
    const stayed: QuestProgress = { ...afterClock, updatedTurn: next.turn };
    next = { ...next, quests: next.quests.map((progress) => progress.questId === stayed.questId && progress.status === "active" ? stayed : progress) };
    const changes = eventChanges(game, next);
    next = addLog(next, `${current.quest.title} · 受阻`, outcome.text, outcome.tone ?? "neutral", { kind: "quest", locationName: getCurrentLocation(next).name, changes, detail: `仍处于阶段 ${afterClock.stageIndex + 1}`, durationDays });
    return checkEnding({ ...next, eventResult: { kind: "quest", title: current.stage.title, text: outcome.text, tone: outcome.tone ?? "neutral", changes, durationDays } });
  }
  return checkEnding(finalizeQuestAdvance(game, next, current.quest, afterClock, outcome.text, outcome.tone ?? "neutral", durationDays));
}

export function resolveQuestStage(game: GameState, choiceId: string): GameState {
  return resolveQuestStageInternal(game, choiceId);
}

export function resolveQuestStageWithAi(game: GameState, choiceId: string, generated: AiGeneratedOutcome): GameState {
  return resolveQuestStageInternal(game, choiceId, generated);
}

function resolveEventInternal(game: GameState, choiceId: string, generated?: AiGeneratedOutcome): GameState {
  const event = game.pendingEventId ? eventDefinitionFor(game, game.pendingEventId) : undefined;
  const choice = event?.choices.find((item) => item.id === choiceId);
  if (!event || (event.choices.length > 0 && (!choice || !canChoose(game, choice)))) return game;

  let outcome: EventDefinition["choices"][number]["outcomes"][number];
  let rng = game.rngState;
  if (generated) {
    outcome = { weight: 1, text: generated.text, tone: generated.tone, effects: generated.effects };
  } else if (choice) {
    const weights = adjustedOutcomeWeights(game, choice);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll; [roll, rng] = nextRandom(game.rngState);
    let cursor = roll * total;
    let index = 0;
    for (let i = 0; i < weights.length; i += 1) {
      cursor -= weights[i];
      if (cursor <= 0) { index = i; break; }
    }
    outcome = choice.outcomes[index];
  } else {
    outcome = event.outcomes?.[0] ?? { weight: 1, text: "这场异闻没有留下更多波澜，日子照旧向前。", tone: "neutral", effects: [] };
  }

  const durationDays = Math.max(1, Math.round(event.durationDays ?? 1));
  let next = tick({ ...game, rngState: rng, pendingEventId: undefined }, durationDays);
  next = promotePendingEvent(next);
  next = applyEffects(next, outcome.effects);
  if (choice && isCombatChoice(choice) && outcome.tone === "danger") {
    const mitigation = Math.min(0.55, Math.max(0, (game.resources.battlePower - 30) * 0.01));
    if (mitigation > 0) next = applyEffects(next, [{ type: "resource", key: "stamina", amount: Math.round(Math.abs(game.resources.battlePower - 30) * 0.2 * mitigation) }]);
  }
  const resultTitle = generated?.title ?? event.title;
  next = addLog(next, resultTitle, outcome.text, outcome.tone ?? "neutral", { kind: "event", locationName: getCurrentLocation(game).name, changes: eventChanges(game, next), detail: choice ? `选择：${choice.label}` : "自动发生的异闻", durationDays });
  next = {
    ...next,
    eventResult: {
      kind: "event",
      title: resultTitle,
      text: outcome.text,
      tone: outcome.tone ?? "neutral",
      changes: eventChanges(game, next),
      durationDays,
    },
  };
  return checkEnding(next);
}

export function resolveEvent(game: GameState, choiceId: string): GameState {
  return resolveEventInternal(game, choiceId);
}

export function resolveEventWithAi(game: GameState, choiceId: string, generated: AiGeneratedOutcome): GameState {
  return resolveEventInternal(game, choiceId, generated);
}

export function getBreakthroughInfo(game: GameState, usePill: boolean) {
  const stats = effectiveStats(game);
  const factors: string[] = [];
  let chance = 0.69 - (game.realmStage - 1) * 0.025;
  chance += (stats.insight - 4) * 0.025 + (stats.constitution - 4) * 0.018;
  if (game.resources.mind >= game.resources.maxMind * 0.7) { chance += 0.08; factors.push("心境澄明"); }
  else if (game.resources.mind < game.resources.maxMind * 0.35) { chance -= 0.14; factors.push("心神不稳"); }
  if (game.resources.stamina < game.resources.maxStamina * 0.5) { chance -= 0.12; factors.push("体力未复"); }
  if (usePill && resourceQuantity(game, "pills") > 0) { chance += 0.16; factors.push("破障丹护持"); }
  if (game.statuses.some((status) => status.id === "prepared")) { chance += 0.1; factors.push("凝神备劫"); }
  if (stats.insight >= 7) factors.push("悟性出众");
  if (stats.constitution >= 7) factors.push("根骨强健");
  chance = Math.max(0.08, Math.min(0.94, chance));
  const label = chance < 0.25 ? "九死一生" : chance < 0.45 ? "凶险" : chance < 0.65 ? "可行" : chance < 0.82 ? "稳妥" : "十拿九稳";
  return { chance, label, factors: factors.length ? factors : ["根基平常"] };
}

export function canBreakthrough(game: GameState): boolean {
  return game.status === "playing" && game.realmStage < REALMS.length && !hasPendingNarrative(game) && actionAvailable(getCurrentLocation(game), "cultivate") && game.resources.cultivation >= game.resources.cultivationRequired;
}

export function breakthrough(game: GameState, usePill: boolean): GameState {
  if (!canBreakthrough(game) || (usePill && resourceQuantity(game, "pills") < 1)) return game;
  const info = getBreakthroughInfo(game, usePill);
  let roll; let rng; [roll, rng] = nextRandom(game.rngState);
  let next = tick({ ...game, rngState: rng });
  if (usePill) next = applyEffects(next, [{ type: "resource", key: "pills", amount: -1 }]);
  if (roll < info.chance) {
    const oldRealm = REALMS[next.realmStage - 1];
    const previousStage = next.realmStage;
    const oldMaxStamina = Math.max(1, next.resources.maxStamina);
    const oldMaxMind = Math.max(1, next.resources.maxMind);
    const oldStaminaRatio = Math.max(0, Math.min(1, next.resources.stamina / oldMaxStamina));
    const oldMindRatio = Math.max(0, Math.min(1, next.resources.mind / oldMaxMind));
    const staminaBonus = Math.max(0, next.resources.maxStamina - maxStaminaForStage(previousStage));
    const mindBonus = Math.max(0, next.resources.maxMind - maxMindForStage(previousStage));
    const qiBonus = Math.max(0, next.resources.maxQi - qiCapacityForStage(previousStage));
    const lifespanBonus = Math.max(0, next.resources.lifespan - lifespanForStage(previousStage));
    const battleBonus = Math.max(0, next.resources.battlePower - battlePowerForStage(previousStage));
    const oldCultivationRequired = Math.max(1, next.resources.cultivationRequired);
    next.realmStage += 1;
    next.resources.cultivation = Math.max(0, next.resources.cultivation - oldCultivationRequired);
    next.resources.cultivationRequired = cultivationRequiredForStage(next.realmStage);
    next.resources.maxStamina = maxStaminaForStage(next.realmStage) + staminaBonus;
    next.resources.maxHealth = next.resources.maxStamina;
    next.resources.stamina = Math.round(next.resources.maxStamina * oldStaminaRatio);
    next.resources.maxMind = maxMindForStage(next.realmStage) + mindBonus;
    next.resources.mind = Math.min(next.resources.maxMind, Math.round(next.resources.maxMind * oldMindRatio) + 12);
    next.resources.maxQi = qiCapacityForStage(next.realmStage) + qiBonus;
    next.resources.qi = next.resources.maxQi;
    next.resources.lifespan = lifespanForStage(next.realmStage) + lifespanBonus;
    next.resources.battlePower = battlePowerForStage(next.realmStage) + battleBonus;
    next.resources = clampResources(next.resources);
    const breakthroughText = `你冲开${oldRealm}的桎梏，踏入${REALMS[next.realmStage - 1]}。经脉扩张时的痛楚，勉强算是天地的掌声。`;
    next = addLog(next, "破境成功", breakthroughText, "mystic", { kind: "action", locationName: getCurrentLocation(game).name, changes: eventChanges(game, next), detail: `从${oldRealm}突破至${REALMS[next.realmStage - 1]}`, durationDays: 1 });
    next = withResult(game, next, "破境成功", breakthroughText, "mystic", "action", 1);
    if (next.realmStage >= REALMS.length) {
      next = { ...next, status: "ended", pendingEventId: undefined, pendingEventQueue: undefined, pendingQuestId: undefined };
      return { ...next, summary: summary("ascension", next) };
    }
  } else {
    const staminaLoss = Math.max(10, Math.round(maxStaminaForStage(next.realmStage) * 0.18));
    const mindLoss = Math.max(8, Math.round(maxMindForStage(next.realmStage) * 0.12));
    next = applyEffects(next, [{ type: "resource", key: "cultivation", amount: -Math.ceil(next.resources.cultivationRequired * 0.35) }, { type: "resource", key: "stamina", amount: -staminaLoss }, { type: "resource", key: "mind", amount: -mindLoss }]);
    const breakthroughText = "灵气在关窍前溃散，经脉受创。天道没有解释，只把你的申请退了回来。";
    next = addLog(next, "破境失败", breakthroughText, "danger", { kind: "action", locationName: getCurrentLocation(game).name, changes: eventChanges(game, next), detail: "冲关失败，经脉受创", durationDays: 1 });
    next = withResult(game, next, "破境失败", breakthroughText, "danger", "action", 1);
  }
  return checkEnding(next);
}

export function claimLegacy(game: GameState, meta: MetaProgress): { game: GameState; meta: MetaProgress } {
  if (!game.summary || game.legacyClaimed) return { game, meta };
  const discovered = Array.from(new Set([...meta.discoveredEvents, ...Object.keys(game.seenEvents)]));
  return {
    game: { ...game, legacyClaimed: true },
    meta: {
      ...meta,
      totalInsight: meta.totalInsight + game.summary.insightEarned,
      completedRuns: meta.completedRuns + 1,
      simulationLevel: Math.max(meta.simulationLevel ?? 1, meta.completedRuns + 2),
      victories: meta.victories + (game.summary.reason === "ascension" || game.summary.reason === "foundation" ? 1 : 0),
      discoveredEvents: discovered,
      bestScore: Math.max(meta.bestScore, game.summary.score),
    },
  };
}

export function getCurrentEvent(game: GameState): EventDefinition | undefined {
  return game.pendingEventId ? eventDefinitionFor(game, game.pendingEventId) : undefined;
}

export function dismissEventResult(game: GameState): GameState {
  if (!game.eventResult) return game;
  const cleared = promotePendingEvent({ ...game, eventResult: undefined });
  if (cleared.travelPlan?.length && cleared.status === "playing" && !hasPendingNarrative(cleared)) {
    return travelSteps(cleared, cleared.travelPlan);
  }
  return cleared;
}
