import type { Effect, ItemCategory, ItemDefinition, ItemRarity, InventoryEntry } from "../types";

export const ITEM_CATEGORY_NAMES: Record<ItemCategory, string> = {
  consumable: "消耗品",
  material: "材料",
  artifact: "法宝",
  quest: "剧情 / 任务",
};

export const ITEM_RARITY_NAMES: Record<ItemRarity, string> = {
  1: "一品",
  2: "二品",
  3: "三品",
  4: "四品",
  5: "五品",
  6: "六品",
  7: "七品",
  8: "八品",
  9: "九品",
};

const resourceEffect = (key: "stamina" | "qi" | "mind", amount: number): Effect => ({ type: "resource", key, amount });

export const ITEMS: ItemDefinition[] = [
  {
    id: "spirit-herb",
    name: "灵草",
    description: "带着山野灵气的草药，可用于炼丹、赠礼或在坊市交易。",
    category: "material",
    rarity: 9,
    price: 4,
    sellPrice: 2,
    stackable: true,
  },
  {
    id: "barrier-pill",
    name: "破障丹",
    description: "凝聚灵力的破境丹药，突破关隘时可服用以增加成功机会。",
    category: "consumable",
    rarity: 6,
    price: 18,
    sellPrice: 11,
    stackable: true,
  },
  {
    id: "rejuvenation-elixir",
    name: "回元灵露",
    description: "以山泉和灵草炼成，服下后恢复一段体力。",
    category: "consumable",
    rarity: 8,
    price: 12,
    sellPrice: 7,
    effects: [resourceEffect("stamina", 28)],
  },
  {
    id: "calm-incense",
    name: "宁神香",
    description: "点燃后心神安定，可抚平修炼留下的躁意。",
    category: "consumable",
    rarity: 8,
    price: 14,
    sellPrice: 8,
    effects: [resourceEffect("mind", 24)],
  },
  {
    id: "spirit-pellet",
    name: "聚灵丸",
    description: "将一缕散乱灵气封在丹皮中，适合短暂补充灵力。",
    category: "consumable",
    rarity: 7,
    price: 18,
    sellPrice: 10,
    effects: [resourceEffect("qi", 36)],
  },
  {
    id: "moon-dew",
    name: "月华露",
    description: "夜间凝在灵植叶尖的露水，是炼丹和制符的温和材料。",
    category: "material",
    rarity: 8,
    price: 8,
    sellPrice: 5,
  },
  {
    id: "spirit-iron",
    name: "灵纹铁",
    description: "矿脉深处才会出现的灵铁，可用于修补低阶法器。",
    category: "material",
    rarity: 7,
    price: 16,
    sellPrice: 10,
  },
  {
    id: "cloud-silk",
    name: "云蚕丝",
    description: "云蚕吐出的灵丝，轻薄却能承受数道护身法诀。",
    category: "material",
    rarity: 6,
    price: 32,
    sellPrice: 20,
  },
  {
    id: "flying-sword",
    name: "青锋飞剑",
    description: "剑身尚未认主，锋芒已经足以让凡俗铁器退避。",
    category: "artifact",
    rarity: 5,
    price: 180,
    sellPrice: 110,
  },
  {
    id: "spirit-lantern",
    name: "照魂灯",
    description: "灯火能照见残留的神识痕迹，适合探查旧日遗迹。",
    category: "artifact",
    rarity: 3,
    price: 520,
    sellPrice: 320,
  },
  {
    id: "ancient-jade-token",
    name: "古宗玉令",
    description: "刻着失落宗门徽记的玉牌，或许能在某处旧山门换来答案。",
    category: "quest",
    rarity: 4,
    price: 0,
    sellPrice: 0,
    stackable: false,
  },
];

export const itemMap = new Map(ITEMS.map((item) => [item.id, item]));

/** A small starting cache gives the inventory page something useful to show. */
export const INITIAL_INVENTORY: InventoryEntry[] = [
  { itemId: "rejuvenation-elixir", quantity: 1 },
  { itemId: "calm-incense", quantity: 1 },
  { itemId: "spirit-iron", quantity: 2 },
  { itemId: "ancient-jade-token", quantity: 1 },
];
