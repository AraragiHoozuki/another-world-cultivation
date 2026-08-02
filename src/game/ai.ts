import { getCurrentLocation } from "./engine";
import { EVENTS, ITEMS, NPC_IDENTITIES, QUESTS } from "./data";
import type {
  ActionDefinition,
  ActionId,
  AiGeneratedContentBundle,
  AiEventRewrite,
  AiExploreResult,
  AiGeneratedLocationDraft,
  AiGeneratedOutcome,
  AiQuestStageRewrite,
  AiQuestGenerationTrigger,
  AiResultRewrite,
  AiSettings,
  CharacterCandidate,
  CoreStat,
  CoreStats,
  Effect,
  EventChoice,
  EventDefinition,
  EventResult,
  EventTrigger,
  GameState,
  ItemCategory,
  ItemDefinition,
  ItemRarity,
  LifeArchive,
  LocationRole,
  LocationModifiers,
  Npc,
  NpcIdentity,
  NpcInteractionDefinition,
  NpcGender,
  NarrativeMessage,
  QuestObjective,
  QuestChoice,
  QuestDefinition,
  QuestOutcome,
  QuestStageDefinition,
  Requirement,
  ResourceKey,
  Resources,
  Tone,
  TraitDefinition,
  TraitRarity,
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
const LOCATION_ROLES: LocationRole[] = ["sanctuary", "market", "herbal", "water", "danger", "sect", "secret", "settlement", "mine", "academy", "rift"];
const ACTION_IDS: ActionId[] = ["cultivate", "explore", "gather", "alchemy", "market", "rest"];
const ITEM_CATEGORIES: ItemCategory[] = ["consumable", "material", "artifact", "quest"];
const ITEM_RARITIES: ItemRarity[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TRAIT_RARITIES: TraitRarity[] = ["gray", "white", "green", "blue", "purple", "rainbow"];
const TRAIT_RESOURCE_KEYS: Array<keyof Resources> = ["health", "maxHealth", "stamina", "maxStamina", "lifespan", "battlePower", "qi", "maxQi", "mind", "maxMind", "spiritStones", "herbs", "pills"];
const TRAIT_SYSTEM_PROMPT = `你是《异界问道》的开局命格设计师。根据给定的候选角色与模拟等级，生成一组有趣但可玩的初始词条。词条应当是小幅、可叠加的数值修正和鲜明的叙事标签，不能让角色直接无敌，也不能修改年龄、修为需求或境界。只输出一个合法 JSON 对象，不要 Markdown、代码围栏、解释或额外文字。
顶层格式：
{
  "traits": [
    {
      "id": "英文短 id",
      "name": "不超过 12 个汉字的词条名",
      "description": "不超过 80 个汉字的描述",
      "rarity": "gray | white | green | blue | purple | rainbow",
      "cost": 1,
      "stats": { "constitution": 0, "insight": 0, "spirit": 0, "fortune": 0 },
      "resources": { "stamina": 0, "maxStamina": 0, "qi": 0, "maxQi": 0, "mind": 0, "maxMind": 0, "lifespan": 0, "battlePower": 0, "spiritStones": 0 },
      "cultivationBonus": 0,
      "alchemyBonus": 0,
      "explorationBonus": 0,
      "dangerModifier": 0
    }
  ]
}
只填写确实需要的字段。stats 每项范围为 -3 至 5 的整数；资源是相对变化量；加成范围为 -0.25 至 0.5；cost 为 1 至 8 的整数。词条数量必须等于要求数量，且 rarity 越高越稀有、cost 越高。`;
const NPC_GENDERS: NpcGender[] = ["male", "female", "unknown"];
const NPC_IDENTITY_IDS: NpcIdentity[] = NPC_IDENTITIES.map((identity) => identity.id);

const STORY_STYLE_GUIDE = `文风要像一部好看的中文网络小说：具体、自然、有画面，人物说话像活人，不要堆砌“玄之又玄、道韵流转”一类空泛古雅词。长短句交替，叙述、动作、对话穿插，避免每次都用同一种三段式或“只见……随后……”的句式。允许一点幽默、迟疑、误会和不体面的细节，让结果有现场感，但不要喧宾夺主。`;
const EFFECT_PROTOCOL_GUIDE = `effects 可混合使用以下效果：
- 资源：{ "type": "resource", "key": "health | stamina | lifespan | age | battlePower | qi | mind | cultivation | spiritStones | herbs | pills", "amount": 数字 }
- 基础属性：{ "type": "stat", "key": "constitution | insight | spirit | fortune", "amount": -3至3整数 }
- 物品：{ "type": "item", "itemId": "context.availableItems 中已有的 id，或本次 worldContent 新物品 id", "amount": 整数 }
- 永久词条：{ "type": "trait", "trait": { "id": "英文短标识", "name": "词条名", "description": "身份、状态或经历及其具体作用", "rarity": "gray | white | green | blue | purple | rainbow", "cost": 0, "stats": {}, "resources": {}, "cultivationBonus": 0, "alchemyBonus": 0, "explorationBonus": 0, "dangerModifier": 0 } }
- 临时词条：与永久词条相同，但在外层增加 "durationDays": 1至3650。
- 标记：{ "type": "flag", "key": "英文短标识" }。
词条应与故事产生的身份、伤势、感悟、名声或契约直接相关，稀有且有意义；不要每次都发词条，不要用词条重复普通资源变化。`;

const SYSTEM_PROMPT = `你是《异界问道》的叙事裁定者。根据给定的游戏上下文，裁定一次行动、强制事件或主动任务阶段的结果。
${STORY_STYLE_GUIDE}
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
效果应符合行动成本、角色能力和世界危险程度；不要修改未提及的属性，不要伪造天数。NPC 互动和行途的固定资源消耗已由程序自动应用，effects 不要重复填写这些消耗。主动任务的阶段推进、失败和完成由程序根据本地判定决定，你只负责当前阶段的文案与合理属性变化，不要跳过后续阶段。effects 还可包含物品与词条：物品使用 { "type": "item", "itemId": "当前世界已有物品 id", "amount": 1 }；永久词条使用 { "type": "trait", "trait": { "id": "英文短标识", "name": "词条名", "description": "身份、经历或能力说明", "rarity": "gray | white | green | blue | purple | rainbow", "cost": 0, "stats": {}, "resources": {}, "cultivationBonus": 0, "alchemyBonus": 0, "explorationBonus": 0, "dangerModifier": 0 } }；临时词条额外填写 "durationDays": 1至3650。词条应当少见且与剧情强相关，不要在每次结果中强行发放。所有数值都是相对变化量。若 payload 的 allowDerivativeContent 为 true，可额外返回 worldContent（结构与世界内容生成相同），只在确有剧情依据时返回少量新地点、人物、任务、事件或物品；否则省略。`;

const CONTENT_SYSTEM_PROMPT = `你是《异界问道》的世界编剧与系统设计师。你可以大胆创作全新的异界剧情、地点、主动任务链、强制事件、物品和 NPC，让每一轮人生都可能走向不同的故事。
${STORY_STYLE_GUIDE}
只输出一个合法 JSON 对象，不要 Markdown、代码围栏、解释或额外文字。顶层格式：
{
  "narrative": "可选的本次世界异动短文案",
  "locations": [{ "id": "英文短标识", "role": "地点类型", "name": "地点名", "subtitle": "副标题", "description": "地点描述", "danger": "安稳 | 尚可 | 凶险 | 绝险", "icon": "home | market | forest | water | ruins | sect | star", "actions": ["可用行动 id"], "modifiers": { "cultivationBonus": 0.2, "actionBonuses": { "explore": 0.1 }, "blockedActions": ["rest"] }, "unlockStage": 1, "travelCost": 4 }],
  "items": [{ "id": "英文短标识", "name": "物品名", "description": "物品描述", "category": "consumable | material | artifact | quest", "rarity": 1至9, "price": 数字, "sellPrice": 数字, "stackable": true, "effects": [效果] }],
  "npcs": [{ "id": "英文短标识", "name": "姓名", "gender": "male | female | unknown", "identity": "wanderer | sect | merchant | alchemist | hunter | hermit | artisan", "personality": ["性格词"], "description": "人物描述", "age": 年龄, "lifespan": 寿元, "stats": { "constitution": 4, "insight": 4, "spirit": 4, "fortune": 4 }, "realmStage": 1至53, "battlePower": 数字, "locationId": "已有或新地点 id", "relationship": -20至20 }],
  "events": [{ "id": "英文短标识", "title": "事件标题", "body": "事件正文", "actions": ["cultivate | explore | gather | alchemy | market | rest | travel"], "locationRoles": ["地点类型"], "durationDays": 1, "outcomes": [{ "weight": 1, "text": "无选项时的结果文案", "tone": "neutral | good | danger | mystic", "effects": [效果] }], "choices": [{ "id": "英文短标识", "label": "选项", "hint": "提示", "requirement": {}, "outcomes": [{ "weight": 1, "text": "结果文案", "tone": "neutral | good | danger | mystic", "effects": [效果] }] }] }],
  "quests": [{ "id": "英文短标识", "title": "任务标题", "summary": "任务摘要", "offerText": "接取时文案", "offerRoles": ["地点类型"], "timeLimitDays": 30, "stages": [{ "id": "英文短标识", "title": "阶段标题", "body": "阶段文案", "kind": "condition | encounter", "locationRoles": ["地点类型"], "objective": { "type": "visit | resource | realm", "description": "目标说明", "locationRoles": ["地点类型"], "key": "资源名", "amount": 3, "minStage": 1 }, "durationDays": 1, "choices": [{ "id": "英文短标识", "label": "选项", "hint": "提示", "outcomes": [{ "weight": 1, "result": "advance | stay | fail", "text": "结果文案", "tone": "neutral | good | danger | mystic", "effects": [效果] }] }] }], "completionFlag": "英文标识", "completionEffects": [效果], "failureEffects": [效果] }]
}
允许一次生成 1 至 3 条互相衔接的任务、1 至 3 个地点、物品、事件和 NPC。可以使用反转、长期因果、灰色选择和高风险奖励，但所有 id、资源、属性、地点类型、行动类型必须使用允许值；不要生成无法在当前世界完成的地点要求。任务链后续任务应通过 requireFlag 连接前一任务的 completionFlag。效果中的 resource key 只能是 health、stamina、lifespan、age、battlePower、qi、mind、cultivation、spiritStones、herbs、pills；stat key 只能是 constitution、insight、spirit、fortune。事件和任务奖励也可使用 item 与 trait 效果；itemId 必须引用已有物品或本次 worldContent 新生成物品的 id，trait 格式与普通裁定协议一致，可用 durationDays 表示临时词条。`;

const EVENT_REWRITE_SYSTEM_PROMPT = `你是《异界问道》的现场叙事导演。玩家正在面对一个已经发生的事件，请在不违背当前世界状态的前提下，重写这一刻的正文和可选行动，让它像一段正在发生的小说场景：具体、有动作、有人的反应，句式有变化，偶尔可以有幽默、迟疑或不体面的细节。不要故作高深，不要只堆砌古雅词，也不要让每次结果都像同一个模板。${STORY_STYLE_GUIDE}
${EFFECT_PROTOCOL_GUIDE}
只输出一个合法 JSON 对象，不要 Markdown、代码围栏或额外解释。格式：
{
  "event": {
    "title": "不超过 60 个汉字",
    "body": "100 至 700 字的事件正文",
    "actions": ["cultivate | explore | gather | alchemy | market | rest | travel"],
    "locationRoles": ["地点类型"],
    "durationDays": 1,
    "outcomes": [{ "weight": 1, "text": "无选项时的结果", "tone": "neutral | good | danger | mystic", "effects": [] }],
    "choices": [{ "id": "英文短标识", "label": "选项文字", "hint": "选项提示", "requirement": {}, "outcomes": [{ "weight": 1, "text": "结果文案", "tone": "neutral | good | danger | mystic", "effects": [] }] }]
  },
  "followUpEvents": [{ "title": "后续事件标题", "body": "后续事件正文", "actions": ["explore"], "choices": [] }],
  "narrative": "可选的重构旁白",
  "worldContent": { "narrative": "可选", "locations": [], "items": [], "npcs": [], "events": [], "quests": [] }
}
当前事件的 id、once、触发条件由程序保留；事件选项应根据场景自然地生成 1 至 5 个，不能机械固定数量；followUpEvents 最多 3 个。worldContent 只有在允许时才填写，最多生成少量地点、人物、任务、事件或物品。effects 只能使用协议允许的相对变化量，不要重复程序自动扣除的行动成本。`;

const RESULT_REWRITE_SYSTEM_PROMPT = `你是《异界问道》的现场叙事导演。玩家刚完成一次行动、移动、交往、任务或事件，眼前结果已经结算。请重写当前结果弹窗的叙事，并根据场景自然地给出 1 至 5 个从这一刻继续行动的选项。已经发生的耗时和属性变化不可撤销、不可重复计算；新选项的 effects 只描述选择之后新增的变化，每个选项固定再耗时 1 天。${STORY_STYLE_GUIDE}
${EFFECT_PROTOCOL_GUIDE}
只输出一个合法 JSON 对象，不要 Markdown、代码围栏或额外解释。格式：
{
  "title": "不超过 60 个汉字",
  "text": "100 至 700 字的当前场景",
  "tone": "neutral | good | danger | mystic",
  "conversation": [{ "speaker": "人物名", "text": "自然的对白", "side": "player | other | narrator" }],
  "choices": [{ "id": "英文短标识", "label": "选项文字", "hint": "可能的代价或意图", "requirement": {}, "outcomes": [{ "weight": 1, "text": "选择后的下一轮结果", "tone": "neutral | good | danger | mystic", "effects": [] }] }],
  "followUpEvents": [],
  "narrative": "可选旁白",
  "worldContent": { "narrative": "可选", "locations": [], "items": [], "npcs": [], "events": [], "quests": [] }
}
followUpEvents 最多 3 个，会在当前分支结束后依次发生。worldContent 只有在允许时才填写。effects 必须是协议允许的相对变化量，不得重放当前结果的变化。`;

const QUEST_STAGE_REWRITE_SYSTEM_PROMPT = `你是《异界问道》的任务叙事导演。玩家正在一个尚未结算的任务阶段中。请只重写当前阶段的标题、正文和 1 至 5 个选择，数量应服从当前场景，不要直接替玩家选择，也不要跳过本地任务进度。每个 outcome 的 result 必须明确为 advance、stay 或 fail。${STORY_STYLE_GUIDE}
${EFFECT_PROTOCOL_GUIDE}
只输出一个合法 JSON 对象，不要 Markdown、代码围栏或额外解释。格式：
{
  "stage": {
    "title": "阶段标题",
    "body": "100 至 700 字的现场叙事",
    "kind": "encounter",
    "durationDays": 1,
    "choices": [{ "id": "英文短标识", "label": "选项文字", "hint": "可能的代价或意图", "requirement": {}, "outcomes": [{ "weight": 1, "result": "advance | stay | fail", "text": "选择后的结果", "tone": "neutral | good | danger | mystic", "effects": [] }] }]
  },
  "followUpEvents": [],
  "narrative": "可选旁白",
  "worldContent": { "narrative": "可选", "locations": [], "items": [], "npcs": [], "events": [], "quests": [] }
}
任务目标、阶段 id 和地点限制由程序保留；followUpEvents 最多 3 个。worldContent 只有在允许时才填写。`;

const EXPLORE_SYSTEM_PROMPT = `你是《异界问道》的探索叙事导演。玩家选择了“探索”，请结合当前人物属性、所在地点、地点上的 NPC 和近期经历，现场写出一次不可预知但合理的遭遇。结果要有小说现场感，叙述、动作和对话交错，长短句变化，不要套用固定三段式，也不要满篇玄虚古雅词。${STORY_STYLE_GUIDE}
${EFFECT_PROTOCOL_GUIDE}
只输出一个合法 JSON 对象，不要 Markdown、代码围栏或额外解释。格式：
{
  "title": "不超过 24 个汉字的结果标题",
  "text": "80 至 400 字的结果文案",
  "tone": "neutral | good | danger | mystic",
  "effects": [{ "type": "resource | stat | item | trait | status | flag", "key": "协议允许的键", "itemId": "已有物品 id", "amount": 0, "durationDays": 12, "trait": { "id": "英文短标识", "name": "词条名", "description": "具体效果与身份说明", "rarity": "gray | white | green | blue | purple | rainbow", "cost": 0 } }],
  "conversation": [{ "speaker": "人物名", "text": "一句自然的对话", "side": "player | other | narrator" }],
  "worldContent": { "narrative": "可选", "locations": [], "items": [], "npcs": [], "events": [], "quests": [] }
}
conversation 需要 2 至 8 条，只有确实发生交流时才使用；探索的固定成本由程序自动应用，effects 不要重复扣除。worldContent 只有在允许时才填写。`;

const LIFE_RESUME_SYSTEM_PROMPT = `你是《异界问道》的卷宗撰写人。请根据一位修士已经结束的一生，写一份有文学感但清晰克制的人生简历。
内容需要包含：人物来历与性格印象、修行境界与关键转折、值得记住的人和事、最终结局，以及一句像墓志铭或卷末批语的总结。
只输出纯中文文本，不要 JSON、Markdown 标题、代码围栏、免责声明或解释；分成 4 至 7 个自然段，总长度控制在 500 至 1100 字。不要凭空添加档案中没有的确定事实，可以用含蓄的文学表达补足气氛。`;

export function isAiConfigured(settings: AiSettings): boolean {
  return Boolean(settings.apiKey.trim()) && Boolean(settings.model.trim()) && Boolean(settings.endpoint.trim() || DEFAULT_ENDPOINTS[settings.format]);
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
  if (Array.isArray(value)) return value.map((part) => jsonText(part)).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const candidate = value as Record<string, unknown>;
  for (const key of ["text", "output_text", "content", "message", "output", "delta", "value", "choices", "data"]) {
    if (!(key in candidate)) continue;
    const text = jsonText(candidate[key]);
    if (text) return text;
  }
  return "";
}

function responseText(response: unknown): string {
  if (!response || typeof response !== "object") return jsonText(response);
  const candidate = response as Record<string, unknown>;
  const choices = Array.isArray(candidate.choices) ? candidate.choices : [];
  const choiceText = choices.map((choice) => {
    if (!choice || typeof choice !== "object") return "";
    const item = choice as Record<string, unknown>;
    return jsonText(item.message) || jsonText(item.text) || jsonText(item.delta) || jsonText(item.reasoning_content);
  }).filter(Boolean).join("\n");
  return choiceText || jsonText(candidate.content) || jsonText(candidate.output_text) || jsonText(candidate.output) || jsonText(candidate.text);
}

function hasGameChoices(value: unknown): boolean {
  return Array.isArray(value) && value.some((choice) => {
    if (!choice || typeof choice !== "object") return false;
    const candidate = choice as Record<string, unknown>;
    return typeof candidate.label === "string" && Array.isArray(candidate.outcomes);
  });
}

function isDirectResultRewriteResponse(response: unknown): response is Record<string, unknown> {
  if (!response || typeof response !== "object") return false;
  const candidate = response as Record<string, unknown>;
  return typeof candidate.text === "string" && hasGameChoices(candidate.choices);
}

function isDirectQuestStageRewriteResponse(response: unknown): response is Record<string, unknown> {
  if (!response || typeof response !== "object") return false;
  const candidate = response as Record<string, unknown>;
  if (candidate.stage && typeof candidate.stage === "object") return true;
  return typeof candidate.body === "string" && hasGameChoices(candidate.choices);
}

function isContentBundle(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["locations", "items", "npcs", "events", "quests"].some((key) => Array.isArray(candidate[key]));
}

function hasContentEntries(value: unknown): value is Record<string, unknown> {
  if (!isContentBundle(value)) return false;
  return ["locations", "items", "npcs", "events", "quests"].some((key) => Array.isArray(value[key]) && value[key].length > 0);
}

const DEFAULT_REQUEST_TIMEOUT = 180_000;
const CONTENT_REQUEST_TIMEOUT = 300_000;
const TRAIT_REQUEST_TIMEOUT = 120_000;
const CONTENT_MAX_TOKENS = 16_000;
const OUTCOME_MAX_TOKENS = 3_200;
const EVENT_REWRITE_TIMEOUT = 180_000;
const EVENT_REWRITE_MAX_TOKENS = 6_000;
const DIALOG_REWRITE_TIMEOUT = 180_000;
const DIALOG_REWRITE_MAX_TOKENS = 6_000;
const EXPLORE_TIMEOUT = 180_000;
const EXPLORE_MAX_TOKENS = 6_500;

function parseResponseBody(body: string): unknown {
  const normalized = body.trim().replace(/^\uFEFF/, "");
  if (!normalized) return undefined;
  try { return JSON.parse(normalized); } catch { /* Some compatible endpoints ignore stream:false. */ }
  const chunks = normalized
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith("data:"))
    .map((line) => line.trimStart().slice(5).trim())
    .filter((line) => line && line !== "[DONE]")
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  return chunks.length ? chunks : undefined;
}

async function requestJson(url: string, init: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT): Promise<unknown> {
  const fetchAttempt = async (targetUrl: string): Promise<{ response: Response; body: string }> => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(targetUrl, { ...init, signal: controller.signal });
      return { response, body: await response.text() };
    } catch (error) {
      if (timedOut) throw new Error(`AI 请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const isExternal = /^https?:\/\//i.test(url);
  let result: { response: Response; body: string };
  if (isExternal && typeof window !== "undefined") {
    const proxyUrl = `${window.location.origin}/api/ai-proxy?url=${encodeURIComponent(url)}`;
    try {
      const proxied = await fetchAttempt(proxyUrl);
      const contentType = proxied.response.headers.get("content-type") ?? "";
      // Static hosts often return index.html for unknown routes. In that case,
      // fall back to direct mode so servers with CORS enabled still work.
      if ((proxied.response.status === 404 || proxied.response.status === 405) || (proxied.response.ok && contentType.includes("text/html"))) {
        result = await fetchAttempt(url);
      } else {
        result = proxied;
      }
    } catch (error) {
      // A timeout is a real upstream failure; do not retry it with an already
      // exhausted signal or hide the useful timeout message.
      if (error instanceof Error && error.message.startsWith("AI 请求超时")) throw error;
      result = await fetchAttempt(url);
    }
  } else {
    result = await fetchAttempt(url);
  }

  const { response, body } = result;
  const parsed = parseResponseBody(body);
  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : body;
    throw new Error(`AI 接口返回 ${response.status}${detail ? `：${detail.slice(0, 180)}` : ""}`);
  }
  if (parsed === undefined) {
    const preview = body.trim().replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`AI 返回内容不是 JSON${preview ? `：${preview}` : "（响应为空）"}`);
  }
  return parsed;
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
      gender: game.character.gender,
      origin: game.character.origin.name,
      spiritRoot: game.character.spiritRoot.name,
      talent: game.character.talent.name,
      stats: game.character.stats,
    },
    resources: game.resources,
    inventory: game.inventory,
    availableItems: [...ITEMS, ...(game.generatedItems ?? [])].map((item) => ({ id: item.id, name: item.name, category: item.category, rarity: item.rarity })),
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

function questPayload(game: GameState, quest: QuestDefinition, stage: QuestStageDefinition, choice?: QuestChoice): Record<string, unknown> {
  const progress = game.quests.find((candidate) => candidate.questId === quest.id && candidate.status === "active");
  return {
    kind: "quest",
    quest: { id: quest.id, title: quest.title, summary: quest.summary, deadlineTurn: progress?.deadlineTurn, stageIndex: progress?.stageIndex ?? 0, totalStages: quest.stages.length },
    stage: { id: stage.id, title: stage.title, body: stage.body, kind: stage.kind, durationDays: stage.durationDays ?? 1, objective: stage.objective ?? null },
    choice: choice ? { id: choice.id, label: choice.label, hint: choice.hint } : null,
    context: contextFor(game),
  };
}

function contentPayload(game: GameState, trigger: AiQuestGenerationTrigger): Record<string, unknown> {
  const location = getCurrentLocation(game);
  return {
    kind: "world_content_generation",
    trigger,
    generation: {
      maxQuests: 3,
      maxStagesPerQuest: 5,
      maxLocations: 3,
      maxEvents: 3,
      maxItems: 5,
      maxNpcs: 4,
      allowedLocationRoles: LOCATION_ROLES,
      allowedActions: ACTION_IDS,
      allowedItemCategories: ITEM_CATEGORIES,
      allowedItemRarities: ITEM_RARITIES,
    },
    existing: {
      flags: game.flags,
      currentLocationId: location.id,
      knownQuestIds: [...QUESTS.map((quest) => quest.id), ...(game.generatedQuests ?? []).map((quest) => quest.id)],
      knownEventIds: [...EVENTS.map((event) => event.id), ...(game.generatedEvents ?? []).map((event) => event.id)],
      knownItemIds: [...(game.inventory ?? []).map((entry) => entry.itemId), ...(game.generatedItems ?? []).map((item) => item.id)],
      locationIds: game.world.locations.map((entry) => entry.id),
      npcNames: game.npcs.slice(0, 30).map((npc) => npc.name),
    },
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

function sanitizeEffectTrait(value: unknown, fallbackId: string): TraitDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.name !== "string" || typeof source.description !== "string") return undefined;
  const rarity = TRAIT_RARITIES.includes(source.rarity as TraitRarity) ? source.rarity as TraitRarity : "white";
  const stats = source.stats && typeof source.stats === "object"
    ? Object.fromEntries(STAT_KEYS.flatMap((key) => {
      const amount = boundedNumber((source.stats as Record<string, unknown>)[key], -3, 3, true);
      return amount === undefined || amount === 0 ? [] : [[key, amount]];
    })) as Partial<CoreStats>
    : undefined;
  const resources = source.resources && typeof source.resources === "object"
    ? Object.fromEntries(TRAIT_RESOURCE_KEYS.flatMap((key) => {
      const amount = boundedNumber((source.resources as Record<string, unknown>)[key], -300, 500, true);
      return amount === undefined || amount === 0 ? [] : [[key, amount]];
    })) as Partial<Resources>
    : undefined;
  return {
    id: safeIdentifier(source.id, fallbackId),
    name: source.name.trim().slice(0, 36),
    description: source.description.trim().slice(0, 180),
    rarity,
    cost: 0,
    ...(stats && Object.keys(stats).length ? { stats } : {}),
    ...(resources && Object.keys(resources).length ? { resources } : {}),
    cultivationBonus: boundedNumber(source.cultivationBonus, -0.5, 0.8),
    alchemyBonus: boundedNumber(source.alchemyBonus, -0.5, 0.8),
    explorationBonus: boundedNumber(source.explorationBonus, -0.5, 0.8),
    dangerModifier: boundedNumber(source.dangerModifier, -0.5, 0.5),
  };
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
  if (candidate.type === "item" && typeof candidate.itemId === "string") {
    const amount = boundedNumber(candidate.amount, -99, 99, true);
    return amount === undefined || amount === 0 ? undefined : { type: "item", itemId: candidate.itemId.slice(0, 96), amount };
  }
  if (candidate.type === "trait") {
    const trait = sanitizeEffectTrait(candidate.trait, `event-trait-${Date.now().toString(36)}`);
    if (!trait) return undefined;
    const durationDays = boundedNumber(candidate.durationDays, 1, 3650, true);
    return { type: "trait", trait, ...(durationDays === undefined ? {} : { durationDays }) };
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
    const alchemyBonus = boundedNumber(status.alchemyBonus, -0.8, 1.5);
    const explorationBonus = boundedNumber(status.explorationBonus, -0.8, 1.5);
    const dangerModifier = boundedNumber(status.dangerModifier, -0.8, 0.8);
    return {
      type: "status",
      status: {
        id: status.id.slice(0, 40),
        name: status.name.slice(0, 40),
        description: status.description.slice(0, 120),
        remaining,
        rarity: TRAIT_RARITIES.includes(status.rarity as TraitRarity) ? status.rarity as TraitRarity : "white",
        ...(stats && Object.keys(stats).length ? { stats } : {}),
        ...(cultivationBonus === undefined ? {} : { cultivationBonus }),
        ...(alchemyBonus === undefined ? {} : { alchemyBonus }),
        ...(explorationBonus === undefined ? {} : { explorationBonus }),
        ...(dangerModifier === undefined ? {} : { dangerModifier }),
      },
    };
  }
  return undefined;
}

function sanitizeNarrativeMessages(value: unknown): NarrativeMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const speaker = textValue(source.speaker, "旁白", 30);
    const text = textValue(source.text, "", 300);
    const side: NarrativeMessage["side"] = source.side === "player" || source.side === "other" || source.side === "narrator" ? source.side : "other";
    return text ? [{ speaker, text, side }] : [];
  }).slice(0, 8);
}

function parseOutcome(rawText: string, game?: GameState, allowDerivativeContent = false): AiGeneratedOutcome {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回对象无效");
  const value = parsed as Record<string, unknown>;
  if (typeof value.text !== "string" || value.text.trim().length < 2) throw new Error("AI 返回缺少有效文案");
  if (!Array.isArray(value.effects)) throw new Error("AI 返回缺少 effects 数组");
  const tone = TONES.includes(value.tone as Tone) ? value.tone as Tone : "neutral";
  const parsedEffects = value.effects.map(sanitizeEffect);
  if (parsedEffects.some((effect) => !effect)) throw new Error("AI 返回了无法识别的属性变化");
  const effects = parsedEffects.filter((effect): effect is Effect => Boolean(effect)).slice(0, 12);
  const rawWorldContent = value.worldContent ?? value.generatedContent;
  const generatedContent = game && allowDerivativeContent && hasContentEntries(rawWorldContent)
    ? parseContentBundle(JSON.stringify(rawWorldContent), game)
    : undefined;
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 24) : undefined,
    text: value.text.trim().slice(0, 500),
    tone,
    effects,
    relationshipDelta: boundedNumber(value.relationshipDelta, -30, 30, true),
    conversation: sanitizeNarrativeMessages(value.conversation),
    ...(generatedContent ? { generatedContent } : {}),
  };
}

const REALM_STAGE_MAX = 54;

function textValue(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function safeIdentifier(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  return (normalized || fallback).slice(0, 48);
}

function sanitizeTraitDefinition(value: unknown, index: number, prefix: string): TraitDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const rarity = TRAIT_RARITIES.includes(source.rarity as TraitRarity) ? source.rarity as TraitRarity : "white";
  const defaultCosts: Record<TraitRarity, number> = { gray: 1, white: 1, green: 2, blue: 3, purple: 5, rainbow: 8 };
  const rawStats = source.stats && typeof source.stats === "object" ? source.stats as Record<string, unknown> : {};
  const stats: Partial<CoreStats> = {};
  STAT_KEYS.forEach((key) => {
    const amount = boundedNumber(rawStats[key], -3, 5, true);
    if (amount !== undefined && amount !== 0) stats[key] = amount;
  });
  const rawResources = source.resources && typeof source.resources === "object" ? source.resources as Record<string, unknown> : {};
  const resources: Partial<Resources> = {};
  TRAIT_RESOURCE_KEYS.forEach((key) => {
    const amount = boundedNumber(rawResources[key], -300, 500, true);
    if (amount !== undefined && amount !== 0) resources[key] = amount;
  });
  return {
    id: `${prefix}-trait-${index + 1}-${safeIdentifier(source.id, `trait-${index + 1}`)}`.slice(0, 96),
    name: textValue(source.name, "无名命格", 36),
    description: textValue(source.description, "一条尚未被命名的命运伏笔。", 180),
    rarity,
    cost: boundedIntegerValue(source.cost, 1, 8, defaultCosts[rarity]),
    stats: Object.keys(stats).length ? stats : undefined,
    resources: Object.keys(resources).length ? resources : undefined,
    cultivationBonus: boundedNumber(source.cultivationBonus, -0.25, 0.5),
    alchemyBonus: boundedNumber(source.alchemyBonus, -0.25, 0.5),
    explorationBonus: boundedNumber(source.explorationBonus, -0.25, 0.5),
    dangerModifier: boundedNumber(source.dangerModifier, -0.25, 0.5),
  };
}

function boundedIntegerValue(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

function locationRoles(value: unknown, fallback: LocationRole[] = []): LocationRole[] {
  if (!Array.isArray(value)) return [...fallback];
  const roles = value.filter((role): role is LocationRole => typeof role === "string" && LOCATION_ROLES.includes(role as LocationRole));
  return Array.from(new Set(roles));
}

function actionIds(value: unknown): ActionId[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((action): action is ActionId => typeof action === "string" && ACTION_IDS.includes(action as ActionId))));
}

function sanitizeRequirement(value: unknown): Requirement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const requirement: Requirement = {};
  if (source.resource && typeof source.resource === "object") {
    const resources: Partial<Record<ResourceKey, number>> = {};
    Object.entries(source.resource as Record<string, unknown>).forEach(([key, amount]) => {
      if (RESOURCE_KEYS.includes(key as ResourceKey) && typeof amount === "number" && Number.isFinite(amount) && amount > 0) resources[key as ResourceKey] = Math.min(2000, Math.round(amount));
    });
    if (Object.keys(resources).length) requirement.resource = resources;
  }
  if (source.stat && typeof source.stat === "object") {
    const stats: Partial<Record<CoreStat, number>> = {};
    Object.entries(source.stat as Record<string, unknown>).forEach(([key, amount]) => {
      if (STAT_KEYS.includes(key as CoreStat) && typeof amount === "number" && Number.isFinite(amount) && amount > 0) stats[key as CoreStat] = Math.min(100, Math.round(amount));
    });
    if (Object.keys(stats).length) requirement.stat = stats;
  }
  if (typeof source.minStage === "number" && Number.isFinite(source.minStage)) requirement.minStage = boundedIntegerValue(source.minStage, 1, REALM_STAGE_MAX, 1);
  if (typeof source.flag === "string" && /^[\w-]{1,40}$/.test(source.flag)) requirement.flag = source.flag;
  return Object.keys(requirement).length ? requirement : undefined;
}

function sanitizeEffects(value: unknown): Effect[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const effect = sanitizeEffect(entry);
    return effect ? [effect] : [];
  }).slice(0, 12);
}

function sanitizeQuestOutcome(value: unknown): QuestOutcome | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const result = source.result === "fail" || source.result === "stay" || source.result === "advance" ? source.result : "advance";
  return {
    weight: typeof source.weight === "number" && Number.isFinite(source.weight) ? Math.max(.1, Math.min(100, source.weight)) : 1,
    text: textValue(source.text, "事情沿着你没有预料到的方向发展。", 500),
    tone: TONES.includes(source.tone as Tone) ? source.tone as Tone : "neutral",
    effects: sanitizeEffects(source.effects),
    result,
  };
}

function sanitizeQuestChoice(value: unknown, index: number): QuestChoice | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const outcomes = Array.isArray(source.outcomes) ? source.outcomes.flatMap((entry) => {
    const outcome = sanitizeQuestOutcome(entry);
    return outcome ? [outcome] : [];
  }).slice(0, 4) : [];
  if (!outcomes.length) return undefined;
  return {
    id: safeIdentifier(source.id, `choice-${index + 1}`),
    label: textValue(source.label, `采取第 ${index + 1} 种做法`, 40),
    hint: textValue(source.hint, "结果尚不可知", 100),
    requirement: sanitizeRequirement(source.requirement),
    outcomes,
  };
}

function sanitizeObjective(value: unknown, fallbackRole: LocationRole): QuestObjective | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const type = source.type;
  const description = textValue(source.description, "完成这段因果", 160);
  if (type === "visit") return { type, description, locationRoles: locationRoles(source.locationRoles, [fallbackRole]) };
  if (type === "resource" && typeof source.key === "string" && RESOURCE_KEYS.includes(source.key as ResourceKey)) {
    return {
      type,
      description,
      key: source.key as ResourceKey,
      amount: boundedIntegerValue(source.amount, 1, 2000, 1),
      consume: source.consume === true,
      ...(Array.isArray(source.locationRoles) ? { locationRoles: locationRoles(source.locationRoles) } : {}),
    };
  }
  if (type === "realm") return { type, description, minStage: boundedIntegerValue(source.minStage, 1, REALM_STAGE_MAX, 1) };
  return undefined;
}

function sanitizeQuestStage(value: unknown, index: number, fallbackRole: LocationRole): QuestStageDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const kind = source.kind === "condition" ? "condition" : "encounter";
  const choices = kind === "encounter" && Array.isArray(source.choices)
    ? source.choices.flatMap((entry, choiceIndex) => { const choice = sanitizeQuestChoice(entry, choiceIndex); return choice ? [choice] : []; }).slice(0, 5)
    : undefined;
  return {
    id: safeIdentifier(source.id, `stage-${index + 1}`),
    title: textValue(source.title, `第 ${index + 1} 段因果`, 48),
    body: textValue(source.body, "线索在沉默中等待你作出下一步选择。", 700),
    kind,
    ...(Array.isArray(source.locationRoles) ? { locationRoles: locationRoles(source.locationRoles, [fallbackRole]) } : {}),
    objective: sanitizeObjective(source.objective, fallbackRole),
    ...(choices?.length ? { choices } : {}),
    ...(kind === "encounter" ? { durationDays: boundedIntegerValue(source.durationDays, 1, 365, 1) } : {}),
  };
}

function sanitizeQuestDefinition(value: unknown, index: number, game: GameState, prefix: string, knownFlags: Set<string>, previousCompletionFlag?: string): QuestDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const fallbackRole = getCurrentLocation(game).role as LocationRole;
  const rawId = safeIdentifier(source.id, `quest-${index + 1}`);
  const id = `${prefix}-quest-${index + 1}-${rawId}`.slice(0, 96);
  const stages = Array.isArray(source.stages) ? source.stages.flatMap((entry, stageIndex) => {
    const stage = sanitizeQuestStage(entry, stageIndex, fallbackRole);
    return stage ? [stage] : [];
  }).slice(0, 5) : [];
  if (!stages.length) return undefined;
  const generatedCompletionFlag = `${id}-complete`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const rawCompletionFlag = typeof source.completionFlag === "string" && /^[\w-]{1,40}$/.test(source.completionFlag) ? source.completionFlag : generatedCompletionFlag;
  const completionFlag = rawCompletionFlag.startsWith("ai-") ? rawCompletionFlag : `${id}-complete`.slice(0, 40);
  const rawRequireFlag = typeof source.requireFlag === "string" && /^[\w-]{1,40}$/.test(source.requireFlag) ? source.requireFlag : undefined;
  const requireFlag = rawRequireFlag && (knownFlags.has(rawRequireFlag) || rawRequireFlag === previousCompletionFlag) ? rawRequireFlag : previousCompletionFlag;
  knownFlags.add(completionFlag);
  return {
    id,
    title: textValue(source.title, "未命名因果", 60),
    summary: textValue(source.summary, "一条尚未写完的异界故事。", 220),
    offerText: textValue(source.offerText, "有人将一桩无法解释的麻烦交到你面前。", 700),
    offerRoles: locationRoles(source.offerRoles, [fallbackRole]),
    stages,
    ...(source.timeLimitDays === undefined ? {} : { timeLimitDays: boundedIntegerValue(source.timeLimitDays, 3, 3650, 30) }),
    ...(source.minStage === undefined ? {} : { minStage: boundedIntegerValue(source.minStage, 1, REALM_STAGE_MAX, 1) }),
    ...(source.maxStage === undefined ? {} : { maxStage: boundedIntegerValue(source.maxStage, 1, REALM_STAGE_MAX, REALM_STAGE_MAX) }),
    ...(requireFlag ? { requireFlag } : {}),
    ...(typeof source.excludeFlag === "string" && /^[\w-]{1,40}$/.test(source.excludeFlag) && knownFlags.has(source.excludeFlag) ? { excludeFlag: source.excludeFlag } : {}),
    completionFlag,
    completionEffects: sanitizeEffects(source.completionEffects),
    failureEffects: sanitizeEffects(source.failureEffects),
    weight: typeof source.weight === "number" && Number.isFinite(source.weight) ? Math.max(.1, Math.min(20, source.weight)) : 1,
    once: source.once !== false,
  };
}

function sanitizeEventDefinition(value: unknown, index: number, game: GameState, prefix: string, knownFlags: Set<string>): EventDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const actions = Array.isArray(source.actions)
    ? Array.from(new Set(source.actions.filter((action): action is EventTrigger => typeof action === "string" && (ACTION_IDS.includes(action as ActionId) || action === "travel"))))
    : [];
  if (!actions.length) actions.push("explore");
  const choices = Array.isArray(source.choices) ? source.choices.flatMap((entry, choiceIndex) => {
    const choice = sanitizeQuestChoice(entry, choiceIndex);
    return choice ? [{ ...choice, outcomes: choice.outcomes.map(({ result: _result, ...outcome }) => outcome) }] : [];
  }).slice(0, 5) : [];
  const outcomes = Array.isArray(source.outcomes) ? source.outcomes.flatMap((entry) => {
    const outcome = sanitizeQuestOutcome(entry);
    if (!outcome) return [];
    const { result: _result, ...eventOutcome } = outcome;
    return [eventOutcome];
  }).slice(0, 4) : [];
  const id = `${prefix}-event-${index + 1}-${safeIdentifier(source.id, `event-${index + 1}`)}`.slice(0, 96);
  const requireFlag = typeof source.requireFlag === "string" && /^[\w-]{1,40}$/.test(source.requireFlag) && knownFlags.has(source.requireFlag) ? source.requireFlag : undefined;
  return {
    id,
    title: textValue(source.title, "异界新变", 60),
    body: textValue(source.body, "天地间出现了一点不合常理的动静。", 800),
    actions,
    choices,
    ...(outcomes.length ? { outcomes } : {}),
    ...(Array.isArray(source.locationRoles) ? { locationRoles: locationRoles(source.locationRoles) } : {}),
    durationDays: boundedIntegerValue(source.durationDays, 1, 365, 1),
    weight: typeof source.weight === "number" && Number.isFinite(source.weight) ? Math.max(.1, Math.min(20, source.weight)) : 1,
    once: source.once === true,
    ...(requireFlag ? { requireFlag } : {}),
    ...(typeof source.excludeFlag === "string" && /^[\w-]{1,40}$/.test(source.excludeFlag) && knownFlags.has(source.excludeFlag) ? { excludeFlag: source.excludeFlag } : {}),
    ...(typeof source.minStage === "number" ? { minStage: boundedIntegerValue(source.minStage, 1, REALM_STAGE_MAX, 1) } : {}),
  };
}

function sanitizeItemDefinition(value: unknown, index: number, prefix: string): ItemDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const category = ITEM_CATEGORIES.includes(source.category as ItemCategory) ? source.category as ItemCategory : "material";
  const price = boundedIntegerValue(source.price, 0, 1000000, 0);
  return {
    id: `${prefix}-item-${index + 1}-${safeIdentifier(source.id, `item-${index + 1}`)}`.slice(0, 96),
    name: textValue(source.name, "无名异物", 50),
    description: textValue(source.description, "一件来历不明的异界物品。", 260),
    category,
    rarity: ITEM_RARITIES.includes(source.rarity as ItemRarity) ? source.rarity as ItemRarity : 7,
    price,
    sellPrice: boundedIntegerValue(source.sellPrice, 0, price, Math.floor(price * .6)),
    stackable: source.stackable !== false,
    effects: sanitizeEffects(source.effects),
  };
}

function sanitizeLocationModifiers(value: unknown): LocationModifiers | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const modifiers: LocationModifiers = {};
  const cultivationBonus = boundedNumber(source.cultivationBonus, -0.8, 1.5);
  if (cultivationBonus !== undefined) modifiers.cultivationBonus = cultivationBonus;
  if (source.actionBonuses && typeof source.actionBonuses === "object") {
    const actionBonuses: Partial<Record<ActionId, number>> = {};
    Object.entries(source.actionBonuses as Record<string, unknown>).forEach(([action, amount]) => {
      if (!ACTION_IDS.includes(action as ActionId)) return;
      const bonus = boundedNumber(amount, -0.8, 1.5);
      if (bonus !== undefined) actionBonuses[action as ActionId] = bonus;
    });
    if (Object.keys(actionBonuses).length) modifiers.actionBonuses = actionBonuses;
  }
  const blockedActions = actionIds(source.blockedActions);
  if (blockedActions.length) modifiers.blockedActions = blockedActions;
  return Object.keys(modifiers).length ? modifiers : undefined;
}

function sanitizeLocationDraft(value: unknown, index: number, game: GameState, prefix: string): AiGeneratedLocationDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const role = LOCATION_ROLES.includes(source.role as LocationRole) ? source.role as LocationRole : getCurrentLocation(game).role;
  return {
    id: `${prefix}-location-${index + 1}-${safeIdentifier(source.id, `location-${index + 1}`)}`.slice(0, 96),
    role,
    name: textValue(source.name, "无名之地", 50),
    subtitle: textValue(source.subtitle, "地图上新出现的标记", 80),
    description: textValue(source.description, "一处刚刚被世界承认的地点。", 400),
    danger: source.danger === "绝险" || source.danger === "凶险" || source.danger === "尚可" ? source.danger : "安稳",
    icon: source.icon === "market" || source.icon === "forest" || source.icon === "water" || source.icon === "ruins" || source.icon === "sect" || source.icon === "star" ? source.icon : "home",
    actions: actionIds(source.actions),
    modifiers: sanitizeLocationModifiers(source.modifiers),
    unlockStage: boundedIntegerValue(source.unlockStage, 1, REALM_STAGE_MAX, game.realmStage),
    travelCost: boundedIntegerValue(source.travelCost, 1, 200, 5),
  };
}

function sanitizeNpcDefinition(value: unknown, index: number, game: GameState, prefix: string, locationIds: Set<string>, locationAliases: Map<string, string>): Npc | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const rawStats = source.stats && typeof source.stats === "object" ? source.stats as Record<string, unknown> : {};
  const stats = {
    constitution: boundedIntegerValue(rawStats.constitution, 1, 100, 4),
    insight: boundedIntegerValue(rawStats.insight, 1, 100, 4),
    spirit: boundedIntegerValue(rawStats.spirit, 1, 100, 4),
    fortune: boundedIntegerValue(rawStats.fortune, 1, 100, 4),
  };
  const rawLocation = typeof source.locationId === "string"
    ? (locationIds.has(source.locationId) ? source.locationId : locationAliases.get(safeIdentifier(source.locationId, "")) ?? game.world.currentLocationId)
    : game.world.currentLocationId;
  return {
    id: `${prefix}-npc-${index + 1}-${safeIdentifier(source.id, `npc-${index + 1}`)}`.slice(0, 96),
    name: textValue(source.name, "无名旅人", 30),
    gender: NPC_GENDERS.includes(source.gender as NpcGender) ? source.gender as NpcGender : "unknown",
    personality: Array.isArray(source.personality) ? source.personality.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim().slice(0, 24)).slice(0, 3) : ["沉稳"],
    identity: NPC_IDENTITY_IDS.includes(source.identity as NpcIdentity) ? source.identity as NpcIdentity : "wanderer",
    description: textValue(source.description, "一个刚刚走进这片天地的人。", 320),
    age: Math.max(1, Math.min(1000, typeof source.age === "number" && Number.isFinite(source.age) ? source.age : 24)),
    lifespan: Math.max(2, Math.min(3000, typeof source.lifespan === "number" && Number.isFinite(source.lifespan) ? source.lifespan : 100)),
    stats,
    realmStage: boundedIntegerValue(source.realmStage, 1, REALM_STAGE_MAX, 1),
    battlePower: boundedIntegerValue(source.battlePower, 1, 100000, 20),
    locationId: rawLocation,
    relationship: boundedIntegerValue(source.relationship, -20, 20, 0),
    attention: false,
    alive: true,
  };
}

function parseContentBundle(rawText: string, game: GameState): AiGeneratedContentBundle {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的世界内容不是对象");
  const value = parsed as Record<string, unknown>;
  const nonce = `${game.turn}-${Date.now().toString(36)}`;
  const prefix = `ai-${nonce}`.replace(/[^a-zA-Z0-9-]/g, "-");
  const knownFlags = new Set(game.flags);
  const rawLocations = Array.isArray(value.locations) ? value.locations : [];
  const locations = rawLocations.flatMap((entry, index) => { const item = sanitizeLocationDraft(entry, index, game, prefix); return item ? [item] : []; }).slice(0, 3);
  const locationIds = new Set([...game.world.locations.map((location) => location.id), ...locations.map((location) => location.id)]);
  const locationAliases = new Map<string, string>();
  rawLocations.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const source = entry as Record<string, unknown>;
    const alias = safeIdentifier(source.id, `location-${index + 1}`);
    const locationId = locations.find((location) => location.id.endsWith(`-${alias}`))?.id;
    if (!locationId) return;
    locationAliases.set(alias, locationId);
    if (typeof source.id === "string") locationAliases.set(source.id, locationId);
  });
  const items = (Array.isArray(value.items) ? value.items : []).flatMap((entry, index) => { const item = sanitizeItemDefinition(entry, index, prefix); return item ? [item] : []; }).slice(0, 5);
  const npcs = (Array.isArray(value.npcs) ? value.npcs : []).flatMap((entry, index) => { const npc = sanitizeNpcDefinition(entry, index, game, prefix, locationIds, locationAliases); return npc ? [npc] : []; }).slice(0, 4);
  const quests: QuestDefinition[] = [];
  let previousCompletionFlag: string | undefined;
  (Array.isArray(value.quests) ? value.quests : []).slice(0, 3).forEach((entry, index) => {
    const quest = sanitizeQuestDefinition(entry, index, game, prefix, knownFlags, previousCompletionFlag);
    if (quest) { quests.push(quest); previousCompletionFlag = quest.completionFlag; }
  });
  const events = (Array.isArray(value.events) ? value.events : []).flatMap((entry, index) => { const event = sanitizeEventDefinition(entry, index, game, prefix, knownFlags); return event ? [event] : []; }).slice(0, 3);
  if (!locations.length && !items.length && !npcs.length && !quests.length && !events.length) throw new Error("AI 没有生成可用的世界内容");
  return {
    narrative: typeof value.narrative === "string" ? value.narrative.trim().slice(0, 800) : undefined,
    locations,
    items,
    npcs,
    quests,
    events,
  };
}

function parseEventRewrite(rawText: string, game: GameState, current: EventDefinition, allowDerivativeContent: boolean): AiEventRewrite {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的事件重构不是对象");
  const value = parsed as Record<string, unknown>;
  const knownFlags = new Set(game.flags);
  const prefix = `ai-rewrite-${game.turn}-${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9-]/g, "-");
  const rawEvent = value.event && typeof value.event === "object" ? value.event : value;
  const sanitized = sanitizeEventDefinition(rawEvent, 0, game, prefix, knownFlags);
  const event = sanitized ? { ...current, ...sanitized, id: current.id, once: current.once } : current;
  const followUpEvents = (Array.isArray(value.followUpEvents) ? value.followUpEvents : []).flatMap((entry, index) => {
    const followUp = sanitizeEventDefinition(entry, index + 1, game, prefix, knownFlags);
    return followUp ? [followUp] : [];
  }).slice(0, 3);
  const rawWorldContent = value.worldContent ?? value.generatedContent;
  const generatedContent = allowDerivativeContent && hasContentEntries(rawWorldContent)
    ? parseContentBundle(JSON.stringify(rawWorldContent), game)
    : undefined;
  return {
    event,
    followUpEvents,
    ...(generatedContent ? { generatedContent } : {}),
    narrative: typeof value.narrative === "string" ? value.narrative.trim().slice(0, 800) : undefined,
  };
}

function parseFollowUpEvents(value: Record<string, unknown>, game: GameState, prefix: string, knownFlags: Set<string>): EventDefinition[] {
  return (Array.isArray(value.followUpEvents) ? value.followUpEvents : []).flatMap((entry, index) => {
    const followUp = sanitizeEventDefinition(entry, index + 1, game, prefix, knownFlags);
    return followUp ? [followUp] : [];
  }).slice(0, 3);
}

function parseResultRewrite(rawText: string, game: GameState, current: EventResult, allowDerivativeContent: boolean): AiResultRewrite {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的结果重构不是对象");
  const value = parsed as Record<string, unknown>;
  const choices = (Array.isArray(value.choices) ? value.choices : []).flatMap((entry, index) => {
    const choice = sanitizeQuestChoice(entry, index);
    return choice ? [{ ...choice, outcomes: choice.outcomes.map(({ result: _result, ...outcome }) => outcome) }] : [];
  }).slice(0, 5);
  if (!choices.length) throw new Error("AI 没有为当前结果生成可用选项");
  const knownFlags = new Set(game.flags);
  const prefix = `ai-result-${game.turn}-${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9-]/g, "-");
  const followUpEvents = parseFollowUpEvents(value, game, prefix, knownFlags);
  const rawWorldContent = value.worldContent ?? value.generatedContent;
  const generatedContent = allowDerivativeContent && hasContentEntries(rawWorldContent)
    ? parseContentBundle(JSON.stringify(rawWorldContent), game)
    : undefined;
  return {
    title: textValue(value.title, current.title, 60),
    text: textValue(value.text, current.text, 900),
    tone: TONES.includes(value.tone as Tone) ? value.tone as Tone : current.tone,
    choices,
    conversation: sanitizeNarrativeMessages(value.conversation),
    followUpEvents,
    ...(generatedContent ? { generatedContent } : {}),
    narrative: typeof value.narrative === "string" ? value.narrative.trim().slice(0, 800) : undefined,
  };
}

function parseQuestStageRewrite(rawText: string, game: GameState, current: QuestStageDefinition, allowDerivativeContent: boolean): AiQuestStageRewrite {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的任务阶段重构不是对象");
  const value = parsed as Record<string, unknown>;
  const rawStage = value.stage && typeof value.stage === "object" ? value.stage : value;
  const sanitized = sanitizeQuestStage(rawStage, 0, getCurrentLocation(game).role);
  if (!sanitized?.choices?.length) throw new Error("AI 没有为当前任务阶段生成可用选项");
  const stage: QuestStageDefinition = {
    ...current,
    ...sanitized,
    id: current.id,
    kind: "encounter",
    objective: current.objective,
    locationRoles: current.locationRoles,
  };
  const knownFlags = new Set(game.flags);
  const prefix = `ai-quest-stage-${game.turn}-${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9-]/g, "-");
  const followUpEvents = parseFollowUpEvents(value, game, prefix, knownFlags);
  const rawWorldContent = value.worldContent ?? value.generatedContent;
  const generatedContent = allowDerivativeContent && hasContentEntries(rawWorldContent)
    ? parseContentBundle(JSON.stringify(rawWorldContent), game)
    : undefined;
  return {
    stage,
    followUpEvents,
    ...(generatedContent ? { generatedContent } : {}),
    narrative: typeof value.narrative === "string" ? value.narrative.trim().slice(0, 800) : undefined,
  };
}

