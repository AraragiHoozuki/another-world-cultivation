import type { OriginDefinition, SpiritRootDefinition, TalentDefinition } from "../types";

export const ORIGINS: OriginDefinition[] = [
  { id: "herbalist", name: "药农遗孤", description: "认得草木，却不太认得人心。", unlockAt: 0, stats: { spirit: 1 }, resources: { herbs: 3 } },
  { id: "guard", name: "边城武卒", description: "活着走出尸山，是你修行前最大的成就。", unlockAt: 0, stats: { constitution: 2 }, resources: { health: 8, maxHealth: 8 } },
  { id: "scribe", name: "落第书生", description: "经义没考中，残卷倒看懂了半页。", unlockAt: 0, stats: { insight: 2 }, resources: { mind: 6, maxMind: 6 } },
  { id: "merchant", name: "行商弃子", description: "你没有家产，只继承了砍价时的厚脸皮。", unlockAt: 0, stats: { fortune: 1 }, resources: { spiritStones: 12 } },
  { id: "prisoner", name: "矿场逃奴", description: "灵矿的每条暗道，都用血记在你脑中。", unlockAt: 3, stats: { constitution: 1, fortune: 1 }, resources: { spiritStones: 6 } },
  { id: "disciple", name: "逐门弃徒", description: "师门收回了法器，没能收回你偷学的口诀。", unlockAt: 7, stats: { insight: 1, spirit: 1 }, resources: { cultivation: 12 } },
];

export const SPIRIT_ROOTS: SpiritRootDefinition[] = [
  { id: "wood", name: "青木灵根", description: "草木亲和，药性在你手中更温顺。", cultivationBonus: 0.08, alchemyBonus: 0.16, stats: { spirit: 1 } },
  { id: "fire", name: "离火灵根", description: "灵气炽烈，进境迅猛，脾气偶尔也跟着进境。", cultivationBonus: 0.14, alchemyBonus: 0.08 },
  { id: "water", name: "玄水灵根", description: "周天绵长，心境不易枯竭。", cultivationBonus: 0.1, stats: { insight: 1 } },
  { id: "metal", name: "庚金灵根", description: "杀伐锐利，荒野中的麻烦通常先倒下。", cultivationBonus: 0.07, explorationBonus: 0.16, stats: { constitution: 1 } },
  { id: "mixed", name: "五行杂灵根", description: "什么都能炼一点，天地也不知道该如何为难你。", cultivationBonus: 0.03, stats: { fortune: 2 } },
];

export const TALENTS: TalentDefinition[] = [
  { id: "clear-mind", name: "澄心", description: "心境上限提高，突破时更易守住神台。", unlockAt: 0, stats: { insight: 1 }, resources: { mind: 10, maxMind: 10 } },
  { id: "iron-bone", name: "铁骨", description: "气血旺盛，挨打以后还能认真总结。", unlockAt: 0, stats: { constitution: 2 }, resources: { health: 12, maxHealth: 12 } },
  { id: "lucky", name: "福缘浅厚", description: "谈不上天命所归，至少天命偶尔记得你。", unlockAt: 0, stats: { fortune: 2 } },
  { id: "spirit-sense", name: "灵台通明", description: "神识敏锐，更善炼丹与识破险局。", unlockAt: 0, stats: { spirit: 2 } },
  { id: "diligent", name: "苦修之心", description: "吐纳所得提高，但你看起来总像没睡醒。", unlockAt: 0, cultivationBonus: 0.15, resources: { mind: -5 } },
  { id: "cautious", name: "见势不妙", description: "危险事件的恶果略微减轻。", unlockAt: 0, dangerModifier: -0.12, stats: { fortune: 1 } },
  { id: "alchemist", name: "丹火余韵", description: "开炉时更容易结丹。", unlockAt: 2, stats: { spirit: 1 }, resources: { herbs: 2 } },
  { id: "wanderer", name: "踏遍荒山", description: "探索收益提高，逃跑姿势也很熟练。", unlockAt: 3, stats: { constitution: 1, fortune: 1 } },
  { id: "old-soul", name: "似曾相识", description: "偶尔觉得这条死路上辈子来过。", unlockAt: 4, stats: { insight: 2, fortune: 1 } },
  { id: "sword-heart", name: "剑心未鸣", description: "手中无剑，胸中那柄倒是一直嫌吵。", unlockAt: 6, stats: { constitution: 1, spirit: 2 } },
  { id: "void-mark", name: "虚空留痕", description: "界蚀印与你纠缠更深，也带来异样悟性。", unlockAt: 8, stats: { insight: 3 }, dangerModifier: 0.08 },
  { id: "heaven-envy", name: "天妒", description: "修行极快，只是老天似乎有点意见。", unlockAt: 10, cultivationBonus: 0.28, dangerModifier: 0.14 },
];
