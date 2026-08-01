import { beforeEach, describe, expect, it } from "vitest";
import {
  breakthrough,
  canBreakthrough,
  canChoose,
  canInteractWithNpc,
  canPerformAction,
  canTravel,
  claimLegacy,
  createCandidates,
  dismissEventResult,
  emptyMeta,
  generateWorld,
  generateNpcs,
  getBreakthroughInfo,
  getNpcRelationshipLabel,
  getLocationModifiers,
  nextRandom,
  performAction,
  interactWithNpc,
  resolveEvent,
  startGame,
  travelTo,
} from "./engine";
import { exportSave, importSave, loadGame, loadMeta, saveGame, saveMeta } from "./storage";
import { eventMap, REALMS } from "./data";
import type { GameState } from "./types";

function fresh(seed = 12345) {
  const candidate = createCandidates(seed, emptyMeta())[0];
  return startGame(candidate, "沈照夜", seed);
}

function randomStateFor(predicate: (roll: number) => boolean) {
  for (let seed = 1; seed < 100_000; seed += 1) {
    if (predicate(nextRandom(seed)[0])) return seed;
  }
  throw new Error("No suitable RNG seed found");
}

describe("deterministic game engine", () => {
  it("defines nine layers for each realm before terminal ascension", () => {
    expect(REALMS).toHaveLength(55);
    expect(REALMS.slice(0, 9)).toEqual(["炼气一层", "炼气二层", "炼气三层", "炼气四层", "炼气五层", "炼气六层", "炼气七层", "炼气八层", "炼气九层"]);
    expect(REALMS.slice(9, 18)).toEqual(["筑基一层", "筑基二层", "筑基三层", "筑基四层", "筑基五层", "筑基六层", "筑基七层", "筑基八层", "筑基九层"]);
    expect(REALMS[REALMS.length - 1]).toBe("羽化飞升");
  });

  it("generates the same candidates from the same seed", () => {
    const first = createCandidates(20260801, emptyMeta());
    const second = createCandidates(20260801, emptyMeta());
    expect(second).toEqual(first);
    expect(new Set(first.map((item) => `${item.origin.id}-${item.talent.id}`)).size).toBe(3);
  });

  it("generates a stable but varied connected world for each run", () => {
    const first = generateWorld(20260801);
    const repeated = generateWorld(20260801);
    const another = generateWorld(20260802);
    expect(repeated).toEqual(first);
    expect(another).not.toEqual(first);
    expect(first.locations).toHaveLength(7);
    const visited = new Set<string>([first.currentLocationId]);
    const queue = [first.currentLocationId];
    while (queue.length) {
      const id = queue.shift()!;
      first.locations.find((location) => location.id === id)!.connections.forEach((next) => {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      });
    }
    expect(visited.size).toBe(first.locations.length);
  });

  it("generates deterministic NPCs across the world", () => {
    const world = generateWorld(20260801);
    const first = generateNpcs(20260801, world.locations);
    const repeated = generateNpcs(20260801, world.locations);
    expect(repeated).toEqual(first);
    expect(first.length).toBe(11);
    expect(new Set(first.map((npc) => npc.identity)).size).toBeGreaterThan(1);
    expect(new Set(first.map((npc) => npc.locationId)).size).toBe(world.locations.length);
    expect(first.every((npc) => npc.realmStage >= 1 && npc.realmStage < 55)).toBe(true);
  });

  it("builds NPC relationships through local interaction", () => {
    const game = fresh();
    const npc = game.npcs.find((item) => item.locationId === game.world.currentLocationId)!;
    const next = interactWithNpc(game, npc.id, "converse");
    const updated = next.npcs.find((item) => item.id === npc.id)!;
    expect(next.turn).toBe(1);
    expect(updated.relationship).toBeGreaterThan(npc.relationship);
    expect(updated.lastInteractionTurn).toBe(1);
    expect(next.chronicle[0].title).toContain(npc.name);
    expect(getNpcRelationshipLabel(updated.relationship)).toMatch(/陌生|相识|友善|亲近|莫逆/);
  });

  it("does not allow interacting with an NPC at another location", () => {
    const game = fresh();
    const npc = game.npcs.find((item) => item.locationId !== game.world.currentLocationId)!;
    const access = canInteractWithNpc(game, npc.id, "converse");
    expect(access.allowed).toBe(false);
    expect(access.reason).toContain("抵达此地");
    expect(interactWithNpc(game, npc.id, "converse")).toBe(game);
  });

  it("applies world size and danger settings when creating a run", () => {
    const small = generateWorld(20260801, { size: "small", danger: "calm", locationCount: 5 });
    const large = generateWorld(20260801, { size: "large", danger: "perilous", locationCount: 9 });
    expect(small.locations).toHaveLength(5);
    expect(large.locations).toHaveLength(9);
    expect(small.options).toEqual({ size: "small", danger: "calm", locationCount: 5 });
    expect(large.options).toEqual({ size: "large", danger: "perilous", locationCount: 9 });
  });

  it("keeps innate actions separate from location actions", () => {
    const game = fresh();
    expect(canPerformAction(game, "cultivate").allowed).toBe(true);
    expect(canPerformAction(game, "rest").allowed).toBe(true);
    const dangerous = game.world.locations.find((location) => location.role === "danger")!;
    const atDanger = { ...game, world: { ...game.world, currentLocationId: dangerous.id } };
    expect(getLocationModifiers(dangerous).blockedActions).toContain("rest");
    expect(canPerformAction(atDanger, "rest").allowed).toBe(false);
    expect(canPerformAction(atDanger, "market").allowed).toBe(false);
    const academy = game.world.locations.find((location) => location.role === "academy");
    if (academy) expect(getLocationModifiers(academy).cultivationBonus).toBeGreaterThan(0);
  });

  it("keeps a custom hundred-location world unique and connected", () => {
    const world = generateWorld(20260803, { size: "custom", danger: "balanced", locationCount: 100 });
    expect(world.locations).toHaveLength(100);
    expect(new Set(world.locations.map((location) => location.id)).size).toBe(100);
    const visited = new Set<string>([world.currentLocationId]);
    const queue = [world.currentLocationId];
    while (queue.length) {
      const id = queue.shift()!;
      world.locations.find((location) => location.id === id)!.connections.forEach((next) => {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      });
    }
    expect(visited.size).toBe(100);
  });

  it("advances exactly one day and clamps recovery", () => {
    const game = fresh();
    game.resources.stamina = game.resources.maxStamina - 2;
    game.resources.qi = game.resources.maxQi - 2;
    const next = performAction(game, "rest");
    expect(next.turn).toBe(1);
    expect(next.resources.stamina).toBe(next.resources.maxStamina);
    expect(next.resources.qi).toBe(next.resources.maxQi);
  });

  it("ends the life when age reaches lifespan", () => {
    const game = fresh();
    game.resources.age = game.resources.lifespan - 1 / 365;
    const next = performAction(game, "rest");
    expect(next.resources.age).toBeCloseTo(game.resources.lifespan);
    expect(next.status).toBe("ended");
    expect(next.summary?.title).toBe("寿元已尽");
  });

  it("consumes configurable cultivation days while keeping age in years", () => {
    const game = fresh();
    game.resources.qi = 100;
    const next = performAction(game, "cultivate", 7);
    expect(next.turn).toBe(7);
    expect(next.resources.age).toBeCloseTo(game.resources.age + 7 / 365);
    expect(next.eventResult?.durationDays).toBe(7);
  });

  it("opens the market and blocks choices without their price", () => {
    let game = fresh();
    expect(canPerformAction(game, "market").allowed).toBe(false);
    const marketLocation = game.world.locations.find((location) => location.role === "market")!;
    expect(canTravel(game, marketLocation.id).allowed).toBe(true);
    game = { ...travelTo(game, marketLocation.id), pendingEventId: undefined };
    game.resources.spiritStones = 0;
    const market = performAction(game, "market");
    expect(market.pendingEventId).toBe("market-day");
    const unchanged = resolveEvent(market, "buy-pill");
    expect(unchanged).toEqual(market);
    const listened = resolveEvent(market, "listen");
    expect(listened.pendingEventId).toBeUndefined();
  });

  it("records event results and their visible changes", () => {
    const game = { ...fresh(), pendingEventId: "market-day" };
    game.resources.mind = 40;
    const resolved = resolveEvent(game, "listen");
    expect(resolved.pendingEventId).toBeUndefined();
    expect(resolved.eventResult?.title).toBeDefined();
    expect(resolved.eventResult?.text).toBeDefined();
    expect(resolved.eventResult?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 3 })]));
    expect(dismissEventResult(resolved).eventResult).toBeUndefined();
  });

  it("automatically resolves events without choices", () => {
    const id = "test-automatic-event";
    eventMap.set(id, {
      id,
      title: "自动异闻",
      body: "没有需要选择的结果。",
      actions: ["rest"],
      choices: [],
      outcomes: [{ weight: 1, text: "异闻平息。", tone: "good", effects: [{ type: "resource", key: "mind", amount: 2 }] }],
    });
    try {
      const game = { ...fresh(), pendingEventId: id };
      game.resources.mind = 40;
      const resolved = resolveEvent(game, "");
      expect(resolved.pendingEventId).toBeUndefined();
      expect(resolved.eventResult?.text).toBe("异闻平息。");
      expect(resolved.eventResult?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 2 })]));
    } finally {
      eventMap.delete(id);
    }
  });

  it("travels only along unlocked roads and may trigger a sudden event", () => {
    let game = fresh();
    const market = game.world.locations.find((location) => location.role === "market")!;
    game.rngState = randomStateFor((roll) => roll < 0.05);
    const arrived = travelTo(game, market.id);
    expect(arrived.world.currentLocationId).toBe(market.id);
    expect(arrived.turn).toBe(1);
    expect(arrived.resources.qi).toBe(game.resources.qi - market.travelCost);
    expect(arrived.pendingEventId).toMatch(/^road-/);
    const settled = { ...arrived, pendingEventId: undefined };
    const sect = settled.world.locations.find((location) => location.role === "sect")!;
    const sectAccess = canTravel(settled, sect.id);
    expect(sectAccess.allowed).toBe(false);
    expect(sectAccess.reason).toMatch(/没有直达道路|炼气/);
  });

  it("uses a deterministic roll for a successful breakthrough", () => {
    const game = fresh();
    game.resources.cultivation = game.resources.cultivationRequired;
    game.rngState = randomStateFor((roll) => roll < 0.1);
    expect(canBreakthrough(game)).toBe(true);
    const next = breakthrough(game, false);
    expect(next.realmStage).toBe(2);
    expect(next.turn).toBe(1);
    expect(next.resources.lifespan).toBeGreaterThan(game.resources.lifespan);
    expect(next.resources.battlePower).toBeGreaterThan(game.resources.battlePower);
    expect(next.chronicle[0].title).toBe("破境成功");
  });

  it("damages the character after a failed breakthrough", () => {
    const game = fresh();
    game.resources.cultivation = game.resources.cultivationRequired;
    game.resources.mind = 1;
    game.rngState = randomStateFor((roll) => roll > 0.95);
    const info = getBreakthroughInfo(game, false);
    expect(info.label).toMatch(/凶险|可行/);
    const next = breakthrough(game, false);
    expect(next.realmStage).toBe(1);
    expect(next.resources.stamina).toBeLessThan(game.resources.stamina);
    expect(next.chronicle[0].title).toBe("破境失败");
  });

  it("continues after reaching the ninth layer", () => {
    const game = fresh();
    game.realmStage = 9;
    game.resources.cultivation = game.resources.cultivationRequired;
    game.rngState = randomStateFor((roll) => roll < 0.05);
    const next = breakthrough(game, false);
    expect(next.status).toBe("playing");
    expect(next.summary).toBeUndefined();
    expect(next.realmStage).toBe(10);
  });

  it("stops offering breakthroughs after ascension", () => {
    const game = fresh();
    game.realmStage = REALMS.length;
    game.resources.cultivation = game.resources.cultivationRequired;
    expect(canBreakthrough(game)).toBe(false);
    expect(breakthrough(game, false)).toBe(game);
  });

  it("ends the run after successfully ascending", () => {
    const game = fresh();
    game.realmStage = REALMS.length - 1;
    game.resources.cultivation = game.resources.cultivationRequired;
    game.rngState = randomStateFor((roll) => roll < 0.05);
    const next = breakthrough(game, false);
    expect(next.realmStage).toBe(REALMS.length);
    expect(next.status).toBe("ended");
    expect(next.pendingEventId).toBeUndefined();
    expect(next.summary?.reason).toBe("ascension");
    expect(next.summary?.title).toBe("羽化飞升");
  });

  it("awards legacy exactly once", () => {
    const ended: GameState = {
      ...fresh(),
      status: "ended",
      summary: { reason: "fallen", title: "终", epitaph: "终", score: 320, insightEarned: 2 },
      seenEvents: { "quiet-season": 1 },
    };
    const first = claimLegacy(ended, emptyMeta());
    const second = claimLegacy(first.game, first.meta);
    expect(first.meta.totalInsight).toBe(2);
    expect(second.meta.totalInsight).toBe(2);
    expect(second.meta.completedRuns).toBe(1);
  });

  it("counts ascension as a victory when claiming legacy", () => {
    const ended: GameState = {
      ...fresh(),
      status: "ended",
      summary: { reason: "ascension", title: "羽化飞升", epitaph: "终", score: 5320, insightEarned: 20 },
    };
    const result = claimLegacy(ended, emptyMeta());
    expect(result.meta.victories).toBe(1);
    expect(result.meta.completedRuns).toBe(1);
  });

  it("evaluates event resource requirements", () => {
    const game = fresh();
    game.pendingEventId = "market-day";
    const event = resolveEvent(game, "listen");
    expect(event.pendingEventId).toBeUndefined();
    game.resources.spiritStones = 0;
    const market = { label: "x", hint: "x", id: "x", requirement: { resource: { spiritStones: 1 } }, outcomes: [] };
    expect(canChoose(game, market)).toBe(false);
  });
});

describe("versioned storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips the active game and meta progress", () => {
    const game = fresh();
    const meta = { ...emptyMeta(), totalInsight: 7 };
    saveGame(game); saveMeta(meta);
    expect(loadGame()).toEqual(game);
    expect(loadMeta()).toEqual(meta);
    const imported = importSave(exportSave(game, meta));
    expect(imported.game).toEqual(game);
    expect(imported.meta.totalInsight).toBe(7);
  });

  it("rejects corrupted or incompatible saves", () => {
    expect(() => importSave("not-json")).toThrow();
    expect(() => importSave(JSON.stringify({ version: 99 }))).toThrow(/版本/);
  });

  it("adds a deterministic world map to older saves", () => {
    const legacy = { ...fresh(9876) } as Partial<GameState>;
    delete legacy.world;
    saveGame(legacy as GameState);
    const migrated = loadGame();
    expect(migrated?.world.locations).toHaveLength(7);
    expect(migrated?.world).toEqual(generateWorld(9876));
  });
});