function parseExplore(rawText: string, game: GameState, allowDerivativeContent: boolean): AiExploreResult {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的探索结果不是对象");
  const value = parsed as Record<string, unknown>;
  const outcome = parseOutcome(JSON.stringify(value));
  const conversation = sanitizeNarrativeMessages(value.conversation);
  const rawWorldContent = value.worldContent ?? value.generatedContent;
  const generatedContent = allowDerivativeContent && hasContentEntries(rawWorldContent)
    ? parseContentBundle(JSON.stringify(rawWorldContent), game)
    : undefined;
  return {
    ...outcome,
    conversation: conversation.length ? conversation : [{ speaker: "旁白", text: outcome.text, side: "narrator" }],
    ...(generatedContent ? { generatedContent } : {}),
  };
}

function parseTraitOptions(rawText: string): TraitDefinition[] {
  const parsed = extractJson(rawText);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的词条不是对象");
  const value = parsed as Record<string, unknown>;
  const rawTraits = Array.isArray(value.traits) ? value.traits : [];
  const nonce = `${Date.now().toString(36)}`;
  const prefix = `ai-traits-${nonce}`.replace(/[^a-zA-Z0-9-]/g, "-");
  const traits = rawTraits.flatMap((entry, index) => {
    const trait = sanitizeTraitDefinition(entry, index, prefix);
    return trait ? [trait] : [];
  });
  if (!traits.length) throw new Error("AI 没有生成可用的开局词条");
  return traits.slice(0, 12);
}

