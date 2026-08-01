import type { ActionDefinition } from "../types";

export const ACTIONS: ActionDefinition[] = [
  { id: "cultivate", category: "innate", name: "闭关吐纳", description: "运转异界灵气，稳步积累修为。每日消耗较少灵力，可持续闭关更久。", risk: "安稳", eventChance: 0.34, durationDays: 1, durationRange: { min: 1, max: 180, step: 1 } },
  { id: "explore", category: "location", name: "外出历练", description: "踏入荒野寻觅机缘，也可能被机缘寻到。", risk: "凶险", eventChance: 0.82, durationDays: 3 },
  { id: "gather", category: "location", name: "入山采药", description: "采集灵草，为炼丹或换取灵石做准备。", risk: "尚可", eventChance: 0.55, durationDays: 2 },
  { id: "alchemy", category: "location", name: "开炉炼丹", description: "消耗两株灵草，尝试炼成破障丹。", risk: "尚可", eventChance: 0.46, durationDays: 1 },
  { id: "market", category: "location", name: "前往坊市", description: "打开坊市菜单；只有听取传闻才会消耗一天。", risk: "安稳", eventChance: 0, durationDays: 1 },
  { id: "rest", category: "innate", name: "静养心神", description: "调理伤势，恢复灵力与心境，静养期间也可能遇到异闻。", risk: "安稳", eventChance: 0.24, durationDays: 1, durationRange: { min: 1, max: 60, step: 1 } },
]; 
