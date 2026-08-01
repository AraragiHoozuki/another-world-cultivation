import type { LocationRole, WorldLocation } from "../types";

export type LocationTemplate = Omit<WorldLocation, "connections" | "position">;

export const LOCATION_POOLS: Record<LocationRole, LocationTemplate[]> = {
  sanctuary: [
    { id: "mist-home", role: "sanctuary", name: "归雾山居", subtitle: "雾岭深处的临时洞府", description: "旧木屋倚着灵脉余支，谈不上洞天福地，胜在门能关严。", danger: "安稳", icon: "home", actions: ["cultivate", "alchemy", "rest"], unlockStage: 1, travelCost: 3 },
    { id: "stone-courtyard", role: "sanctuary", name: "石竹小院", subtitle: "竹海间的无主别院", description: "院中石竹终年不败，前任主人只留下半口丹炉和一张欠租告示。", danger: "安稳", icon: "home", actions: ["cultivate", "alchemy", "rest"], unlockStage: 1, travelCost: 3 },
    { id: "old-post", role: "sanctuary", name: "断云驿", subtitle: "废弃官道上的旧驿站", description: "驿站荒废多年，马厩里却仍有微弱聚灵阵运转，像在等一匹不会来的马。", danger: "安稳", icon: "home", actions: ["cultivate", "alchemy", "rest"], unlockStage: 1, travelCost: 3 },
  ],
  market: [
    { id: "floating-market", role: "market", name: "浮云坊市", subtitle: "散修云集的山中市镇", description: "棚布下什么都卖，真假各占一半，至于是哪一半要看摊主心情。", danger: "安稳", icon: "market", actions: ["market", "rest"], unlockStage: 1, travelCost: 3 },
    { id: "herb-fair", role: "market", name: "百草集", subtitle: "药农与丹师的定期集市", description: "空气里混着药香、炉烟和讨价还价的火气，咳一声都可能被问价。", danger: "安稳", icon: "market", actions: ["market", "alchemy", "rest"], unlockStage: 1, travelCost: 3 },
    { id: "raven-market", role: "market", name: "渡鸦黑市", subtitle: "只在无月夜开张的秘市", description: "蒙面客以渡鸦羽换取入场资格。这里不问来路，通常也不保证去路。", danger: "尚可", icon: "market", actions: ["market", "explore"], unlockStage: 1, travelCost: 4 },
  ],
  herbal: [
    { id: "azure-valley", role: "herbal", name: "青岚药谷", subtitle: "灵雾滋养的天然药圃", description: "谷中草木疯长，灵药与毒株挤在一起，彼此看起来都很无辜。", danger: "尚可", icon: "forest", actions: ["gather", "explore", "rest"], unlockStage: 1, travelCost: 4 },
    { id: "bamboo-sea", role: "herbal", name: "千籁竹海", subtitle: "风声如潮的碧竹深林", description: "每阵风都像有人在竹间低语。药材丰盛，迷路的人也同样丰盛。", danger: "尚可", icon: "forest", actions: ["gather", "explore", "cultivate"], unlockStage: 1, travelCost: 4 },
    { id: "red-marsh", role: "herbal", name: "赤叶泽", subtitle: "红叶覆水的湿地", description: "赤叶下藏着珍稀水生灵草，也藏着对采药人抱有研究兴趣的东西。", danger: "凶险", icon: "forest", actions: ["gather", "explore"], unlockStage: 1, travelCost: 5 },
  ],
  water: [
    { id: "mirror-ferry", role: "water", name: "镜湖古渡", subtitle: "水天不分的废弃渡口", description: "无风时湖面会映出并不存在的山。偶尔，也会映出不在岸边的人。", danger: "尚可", icon: "water", actions: ["explore", "gather", "rest"], unlockStage: 1, travelCost: 4 },
    { id: "sunken-moon", role: "water", name: "沉月泽", subtitle: "月光沉底的幽暗水泽", description: "夜里水下会亮起第二轮月亮，靠得太近的人往往会多出一道影子。", danger: "凶险", icon: "water", actions: ["explore", "gather", "cultivate"], unlockStage: 1, travelCost: 5 },
    { id: "white-sand", role: "water", name: "白沙渡", subtitle: "商旅停泊的浅水河湾", description: "船夫能把活人送去彼岸，也能把秘密送去坊市，后者收费更高。", danger: "尚可", icon: "water", actions: ["explore", "rest", "market"], unlockStage: 1, travelCost: 3 },
  ],
  danger: [
    { id: "ember-waste", role: "danger", name: "烬骨荒原", subtitle: "古战场焚尽后的灰土", description: "焦土下埋着残器与尸骨。每当风起，两者都会发出不太一样的声音。", danger: "凶险", icon: "ruins", actions: ["explore", "gather"], unlockStage: 2, travelCost: 6 },
    { id: "miasma-wood", role: "danger", name: "瘴雾林", subtitle: "终日不见阳光的毒林", description: "树皮长着模糊人脸，瘴气则长着明确恶意。好消息是毒物通常也很值钱。", danger: "凶险", icon: "forest", actions: ["explore", "gather"], unlockStage: 2, travelCost: 6 },
    { id: "red-battlefield", role: "danger", name: "赤砂古战场", subtitle: "兵煞未散的血色沙原", description: "断旗在无风处猎猎作响，地下偶尔传出整齐脚步，像一支军队还没收到停战消息。", danger: "凶险", icon: "ruins", actions: ["explore", "cultivate"], unlockStage: 2, travelCost: 6 },
  ],
  sect: [
    { id: "azure-sect", role: "sect", name: "青霄山门", subtitle: "立于云崖的修行宗门", description: "石阶直入云海，外门执事在尽头审视每个来客的钱袋与灵根。", danger: "尚可", icon: "sect", actions: ["cultivate", "market", "explore", "rest"], unlockStage: 3, travelCost: 5 },
    { id: "sword-platform", role: "sect", name: "无相剑台", subtitle: "剑修留下的悬空道场", description: "台上没有一柄剑，石壁却布满剑痕。风穿过时，整座山都像在出鞘。", danger: "凶险", icon: "sect", actions: ["cultivate", "explore", "rest"], unlockStage: 3, travelCost: 5 },
    { id: "sunset-temple", role: "sect", name: "栖霞观", subtitle: "只在黄昏开门的古观", description: "观门每天只开一刻，里面的道人却坚持自己从未关门。", danger: "尚可", icon: "sect", actions: ["cultivate", "alchemy", "market", "rest"], unlockStage: 3, travelCost: 4 },
  ],
  secret: [
    { id: "starfall-ridge", role: "secret", name: "落星岭", subtitle: "天外残骸坠落之地", description: "黑色山岩会在夜里发光，界蚀印靠近时也会。两者似乎认识。", danger: "绝险", icon: "star", actions: ["explore", "gather", "cultivate"], unlockStage: 5, travelCost: 7 },
    { id: "sky-rift", role: "secret", name: "裂天峡", subtitle: "天空破碎的狭长峡谷", description: "抬头能看见另一片星空从裂隙后经过。偶尔有东西也会低头看你。", danger: "绝险", icon: "star", actions: ["explore", "cultivate"], unlockStage: 5, travelCost: 7 },
    { id: "dragon-tomb", role: "secret", name: "葬龙台", subtitle: "巨骨环绕的高原祭台", description: "没人证明这里埋过真龙，但也没人愿意把中央那根肋骨叫作别的东西。", danger: "绝险", icon: "ruins", actions: ["explore", "gather", "cultivate"], unlockStage: 5, travelCost: 7 },
  ],
  settlement: [
    { id: "paper-lantern-town", role: "settlement", name: "纸灯镇", subtitle: "沿商道生长的凡人集镇", description: "入夜后千盏纸灯映着各色行脚人，修士在这里也得排队买一碗热汤。", danger: "安稳", icon: "home", actions: ["market", "explore"], unlockStage: 1, travelCost: 3 },
    { id: "river-mouth-city", role: "settlement", name: "回潮城", subtitle: "三条水路交汇的边城", description: "船帮、镖局与散修在城门内外交换货物，也交换各自不愿说完的消息。", danger: "尚可", icon: "market", actions: ["market", "gather"], unlockStage: 1, travelCost: 4 },
    { id: "cloud-step-village", role: "settlement", name: "云梯村", subtitle: "依山而建的灵田村落", description: "村民把灵田一层层种上山腰，偶尔会有修士来替他们看一眼云外的天气。", danger: "安稳", icon: "home", actions: ["market", "gather"], unlockStage: 1, travelCost: 3 },
  ],
  mine: [
    { id: "red-gold-mine", role: "mine", name: "赤金矿脉", subtitle: "灵石裸露的断层矿场", description: "矿镐声昼夜不停，岩缝里偶尔传出第二种回声，没人愿意追究它来自哪里。", danger: "尚可", icon: "ruins", actions: ["gather", "explore"], unlockStage: 1, travelCost: 5 },
    { id: "jade-bone-pit", role: "mine", name: "玉骨坑", subtitle: "埋着古修遗骸的深坑", description: "白玉般的骨片混在矿砂中，采矿人与盗墓客常常在同一盏灯下讨价还价。", danger: "凶险", icon: "ruins", actions: ["gather", "explore", "alchemy"], unlockStage: 2, travelCost: 6 },
    { id: "skyforge-quarry", role: "mine", name: "天工石场", subtitle: "炼器宗门的外采地", description: "碎石悬在半空等待号令，懂得辨认矿脉的人能在这里换到一份不错的炉火。", danger: "尚可", icon: "ruins", actions: ["gather", "market"], unlockStage: 2, travelCost: 5 },
  ],
  academy: [
    { id: "stargazing-tower", role: "academy", name: "观星楼", subtitle: "推演天象的高层道场", description: "楼中每一层都收藏着不同年代的星图，抬头久了，连自己的命数也像一颗过客。", danger: "尚可", icon: "sect", actions: ["alchemy", "explore"], unlockStage: 2, travelCost: 4 },
    { id: "hundred-scripture-hall", role: "academy", name: "百卷堂", subtitle: "散修共享的藏经阁", description: "书架没有尽头，管理员只允许带走自己真正看懂的那一页。", danger: "安稳", icon: "sect", actions: ["alchemy", "market"], unlockStage: 2, travelCost: 4 },
    { id: "echoing-cliff", role: "academy", name: "回声崖", subtitle: "以问答磨炼心神的学宫", description: "崖壁会重复每一个问题，却从不替人回答。悟性高的人常常在这里坐到忘记天黑。", danger: "尚可", icon: "sect", actions: ["explore", "alchemy"], unlockStage: 2, travelCost: 4 },
  ],
  rift: [
    { id: "eclipse-rift", role: "rift", name: "蚀界裂隙", subtitle: "界壁剥落的危险缝隙", description: "裂隙另一侧吹来的风带着不属于此界的气味，灵力在这里既丰沛又不听使唤。", danger: "绝险", icon: "star", actions: ["explore", "gather"], unlockStage: 4, travelCost: 8 },
    { id: "nine-abyss-well", role: "rift", name: "九幽井", subtitle: "直通幽暗地脉的古井", description: "井水倒映的不是天空，而是某个更深的夜。井沿刻着劝人回头的字，字迹却很新。", danger: "绝险", icon: "star", actions: ["explore", "alchemy"], unlockStage: 4, travelCost: 8 },
    { id: "reverse-sky-gate", role: "rift", name: "倒悬天门", subtitle: "悬在云下的残破界门", description: "门框朝向大地，门后偶尔传来脚步。没人见过来者，只有门前的尘土会改变方向。", danger: "绝险", icon: "star", actions: ["explore", "market"], unlockStage: 5, travelCost: 9 },
  ],
};