async function requestOutcome(settings: AiSettings, payload: Record<string, unknown>, game?: GameState, allowDerivativeContent = false): Promise<AiGeneratedOutcome> {
  if (!isAiConfigured(settings)) throw new Error("请先完整填写 AI 接口、密钥和模型");
  const enrichedPayload = { ...payload, allowDerivativeContent };
  const body = settings.format === "claude"
    ? {
      model: modelName(settings),
      max_tokens: OUTCOME_MAX_TOKENS,
      temperature: 0.8,
      stream: false,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(enrichedPayload) }],
    }
    : {
      model: modelName(settings),
      max_tokens: OUTCOME_MAX_TOKENS,
      temperature: 0.8,
      stream: false,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(enrichedPayload) }],
    };
  const response = await requestJson(completionEndpoint(settings), { method: "POST", headers: headers(settings), body: JSON.stringify(body) });
  const directOutcome = response && typeof response === "object" && typeof (response as { text?: unknown }).text === "string" && Array.isArray((response as { effects?: unknown }).effects);
  if (directOutcome) return parseOutcome(JSON.stringify(response), game, allowDerivativeContent);
  const content = responseText(response);
  if (!content) throw new Error("AI 响应中没有可解析的文案");
  return parseOutcome(content, game, allowDerivativeContent);
}

