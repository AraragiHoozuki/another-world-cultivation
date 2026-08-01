/** Ordered progression: six realms with nine layers each, then a terminal ascension. */
const REALM_NAMES = ["炼气", "筑基", "金丹", "元婴", "化神", "合体"] as const;
const LAYER_NAMES = ["一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

export const REALMS = [
  ...REALM_NAMES.flatMap((realm) => LAYER_NAMES.map((layer) => `${realm}${layer}层`)),
  "羽化飞升",
] as const;
