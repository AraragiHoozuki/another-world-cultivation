import type { LocationRole, NpcIdentityDefinition, NpcInteractionDefinition } from "../types";

export const NPC_IDENTITIES: NpcIdentityDefinition[] = [
  { id: "wanderer", name: "云游散修", description: "没有宗门约束，靠一柄旧剑和一张能说会道的嘴走遍山河。", roles: ["sanctuary", "market", "herbal", "water", "settlement", "mine", "academy"], minStage: 1, maxStage: 30, powerBase: 24, powerPerStage: 4.5, relationshipBias: 1 },
  { id: "sect", name: "宗门弟子", description: "身负宗门功法与任务，言谈间总带着几分师门规矩。", roles: ["sect", "academy", "settlement", "sanctuary"], minStage: 2, maxStage: 36, powerBase: 30, powerPerStage: 5, relationshipBias: 2 },
  { id: "merchant", name: "行商掌柜", description: "在各处坊市之间往来，袖中算盘比飞剑更快。", roles: ["market", "settlement", "mine", "water"], minStage: 1, maxStage: 18, powerBase: 18, powerPerStage: 3.2, relationshipBias: 5 },
  { id: "alchemist", name: "游方丹师", description: "背着药篓与丹炉寻找奇方，愿意用一炉丹火换一个故事。", roles: ["herbal", "academy", "sect", "water"], minStage: 2, maxStage: 32, powerBase: 26, powerPerStage: 4.2, relationshipBias: 4 },
  { id: "hunter", name: "猎妖人", description: "熟悉荒野每一条兽道，沉默得像一支未出鞘的箭。", roles: ["danger", "secret", "rift", "herbal", "mine"], minStage: 2, maxStage: 42, powerBase: 36, powerPerStage: 5.8, relationshipBias: -2 },
  { id: "hermit", name: "隐世前辈", description: "来历无人知晓，偶尔在风雪里留下一句足够后辈参悟半年的话。", roles: ["sanctuary", "secret", "rift", "water"], minStage: 8, maxStage: 54, powerBase: 58, powerPerStage: 6.4, relationshipBias: 0 },
  { id: "artisan", name: "凡俗匠人", description: "不修大道，只把木石、灵矿和日子打磨成能用的模样。", roles: ["settlement", "mine", "market", "sanctuary"], minStage: 1, maxStage: 8, powerBase: 10, powerPerStage: 1.8, relationshipBias: 6 },
];

export const NPC_INTERACTIONS: NpcInteractionDefinition[] = [
  { id: "converse", name: "促膝闲谈", description: "坐下来听对方讲一段来处，也让自己的名字被记住。", durationDays: 1 },
  { id: "gift", name: "赠礼结交", description: "送出三枚灵石，试着把陌生变成一份善意。", resourceCost: { spiritStones: 3 }, durationDays: 1 },
  { id: "spar", name: "切磋论道", description: "以灵力和招式交流，胜负之外也能看清彼此的路。", resourceCost: { qi: 6, stamina: 8 }, durationDays: 2 },
  { id: "assist", name: "出手相助", description: "拿出一株灵草帮对方解燃眉之急，关系往往从此改变。", resourceCost: { herbs: 1 }, durationDays: 2 },
  { id: "consult", name: "请教功法", description: "以灵石和心得换取对方在修行路上的指点。", resourceCost: { qi: 4 }, durationDays: 2, minRelationship: 15 },
  { id: "visit", name: "探望陪伴", description: "留在对方身边一日，听其近况，也分享自己的见闻。", durationDays: 1, minRelationship: 10 },
  { id: "seekMentor", name: "拜师求道", description: "以诚心叩问道途，请境界更高者收你为徒。", resourceCost: { mind: 6 }, durationDays: 3, minRelationship: 35, setsRelationship: "disciple" },
  { id: "acceptDisciple", name: "收徒传道", description: "将自己的心得传给后辈，结下师徒因果。", resourceCost: { mind: 8 }, durationDays: 3, minRelationship: 40, setsRelationship: "mentor" },
  { id: "swear", name: "结拜金兰", description: "以天地为证，与志同道合之人结为兄弟。", resourceCost: { spiritStones: 5 }, durationDays: 2, minRelationship: 55, setsRelationship: "swornSibling" },
  { id: "propose", name: "结为道侣", description: "将一生心意交付给对方，许下共同求道的誓言。", resourceCost: { spiritStones: 8 }, durationDays: 2, minRelationship: 70, setsRelationship: "spouse" },
  { id: "dissolve", name: "解除关系", description: "了结已经无法继续的因果，让双方重新走自己的路。", durationDays: 1, clearsRelationship: true },
];

export const NPC_PERSONALITIES = [
  "沉稳", "爽朗", "谨慎", "执拗", "温柔", "孤高", "机敏", "赤诚", "冷峻", "随和", "好奇", "坚韧",
];

export const NPC_SURNAMES = ["沈", "陆", "顾", "闻", "江", "宁", "楚", "谢", "林", "苏", "裴", "容", "许", "温", "白"];
export const NPC_GIVEN_NAMES = ["停云", "照川", "归鹤", "问舟", "无咎", "青崖", "见微", "怀真", "知白", "临渊", "听雪", "观澜", "秋水", "长歌", "孤鸿", "晚棠"];

export function identityForRole(role: LocationRole): NpcIdentityDefinition[] {
  return NPC_IDENTITIES.filter((identity) => identity.roles.includes(role));
}