async function requestContent(settings: AiSettings, game: GameState, trigger: AiQuestGenerationTrigger): Promise<AiGeneratedContentBundle> {
  if (!isAiConfigured(settings)) throw new Error("请先完整填写 AI 接口、密钥和模型");
  const payload = contentPayload(game, trigger);
  const body = settings.format === "claude"
    ? {
      model: modelName(settings),
      // World bundles contain several nested JSON arrays (quests, stages,
      // choices, outcomes). Leave enough room for a complete, parseable reply.
      max_tokens: CONTENT_MAX_TOKENS,
      temperature: 1,
      stream: false,
      system: CONTENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }
    : {
      model: modelName(settings),
      max_tokens: CONTENT_MAX_TOKENS,
      temperature: 1,
      stream: false,
      messages: [{ role: "system", content: CONTENT_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
    };
  const response = await requestJson(completionEndpoint(settings), { method: "POST", headers: headers(settings), body: JSON.stringify(body) }, CONTENT_REQUEST_TIMEOUT);
  if (isContentBundle(response)) return parseContentBundle(JSON.stringify(response), game);
  if (response && typeof response === "object") {
    const wrapper = response as Record<string, unknown>;
    if (isContentBundle(wrapper.content) || isContentBundle(wrapper.data)) {
      return parseContentBundle(JSON.stringify(isContentBundle(wrapper.content) ? wrapper.content : wrapper.data), game);
    }
  }
  const content = responseText(response);
  if (!content) throw new Error("AI 响应中没有可解析的世界内容");
  return parseContentBundle(content, game);
}

async function requestNarrativeJson(settings: AiSettings, system: string, payload: Record<string, unknown>, maxTokens: number, timeoutMs: number): Promise<unknown> {
  if (!isAiConfigured(settings)) throw new Error("请先完整填写 AI 接口、密钥和模型");
  const body = settings.format === "claude"
    ? {
      model: modelName(settings),
      max_tokens: maxTokens,
      temperature: 1,
      stream: false,
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }
    : {
      model: modelName(settings),
      max_tokens: maxTokens,
      temperature: 1,
      stream: false,
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
    };
  return requestJson(completionEndpoint(settings), { method: "POST", headers: headers(settings), body: JSON.stringify(body) }, timeoutMs);
}

export async function requestAiAction(settings: AiSettings, game: GameState, action: ActionDefinition, durationDays: number, allowDerivativeContent = false): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, actionPayload(game, action, durationDays), game, allowDerivativeContent);
}

