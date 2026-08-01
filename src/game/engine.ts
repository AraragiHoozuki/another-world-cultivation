import { ACTIONS, EVENTS, INITIAL_INVENTORY, LOCATION_POOLS, NPC_GIVEN_NAMES, NPC_INTERACTIONS, NPC_PERSONALITIES, NPC_SURNAMES, ORIGINS, REALMS, SPIRIT_ROOTS, TALENTS, eventMap, identityForRole, NPC_IDENTITIES, itemMap } from "./data";
import type {
  ActionId,
  AiGeneratedOutcome,
  CharacterCandidate,
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
  Requirement,
  ResourceKey,
  Resources,
  RunSummary,
  Tone,
  WorldLocation,
  WorldMapState,
  WorldOptions,
} from "./types";

export const DEFAULT_WORLD_OPTIONS: WorldOptions = { size: "medium", danger: "balanced", locationCount: 7 };
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
  victories: 0,
  discoveredEvents: [],
  bestScore: 0,
});

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

function draw<T>(items: T[], state: number): [T, number] {
  const [roll, next] = nextRandom(state);
  return [items[Math.floor(roll * items.length)] ?? items[0], next];
}

function addPartial<T extends object>(base: T, patch?: Partial<T>): T {
  const result = { ...base };
  if (patch) Object.entries(patch).forEach(([key, value]) => {
    const typedKey = key as keyof T;
    result[typedKey] = ((result[typedKey] as number) + (value as number)) as T[keyof T];
  });
  return result;
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

export function startGame(candidate: CharacterCandidate, name: string, seed: number, worldOptions: WorldOptions = DEFAULT_WORLD_OPTIONS): GameState {
  const world = generateWorld(seed, worldOptions);
  const inventoryMap = new Map(INITIAL_INVENTORY.map((entry) => [entry.itemId, entry.quantity]));
  (Object.keys(RESOURCE_ITEM_IDS) as Array<keyof typeof RESOURCE_ITEM_IDS>).forEach((resourceKey) => {
    const itemId = RESOURCE_ITEM_IDS[resourceKey];
    const quantity = Math.max(0, Math.floor(candidate.resources[resourceKey] ?? 0));
    if (quantity > 0) inventoryMap.set(itemId, (inventoryMap.get(itemId) ?? 0) + quantity);
  });
  return {
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
      origin: candidate.origin,
      spiritRoot: candidate.spiritRoot,
      talent: candidate.talent,
      stats: candidate.stats,
    },
    resources: { ...candidate.resources },
    inventory: Array.from(inventoryMap, ([itemId, quantity]) => ({ itemId, quantity })),
    statuses: [],
    flags: [],
    seenEvents: {},
    chronicle: [{ id: "arrival", turn: 0, title: "坠入异界", text: "醒来时，你掌心多了一道界蚀印。没有天命，也没有期限；这一生要走向哪里，由你自己决定。", tone: "mystic" }],
    legacyClaimed: false,
  };
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

export function getItem(itemId: string): ItemDefinition | undefined {
  return itemMap.get(itemId);
}

export function getItemQuantity(game: GameState, itemId: string): number {
  if (itemId === RESOURCE_ITEM_IDS.herbs && !game.inventory?.some((entry) => entry.itemId === itemId)) return Math.max(0, game.resources.herbs);
  if (itemId === RESOURCE_ITEM_IDS.pills && !game.inventory?.some((entry) => entry.itemId === itemId)) return Math.max(0, game.resources.pills);
  return inventoryQuantity(game, itemId);
}

export function canUseItem(game: GameState, itemId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "请先处理眼前之事" };
  const item = itemMap.get(itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  if (item.category !== "consumable" || !item.effects?.length) return { allowed: false, reason: "此物品不能直接使用" };
  if (inventoryQuantity(game, itemId) < 1) return { allowed: false, reason: "物品栏中没有此物品" };
  return { allowed: true };
}

function canTrade(game: GameState): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "请先处理眼前之事" };
  if (!actionAvailable(getCurrentLocation(game), "market")) return { allowed: false, reason: "抵达提供坊市交易的地点后方可交易" };
  return { allowed: true };
}

