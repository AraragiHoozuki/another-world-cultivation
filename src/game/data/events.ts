import type { EventDefinition } from "../types";

const simple = (
  id: string,
  title: string,
  body: string,
  actions: EventDefinition["actions"],
  choices: EventDefinition["choices"],
  extra: Partial<EventDefinition> = {},
): EventDefinition => ({ id, title, body, actions, choices, weight: 1, durationDays: 1, ...extra });

const gainChoice = (id: string, label: string, hint: string, text: string, effects: EventDefinition["choices"][number]["outcomes"][number]["effects"]) => ({
  id, label, hint, outcomes: [{ weight: 1, text, tone: "good" as const, effects }],
});

export const EVENTS: EventDefinition[] = [
  simple("market-day", "浮云集", "棚布下摆着来路可疑的丹药与去路明确的灵石。摊主们都发誓自己只赚一口饭。", ["market"], [
    { id: "buy-herbs", label: "买两株灵草", hint: "花费 8 灵石", requirement: { resource: { spiritStones: 8 } }, outcomes: [{ weight: 1, text: "摊主咬牙含泪赚了你六块灵石。", tone: "neutral", effects: [{ type: "resource", key: "spiritStones", amount: -8 }, { type: "resource", key: "herbs", amount: 2 }] }] },
    { id: "buy-pill", label: "买一枚破障丹", hint: "花费 18 灵石", requirement: { resource: { spiritStones: 18 } }, outcomes: [{ weight: 1, text: "丹药颜色不太端正，好在灵气确实是真的。", tone: "good", effects: [{ type: "resource", key: "spiritStones", amount: -18 }, { type: "resource", key: "pills", amount: 1 }] }] },
    { id: "sell-herbs", label: "卖出两株灵草", hint: "获得 7 灵石", requirement: { resource: { herbs: 2 } }, outcomes: [{ weight: 1, text: "药贩挑了半天毛病，最后还是全收了。", tone: "good", effects: [{ type: "resource", key: "herbs", amount: -2 }, { type: "resource", key: "spiritStones", amount: 7 }] }] },
    { id: "listen", label: "只听传闻", hint: "不做买卖", outcomes: [{ weight: 1, text: "你听说北坡最近有妖兽。北坡常有妖兽，这消息十分稳定。", tone: "neutral", effects: [{ type: "resource", key: "mind", amount: 3 }] }] },
  ], { once: false }),
  simple("wounded-fox", "负伤灵狐", "一只银灰灵狐被兽夹锁住前爪。它没有挣扎，只冷冷看你，像在判断你值不值得记仇。", ["explore", "gather"], [
    { id: "help", label: "拆开兽夹", hint: "心软未必是坏事", outcomes: [
      { weight: 7, text: "灵狐消失在林中。片刻后，一株带露灵草被放在你脚边。", tone: "good", effects: [{ type: "resource", key: "herbs", amount: 2 }, { type: "flag", key: "fox-kindness" }] },
      { weight: 3, text: "灵狐临走前咬了你一口。它大概认为两清比较体面。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -7 }] },
    ] },
    gainChoice("leave", "绕路离开", "稳妥", "你们互相尊重了彼此的戒心。", [{ type: "resource", key: "mind", amount: 2 }]),
  ], { once: true }),
  simple("fox-return", "月下衔枝", "银灰灵狐从月影中现身，将一枚沾着妖血的果子丢到你面前。看来它记得你。", ["cultivate", "rest"], [
    gainChoice("accept", "收下灵果", "一段善缘", "灵果入口清凉，滞涩的经脉随之松动。", [{ type: "resource", key: "cultivation", amount: 20 }, { type: "resource", key: "health", amount: 8 }]),
  ], { once: true, requireFlag: "fox-kindness", minStage: 2 }),
  simple("tax-collector", "山神收税", "一块刻着“山神有令”的木牌拦在路中，旁边趴着一只炼气小妖，算盘拨得飞快。", ["explore", "gather"], [
    { id: "pay", label: "照章缴纳", hint: "花费 5 灵石", requirement: { resource: { spiritStones: 5 } }, outcomes: [{ weight: 1, text: "小妖开了张墨迹未干的收据。异界的官僚体系令你肃然起敬。", tone: "neutral", effects: [{ type: "resource", key: "spiritStones", amount: -5 }] }] },
    { id: "argue", label: "质疑它的资质", hint: "看悟性，也看脸色", outcomes: [
      { weight: 6, text: "你援引三条山规，小妖一条也没听过，只好心虚放行。", tone: "good", effects: [{ type: "resource", key: "mind", amount: 4 }] },
      { weight: 4, text: "它用算盘证明你还欠滞纳金，随后用算盘打了你。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -8 }, { type: "resource", key: "spiritStones", amount: -3 }] },
    ] },
    { id: "fight", label: "替天行道", hint: "凶险，根骨有利", outcomes: [
      { weight: 6, text: "小妖落荒而逃，账箱成了你的战利品。", tone: "good", effects: [{ type: "resource", key: "spiritStones", amount: 11 }] },
      { weight: 4, text: "山神是否存在尚无定论，但小妖的算盘确实很硬。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -14 }] },
    ] },
  ]),
  simple("ruined-cave", "前人洞府", "藤蔓后露出半扇石门，门楣上写着：有缘者入，欠债者免谈。", ["explore"], [
    { id: "enter", label: "推门而入", hint: "神识有利", outcomes: [
      { weight: 5, text: "洞中只剩一卷残诀，你勉强续出了三句。", tone: "mystic", effects: [{ type: "resource", key: "cultivation", amount: 24 }, { type: "resource", key: "mind", amount: 4 }] },
      { weight: 3, text: "禁制早已衰败，但还足够认真地劈你一下。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -18 }, { type: "resource", key: "qi", amount: -10 }] },
      { weight: 2, text: "你找到一小袋灵石，以及一叠数百年前的催款符。", tone: "good", effects: [{ type: "resource", key: "spiritStones", amount: 16 }] },
    ] },
    gainChoice("mark", "记下位置", "谨慎离开", "你在地图上画了个圈，并郑重写下“可能会死”。", [{ type: "resource", key: "mind", amount: 3 }]),
  ], { once: true }),
  simple("rain-meditation", "灵雨", "黑云无声聚拢，落下的雨滴在皮肤上化作细碎灵气。", ["cultivate", "rest"], [
    gainChoice("meditate", "就地吐纳", "顺应天时", "雨过一夜，你的周天比往日宽阔了几分。", [{ type: "resource", key: "cultivation", amount: 18 }, { type: "resource", key: "qi", amount: 12 }]),
    gainChoice("collect", "以瓶收雨", "换些实利", "瓶里只留住少许灵液，但总好过空瓶。", [{ type: "resource", key: "spiritStones", amount: 6 }]),
  ]),
  simple("inner-demon", "梦中来客", "梦里的你已经筑基，衣袂飘然，正耐心劝你放弃这条费劲的路。", ["cultivate", "rest"], [
    { id: "question", label: "问它筑基口诀", hint: "悟性有利", outcomes: [
      { weight: 6, text: "它被问住了。你醒来时心境澄明，骗子最怕细节。", tone: "good", effects: [{ type: "resource", key: "mind", amount: 12 }, { type: "resource", key: "cultivation", amount: 8 }] },
      { weight: 4, text: "它说得头头是道，你险些忘了醒来。", tone: "danger", effects: [{ type: "resource", key: "mind", amount: -15 }] },
    ] },
    gainChoice("ignore", "闭口守心", "稳妥", "天亮后，梦中仙人的脸已经模糊。", [{ type: "resource", key: "mind", amount: 5 }]),
  ]),
  simple("rogue-cultivator", "林中劫修", "三名蒙面修士拦住去路。为首者说只劫财，语气诚恳得像在做百年老店。", ["explore"], [
    { id: "fight", label: "正面迎战", hint: "凶险，根骨有利", outcomes: [
      { weight: 5, text: "你赢了。三人身上总共只有九块灵石，行业显然不景气。", tone: "good", effects: [{ type: "resource", key: "health", amount: -6 }, { type: "resource", key: "spiritStones", amount: 9 }] },
      { weight: 5, text: "你没能证明谁更适合这门生意，只证明了自己的肋骨会疼。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -20 }, { type: "resource", key: "spiritStones", amount: -8 }] },
    ] },
    { id: "talk", label: "与其周旋", hint: "神识有利", outcomes: [
      { weight: 6, text: "你指出他们埋伏位置、服装和话术的十一处问题。三人听完决定改行。", tone: "good", effects: [{ type: "resource", key: "mind", amount: 5 }] },
      { weight: 4, text: "他们耐心听完了你的长篇大论，然后照旧收费。", tone: "danger", effects: [{ type: "resource", key: "spiritStones", amount: -10 }] },
    ] },
    gainChoice("run", "转身逃遁", "气运有利", "你钻入灌木，熟练得令双方都沉默了片刻。", [{ type: "resource", key: "qi", amount: -8 }]),
  ]),
  simple("stone-lesson", "顽石讲道", "溪边顽石忽然问你何为道。", ["gather", "rest"], [gainChoice("answer", "认真作答", "悟性有利", "顽石裂开一道缝，露出灵石。", [{ type: "resource", key: "spiritStones", amount: 10 }])]),
  simple("old-herbalist", "迷路药师", "白发药师请你指路。", ["gather", "explore"], [gainChoice("guide", "为他引路", "耽搁片刻", "药师送你三株灵草。", [{ type: "resource", key: "herbs", amount: 3 }])], { once: true }),
  simple("spirit-well", "荒井微光", "废村枯井泛着幽蓝微光。", ["explore"], [gainChoice("seal", "封住井口", "求个心安", "背诵声渐渐停下。", [{ type: "resource", key: "mind", amount: 4 }])], { once: true, minStage: 3 }),
  simple("thunder-tree", "雷击木", "山巅古木焦黑树心中有金光游走。", ["gather", "explore"], [gainChoice("observe", "观摩雷意", "悟性有利", "你参悟天地之威。", [{ type: "resource", key: "cultivation", amount: 12 }])], { minStage: 4 }),
  simple("mimic-herb", "会跑的灵草", "一株赤叶草拔出根须狂奔。", ["gather"], [gainChoice("negotiate", "以灵气诱它回来", "神识有利", "它留下一片叶子。", [{ type: "resource", key: "herbs", amount: 2 }, { type: "resource", key: "qi", amount: -6 }])]),
  simple("bad-cauldron", "炉火反噬", "丹炉发出一声闷响。", ["alchemy"], [gainChoice("duck", "果断伏地", "稳妥", "炉盖擦着头顶飞过。", [{ type: "resource", key: "mind", amount: 2 }])]),
  simple("perfect-pill", "丹成异香", "炉中丹丸圆润，药香凝而不散。", ["alchemy"], [gainChoice("taste", "趁热服下", "直接炼化药力", "修为向前推了一截。", [{ type: "resource", key: "cultivation", amount: 18 }])]),
  simple("sect-recruiter", "山门招新", "青霄门执事在坊市测灵。", ["market", "explore"], [gainChoice("watch", "旁观流程", "不自取其辱", "你记下几句安慰落选者的话。", [{ type: "resource", key: "mind", amount: 3 }])], { once: true }),
  simple("corpse-bag", "无主储物袋", "路边储物袋完整得过于刻意。", ["explore"], [gainChoice("bury", "掩埋尸身", "积一点阴德", "你获得片刻心安。", [{ type: "stat", key: "fortune", amount: 1 }])], { once: true }),
  simple("white-deer", "白鹿引路", "雾中白鹿回首看你。", ["explore", "gather"], [gainChoice("bow", "遥遥一礼", "不强求机缘", "白鹿没入雾中。", [{ type: "resource", key: "mind", amount: 4 }])]),
  simple("night-knock", "夜半敲门", "子夜有人在门外轻敲三声。", ["rest", "cultivate"], [gainChoice("ward", "贴符不理", "稳妥", "敲门声持续到天亮。", [{ type: "resource", key: "mind", amount: -2 }])]),
  simple("wandering-sword", "断剑低鸣", "泥中斜插着半截断剑。", ["explore"], [gainChoice("sell", "连泥拔走", "换取灵石", "铁匠按废铁价成交。", [{ type: "resource", key: "spiritStones", amount: 7 }])], { once: true, minStage: 2 }),
  simple("spirit-moth", "噬灵飞蛾", "成群飞蛾扑向你的灵气。", ["cultivate", "gather"], [gainChoice("flee", "暂避锋芒", "稳妥", "飞蛾终于散去。", [{ type: "resource", key: "qi", amount: -4 }])]),
  simple("wine-monk", "醉酒僧人", "醉僧拦路与你论禅。", ["explore", "rest"], [gainChoice("listen", "听他讲完", "磨炼心境", "你从醉话中悟到一丝道理。", [{ type: "resource", key: "mind", amount: 6 }])]),
  simple("ancient-tablet", "无字古碑", "荒野古碑不着一字，却让人不敢直视。", ["explore", "rest"], [gainChoice("meditate", "碑前参悟", "悟性有利", "你从无字中读出一丝道韵。", [{ type: "resource", key: "cultivation", amount: 20 }])], { once: true }),
  simple("healing-spring", "温泉白骨", "山间温泉灵气充沛，池边却整齐摆着三具白骨，像是排队等你加入。", ["rest", "explore"], [
    { id: "bathe", label: "入泉疗伤", hint: "收益丰厚，略有风险", outcomes: [
      { weight: 7, text: "泉水洗去疲惫。白骨很安静，服务态度无可挑剔。", tone: "good", effects: [{ type: "resource", key: "health", amount: 25 }, { type: "resource", key: "qi", amount: 15 }] },
      { weight: 3, text: "水底藤蔓缠住脚踝。你挣脱后终于理解了白骨的排队方式。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -12 }] },
    ] },
    gainChoice("leave", "不与前人争位", "稳妥", "你向三位前辈拱手，原路退去。", [{ type: "resource", key: "mind", amount: 2 }]),
  ]),
  simple("star-night", "星河倒悬", "夜空像被撕开一道缝，陌生星河垂落山野。界蚀印随之灼热。", ["cultivate", "rest"], [
    { id: "observe", label: "直视星河", hint: "凶险，悟性有利", outcomes: [
      { weight: 5, text: "你窥见两个世界重叠的刹那，修行路忽然清晰。", tone: "mystic", effects: [{ type: "resource", key: "cultivation", amount: 30 }, { type: "stat", key: "insight", amount: 1 }] },
      { weight: 5, text: "群星也在回望。你用了很久才想起自己是谁。", tone: "danger", effects: [{ type: "resource", key: "mind", amount: -20 }] },
    ] },
    gainChoice("hide", "闭目守心", "不窥天外", "异象散去后，你掌心的界蚀印淡了片刻。", [{ type: "resource", key: "mind", amount: 8 }]),
  ], { once: true, minStage: 5 }),
  simple("beast-tracks", "铁背熊踪", "泥中脚印大如磨盘，前方传来树木折断声。你想起药经里没写熊肉能否入药。", ["gather", "explore"], [
    { id: "hunt", label: "循迹猎杀", hint: "凶险，根骨有利", outcomes: [
      { weight: 5, text: "一番恶战后，妖熊倒下。熊胆在坊市很值钱。", tone: "good", effects: [{ type: "resource", key: "health", amount: -10 }, { type: "resource", key: "spiritStones", amount: 17 }] },
      { weight: 5, text: "你确认了熊肉不能入药，至少你的肉很可能可以。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -23 }] },
    ] },
    gainChoice("detour", "悄然绕行", "稳妥", "你多走了半座山，完整地保留了自己。", [{ type: "resource", key: "qi", amount: -4 }]),
  ], { minStage: 3 }),
  simple("herb-thief", "药篓失窃", "一只长臂猿抱着你的药篓蹲在树梢，正在逐株品尝。它的点评非常尖锐。", ["gather"], [
    { id: "trade", label: "用果子交换", hint: "气运有利", outcomes: [
      { weight: 7, text: "它还回药篓，顺便塞进一株你没见过的灵草。", tone: "good", effects: [{ type: "resource", key: "herbs", amount: 1 }] },
      { weight: 3, text: "它收下果子，带着药篓一起走了。商业意识相当先进。", tone: "danger", effects: [{ type: "resource", key: "herbs", amount: -2 }] },
    ] },
    { id: "shake", label: "震树夺回", hint: "根骨有利", outcomes: [
      { weight: 6, text: "药篓落下，长臂猿也落下。你只接住了重要的那个。", tone: "good", effects: [{ type: "resource", key: "herbs", amount: 1 }] },
      { weight: 4, text: "它用你采的果子精准还击。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -7 }] },
    ] },
  ]),
  simple("ash-wind", "蚀骨灰风", "远处灰线席卷山谷，沿途草木无声枯萎。风中夹着界外低语。", ["explore", "gather"], [
    { id: "shelter", label: "寻找石隙躲避", hint: "神识有利", outcomes: [
      { weight: 7, text: "你及时找到背风处，只损失了半日。", tone: "neutral", effects: [{ type: "resource", key: "mind", amount: -3 }] },
      { weight: 3, text: "石隙是风口。你选中了山谷里最努力的一阵风。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -15 }, { type: "resource", key: "mind", amount: -8 }] },
    ] },
    { id: "ward", label: "运功硬抗", hint: "消耗灵力", requirement: { resource: { qi: 12 } }, outcomes: [{ weight: 1, text: "护体灵光摇摇欲坠，最终还是撑过了灰风。", tone: "good", effects: [{ type: "resource", key: "qi", amount: -12 }, { type: "resource", key: "cultivation", amount: 8 }] }] },
  ], { minStage: 4 }),
  simple("fake-master", "自称高人", "青衣老者说你骨骼清奇，只需二十灵石便传你不世神功。他已经对前面五人说过同一句。", ["market"], [
    { id: "buy", label: "买下秘籍", hint: "花费 20 灵石", requirement: { resource: { spiritStones: 20 } }, outcomes: [
      { weight: 2, text: "纸上竟真有一段运气法门。骗子可能也需要核心竞争力。", tone: "mystic", effects: [{ type: "resource", key: "spiritStones", amount: -20 }, { type: "resource", key: "cultivation", amount: 26 }] },
      { weight: 8, text: "秘籍第一页写着：多喝热水，勤加修炼。后者确实无法反驳。", tone: "danger", effects: [{ type: "resource", key: "spiritStones", amount: -20 }, { type: "resource", key: "mind", amount: -3 }] },
    ] },
    gainChoice("expose", "当众拆穿", "神识有利", "老者骂你断人财路，却在逃跑时掉下几块灵石。", [{ type: "resource", key: "spiritStones", amount: 5 }]),
  ]),
  simple("quiet-season", "无事发生", "这一天没有妖兽、劫修、异象或会说话的石头。你反而有些不安。", ["cultivate", "rest", "gather"], [
    gainChoice("enjoy", "珍惜平静", "难得如此", "你终于完成了几件一直拖着的小事，心神稍定。", [{ type: "resource", key: "mind", amount: 8 }, { type: "resource", key: "health", amount: 5 }]),
  ], { weight: 0.8 }),
  simple("fallen-star", "陨星残片", "一道青光坠入远山。你赶到时，坑中只剩拳头大的黑色碎片，四周灵气都在避开它。", ["explore"], [
    { id: "study", label: "以神识探查", hint: "极凶险，悟性有利", outcomes: [
      { weight: 4, text: "碎片映出故乡天空。你借那一瞬明悟跨过瓶颈。", tone: "mystic", effects: [{ type: "resource", key: "cultivation", amount: 36 }, { type: "resource", key: "mind", amount: 6 }] },
      { weight: 6, text: "某种不属于此界的寒意侵入识海。界蚀印欢快地回应。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -16 }, { type: "resource", key: "mind", amount: -18 }] },
    ] },
    gainChoice("sell", "用布包好卖掉", "让别人研究", "坊市鉴定师看了一眼便付钱，随后立刻关门。", [{ type: "resource", key: "spiritStones", amount: 24 }]),
  ], { once: true, minStage: 6 }),
  simple("dao-debate", "路亭论道", "两位修士争论“先有灵气还是先有功法”，见你经过，立刻要求你裁决。", ["market", "explore"], [
    { id: "join", label: "各打五十大板", hint: "悟性有利", outcomes: [
      { weight: 7, text: "两人都不满意，却都认为你说得有些道理。你也想通了一处滞涩。", tone: "good", effects: [{ type: "resource", key: "cultivation", amount: 12 }, { type: "resource", key: "mind", amount: 4 }] },
      { weight: 3, text: "争论从两个观点变成三个，太阳落山时仍无人获胜。", tone: "neutral", effects: [{ type: "resource", key: "mind", amount: -5 }] },
    ] },
    gainChoice("leave", "称有急事", "免受牵连", "你听见身后两人开始争论你究竟急不急。", []),
  ]),
  simple("winter-famine", "灵田歉收", "坊市灵米涨价，散修们的脸色比天色更阴。你囤下的草药倒成了紧俏货。", ["market", "gather"], [
    { id: "sell", label: "卖出三株灵草", hint: "获得 14 灵石", requirement: { resource: { herbs: 3 } }, outcomes: [{ weight: 1, text: "你赚到了灵石，也收到几道复杂目光。", tone: "good", effects: [{ type: "resource", key: "herbs", amount: -3 }, { type: "resource", key: "spiritStones", amount: 14 }] }] },
    gainChoice("help", "分一株给伤者", "积一份善缘", "伤者连声道谢。你不知道善缘有没有用，但这一株确实有用。", [{ type: "resource", key: "herbs", amount: -1 }, { type: "stat", key: "fortune", amount: 1 }]),
  ]),
  simple("mirror-self", "水中倒影", "溪水中的倒影慢了半拍。你停下，它却继续向前走了一步。", ["rest", "cultivate"], [
    { id: "watch", label: "与它对视", hint: "心境越稳越有利", outcomes: [
      { weight: 6, text: "倒影最终与你重合，你看清了自身功法的一处错漏。", tone: "mystic", effects: [{ type: "resource", key: "cultivation", amount: 18 }] },
      { weight: 4, text: "它对你笑了一下。你接下来几夜都没敢照镜子。", tone: "danger", effects: [{ type: "resource", key: "mind", amount: -12 }] },
    ] },
    gainChoice("muddy", "搅浑溪水", "简单有效", "倒影消失了。许多玄学问题都经不起一根木棍。", [{ type: "resource", key: "mind", amount: 3 }]),
  ]),
  simple("buried-cellar", "地下酒窖", "采药锄敲破一块石板，露出封存百年的酒窖。酒坛上贴着“筑基前勿饮”。", ["gather"], [
    { id: "drink", label: "只喝一小口", hint: "你当然会这样说", outcomes: [
      { weight: 6, text: "酒力冲开经脉，你醒来时修为精进，衣服穿反。", tone: "good", effects: [{ type: "resource", key: "cultivation", amount: 24 }, { type: "resource", key: "mind", amount: -6 }] },
      { weight: 4, text: "你醒来已是三日后，唯一的收获是确认标签没有骗人。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -8 }, { type: "resource", key: "mind", amount: -8 }] },
    ] },
    gainChoice("sell", "整坛封好", "换取灵石", "酒楼掌柜闻了闻封泥，立刻付钱，甚至没有砍价。", [{ type: "resource", key: "spiritStones", amount: 16 }]),
  ], { once: true }),
  simple("storm-refuge", "古庙避雨", "暴雨将你逼入破庙。神像没有头，供桌上却有一炷新香。", ["explore", "gather"], [
    { id: "incense", label: "续上一炷香", hint: "花费 2 灵石", requirement: { resource: { spiritStones: 2 } }, outcomes: [{ weight: 1, text: "夜里风雨绕开破庙。清晨，香灰凝成一枚小小符印。", tone: "mystic", effects: [{ type: "resource", key: "spiritStones", amount: -2 }, { type: "resource", key: "mind", amount: 10 }, { type: "resource", key: "health", amount: 6 }] }] },
    gainChoice("corner", "找个角落等雨停", "不碰陌生神像", "神像整夜都很安静。你也努力如此。", [{ type: "resource", key: "health", amount: 4 }]),
  ]),
  simple("spirit-vein", "地脉裂隙", "山壁裂开一道细缝，精纯灵气不断溢出。裂缝也在缓慢扩大。", ["cultivate", "explore"], [
    { id: "absorb", label: "全力吸纳", hint: "收益高，经脉承压", outcomes: [
      { weight: 6, text: "你赶在地脉闭合前纳入大量灵气，周天轰鸣不止。", tone: "mystic", effects: [{ type: "resource", key: "cultivation", amount: 32 }, { type: "resource", key: "health", amount: -6 }] },
      { weight: 4, text: "灵气来得太快，经脉像被一群野牛认真巡视过。", tone: "danger", effects: [{ type: "resource", key: "cultivation", amount: 12 }, { type: "resource", key: "health", amount: -18 }] },
    ] },
    gainChoice("steady", "缓缓吐纳", "稳妥", "你只取一缕，不与地脉争强。", [{ type: "resource", key: "cultivation", amount: 15 }, { type: "resource", key: "qi", amount: 8 }]),
  ], { minStage: 5 }),
  simple("grave-keeper", "守墓老者", "老者独坐荒坟前，问你可愿替一个陌生人守半夜的墓。报酬是一句忠告。", ["explore", "rest"], [
    gainChoice("keep", "替他守墓", "心境有所收获", "夜半坟中无人起身。老者归来只说：活人比死人更值得防。", [{ type: "resource", key: "mind", amount: 12 }, { type: "stat", key: "fortune", amount: 1 }]),
    gainChoice("decline", "婉言拒绝", "赶自己的路", "老者点头，像是早已知道。你回望时，墓前已空无一人。", [{ type: "resource", key: "mind", amount: 2 }]),
  ], { once: true }),
  simple("road-spirit-rain", "途中灵雨", "行至半途，云层忽然降下带着微光的细雨。道路迅速泥泞，四周灵气却浓得近乎凝结。", ["travel"], [
    gainChoice("meditate", "驻足吐纳", "吸纳灵雨", "你在雨中运转周天，衣袍湿透，经脉倒是暖了起来。", [{ type: "resource", key: "cultivation", amount: 14 }, { type: "resource", key: "qi", amount: 8 }]),
    gainChoice("hurry", "冒雨赶路", "避免耽搁", "你赶在山道积水前通过，除了一身泥没有额外收获。", [{ type: "resource", key: "health", amount: -2 }]),
  ]),
  simple("road-wandering-peddler", "挑担游商", "一个挑着两只巨大竹箱的游商从岔路出现，坚称自己卖的都是“路上刚捡到的传家宝”。", ["travel"], [
    { id: "buy", label: "买下药包", hint: "花费 6 灵石", requirement: { resource: { spiritStones: 6 } }, outcomes: [{ weight: 1, text: "药包里有两株灵草和一张祝你好运的纸条。至少灵草是真的。", tone: "good", effects: [{ type: "resource", key: "spiritStones", amount: -6 }, { type: "resource", key: "herbs", amount: 2 }] }] },
    gainChoice("directions", "问一问前路", "不花灵石", "游商认真指了三个相反方向。你选择相信自己的地图。", [{ type: "resource", key: "mind", amount: 2 }]),
  ]),
  simple("road-landslide", "山道崩塌", "轰鸣从头顶传来，碎石与枯木截断前路。新鲜断面中隐约露出一点灵矿光泽。", ["travel"], [
    { id: "climb", label: "翻越崩塌处", hint: "凶险，根骨有利", outcomes: [
      { weight: 6, text: "你踩着尚未稳定的碎石翻过山脊，顺手撬下几枚灵石。", tone: "good", effects: [{ type: "resource", key: "spiritStones", amount: 8 }, { type: "resource", key: "qi", amount: -4 }] },
      { weight: 4, text: "脚下石层二次塌陷。你抓住树根，树根没有抓住你。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -14 }] },
    ] },
    gainChoice("detour", "寻找绕行小路", "稳妥但费神", "你多绕了一段路，总算完整抵达目的地。", [{ type: "resource", key: "mind", amount: -3 }]),
  ]),
  simple("road-shadow-beast", "逐影妖兽", "夕阳落下后，一道没有实体的兽影贴着山壁追来。它不理会血肉，只吞食修士逸散的灵气。", ["travel"], [
    { id: "disperse", label: "运转神识震散", hint: "神识有利", outcomes: [
      { weight: 6, text: "兽影在识海震鸣中溃散，留下几缕可供炼化的精纯灵息。", tone: "good", effects: [{ type: "resource", key: "cultivation", amount: 10 }] },
      { weight: 4, text: "兽影从神识缝隙钻过，狠狠咬去一截灵力。", tone: "danger", effects: [{ type: "resource", key: "qi", amount: -16 }, { type: "resource", key: "mind", amount: -6 }] },
    ] },
    { id: "feed", label: "抛出一枚灵石", hint: "花费 1 灵石", requirement: { resource: { spiritStones: 1 } }, outcomes: [{ weight: 1, text: "兽影叼走灵石，在山壁上停步舔食。花钱消灾，朴素而有效。", tone: "neutral", effects: [{ type: "resource", key: "spiritStones", amount: -1 }] }] },
  ]),
  simple("road-lost-child", "迷途童子", "路边坐着一个背药篓的孩子。他说师父让他沿太阳下山的方向走，但今天太阳下山了两次。", ["travel"], [
    gainChoice("escort", "送他到下一处路口", "积一份善缘", "孩子临别送你一株藏在药篓底的灵草，还认真嘱咐你不要迷路。", [{ type: "resource", key: "herbs", amount: 1 }, { type: "stat", key: "fortune", amount: 1 }]),
    gainChoice("point", "替他辨明方向", "悟性有利", "你依据山势给出方向。孩子走后，你忽然不太确定那边是不是南。", [{ type: "resource", key: "mind", amount: 2 }]),
  ], { once: true }),
  simple("road-space-rift", "界隙横生", "前方道路像纸一样折起，裂缝另一侧不是山林，而是一座倒悬在紫色天空下的城。", ["travel"], [
    { id: "peer", label: "靠近窥视", hint: "极凶险，悟性有利", outcomes: [
      { weight: 4, text: "你看见另一种灵气运行方式，在裂缝闭合前记住了其中一瞬。", tone: "mystic", effects: [{ type: "resource", key: "cultivation", amount: 26 }, { type: "resource", key: "mind", amount: 4 }] },
      { weight: 6, text: "倒悬城中有人也看见了你。界蚀印像被无形手掌狠狠攥住。", tone: "danger", effects: [{ type: "resource", key: "health", amount: -15 }, { type: "resource", key: "mind", amount: -14 }] },
    ] },
    gainChoice("retreat", "闭目绕行", "不沾界外因果", "你贴着山壁绕过裂缝，直到身后再无紫光才敢回头。", [{ type: "resource", key: "qi", amount: -5 }]),
  ], { minStage: 4 }),
  simple("road-sword-toll", "御剑收路费", "一名年轻剑修悬在路中央，脚下飞剑抖得厉害。他说此山归宗门管，路费暂由他个人代收。", ["travel"], [
    { id: "pay", label: "交过路费", hint: "花费 4 灵石", requirement: { resource: { spiritStones: 4 } }, outcomes: [{ weight: 1, text: "剑修收钱后松了口气，飞剑也跟着松了口气。", tone: "neutral", effects: [{ type: "resource", key: "spiritStones", amount: -4 }] }] },
    { id: "challenge", label: "请他出示宗门令", hint: "气运有利", outcomes: [
      { weight: 7, text: "剑修摸遍全身没找到令牌，只好红着脸让路。", tone: "good", effects: [{ type: "resource", key: "mind", amount: 3 }] },
      { weight: 3, text: "令牌是真的。你不仅补交路费，还被剑柄礼貌地敲了一下。", tone: "danger", effects: [{ type: "resource", key: "spiritStones", amount: -5 }, { type: "resource", key: "health", amount: -5 }] },
    ] },
  ]),
  simple("road-spirit-caravan", "灵兽商队", "一队驮山兽堵住狭路，背上的货箱比房屋还大。商队管事正在为一只拒绝前进的幼兽发愁。", ["travel"], [
    { id: "help", label: "以灵气安抚", hint: "消耗 6 灵力", requirement: { resource: { qi: 6 } }, outcomes: [{ weight: 1, text: "幼兽终于迈步。管事送你几块灵石，并坚称这不是误工赔偿。", tone: "good", effects: [{ type: "resource", key: "qi", amount: -6 }, { type: "resource", key: "spiritStones", amount: 9 }] }] },
    gainChoice("wait", "在路边等候", "恢复少量心境", "你看着商队折腾了半日，忽然觉得自己的道途也没那么混乱。", [{ type: "resource", key: "mind", amount: 5 }]),
  ]),
  simple("final-omen", "突破天兆", "云层中有金线交织，界蚀印疼得像要从掌心挣脱。你知道新的关口正在靠近。", ["cultivate", "rest"], [
    gainChoice("prepare", "凝神备劫", "为突破蓄势", "你一遍遍推演周天，将杂念压进心底最安静的角落。", [{ type: "status", status: { id: "prepared", name: "凝神备劫", description: "下一次突破更为稳妥", remaining: 6, cultivationBonus: 0.08 } }, { type: "resource", key: "mind", amount: 8 }]),
  ], { once: true, minStage: 8 }),
];

export const eventMap = new Map(EVENTS.map((event) => [event.id, event]));