export async function requestAiStartingTraits(settings: AiSettings, candidate: CharacterCandidate, level: number, optionCount: number, seed: number): Promise<TraitDefinition[]> {
  if (!isAiConfigured(settings)) throw new Error("请先在设置中启用并完整配置 AI");
  const payload = {
    task: "生成开局词条候选",
    seed,
    simulationLevel: level,
    optionCount: Math.max(3, Math.min(12, Math.round(optionCount))),
    candidate: {
      origin: candidate.origin.name,
      spiritRoot: candidate.spiritRoot.name,
      talent: candidate.talent.name,
      stats: candidate.stats,
      resources: candidate.resources,
    },
  };
  const body = settings.format === "claude"
    ? {
      model: modelName(settings),
      max_tokens: 4500,
      temperature: 1,
      stream: false,
      system: TRAIT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }
    : {
      model: modelName(settings),
      max_tokens: 4500,
      temperature: 1,
      stream: false,
      messages: [{ role: "system", content: TRAIT_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
    };
  const response = await requestJson(completionEndpoint(settings), { method: "POST", headers: headers(settings), body: JSON.stringify(body) }, TRAIT_REQUEST_TIMEOUT);
  if (response && typeof response === "object" && Array.isArray((response as { traits?: unknown }).traits)) return parseTraitOptions(JSON.stringify(response));
  const content = responseText(response);
  if (!content) throw new Error("AI 响应中没有可解析的词条");
  return parseTraitOptions(content);
}

export async function requestAiEvent(settings: AiSettings, game: GameState, event: EventDefinition, choice?: EventChoice, allowDerivativeContent = false): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, eventPayload(game, event, choice), game, allowDerivativeContent);
}