export function canBuyItem(game: GameState, itemId: string, quantity = 1): { allowed: boolean; reason?: string } {
  const item = itemMap.get(itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  const trade = canTrade(game);
  if (!trade.allowed) return trade;
  if (item.category === "quest" || item.price <= 0) return { allowed: false, reason: "此物品不在坊市出售" };
  const count = Math.max(1, Math.floor(quantity));
  if (game.resources.spiritStones < item.price * count) return { allowed: false, reason: `至少需要 ${item.price * count} 灵石` };
  return { allowed: true };
}

export function canSellItem(game: GameState, itemId: string, quantity = 1): { allowed: boolean; reason?: string } {
  const item = itemMap.get(itemId);
  if (!item) return { allowed: false, reason: "没有此物品" };
  const trade = canTrade(game);
  if (!trade.allowed) return trade;
  if (item.category === "quest" || item.sellPrice <= 0) return { allowed: false, reason: "剧情物品不可出售" };
  const count = Math.max(1, Math.floor(quantity));
  if (inventoryQuantity(game, itemId) < count) return { allowed: false, reason: "物品数量不足" };
  return { allowed: true };
}

export function canGiftItem(game: GameState, npcId: string, itemId: string, quantity = 1): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "请先处理眼前之事" };
  const item = itemMap.get(itemId);
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
  const item = itemMap.get(itemId);
  if (!access.allowed || !item) return game;
  const before = game;
  let next = changeInventory(game, itemId, -1);
  next = applyEffects(next, item.effects ?? []);
  return itemActionResult(before, next, `使用${item.name}`, `你取出${item.name}，药力或灵息在经脉中慢慢散开。`, "good");
}

export function buyItem(game: GameState, itemId: string, quantity = 1): GameState {
  const count = Math.max(1, Math.floor(quantity));
  const access = canBuyItem(game, itemId, count);
  const item = itemMap.get(itemId);
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
  const item = itemMap.get(itemId);
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
  const item = itemMap.get(itemId);
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
    const item = itemMap.get(itemId);
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
  const entry: ChronicleEntry = { id: `${game.turn}-${game.rngState}-${game.chronicle.length}`, turn: game.turn, title, text, tone, ...details };
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
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "先处理眼前之事" };
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
  return {
    ...game,
    turn: game.turn + days,
    rngState: npcLife.rngState,
    resources: { ...game.resources, age: game.resources.age + days / DAYS_PER_YEAR },
    statuses: game.statuses.map((status) => ({ ...status, remaining: status.remaining - days })).filter((status) => status.remaining > 0),
    npcs: npcLife.npcs,
    chronicle: lifeEntries.length ? [...lifeEntries, ...game.chronicle].slice(0, 60) : game.chronicle,
  };
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
  let next = tick({ ...game, pendingEventId: undefined }, durationDays);
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
        next.pendingEventId = eventId;
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
  const eligible = EVENTS.filter((event) => event.id !== "market-day" && eventEligible(event, game, trigger));
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
  if (game.resources.stamina <= 0 || game.resources.age >= game.resources.lifespan) return { ...game, status: "ended", pendingEventId: undefined, summary: summary("fallen", game) };
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
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "先处理眼前之事" };
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
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "先处理眼前之事" };
  const current = getCurrentLocation(game);
  const target = game.world.locations.find((location) => location.id === targetId);
  if (!target) return { allowed: false, reason: "地图上没有此地" };
  if (target.id === current.id) return { allowed: false, reason: "你已身在此处" };
  if (!current.connections.includes(target.id)) return { allowed: false, reason: "此处没有直达道路" };
  if (game.realmStage < target.unlockStage) return { allowed: false, reason: `炼气${target.unlockStage}层方可踏足` };
  return { allowed: true };
}

export function canTravel(game: GameState, targetId: string): { allowed: boolean; reason?: string } {
  if (game.status !== "playing" || game.pendingEventId) return { allowed: false, reason: "先处理眼前之事" };
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
      next.pendingEventId = eventId;
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
    if (next.status !== "playing" || next.pendingEventId) {
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

function resolveEventInternal(game: GameState, choiceId: string, generated?: AiGeneratedOutcome): GameState {
  const event = game.pendingEventId ? eventMap.get(game.pendingEventId) : undefined;
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
  return game.status === "playing" && game.realmStage < REALMS.length && !game.pendingEventId && actionAvailable(getCurrentLocation(game), "cultivate") && game.resources.cultivation >= game.resources.cultivationRequired;
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
      next = { ...next, status: "ended", pendingEventId: undefined };
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
      victories: meta.victories + (game.summary.reason === "ascension" || game.summary.reason === "foundation" ? 1 : 0),
      discoveredEvents: discovered,
      bestScore: Math.max(meta.bestScore, game.summary.score),
    },
  };
}

export function getCurrentEvent(game: GameState): EventDefinition | undefined {
  return game.pendingEventId ? eventMap.get(game.pendingEventId) : undefined;
}

export function dismissEventResult(game: GameState): GameState {
  if (!game.eventResult) return game;
  const cleared = { ...game, eventResult: undefined };
  if (cleared.travelPlan?.length && cleared.status === "playing" && !cleared.pendingEventId) {
    return travelSteps(cleared, cleared.travelPlan);
  }
  return cleared;
}
