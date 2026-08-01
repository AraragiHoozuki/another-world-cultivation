import { getCurrentLocation } from "./engine";
import type {
  ActionDefinition,
  AiGeneratedOutcome,
  AiSettings,
  CoreStat,
  Effect,
  EventChoice,
  EventDefinition,
  GameState,
  Npc,
  NpcInteractionDefinition,
  ResourceKey,
  Tone,
} from "./types";

const DEFAULT_ENDPOINTS: Record<AiSettings["format"], string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

const DEFAULT_MODELS: Record<AiSettings["format"], string> = {
  openai: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-latest",
};

const RESOURCE_KEYS: ResourceKey[] = [
  "health", "stamina", "lifespan", "age", "battlePower", "qi", "mind", "cultivation",
  "spiritStones", "herbs", "pills",
];
const STAT_KEYS: CoreStat[] = ["constitution", "insight", "spirit", "fortune"];
const TONES: Tone[] = ["neutral", "good", "danger", "mystic"];

const SYSTEM_PROMPT = `你是《异界问道》的叙事裁定者。根据给定的游戏上下文，裁定一次行动或事件的结果。
只输出一个合法 JSON 对象，不要 Markdown、代码围栏、解释或额外文字。JSON 必须符合：
{
  "title": "不超过 24 个汉字的结果标题",
  "text": "100 至 300 字的中文结果文案",
  "tone": "neutral | good | danger | mystic",
  "relationshipDelta": 整数（仅 NPC 互动填写，范围 -30 至 30；普通行动或事件可省略）, 
  "effects": [
    { "type": "resource", "key": "资源名", "amount": 数字 },
    { "type": "stat", "key": "根骨对应的英文键", "amount": 整数 },
    { "type": "status", "status": { "id": "英文或短标识", "name": "名称", "description": "描述", "remaining": 天数 } },
    { "type": "flag", "key": "事件标记" }
  ]
}
resource key 只能是 health、stamina、lifespan、age、battlePower、qi、mind、cultivation、spiritStones、herbs、pills；stat key 只能是 constitution、insight、spirit、fortune。
效果应符合行动成本、角色能力和世界危险程度；不要修改未提及的属性，不要伪造天数。NPC 互动和行途的固定资源消耗已由程序自动应用，effects 不要重复填写这些消耗。所有数值都是相对变化量。`;

export function isAiConfigured(settings: AiSettings): boolean {
  return settings.enabled && Boolean(settings.apiKey.trim()) && Boolean(settings.model.trim()) && Boolean(settings.endpoint.trim() || DEFAULT_ENDPOINTS[settings.format]);
}

function completionEndpoint(settings: AiSettings): string {
  const raw = settings.endpoint.trim() || DEFAULT_ENDPOINTS[settings.format];
  if (settings.format === "openai") {
    if (/\/chat\/completions\/?$/i.test(raw)) return raw;
    if (/\/v1\/?$/i.test(raw)) return `${raw.replace(/\/$/, "")}/chat/completions`;
    if (/\/models\/?$/i.test(raw)) return raw.replace(/\/models\/?$/i, "/chat/completions");
    if (/^https?:\/\/[^/]+\/?$/i.test(raw)) return `${raw.replace(/\/$/, "")}/v1/chat/completions`;
    return raw;
  }
  if (/\/messages\/?$/i.test(raw)) return raw;
  if (/\/v1\/?$/i.test(raw)) return `${raw.replace(/\/$/, "")}/messages`;
  if (/\/models\/?$/i.test(raw)) return raw.replace(/\/models\/?$/i, "/messages");
  if (/^https?:\/\/[^/]+\/?$/i.test(raw)) return `${raw.replace(/\/$/, "")}/v1/messages`;
  return raw;
}

function modelsEndpoint(settings: AiSettings): string {
  const raw = settings.endpoint.trim() || DEFAULT_ENDPOINTS[settings.format];
  if (/\/(chat\/completions|messages)\/?$/i.test(raw)) return raw.replace(/\/(chat\/completions|messages)\/?$/i, "/models");
  if (/\/models\/?$/i.test(raw)) return raw;
  if (/\/v1\/?$/i.test(raw)) return `${raw.replace(/\/$/, "")}/models`;
  if (/^https?:\/\/[^/]+\/?$/i.test(raw)) return `${raw.replace(/\/$/, "")}/v1/models`;
  return `${raw.replace(/\/$/, "")}/models`;
}

function modelName(settings: AiSettings): string {
  return settings.model.trim() || DEFAULT_MODELS[settings.format];
}

function jsonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
    .join("\n");
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const requestInit = { ...init, signal: controller.signal };
    const isExternal = /^https?:\/\//i.test(url);
    let response: Response;
    if (isExternal && typeof window !== "undefined") {
      const proxyUrl = `${window.location.origin}/api/ai-proxy?url=${encodeURIComponent(url)}`;
      try {
        const proxied = await fetch(proxyUrl, requestInit);
        const contentType = proxied.headers.get("content-type") ?? "";
        // Static hosts often return index.html for unknown routes. In that case,
        // fall back to direct mode so servers with CORS enabled still work.
        if ((proxied.status === 404 || proxied.status === 405) || (proxied.ok && contentType.includes("text/html"))) {
          response = await fetch(url, requestInit);
        } else {
          response = proxied;
        }
      } catch {
        response = await fetch(url, requestInit);
      }
    } else {
      response = await fetch(url, requestInit);
    }
    const body = await response.text();
    let parsed: unknown;
    try { parsed = body ? JSON.parse(body) : undefined; } catch { parsed = undefined; }
    if (!response.ok) {
      const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : body;
      throw new Error(`AI 接口返回 ${response.status}${detail ? `：${detail.slice(0, 180)}` : ""}`);
    }
    return parsed;
  } finally {
    window.clearTimeout(timeout);
  }
}