export async function requestAiEventRewrite(settings: AiSettings, game: GameState, event: EventDefinition, allowDerivativeContent: boolean): Promise<AiEventRewrite> {
  const payload = {
    kind: "event_rewrite",
    event: {
      id: event.id,
      title: event.title,
      body: event.body,
      actions: event.actions,
      locationRoles: event.locationRoles,
      durationDays: event.durationDays ?? 1,
      choices: event.choices,
      outcomes: event.outcomes ?? [],
    },
    allowDerivativeContent,
    context: contextFor(game),
  };
  const response = await requestNarrativeJson(settings, EVENT_REWRITE_SYSTEM_PROMPT, payload, EVENT_REWRITE_MAX_TOKENS, EVENT_REWRITE_TIMEOUT);
  const direct = response && typeof response === "object" && ("event" in response || "followUpEvents" in response) ? JSON.stringify(response) : responseText(response);
  if (!direct) throw new Error("AI 响应中没有可解析的事件重构");
  return parseEventRewrite(direct, game, event, allowDerivativeContent);
}

export async function requestAiResultRewrite(settings: AiSettings, game: GameState, result: EventResult, allowDerivativeContent: boolean): Promise<AiResultRewrite> {
  const payload = {
    kind: "result_rewrite",
    result: {
      kind: result.kind,
      title: result.title,
      text: result.text,
      tone: result.tone,
      changes: result.changes,
      durationDays: result.durationDays ?? 0,
      conversation: result.conversation ?? [],
      currentChoices: result.choices ?? [],
    },
    allowDerivativeContent,
    context: contextFor(game),
  };
  const response = await requestNarrativeJson(settings, RESULT_REWRITE_SYSTEM_PROMPT, payload, DIALOG_REWRITE_MAX_TOKENS, DIALOG_REWRITE_TIMEOUT);
  const direct = isDirectResultRewriteResponse(response) ? JSON.stringify(response) : responseText(response);
  if (!direct) throw new Error("AI 响应中没有可解析的结果重构");
  return parseResultRewrite(direct, game, result, allowDerivativeContent);
}

