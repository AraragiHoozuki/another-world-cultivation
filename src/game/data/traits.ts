import type { TraitDefinition } from "../types";

export const TRAIT_RARITY_NAMES = {
  gray: "灰色",
  white: "白色",
  green: "绿色",
  blue: "蓝色",
  purple: "紫色",
  rainbow: "虹彩",
} as const;

/** Starting traits are intentionally small, additive modifiers so a run remains viable at every level. */
export const TRAITS: TraitDefinition[] = [
  { id: "plain-born", name: "凡尘底色", description: "出身寻常，却比许多人更懂得惜命。", rarity: "gray", cost: 1, resources: { stamina: 4, maxStamina: 4 } },
  { id: "steady-breath", name: "吐纳平稳", description: "最基础的吐纳法，也能让灵力少些浪费。", rarity: "gray", cost: 1, resources: { qi: 3, maxQi: 3 } },
  { id: "keen-memory", name: "过目不忘", description: "看过的口诀不会轻易从脑中散去。", rarity: "white", cost: 1, stats: { insight: 1 } },
  { id: "hardy", name: "筋骨结实", description: "经年劳作留下了比同龄人更可靠的体魄。", rarity: "white", cost: 1, stats: { constitution: 1 } },
  { id: "quiet-heart", name: "静心", description: "喧嚣临身时，心湖仍能留下一角清明。", rarity: "white", cost: 1, resources: { mind: 8, maxMind: 8 } },
  { id: "herb-scent", name: "药香入骨", description: "自幼与灵草为伴，炼丹和采集都更得心应手。", rarity: "green", cost: 2, stats: { spirit: 1 }, alchemyBonus: 0.08, explorationBonus: 0.05 },
  { id: "traveler", name: "旧路行者", description: "认得荒野的风向，探索时更容易找到收获。", rarity: "green", cost: 2, stats: { fortune: 1 }, explorationBonus: 0.12 },
  { id: "merchant-blood", name: "商脉", description: "讨价还价是刻在骨子里的本能。", rarity: "green", cost: 2, stats: { fortune: 1 }, resources: { spiritStones: 10 } },
  { id: "spirit-sight", name: "灵光初现", description: "偶尔能看见灵气流动的细微纹路。", rarity: "green", cost: 2, stats: { spirit: 1, insight: 1 }, resources: { qi: 5, maxQi: 5 } },
  { id: "sword-seed", name: "剑胚", description: "尚未握剑，杀伐之意却已经在心中生根。", rarity: "blue", cost: 3, stats: { constitution: 1, spirit: 1 }, resources: { battlePower: 10 } },
  { id: "lucky-star", name: "福星照命", description: "关键时刻总有一线不讲道理的好运。", rarity: "blue", cost: 3, stats: { fortune: 2 } },
  { id: "dao-mind", name: "道心雏形", description: "面对漫长修行，心中已有不肯熄灭的火。", rarity: "blue", cost: 3, stats: { insight: 1 }, cultivationBonus: 0.1, resources: { mind: 8, maxMind: 8 } },
  { id: "battle-temper", name: "百战余烬", description: "见过真正的生死，战力和危险判断都更老练。", rarity: "blue", cost: 3, stats: { constitution: 1, fortune: 1 }, resources: { battlePower: 18 }, dangerModifier: -0.04 },
  { id: "heavenly-insight", name: "天授悟性", description: "天地间偶尔会有一句话，恰好落进你的心里。", rarity: "purple", cost: 5, stats: { insight: 3 }, cultivationBonus: 0.16 },
  { id: "immortal-bone", name: "先天仙骨", description: "筋骨中藏着一缕不属于凡人的回响。", rarity: "purple", cost: 5, stats: { constitution: 2, spirit: 1 }, resources: { lifespan: 12, battlePower: 20 }, cultivationBonus: 0.08 },
  { id: "void-walker", name: "虚空行迹", description: "界外的风曾从你身上经过，危险也因此更容易注意到你。", rarity: "purple", cost: 5, stats: { spirit: 2, fortune: 1 }, explorationBonus: 0.18, dangerModifier: 0.08 },
  { id: "rainbow-rebirth", name: "虹彩命痕", description: "命运在你出生时留下了一道无法解释的彩痕。", rarity: "rainbow", cost: 8, stats: { constitution: 2, insight: 2, spirit: 2, fortune: 2 }, resources: { lifespan: 25, qi: 12, maxQi: 12, mind: 12, maxMind: 12, battlePower: 35 }, cultivationBonus: 0.2, dangerModifier: 0.05 },
  { id: "world-favored", name: "世界偏爱", description: "你尚未踏上大道，世界却已经为你留了一扇门。", rarity: "rainbow", cost: 8, stats: { insight: 2, fortune: 3 }, cultivationBonus: 0.28, explorationBonus: 0.2, resources: { spiritStones: 30 } },
];

export const traitMap = new Map(TRAITS.map((trait) => [trait.id, trait]));