function headers(settings: AiSettings): Record<string, string> {
  if (settings.format === "claude") {
    return {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey.trim()}` };
}

function contextFor(game: GameState): Record<string, unknown> {
  const location = getCurrentLocation(game);
  return {
    day: game.turn,
    ageYears: Number(game.resources.age.toFixed(2)),
    lifespanYears: Number(game.resources.lifespan.toFixed(2)),
    realmStage: game.realmStage,
    realm: game.realmStage,
    character: {
      name: game.character.name,
      origin: game.character.origin.name,
      spiritRoot: game.character.spiritRoot.name,
      talent: game.character.talent.name,
      stats: game.character.stats,
    },
    resources: game.resources,
    inventory: game.inventory,
    statuses: game.statuses,
    flags: game.flags,
    world: {
      size: game.world.options.size,
      danger: game.world.options.danger,
      locationCount: game.world.locations.length,
      currentLocation: {
        id: location.id,
        name: location.name,
        role: location.role,
        danger: location.danger,
        description: location.description,
      },
    },
    recentChronicle: game.chronicle.slice(0, 8).map((entry) => ({ day: entry.turn, title: entry.title, text: entry.text, kind: entry.kind })),
  };
}

function actionPayload(game: GameState, action: ActionDefinition, durationDays: number): Record<string, unknown> {
  return { kind: "action", action: { id: action.id, name: action.name, description: action.description, risk: action.risk, durationDays }, context: contextFor(game) };
}

function npcPayload(game: GameState, npc: Npc, interaction: NpcInteractionDefinition): Record<string, unknown> {
  return {
    kind: "npc_interaction",
    action: {
      id: `npc:${interaction.id}`,
      name: interaction.name,
      description: interaction.description,
      durationDays: interaction.durationDays ?? 1,
      resourceCost: interaction.resourceCost ?? {},
      establishesRelationship: interaction.setsRelationship,
      clearsRelationship: interaction.clearsRelationship ?? false,
    },
    npc: {
      name: npc.name,
      identity: npc.identity,
      gender: npc.gender,
      personality: npc.personality,
      description: npc.description,
      ageYears: Number(npc.age.toFixed(1)),
      lifespanYears: Number(npc.lifespan.toFixed(1)),
      stats: npc.stats,
      realmStage: npc.realmStage,
      battlePower: npc.battlePower,
      relationship: npc.relationship,
      relationshipType: npc.relationshipType,
      attention: npc.attention,
      alive: npc.alive,
    },
    context: contextFor(game),
  };
}

function travelPayload(game: GameState, target: { id: string; name: string; subtitle: string; description: string; danger: string; travelCost: number }): Record<string, unknown> {
  return {
    kind: "travel",
    action: { id: "travel", name: "踏上行途", description: "沿道路前往相邻地点", durationDays: 1, resourceCost: { qi: target.travelCost } },
    destination: { id: target.id, name: target.name, subtitle: target.subtitle, description: target.description, danger: target.danger, travelCost: target.travelCost },
    context: contextFor(game),
  };
}

function eventPayload(game: GameState, event: EventDefinition, choice?: EventChoice): Record<string, unknown> {
  return {
    kind: "event",
    event: { id: event.id, title: event.title, body: event.body, durationDays: event.durationDays ?? 1 },
    choice: choice ? { id: choice.id, label: choice.label, hint: choice.hint } : null,
    context: contextFor(game),
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 返回的内容不是 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function boundedNumber(value: unknown, min: number, max: number, integer = false): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const result = Math.max(min, Math.min(max, value));
  return integer ? Math.round(result) : result;
}

function sanitizeEffect(value: unknown): Effect | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "resource" && typeof candidate.key === "string" && RESOURCE_KEYS.includes(candidate.key as ResourceKey)) {
    const amount = boundedNumber(candidate.amount, -500, 500);
    return amount === undefined ? undefined : { type: "resource", key: candidate.key as ResourceKey, amount };
  }
  if (candidate.type === "stat" && typeof candidate.key === "string" && STAT_KEYS.includes(candidate.key as CoreStat)) {
    const amount = boundedNumber(candidate.amount, -3, 3, true);
    return amount === undefined ? undefined : { type: "stat", key: candidate.key as CoreStat, amount };
  }
  if (candidate.type === "flag" && typeof candidate.key === "string" && /^[\w-]{1,40}$/.test(candidate.key)) return { type: "flag", key: candidate.key };
  if (candidate.type === "status" && candidate.status && typeof candidate.status === "object") {
    const status = candidate.status as Record<string, unknown>;
    if (typeof status.id !== "string" || typeof status.name !== "string" || typeof status.description !== "string") return undefined;
    const remaining = boundedNumber(status.remaining, 1, 3650, true);
    if (remaining === undefined) return undefined;
    const stats = status.stats && typeof status.stats === "object"
      ? Object.fromEntries(STAT_KEYS.flatMap((key) => {
        const amount = boundedNumber((status.stats as Record<string, unknown>)[key], -3, 3, true);
        return amount === undefined ? [] : [[key, amount]];
      }))
      : undefined;
    const cultivationBonus = boundedNumber(status.cultivationBonus, -0.8, 1.5);
    const dangerModifier = boundedNumber(status.dangerModifier, -0.8, 0.8);
    return {
      type: "status",
      status: {
        id: status.id.slice(0, 40),
        name: status.name.slice(0, 40),
        description: status.description.slice(0, 120),
        remaining,
        ...(stats && Object.keys(stats).length ? { stats } : {}),
        ...(cultivationBonus === undefined ? {} : { cultivationBonus }),
        ...(dangerModifier === undefined ? {} : { dangerModifier }),
      },
    };
  }
  return undefined;
}

function parseOutcome(rawText: string): AiGeneratedOutcome {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回对象无效");
  const value = parsed as Record<string, unknown>;
  if (typeof value.text !== "string" || value.text.trim().length < 2) throw new Error("AI 返回缺少有效文案");
  if (!Array.isArray(value.effects)) throw new Error("AI 返回缺少 effects 数组");
  const tone = TONES.includes(value.tone as Tone) ? value.tone as Tone : "neutral";
  const parsedEffects = value.effects.map(sanitizeEffect);
  if (parsedEffects.some((effect) => !effect)) throw new Error("AI 返回了无法识别的属性变化");
  const effects = parsedEffects.filter((effect): effect is Effect => Boolean(effect)).slice(0, 12);
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 24) : undefined,
    text: value.text.trim().slice(0, 500),
    tone,
    effects,
    relationshipDelta: boundedNumber(value.relationshipDelta, -30, 30, true),
  };
}

async function requestOutcome(settings: AiSettings, payload: Record<string, unknown>): Promise<AiGeneratedOutcome> {
  if (!isAiConfigured(settings)) throw new Error("请先完整填写 AI 接口、密钥和模型");
  const body = settings.format === "claude"
    ? {
      model: modelName(settings),
      max_tokens: 900,
      temperature: 0.8,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }
    : {
      model: modelName(settings),
      temperature: 0.8,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
    };
  const response = await requestJson(completionEndpoint(settings), { method: "POST", headers: headers(settings), body: JSON.stringify(body) });
  const content = settings.format === "claude"
    ? jsonText(response && typeof response === "object" ? (response as { content?: unknown }).content : undefined)
    : jsonText(response && typeof response === "object" ? (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content : undefined);
  if (!content) throw new Error("AI 响应中没有可解析的文案");
  return parseOutcome(content);
}

export async function requestAiAction(settings: AiSettings, game: GameState, action: ActionDefinition, durationDays: number): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, actionPayload(game, action, durationDays));
}

export async function requestAiEvent(settings: AiSettings, game: GameState, event: EventDefinition, choice?: EventChoice): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, eventPayload(game, event, choice));
}

export async function requestAiNpcInteraction(settings: AiSettings, game: GameState, npc: Npc, interaction: NpcInteractionDefinition): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, npcPayload(game, npc, interaction));
}

export async function requestAiTravel(settings: AiSettings, game: GameState, target: { id: string; name: string; subtitle: string; description: string; danger: string; travelCost: number }): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, travelPayload(game, target));
}

function modelIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as { data?: unknown; models?: unknown };
  const list = Array.isArray(candidate.data) ? candidate.data : Array.isArray(candidate.models) ? candidate.models : [];
  return Array.from(new Set(list.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") return [(item as { id: string }).id];
    return [];
  }))).sort();
}

export async function fetchAiModels(settings: AiSettings): Promise<string[]> {
  if (!settings.apiKey.trim()) throw new Error("请先填写 API Key");
  const response = await requestJson(modelsEndpoint(settings), { method: "GET", headers: headers(settings) });
  const models = modelIds(response);
  if (!models.length) throw new Error("接口没有返回可用模型列表，请手动填写模型名");
  return models;
}