export async function requestAiQuestStageRewrite(settings: AiSettings, game: GameState, quest: QuestDefinition, stage: QuestStageDefinition, allowDerivativeContent: boolean): Promise<AiQuestStageRewrite> {
  const payload = {
    kind: "quest_stage_rewrite",
    quest: { id: quest.id, title: quest.title, summary: quest.summary },
    stage: {
      id: stage.id,
      title: stage.title,
      body: stage.body,
      kind: stage.kind,
      objective: stage.objective,
      locationRoles: stage.locationRoles,
      durationDays: stage.durationDays ?? 1,
      choices: stage.choices ?? [],
    },
    allowDerivativeContent,
    context: contextFor(game),
  };
  const response = await requestNarrativeJson(settings, QUEST_STAGE_REWRITE_SYSTEM_PROMPT, payload, DIALOG_REWRITE_MAX_TOKENS, DIALOG_REWRITE_TIMEOUT);
  const direct = isDirectQuestStageRewriteResponse(response) ? JSON.stringify(response) : responseText(response);
  if (!direct) throw new Error("AI 响应中没有可解析的任务阶段重构");
  return parseQuestStageRewrite(direct, game, stage, allowDerivativeContent);
}

export async function requestAiExplore(settings: AiSettings, game: GameState, allowDerivativeContent: boolean): Promise<AiExploreResult> {
  const location = getCurrentLocation(game);
  const npcs = game.npcs.filter((npc) => npc.alive && npc.locationId === location.id).slice(0, 12).map((npc) => ({
    id: npc.id,
    name: npc.name,
    gender: npc.gender,
    identity: npc.identity,
    personality: npc.personality,
    description: npc.description,
    ageYears: Number(npc.age.toFixed(1)),
    realmStage: npc.realmStage,
    battlePower: npc.battlePower,
    relationship: npc.relationship,
    relationshipType: npc.relationshipType,
  }));
  const payload = {
    kind: "explore",
    allowDerivativeContent,
    location: { id: location.id, name: location.name, role: location.role, subtitle: location.subtitle, description: location.description, danger: location.danger, modifiers: location.modifiers },
    npcs,
    context: contextFor(game),
  };
  const response = await requestNarrativeJson(settings, EXPLORE_SYSTEM_PROMPT, payload, EXPLORE_MAX_TOKENS, EXPLORE_TIMEOUT);
  const direct = response && typeof response === "object" && ("text" in response || "conversation" in response) ? JSON.stringify(response) : responseText(response);
  if (!direct) throw new Error("AI 响应中没有可解析的探索结果");
  return parseExplore(direct, game, allowDerivativeContent);
}

export async function requestAiQuest(settings: AiSettings, game: GameState, quest: QuestDefinition, stage: QuestStageDefinition, choice?: QuestChoice, allowDerivativeContent = false): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, questPayload(game, quest, stage, choice), game, allowDerivativeContent);
}

export async function requestAiContent(settings: AiSettings, game: GameState, trigger: AiQuestGenerationTrigger): Promise<AiGeneratedContentBundle> {
  return requestContent(settings, game, trigger);
}

export async function requestAiQuestGeneration(settings: AiSettings, game: GameState, trigger: AiQuestGenerationTrigger): Promise<AiGeneratedContentBundle> {
  return requestContent(settings, game, trigger);
}

export async function requestAiNpcInteraction(settings: AiSettings, game: GameState, npc: Npc, interaction: NpcInteractionDefinition, allowDerivativeContent = false): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, npcPayload(game, npc, interaction), game, allowDerivativeContent);
}

export async function requestAiTravel(settings: AiSettings, game: GameState, target: { id: string; name: string; subtitle: string; description: string; danger: string; travelCost: number }, allowDerivativeContent = false): Promise<AiGeneratedOutcome> {
  return requestOutcome(settings, travelPayload(game, target), game, allowDerivativeContent);
}

export async function requestAiLifeResume(settings: AiSettings, archive: LifeArchive): Promise<string> {
  if (!isAiConfigured(settings)) throw new Error("请先在设置中启用并完整配置 AI");
  const payload = {
    task: "为已结束的人生撰写卷宗简历",
    character: archive.character,
    summary: archive.summary,
    finalRealm: archive.finalRealm,
    turn: archive.turn,
    age: archive.age,
    lifespan: archive.lifespan,
    finalLocationName: archive.finalLocationName,
    chronicle: archive.chronicle.slice().reverse().map((entry) => ({
      day: entry.turn,
      title: entry.title,
      text: entry.text,
      kind: entry.kind,
      detail: entry.detail,
      locationName: entry.locationName,
      changes: entry.changes,
    })),
  };
  const body = settings.format === "claude"
    ? {
      model: modelName(settings),
      max_tokens: 3200,
      temperature: 0.85,
      stream: false,
      system: LIFE_RESUME_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }
    : {
      model: modelName(settings),
      max_tokens: 3200,
      temperature: 0.85,
      stream: false,
      messages: [{ role: "system", content: LIFE_RESUME_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(payload) }],
    };
  const response = await requestJson(completionEndpoint(settings), { method: "POST", headers: headers(settings), body: JSON.stringify(body) }, 180_000);
  const content = responseText(response).trim();
  if (!content) throw new Error("AI 响应中没有可解析的人生简历");
  return content.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim().slice(0, 5000);
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
