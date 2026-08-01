import { useEffect, useMemo, useRef, useState } from "react";
import {
  Backpack,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleGauge,
  CloudMoon,
  Clock3,
  Download,
  Dices,
  Flame,
  Flower2,
  Gift,
  GraduationCap,
  Handshake,
  Heart,
  HeartHandshake,
  History,
  House,
  Import,
  Info,
  Landmark,
  Leaf,
  LockKeyhole,
  ListChecks,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Menu,
  Mountain,
  PackageOpen,
  RefreshCw,
  Route,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Store,
  Star,
  Swords,
  Trees,
  UserRound,
  Users,
  Waves,
  ZoomIn,
  ZoomOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { ACTIONS, ITEM_CATEGORY_NAMES, ITEM_RARITY_NAMES, ITEMS, NPC_IDENTITIES, NPC_INTERACTIONS, REALMS, itemMap } from "./game/data";
import {
  fetchAiModels,
  isAiConfigured,
  requestAiAction,
  requestAiEvent,
  requestAiNpcInteraction,
  requestAiTravel,
} from "./game/ai";
import {
  breakthrough,
  canBreakthrough,
  canChoose,
  canPerformAction,
  canTravel,
  claimLegacy,
  createCandidates,
  getBreakthroughInfo,
  getCurrentEvent,
  getCurrentLocation,
  getItemQuantity,
  getTravelPath,
  getLocationModifiers,
  getLocationNpcs,
  getNpcRelationshipLabel,
  getNpcSpecialRelationshipLabel,
  canInteractWithNpc,
  canBuyItem,
  canGiftItem,
  canSellItem,
  canUseItem,
  dismissEventResult,
  buyItem,
  giftItem,
  interactWithNpc,
  interactWithNpcWithAi,
  performActionWithAi,
  performAction,
  resolveEvent,
  resolveEventWithAi,
  startGame,
  toggleNpcAttention,
  travelTo,
  travelToWithAi,
  sellItem,
  useItem,
} from "./game/engine";
import { exportSave, importSave, loadAiSettings, loadGame, loadMeta, saveAiSettings, saveGame, saveMeta } from "./game/storage";
import type { ActionDefinition, ActionId, AiSettings, CharacterCandidate, ChronicleEntry, EventResult, GameState, ItemCategory, ItemDefinition, MetaProgress, Npc, NpcInteractionId, NpcRelationshipType, ResourceKey, Tone, WorldLocation, WorldOptions } from "./game/types";

type Screen = "welcome" | "create" | "game";
type MobileTab = "journey" | "map" | "npcs" | "inventory" | "character" | "actions" | "legacy";

const actionIcons: Record<ActionId, LucideIcon> = {
  cultivate: CloudMoon,
  explore: Mountain,
  gather: Leaf,
  alchemy: Flame,
  market: Store,
  rest: Heart,
};

const npcInteractionIcons: Record<NpcInteractionId, LucideIcon> = {
  converse: MessageCircle,
  gift: Gift,
  spar: Swords,
  assist: Heart,
  consult: BookOpen,
  visit: HeartHandshake,
  seekMentor: GraduationCap,
  acceptDisciple: GraduationCap,
  swear: Handshake,
  propose: Heart,
  dissolve: X,
};

const locationIcons: Record<WorldLocation["icon"], LucideIcon> = {
  home: House,
  market: Store,
  forest: Trees,
  water: Waves,
  ruins: Landmark,
  sect: Mountain,
  star: Star,
};

const locationRoleNames: Record<WorldLocation["role"], string> = {
  sanctuary: "静修地",
  market: "坊市",
  herbal: "灵植地",
  water: "水域",
  danger: "险地",
  sect: "宗门道场",
  secret: "秘境",
  settlement: "人烟聚落",
  mine: "灵矿",
  academy: "学宫",
  rift: "界隙",
};

const statNames = { constitution: "根骨", insight: "悟性", spirit: "神识", fortune: "气运" } as const;

const npcGenderNames: Record<Npc["gender"], string> = { male: "男", female: "女", unknown: "未知" };

const itemCategoryIcons: Record<ItemCategory, LucideIcon> = {
  consumable: PackageOpen,
  material: Flower2,
  artifact: Shield,
  quest: ScrollText,
};

const itemCategoryOrder: ItemCategory[] = ["consumable", "material", "artifact", "quest"];

function npcSpecialLabel(type?: NpcRelationshipType): string | undefined {
  return getNpcSpecialRelationshipLabel(type);
}

function formatYears(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function Brand() {
  return (
    <div className="brand" aria-label="异界问道">
      <span className="brand-mark">异</span>
      <span><strong>异界问道</strong><small>一介散修的求生录</small></span>
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}><Icon size={18} /></button>;
}

function ProgressBar({ value, max, tone = "jade", label }: { value: number; max: number; tone?: "jade" | "red" | "gold" | "blue"; label: string }) {
  const percent = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <div className="resource-row">
      <div className="resource-label"><span>{label}</span><span>{Math.round(value)} / {Math.round(max)}</span></div>
      <div className={`progress ${tone}`}><span style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function WelcomeScreen({ game, meta, onContinue, onCreate, onManage }: { game: GameState | null; meta: MetaProgress; onContinue: () => void; onCreate: () => void; onManage: () => void }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-backdrop" aria-hidden="true" />
      <header className="welcome-header"><Brand /><IconButton label="设置与存档" icon={Settings} onClick={onManage} /></header>
      <section className="welcome-content">
        <div className="title-seal">界蚀将至</div>
        <h1>异界问道</h1>
        <p className="welcome-prose">没有预设终点，也没有必须完成的使命。<br />在陌生天地里活下去，写下属于你的一生。</p>
        <div className="welcome-actions">
          {game && <button className="primary-command" type="button" onClick={onContinue}><ScrollText size={19} /><span>续写此生</span><ChevronRight size={18} /></button>}
          <button className={game ? "secondary-command" : "primary-command"} type="button" onClick={onCreate}><Sparkles size={18} /><span>另启轮回</span></button>
        </div>
        <div className="legacy-line"><History size={15} /><span>轮回见闻 {meta.totalInsight}</span><i /> <span>已历 {meta.completedRuns} 世</span></div>
      </section>
      <p className="welcome-quote">“此界不问来处，只问你能走多远。”</p>
    </main>
  );
}

function CandidateCard({ candidate, selected, onSelect }: { candidate: CharacterCandidate; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`candidate-card ${selected ? "selected" : ""}`} type="button" onClick={onSelect} aria-pressed={selected}>
      <div className="candidate-top"><span className="candidate-index">命格</span>{selected && <Check size={18} />}</div>
      <div className="candidate-section"><small>出身</small><strong>{candidate.origin.name}</strong><p>{candidate.origin.description}</p></div>
      <div className="candidate-section"><small>灵根</small><strong>{candidate.spiritRoot.name}</strong><p>{candidate.spiritRoot.description}</p></div>
      <div className="candidate-section"><small>天赋</small><strong>{candidate.talent.name}</strong><p>{candidate.talent.description}</p></div>
      <div className="candidate-stats">
        {Object.entries(candidate.stats).map(([key, value]) => <span key={key}>{statNames[key as keyof typeof statNames]} <b>{value}</b></span>)}
      </div>
    </button>
  );
}

function CreationScreen({ meta, onBack, onStart }: { meta: MetaProgress; onBack: () => void; onStart: (candidate: CharacterCandidate, name: string, seed: number, worldOptions: WorldOptions) => void }) {
  const [seed, setSeed] = useState(randomSeed);
  const [refreshes, setRefreshes] = useState(1);
  const [selected, setSelected] = useState(0);
  const [name, setName] = useState("");
  const [worldOptions, setWorldOptions] = useState<WorldOptions>({ size: "medium", danger: "balanced", locationCount: 7 });
  const candidates = useMemo(() => createCandidates(seed, meta), [seed, meta]);
  const randomName = () => {
    const surnames = ["沈", "陆", "顾", "闻", "江", "宁", "楚", "谢", "林", "苏"];
    const given = ["长安", "照夜", "归尘", "问舟", "无咎", "青崖", "见微", "怀真", "知白", "临渊"];
    setName(surnames[Math.floor(Math.random() * surnames.length)] + given[Math.floor(Math.random() * given.length)]);
  };
  const refresh = () => {
    if (refreshes <= 0) return;
    setSeed(randomSeed()); setRefreshes((value) => value - 1); setSelected(0);
  };
  return (
    <main className="creation-screen">
      <header className="creation-header"><Brand /><button className="text-button" type="button" onClick={onBack}><X size={17} />返回</button></header>
      <section className="creation-intro">
        <span className="eyebrow">第一卷 · 命落异乡</span>
        <h1>择一命格，踏入此界</h1>
        <p>有些来路是选择，有些只是你醒来以后别人塞进手里的。</p>
      </section>
      <section className="name-field">
        <label htmlFor="cultivator-name">道友名讳</label>
        <div><input id="cultivator-name" maxLength={8} placeholder="无名亦可" value={name} onChange={(event) => setName(event.target.value)} /><IconButton label="随机姓名" icon={Dices} onClick={randomName} /></div>
      </section>
      <div className="candidate-toolbar"><span>三道命途，择其一</span><button className="text-button" type="button" disabled={!refreshes} onClick={refresh}><RefreshCw size={16} />重观命数 {refreshes}/1</button></div>
      <section className="candidate-grid">
        {candidates.map((candidate, index) => <CandidateCard key={candidate.id} candidate={candidate} selected={index === selected} onSelect={() => setSelected(index)} />)}
      </section>
      <section className="world-options" aria-label="世界设定">
        <div className="world-option-group"><div><b>世界规模</b><small>地点越多，探索路线越长</small></div><div className="option-segments">{([['small', '小型', '5 处地点', 5], ['medium', '标准', '7 处地点', 7], ['large', '广阔', '9 处地点', 9]] as const).map(([value, label, hint, count]) => <button key={value} type="button" className={worldOptions.size === value ? "selected" : ""} onClick={() => setWorldOptions({ ...worldOptions, size: value, locationCount: count })}><b>{label}</b><small>{hint}</small></button>)}</div><label className="location-count-field">自定义地点数量<input type="number" min={5} max={100} value={worldOptions.locationCount} onChange={(event) => setWorldOptions({ ...worldOptions, size: "custom", locationCount: Math.max(5, Math.min(100, Number(event.target.value) || 5)) })} /><span>5 - 100</span></label></div>
        <div className="world-option-group"><div><b>凶险程度</b><small>影响突发事件出现频率</small></div><div className="option-segments">{([['calm', '清平', '事件较少'], ['balanced', '常态', '平衡体验'], ['perilous', '险世', '事件频繁']] as const).map(([value, label, hint]) => <button key={value} type="button" className={worldOptions.danger === value ? "selected" : ""} onClick={() => setWorldOptions((current) => ({ ...current, danger: value }))}><b>{label}</b><small>{hint}</small></button>)}</div></div>
      </section>
      <footer className="creation-footer">
        <div><History size={16} /><span>轮回见闻 {meta.totalInsight}</span><small>见闻会让新的命格浮现</small></div>
        <button className="primary-command" type="button" onClick={() => onStart(candidates[selected], name, seed, worldOptions)}><Sparkles size={18} /><span>坠入异界</span><ChevronRight size={18} /></button>
      </footer>
    </main>
  );
}

function StatPanel({ game }: { game: GameState }) {
  return (
    <section className="side-section character-panel">
      <div className="portrait"><UserRound size={32} /><span>{game.realmStage}</span></div>
      <div className="identity"><h2>{game.character.name}</h2><p>{game.character.origin.name} · {game.character.spiritRoot.name}</p><span>{game.character.talent.name}</span></div>
      <div className="realm-label"><span>{REALMS[game.realmStage - 1]}</span><small>{game.realmStage < REALMS.length ? `下一境界：${REALMS[game.realmStage]}` : "已至羽化飞升"}</small></div>
      <ProgressBar label="体力" value={game.resources.stamina} max={game.resources.maxStamina} tone="red" />
      <ProgressBar label="灵力" value={game.resources.qi} max={game.resources.maxQi} tone="blue" />
      <ProgressBar label="心境" value={game.resources.mind} max={game.resources.maxMind} tone="gold" />
      <ProgressBar label="修为" value={game.resources.cultivation} max={game.resources.cultivationRequired} />
      <div className="life-summary"><span>年龄 <b>{formatYears(game.resources.age)} 岁</b> / {formatYears(game.resources.lifespan)} 岁</span><span>战力 <b>{game.resources.battlePower}</b></span></div>
      <div className="stat-grid">
        {Object.entries(game.character.stats).map(([key, value]) => <div key={key}><span>{statNames[key as keyof typeof statNames]}</span><strong>{value}</strong></div>)}
      </div>
      {game.statuses.length > 0 && <div className="status-list">{game.statuses.map((status) => <span key={status.id} title={status.description}>{status.name} · {status.remaining}天</span>)}</div>}
    </section>
  );
}

function InventoryPanel({ game, onUseItem, onGiftItem }: { game: GameState; onUseItem?: (itemId: string) => void; onGiftItem?: (itemId: string) => void }) {
  const resources: Array<{ key: ResourceKey; icon: LucideIcon; label: string; detail: string }> = [
    { key: "spiritStones", icon: Sparkles, label: "灵石", detail: "坊市通货" },
  ];
  const ownedItems = (game.inventory ?? []).map((entry) => ({ item: itemMap.get(entry.itemId), quantity: entry.quantity })).filter((entry): entry is { item: ItemDefinition; quantity: number } => Boolean(entry.item));
  const interactive = Boolean(onUseItem || onGiftItem);
  const groupedItems = itemCategoryOrder.map((category) => ({ category, items: ownedItems.filter(({ item }) => item.category === category) })).filter((group) => group.items.length > 0);
  const renderItem = ({ item, quantity }: { item: ItemDefinition; quantity: number }) => {
    const Icon = itemCategoryIcons[item.category];
    const useAccess = canUseItem(game, item.id);
    const giftAccess = game.npcs.some((npc) => canGiftItem(game, npc.id, item.id).allowed);
    return <article className={`inventory-item rarity-${item.rarity}`} key={item.id}>
      <span className="item-icon"><Icon size={19} /></span>
      <div className="item-copy"><div className="item-name-line"><b>{item.name}</b><span className="item-rarity">{ITEM_RARITY_NAMES[item.rarity]}</span></div><small>{ITEM_CATEGORY_NAMES[item.category]} · {item.description}</small></div>
      <div className="item-meta"><strong>×{quantity}</strong>{interactive && <div className="item-actions">
        {item.category === "consumable" && onUseItem && <button type="button" disabled={!useAccess.allowed} title={useAccess.reason} onClick={() => onUseItem(item.id)}><PackageOpen size={13} />使用</button>}
        {item.category !== "quest" && onGiftItem && <button type="button" disabled={!giftAccess} title={giftAccess ? "选择一位在场 NPC" : "当前没有可赠送的在场 NPC"} onClick={() => onGiftItem(item.id)}><Gift size={13} />赠送</button>}
      </div>}</div>
    </article>;
  };
  return <section className={`side-section inventory-panel ${interactive ? "inventory-interactive" : ""}`}>
    <header className="inventory-heading"><div><span className="eyebrow">物品与资源</span><h3><Backpack size={17} />物品栏</h3></div><span className="inventory-count">{ownedItems.reduce((sum, entry) => sum + entry.quantity, 0)} 件</span></header>
    <div className="inventory-scroll">
      <div className="inventory-list inventory-resources">{resources.map(({ key, icon: Icon, label, detail }) => <div key={key}><Icon size={18} /><span><b>{label}</b><small>{detail}</small></span><strong>{Math.floor(game.resources[key])}</strong></div>)}</div>
      {groupedItems.length > 0 ? <div className="item-groups">{groupedItems.map(({ category, items }) => <section className="item-group" key={category}><span className="item-group-label">{ITEM_CATEGORY_NAMES[category]}</span>{items.map(renderItem)}</section>)}</div> : <p className="inventory-empty">行囊中还没有可展示的物品。</p>}
    </div>
  </section>;
}

function MarketDialog({ game, onClose, onListen, onBuy, onSell }: { game: GameState; onClose: () => void; onListen: () => void; onBuy: (itemId: string) => void; onSell: (itemId: string) => void }) {
  const buyableItems = ITEMS.filter((item) => item.category !== "quest");
  const ownedItems = (game.inventory ?? []).map((entry) => ({ item: itemMap.get(entry.itemId), quantity: entry.quantity })).filter((entry): entry is { item: ItemDefinition; quantity: number } => {
    const { item, quantity } = entry;
    return item !== undefined && quantity > 0 && item.category !== "quest" && item.sellPrice > 0;
  });
  const location = getCurrentLocation(game);
  return <div className="market-modal-backdrop" role="presentation">
    <section className="dialog market-dialog" role="dialog" aria-modal="true" aria-labelledby="market-dialog-title">
      <header><div><span className="eyebrow">{location.name} · 坊市</span><h2 id="market-dialog-title">浮云集</h2></div><IconButton label="关闭坊市" icon={X} onClick={onClose} /></header>
      <div className="market-balance"><span><Store size={16} />坊市交易</span><strong>{Math.floor(game.resources.spiritStones)} 灵石</strong></div>
      <button className="market-rumor-command" type="button" onClick={onListen}><MessageCircle size={18} /><span><b>听取坊市传闻</b><small>消耗一天，直接听取各地消息</small></span><ChevronRight size={17} /></button>
      <div className="market-sections">
        <section className="market-section"><div className="market-section-heading"><h3>购买物品</h3><small>一品至九品</small></div><div className="market-item-list">{buyableItems.map((item) => { const Icon = itemCategoryIcons[item.category]; const access = canBuyItem(game, item.id); return <div className={`shop-item rarity-${item.rarity}`} key={`buy-${item.id}`}><Icon size={16} /><span><b>{item.name}</b><small>{ITEM_RARITY_NAMES[item.rarity]} · {ITEM_CATEGORY_NAMES[item.category]} · {item.price} 灵石</small></span><button type="button" disabled={!access.allowed} title={access.reason} onClick={() => onBuy(item.id)}><Store size={13} />购买</button></div>; })}</div></section>
        <section className="market-section"><div className="market-section-heading"><h3>出售物品</h3><small>仅收取可交易物品</small></div><div className="market-item-list">{ownedItems.length > 0 ? ownedItems.map(({ item, quantity }) => { const Icon = itemCategoryIcons[item.category]; const access = canSellItem(game, item.id); return <div className={`shop-item rarity-${item.rarity}`} key={`sell-${item.id}`}><Icon size={16} /><span><b>{item.name} ×{quantity}</b><small>{ITEM_RARITY_NAMES[item.rarity]} · 售价 {item.sellPrice} 灵石</small></span><button type="button" disabled={!access.allowed} title={access.reason} onClick={() => onSell(item.id)}><Store size={13} />出售</button></div>; }) : <p className="market-empty">行囊中暂无可出售的物品。</p>}</div></section>
      </div>
      <button className="secondary-command market-close-command" type="button" onClick={onClose}>离开坊市</button>
    </section>
  </div>;
}

function GoalPanel({ game }: { game: GameState }) {
  return (
    <section className="side-section goal-panel">
      <p className="life-day-label">第 {game.turn} 天 · 无预设目标</p>
      <h3><CircleGauge size={17} />此世行年</h3>
      <div className="day-count"><strong>{game.turn}</strong><span>天</span></div>
      <p>没有预设目标。每一次选择，都会成为这段异界人生的一部分。</p>
      <div className="stage-track" aria-label={`修行境界进度 ${game.realmStage} / ${REALMS.length}`}>
        {REALMS.map((realm, i) => <span key={realm} className={i < game.realmStage ? "filled" : ""} title={realm}>{i + 1}</span>)}
      </div>
    </section>
  );
}

function LegacyPanel({ meta }: { meta: MetaProgress }) {
  return (
    <section className="side-section legacy-panel">
      <h3><History size={17} />轮回见闻</h3>
      <div className="legacy-total"><strong>{meta.totalInsight}</strong><span>点见闻</span></div>
      <dl><div><dt>已结束此世</dt><dd>{meta.completedRuns}</dd></div><div><dt>最高境界记录</dt><dd>{meta.victories}</dd></div><div><dt>最高评分</dt><dd>{meta.bestScore}</dd></div><div><dt>所见异闻</dt><dd>{meta.discoveredEvents.length}</dd></div></dl>
    </section>
  );
}

function SimulationDetailsDialog({ game, meta, onClose }: { game: GameState; meta: MetaProgress; onClose: () => void }) {
  return <div className="modal-backdrop details-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-dialog-title"><header><div><span className="eyebrow">本次模拟</span><h2 id="details-dialog-title">本次模拟详情</h2></div><IconButton label="关闭模拟详情" icon={X} onClick={onClose} /></header><div className="details-panels"><GoalPanel game={game} /><LegacyPanel meta={meta} /></div></section></div>;
}

function WorldMap({ game, onTravel, onAction, onMarket, onBreakthrough, showActions, onShowActionsChange }: { game: GameState; onTravel: (locationId: string) => void; onAction: (id: ActionId, durationDays?: number) => void; onMarket: () => void; onBreakthrough: () => void; showActions: boolean; onShowActionsChange: (open: boolean) => void }) {
  const current = getCurrentLocation(game);
  const [selectedId, setSelectedId] = useState(current.id);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragMoved = useRef(false);
  const contextPress = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  useEffect(() => { setSelectedId(current.id); }, [current.id]);
  useEffect(() => { onShowActionsChange(false); }, [current.id, onShowActionsChange]);
  useEffect(() => () => { if (contextPress.current !== null) window.clearTimeout(contextPress.current); }, []);
  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => Math.max(0.65, Math.min(2.4, Number((value + (event.deltaY > 0 ? -0.1 : 0.1)).toFixed(2)))));
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);
  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    dragOrigin.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    dragMoved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (Math.abs(event.clientX - dragOrigin.current.x) > 4 || Math.abs(event.clientY - dragOrigin.current.y) > 4) dragMoved.current = true;
    setPan({ x: dragOrigin.current.panX + event.clientX - dragOrigin.current.x, y: dragOrigin.current.panY + event.clientY - dragOrigin.current.y });
  };
  const endPan = () => setDragging(false);
  const zoomMap = (delta: number) => setZoom((value) => Math.max(0.65, Math.min(2.4, Number((value + delta).toFixed(2)))));
  const selected = game.world.locations.find((location) => location.id === selectedId) ?? current;
  const access = canTravel(game, selected.id);
  const travelPath = selected.id === current.id ? undefined : getTravelPath(game, selected.id);
  const travelCost = travelPath?.slice(1).reduce((sum, location) => sum + location.travelCost, 0) ?? 0;
  const SelectedIcon = locationIcons[selected.icon];
  const routes = game.world.locations.flatMap((location) => location.connections
    .filter((targetId) => location.id < targetId)
    .map((targetId) => ({ from: location, to: game.world.locations.find((item) => item.id === targetId)! })));
  const selectedModifiers = getLocationModifiers(selected);
  const mapColumns = Math.ceil(Math.sqrt(game.world.locations.length));
  const mapRows = Math.ceil(game.world.locations.length / mapColumns);
  // Keep neighboring cards separated by several card widths; dense worlds become a scrollable canvas.
  const layerWidthFactor = game.world.locations.length > 60 ? 48 : 36;
  const layerHeightFactor = game.world.locations.length > 60 ? 50 : 36;
  const mapLayerStyle = { width: `${Math.max(100, mapColumns * layerWidthFactor)}%`, height: `${Math.max(100, mapRows * layerHeightFactor)}%`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` };
  return (
    <section className="world-map-section">
      <header className="map-header">
        <div><span className="eyebrow">本世疆域 · 每次轮回皆有不同</span><h2>异界舆图</h2></div>
        <div className="map-tools"><button type="button" aria-label="缩小地图" title="缩小地图" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomMap(-0.15)}><ZoomOut size={16} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大地图" title="放大地图" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomMap(0.15)}><ZoomIn size={16} /></button></div>
        <div className="current-place"><MapPin size={16} /><span>当前 · {game.world.locations.length} 处地点</span><strong>{current.name}</strong></div>
      </header>
      <div ref={mapCanvasRef} className={`world-map-canvas ${dragging ? "dragging" : ""}`} aria-label="世界地图" onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className="map-layer" style={mapLayerStyle}>
        <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {routes.map(({ from, to }) => {
            const active = from.id === current.id || to.id === current.id;
            const locked = from.unlockStage > game.realmStage || to.unlockStage > game.realmStage;
            return <line key={`${from.id}-${to.id}`} x1={from.position.x} y1={from.position.y} x2={to.position.x} y2={to.position.y} className={`${active ? "active" : ""} ${locked ? "locked" : ""}`} />;
          })}
        </svg>
        {game.world.locations.map((location) => {
          const Icon = locationIcons[location.icon];
          const isCurrent = location.id === current.id;
          const isSelected = location.id === selected.id;
          const isLocked = location.unlockStage > game.realmStage;
          const isReachable = current.connections.includes(location.id);
          return (
            <button
              key={location.id}
              type="button"
              className={`map-node ${isCurrent ? "current" : ""} ${isSelected ? "selected" : ""} ${isLocked ? "locked" : ""} ${isReachable ? "reachable" : ""}`}
              style={{ left: `${location.position.x}%`, top: `${location.position.y}%` }}
              onPointerDown={(event) => {
                longPressTriggered.current = false;
                if (event.pointerType !== "touch" || !isCurrent || game.pendingEventId) return;
                if (contextPress.current !== null) window.clearTimeout(contextPress.current);
                contextPress.current = window.setTimeout(() => { longPressTriggered.current = true; setSelectedId(location.id); onShowActionsChange(true); }, 550);
              }}
              onPointerUp={() => { if (contextPress.current !== null) { window.clearTimeout(contextPress.current); contextPress.current = null; } }}
              onPointerCancel={() => { if (contextPress.current !== null) { window.clearTimeout(contextPress.current); contextPress.current = null; } }}
              onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } if (dragMoved.current) { dragMoved.current = false; return; } setSelectedId(location.id); onShowActionsChange(false); }}
              onContextMenu={(event) => { event.preventDefault(); if (contextPress.current !== null) { window.clearTimeout(contextPress.current); contextPress.current = null; } longPressTriggered.current = true; if (dragMoved.current) { dragMoved.current = false; return; } setSelectedId(location.id); if (isCurrent && !game.pendingEventId) onShowActionsChange(true); }}
              title={isCurrent ? "右键打开行动菜单" : isLocked ? undefined : "选择地点查看路线"}
              aria-label={`${location.name}${isCurrent ? "，当前位置，可右键打开行动菜单" : isLocked ? `，炼气${location.unlockStage}层解锁` : "，选择后可沿最短路线前往"}`}
            >
              <span className="map-node-icon">{isLocked ? <LockKeyhole size={18} /> : <Icon size={20} />}</span>
              <b>{isLocked ? "未知之地" : location.name}</b>
              <small>{isCurrent ? "身在此处" : isReachable ? "道路相连" : location.danger}</small>
            </button>
          );
        })}
        </div>
      </div>
      <div className="map-detail">
        <span className={`location-emblem danger-${selected.danger}`}><SelectedIcon size={23} /></span>
        <div className="location-copy">
          <div><span>{locationRoleNames[selected.role]}</span><span>{selected.subtitle}</span><i>{selected.danger}</i></div>
          <h3>{selected.name}</h3>
          <p>{selected.description}</p>
          <div className="location-actions">{selectedModifiers.cultivationBonus ? <span>修炼效率 +{Math.round(selectedModifiers.cultivationBonus * 100)}%</span> : null}{Object.entries(selectedModifiers.actionBonuses ?? {}).map(([actionId, bonus]) => bonus ? <span key={`bonus-${actionId}`}>{ACTIONS.find((action) => action.id === actionId)?.name}效率 +{Math.round(bonus * 100)}%</span> : null)}{selectedModifiers.blockedActions?.map((actionId) => <span key={`blocked-${actionId}`}>禁用{ACTIONS.find((action) => action.id === actionId)?.name}</span>)}</div>
        </div>
        <div className="travel-command">
          {selected.id === current.id ? <button type="button" disabled><MapPin size={17} />身在此处</button> : <button type="button" disabled={!access.allowed} onClick={() => onTravel(selected.id)}><Route size={17} />前往此地<small>{access.allowed && travelPath ? `${travelPath.length - 1} 天 · ${travelCost} 灵力 · 自动走最短路线` : access.reason}</small></button>}
        </div>
      </div>
      {selected.id === current.id ? (!game.pendingEventId && showActions && <ActionPanel game={game} onAction={onAction} onMarket={onMarket} onBreakthrough={onBreakthrough} onClose={() => onShowActionsChange(false)} />) : <div className="map-action-hint">抵达此地后，方可使用这里提供的行动。</div>}
    </section>
  );
}

function ActionDurationDialog({ game, action, onConfirm, onClose }: { game: GameState; action: ActionDefinition; onConfirm: (durationDays: number) => void; onClose: () => void }) {
  const range = action.durationRange ?? { min: action.durationDays, max: action.durationDays, step: 1 };
  const [durationDays, setDurationDays] = useState(action.durationDays);
  const setDuration = (value: number) => {
    const stepped = range.min + Math.round((value - range.min) / range.step) * range.step;
    setDurationDays(Math.max(range.min, Math.min(range.max, stepped)));
  };
  const access = canPerformAction(game, action.id, durationDays);
  const presets = [1, 3, 7, 14, 30, 60, 90, 180].filter((value) => value >= range.min && value <= range.max);
  const actionLabel = action.id === "cultivate" ? "闭关" : action.id === "rest" ? "静养" : "行动";
  return (
    <div className="modal-backdrop action-duration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog action-duration-dialog" role="dialog" aria-modal="true" aria-labelledby="action-duration-title">
        <header><div><span className="eyebrow">自定义行动时长</span><h2 id="action-duration-title">{action.name}</h2></div><IconButton label="关闭时长设置" icon={X} onClick={onClose} /></header>
        <div className="duration-field"><label htmlFor="action-duration-input"><Clock3 size={18} />消耗天数</label><output htmlFor="action-duration-input">{durationDays} 天</output></div>
        <input className="duration-slider" id="action-duration-input" type="range" min={range.min} max={range.max} step={range.step} value={durationDays} onChange={(event) => setDuration(Number(event.target.value))} aria-valuetext={`${durationDays} 天`} />
        <div className="duration-slider-boundaries" aria-hidden="true"><span>{range.min} 天</span><span>{range.max} 天</span></div>
        <div className="duration-presets">{presets.map((value) => <button key={value} type="button" className={durationDays === value ? "selected" : ""} onClick={() => setDuration(value)}>{value}天</button>)}</div>
        <p className={`duration-note ${access.allowed ? "" : "invalid"}`}>{access.allowed ? `本次${actionLabel}将推进 ${durationDays} 天，年龄增加约 ${(durationDays / 365).toFixed(2)} 年。${action.id === "rest" ? "静养期间仍可能触发异闻。" : ""}` : access.reason}</p>
        <div className="dialog-actions"><button className="secondary-command" type="button" onClick={onClose}>暂且作罢</button><button className="primary-command" type="button" disabled={!access.allowed} onClick={() => onConfirm(durationDays)}><Clock3 size={17} />开始行动</button></div>
      </section>
    </div>
  );
}

function ActionPanel({ game, onAction, onMarket, onBreakthrough, onClose, variant = "modal" }: { game: GameState; onAction: (id: ActionId, durationDays?: number) => void; onMarket?: () => void; onBreakthrough: () => void; onClose?: () => void; variant?: "modal" | "sidebar" }) {
  const breakthroughReady = canBreakthrough(game);
  const location = getCurrentLocation(game);
  const innateActions = ACTIONS.filter((action) => action.category === "innate");
  const locationActions = ACTIONS.filter((action) => action.category === "location" && location.actions.includes(action.id));
  const [durationAction, setDurationAction] = useState<ActionDefinition>();
  useEffect(() => {
    if (variant !== "modal" || !onClose) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, variant]);
  const renderAction = (action: (typeof ACTIONS)[number]) => {
    const Icon = actionIcons[action.id];
    const access = canPerformAction(game, action.id);
    const durationLabel = action.durationRange ? `${action.durationRange.min}-${action.durationRange.max} 天可调` : `耗时 ${action.durationDays} 天`;
    return <button key={action.id} className="action-button" type="button" disabled={!access.allowed} onClick={() => { if (action.id === "market") { onMarket?.(); onClose?.(); return; } if (action.durationRange) setDurationAction(action); else { onAction(action.id, action.durationDays); onClose?.(); } }} title={access.reason}><span className="action-icon"><Icon size={20} /></span><span><b>{action.name}</b><small>{access.allowed ? `${action.description} · ${durationLabel}` : access.reason}</small></span><em>{action.risk}</em></button>;
  };
  const actionContent = <>
    {breakthroughReady && <button className={`breakthrough-button ${variant === "modal" ? "action-menu-breakthrough" : "action-sidebar-breakthrough"}`} type="button" onClick={() => { onClose?.(); onBreakthrough(); }}><Sparkles size={17} />尝试破境</button>}
    <div className="action-group"><span className="action-group-label">自身固有行动</span><div className="action-grid">{innateActions.map(renderAction)}</div></div>
    {locationActions.length > 0 && <div className="action-group"><span className="action-group-label">地点提供行动</span><div className="action-grid">{locationActions.map(renderAction)}</div></div>}
  </>;
  const panel = variant === "sidebar"
    ? <section className="side-section actions-sidebar"><header className="actions-sidebar-header"><div><span className="eyebrow">第 {game.turn} 天 · 今日行动</span><h3><ListChecks size={17} />{location.name}</h3></div></header><p className="action-menu-summary">每次行动会消耗对应天数。固有行动随身可用，地点行动取决于当前落脚处。</p>{actionContent}</section>
    : <div className="modal-backdrop action-menu-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section className="dialog action-menu" role="dialog" aria-modal="true" aria-labelledby="action-menu-title"><header><div><span className="eyebrow">第 {game.turn} 天 · 行动选择</span><h2 id="action-menu-title">{location.name} · 今日行止</h2></div><IconButton label="关闭行动菜单" icon={X} onClick={() => onClose?.()} /></header><p className="action-menu-summary">每次行动会消耗对应天数。固有行动随身可用，地点行动取决于当前落脚处。</p>{actionContent}</section></div>;
  return <>{panel}{durationAction && <ActionDurationDialog game={game} action={durationAction} onClose={() => setDurationAction(undefined)} onConfirm={(durationDays) => { onAction(durationAction.id, durationDays); setDurationAction(undefined); onClose?.(); }} />}</>;
}

function NpcCard({ npc, onSelect }: { npc: Npc; onSelect: () => void }) {
  const identity = NPC_IDENTITIES.find((item) => item.id === npc.identity);
  const relation = npcSpecialLabel(npc.relationshipType);
  return <button type="button" className={`npc-card ${npc.alive ? "" : "npc-card-dead"}`} onClick={onSelect}>
    <span className="npc-avatar"><UserRound size={19} /></span>
    <span className="npc-card-copy"><b><span>{npc.name}</span>{npc.attention && <Star size={12} aria-label="特别关注" />}</b><small>{identity?.name ?? "异乡人"} · {npcGenderNames[npc.gender]} · {REALMS[npc.realmStage - 1] ?? "飞升"}{!npc.alive && " · 已故"}</small></span>
    <span className="npc-card-relation">{relation ?? getNpcRelationshipLabel(npc.relationship)}</span>
  </button>;
}

function NpcSidebar({ game, onInteract, onToggleAttention }: { game: GameState; onInteract: (npcId: string, interactionId: NpcInteractionId) => void; onToggleAttention: (npcId: string) => void }) {
  const [selectedNpcId, setSelectedNpcId] = useState<string>();
  const npcs = getLocationNpcs(game);
  const selectedNpc = game.npcs.find((npc) => npc.id === selectedNpcId);
  useEffect(() => { if (selectedNpcId && !npcs.some((npc) => npc.id === selectedNpcId)) setSelectedNpcId(undefined); }, [npcs, selectedNpcId]);
  return <section className="side-section npc-sidebar" aria-labelledby="sidebar-npcs-title"><div className="npc-section-heading"><div><span className="eyebrow">来往人物</span><h3 id="sidebar-npcs-title">此地 NPC</h3></div><span className="npc-count"><Users size={16} />{npcs.length} 人</span></div>{npcs.length > 0 ? <div className="npc-list">{npcs.map((npc) => <NpcCard key={npc.id} npc={npc} onSelect={() => setSelectedNpcId(npc.id)} />)}</div> : <p className="npc-empty">这里暂时没有与你擦肩而过的人。</p>}{selectedNpc && <NpcDialog game={game} npc={selectedNpc} onClose={() => setSelectedNpcId(undefined)} onInteract={onInteract} onToggleAttention={onToggleAttention} />}</section>;
}

function ActionSidebar({ game, onAction, onMarket, onBreakthrough, onNpcInteraction, onToggleAttention }: { game: GameState; onAction: (id: ActionId, durationDays?: number) => void; onMarket?: () => void; onBreakthrough: () => void; onNpcInteraction: (npcId: string, interactionId: NpcInteractionId) => void; onToggleAttention: (npcId: string) => void }) {
  return <><ActionPanel game={game} onAction={onAction} onMarket={onMarket} onBreakthrough={onBreakthrough} variant="sidebar" /><NpcSidebar game={game} onInteract={onNpcInteraction} onToggleAttention={onToggleAttention} /></>;
}

function NpcDialog({ game, npc, onClose, onInteract, onToggleAttention }: { game: GameState; npc: Npc; onClose: () => void; onInteract: (npcId: string, interactionId: NpcInteractionId) => void; onToggleAttention: (npcId: string) => void }) {
  const identity = NPC_IDENTITIES.find((item) => item.id === npc.identity);
  const relationLabel = getNpcRelationshipLabel(npc.relationship);
  const relationPercent = Math.max(0, Math.min(100, ((npc.relationship + 100) / 200) * 100));
  const specialRelation = npcSpecialLabel(npc.relationshipType);
  const locationName = game.world.locations.find((location) => location.id === npc.locationId)?.name;
  return (
    <div className="modal-backdrop npc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog npc-dialog" role="dialog" aria-modal="true" aria-labelledby="npc-dialog-title">
        <header><div><span className="eyebrow">异界来客 · 人物档案</span><h2 id="npc-dialog-title">{npc.name}</h2></div><div className="npc-dialog-tools"><button className={`npc-attention-button ${npc.attention ? "active" : ""}`} type="button" onClick={() => onToggleAttention(npc.id)} title={npc.attention ? "取消特别关注" : "特别关注"}><Star size={17} />{npc.attention ? "已关注" : "关注"}</button><IconButton label="关闭人物档案" icon={X} onClick={onClose} /></div></header>
        <div className="npc-profile"><span className="npc-profile-avatar"><UserRound size={27} /></span><div><strong>{identity?.name ?? "异乡人"}</strong><span>{npcGenderNames[npc.gender]} · {REALMS[npc.realmStage - 1] ?? "飞升"} · 战力 {npc.battlePower}</span></div></div>
        <div className="npc-facts"><span>年龄 {formatYears(npc.age)} 岁</span><span>寿元 {formatYears(npc.lifespan)} 年</span><span>{npc.alive ? locationName ?? "行踪不明" : `第${npc.deathTurn ?? game.turn}天离世`}</span></div>
        <div className="npc-personality"><span>性格</span>{npc.personality.map((item) => <b key={item}>{item}</b>)}</div>
        <div className="npc-stat-grid">{(Object.keys(statNames) as Array<keyof typeof statNames>).map((key) => <span key={key}><small>{statNames[key]}</small><b>{npc.stats[key]}</b></span>)}</div>
        <p className="npc-description">{npc.description}</p>
        <div className="npc-relationship"><div><span>与你的关系 · {specialRelation ?? relationLabel}</span><b>{npc.relationship > 0 ? `+${npc.relationship}` : npc.relationship}</b></div><div className="npc-relationship-track"><span style={{ width: `${relationPercent}%` }} /></div></div>
        <div className="npc-interactions">{NPC_INTERACTIONS.map((interaction) => {
          const Icon = npcInteractionIcons[interaction.id];
          const access = canInteractWithNpc(game, npc.id, interaction.id);
          return <button key={interaction.id} type="button" disabled={!access.allowed} title={access.reason} onClick={() => { onInteract(npc.id, interaction.id); onClose(); }}><span className="npc-interaction-icon"><Icon size={18} /></span><span><b>{interaction.name}</b><small>{access.allowed ? `${interaction.description} · 耗时 ${interaction.durationDays ?? 1} 天` : access.reason}</small></span><ChevronRight size={17} /></button>;
        })}</div>
      </section>
    </div>
  );
}

function ItemGiftDialog({ game, itemId, onClose, onConfirm }: { game: GameState; itemId: string; onClose: () => void; onConfirm: (npcId: string) => void }) {
  const item = itemMap.get(itemId);
  const npcs = getLocationNpcs(game).filter((npc) => canGiftItem(game, npc.id, itemId).allowed);
  if (!item) return null;
  return <div className="modal-backdrop item-gift-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog item-gift-dialog" role="dialog" aria-modal="true" aria-labelledby="item-gift-title">
      <header><div><span className="eyebrow">赠礼结缘</span><h2 id="item-gift-title">赠送 {item.name}</h2></div><IconButton label="关闭赠礼窗口" icon={X} onClick={onClose} /></header>
      <p className="item-gift-intro">选择一位当前地点的 NPC，将这件{ITEM_CATEGORY_NAMES[item.category]}交给对方。</p>
      <div className="item-gift-list">{npcs.length > 0 ? npcs.map((npc) => <button type="button" key={npc.id} onClick={() => onConfirm(npc.id)}><span className="npc-avatar"><UserRound size={17} /></span><span><b>{npc.name}</b><small>{getNpcRelationshipLabel(npc.relationship)} · {npc.relationship > 0 ? `+${npc.relationship}` : npc.relationship}</small></span><Gift size={16} /></button>) : <p className="inventory-empty">当前地点没有可以接受这份赠礼的 NPC。</p>}</div>
      <button className="secondary-command" type="button" onClick={onClose}>暂不赠送</button>
    </section>
  </div>;
}

function NpcDirectory({ game, onInteract, onToggleAttention }: { game: GameState; onInteract: (npcId: string, interactionId: NpcInteractionId) => void; onToggleAttention: (npcId: string) => void }) {
  const [selectedNpcId, setSelectedNpcId] = useState<string>();
  const special = game.npcs.filter((npc) => npc.relationshipType);
  const attention = game.npcs.filter((npc) => npc.attention && !npc.relationshipType);
  const deceased = game.npcs.filter((npc) => !npc.alive && !npc.relationshipType && !npc.attention);
  const selectedNpc = game.npcs.find((npc) => npc.id === selectedNpcId);
  const group = (title: string, items: Npc[], empty: string) => <section className="npc-directory-group"><div className="npc-section-heading"><div><span className="eyebrow">{title}</span><h3>{items.length} 人</h3></div></div>{items.length ? <div className="npc-directory-grid">{items.map((npc) => <NpcCard key={npc.id} npc={npc} onSelect={() => setSelectedNpcId(npc.id)} />)}</div> : <p className="npc-empty">{empty}</p>}</section>;
  return <section className="npc-directory side-section" aria-labelledby="npc-directory-title"><header className="directory-header"><div><span className="eyebrow">人物志</span><h2 id="npc-directory-title">与你有因果的人</h2></div><span className="directory-count"><Users size={16} />{special.length + attention.length} 人</span></header>{group("特殊关系", special, "尚未与任何人结下特殊关系。")}{group("特别关注", attention, "点击人物档案中的星标，记录你想持续留意的人。")}{deceased.length > 0 && group("已故人物", deceased, "")}{selectedNpc && <NpcDialog game={game} npc={selectedNpc} onClose={() => setSelectedNpcId(undefined)} onInteract={onInteract} onToggleAttention={onToggleAttention} />}</section>;
}

function PendingEvent({ game, onChoose, busy }: { game: GameState; onChoose: (choice: string) => void; busy?: boolean }) {
  const event = getCurrentEvent(game);
  useEffect(() => {
    if (event && event.choices.length === 0 && !game.eventResult && !busy) onChoose("");
  }, [event?.id, game.eventResult, onChoose, busy]);
  if (!event) return null;
  return (
    <div className="modal-backdrop event-modal-backdrop" role="presentation">
      <section className="dialog event-dialog event-section" role="dialog" aria-modal="true" aria-labelledby="pending-event-title" aria-describedby="pending-event-body" aria-live="polite">
      <div className="day-marker">第 {game.turn} 天</div>
      <div className="event-ornament"><span /><Sparkles size={17} /><span /></div>
      <span className="eyebrow">异闻 · 第 {game.turn} 天</span>
      <h2 id="pending-event-title">{event.title}</h2>
      <span className="event-duration">处理此事预计耗时 {event.durationDays ?? 1} 天</span>
      <p id="pending-event-body">{event.body}</p>
      {busy && <p className="ai-working" role="status"><Bot size={16} />AI 正在裁定此事……</p>}
      <div className="choice-list">{event.choices.map((choice) => {
        const enabled = canChoose(game, choice);
        return <button key={choice.id} type="button" disabled={!enabled || Boolean(busy)} onClick={() => onChoose(choice.id)}><span><b>{choice.label}</b><small>{enabled ? choice.hint : "条件不足"}</small></span><ChevronRight size={18} /></button>;
      })}</div>
      </section>
    </div>
  );
}

function EventResultDialog({ result, onClose }: { result: EventResult; onClose: () => void }) {
  return (
    <div className="modal-backdrop event-result-backdrop" role="presentation">
      <section className={`dialog event-section event-result-dialog tone-${result.tone}`} role="dialog" aria-modal="true" aria-labelledby="event-result-title" aria-describedby="event-result-text">
        <div className="event-ornament"><span /><Check size={17} /><span /></div>
        <span className="eyebrow">{result.kind === "action" ? "行动结果" : "事件结果"}</span>
        <h2 id="event-result-title">{result.title}</h2>
        <span className="event-duration">{result.durationDays ? `本次耗时 ${result.durationDays} 天` : "即时操作"}</span>
        <p id="event-result-text">{result.text}</p>
        <div className="event-result-changes" aria-label="属性变化">
          <span className="event-result-label">本次变化</span>
          {result.changes.length > 0 ? result.changes.map((change) => <div className={`event-result-change ${change.amount > 0 ? "event-change-positive" : "event-change-negative"}`} key={`${change.label}-${change.amount}`}><span>{change.label}</span><strong>{change.amount > 0 ? `+${change.amount}` : change.amount}</strong></div>) : <p className="event-result-empty">没有可见的属性变化。</p>}
        </div>
        <button className="primary-command event-result-actions" type="button" onClick={onClose}><Check size={17} />继续</button>
      </section>
    </div>
  );
}

function AiWorkingDialog() {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const blockKeyboard = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", blockKeyboard, true);
    return () => window.removeEventListener("keydown", blockKeyboard, true);
  }, []);
  return (
    <div className="modal-backdrop ai-working-backdrop" role="presentation">
      <section ref={dialogRef} className="dialog ai-working-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-working-title" tabIndex={-1}>
        <div className="ai-working-icon"><Bot size={28} /><span /></div>
        <span className="eyebrow">异界天机推演中</span>
        <h2 id="ai-working-title">AI 正在裁定</h2>
        <p>正在结合当前人物、地点与因果，生成这一刻的结果……</p>
        <div className="ai-loading-bars" aria-hidden="true"><i /><i /><i /></div>
        <small>请稍候，期间暂不可操作</small>
      </section>
    </div>
  );
}

function ChronicleDetailDialog({ entry, onClose }: { entry: ChronicleEntry; onClose: () => void }) {
  const kindLabel = entry.kind === "event" ? "事件记录" : entry.kind === "action" ? "行动记录" : "人生记录";
  return (
    <div className="modal-backdrop chronicle-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog chronicle-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="chronicle-detail-title" aria-describedby="chronicle-detail-text">
        <header><div><span className="eyebrow">{kindLabel} · 第 {entry.turn} 天</span><h2 id="chronicle-detail-title">{entry.title}</h2></div><IconButton label="关闭历程详情" icon={X} onClick={onClose} /></header>
        <div className="chronicle-detail-meta"><span>{entry.durationDays ? `耗时 ${entry.durationDays} 天` : "即时操作"}</span><span>{entry.locationName ?? "未知地点"}</span>{entry.detail && <span>{entry.detail}</span>}</div>
        <p className="chronicle-detail-text" id="chronicle-detail-text">{entry.text}</p>
        <div className="event-result-changes chronicle-detail-changes" aria-label="属性变化">
          <span className="event-result-label">本次变化</span>
          {entry.changes && entry.changes.length > 0 ? entry.changes.map((change) => <div className={`event-result-change ${change.amount > 0 ? "event-change-positive" : "event-change-negative"}`} key={`${change.label}-${change.amount}`}><span>{change.label}</span><strong>{change.amount > 0 ? `+${change.amount}` : change.amount}</strong></div>) : <p className="event-result-empty">没有记录到可见的属性变化。</p>}
        </div>
        <button className="primary-command chronicle-detail-close" type="button" onClick={onClose}><Check size={17} />返回历程</button>
      </section>
    </div>
  );
}

function Chronicle({ game }: { game: GameState }) {
  // The active result dialog already presents the newest entry; keep the log
  // behind it uncluttered and reveal the entry again after the dialog closes.
  const entries = game.eventResult ? game.chronicle.slice(1) : game.chronicle;
  const [selectedEntry, setSelectedEntry] = useState<ChronicleEntry>();
  useEffect(() => {
    if (selectedEntry && !entries.some((entry) => entry.id === selectedEntry.id)) setSelectedEntry(undefined);
  }, [entries, selectedEntry]);
  return (
    <section className="chronicle-section">
      <span className="chronicle-legacy-label" aria-hidden="true">行旅录</span>
      <div className="chronicle-list">{entries.map((entry, index) => { const kindLabel = entry.kind === "event" ? "事件" : entry.kind === "action" ? "行动" : "人生记录"; return <button className={`chronicle-entry tone-${entry.tone}`} type="button" key={entry.id} onClick={() => setSelectedEntry(entry)} aria-label={`${kindLabel}：第 ${entry.turn} 天，${entry.title}，查看详情`}><span className="chronicle-dot" /><span className="chronicle-entry-copy"><span>第 {entry.turn} 天 · {entry.title}</span><span className="chronicle-entry-text">{entry.text}</span></span>{index === 0 && <em>近日 · 查看详情</em>}</button>; })}</div>
      {selectedEntry && <ChronicleDetailDialog entry={selectedEntry} onClose={() => setSelectedEntry(undefined)} />}
    </section>
  );
}

function BreakthroughDialog({ game, onClose, onConfirm }: { game: GameState; onClose: () => void; onConfirm: (pill: boolean) => void }) {
  const pillQuantity = getItemQuantity(game, "barrier-pill");
  const [usePill, setUsePill] = useState(pillQuantity > 0);
  const info = getBreakthroughInfo(game, usePill);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="breakthrough-title">
        <header><div><span className="eyebrow">叩问关窍</span><h2 id="breakthrough-title">突破至 {REALMS[game.realmStage] ?? "羽化飞升"}</h2></div><IconButton label="关闭" icon={X} onClick={onClose} /></header>
        <div className={`odds odds-${info.label}`}><Shield size={22} /><span><small>天机所示</small><strong>{info.label}</strong></span></div>
        <ul className="factor-list">{info.factors.map((factor) => <li key={factor}><Check size={15} />{factor}</li>)}</ul>
        <label className={`pill-toggle ${pillQuantity < 1 ? "disabled" : ""}`}><input type="checkbox" checked={usePill} disabled={pillQuantity < 1} onChange={(event) => setUsePill(event.target.checked)} /><span><PackageOpen size={18} /><b>服用破障丹</b><small>现有 {pillQuantity} 枚，令此行更为稳妥</small></span></label>
        <p className="warning-copy">破境会流逝一天。若功败，经脉与心境都将受损。</p>
        <div className="dialog-actions"><button className="secondary-command" type="button" onClick={onClose}>暂且作罢</button><button className="primary-command" type="button" onClick={() => onConfirm(usePill)}><Sparkles size={17} />叩关</button></div>
      </section>
    </div>
  );
}

function EndScreen({ game, meta, onReincarnate, onHome }: { game: GameState; meta: MetaProgress; onReincarnate: () => void; onHome: () => void }) {
  const result = game.summary!;
  return (
    <main className={`end-screen end-${result.reason}`}>
      <div className="end-sigil">{result.reason === "ascension" || result.reason === "foundation" ? <Sparkles size={42} /> : <Leaf size={42} />}</div>
      <span className="eyebrow">此世已终</span>
      <h1>{result.title}</h1>
      <p className="epitaph">{result.epitaph}</p>
      <div className="run-stats"><div><span>最终境界</span><strong>{REALMS[game.realmStage - 1]}</strong></div><div><span>历经岁月</span><strong>{game.turn} 天</strong></div><div><span>此世评分</span><strong>{result.score}</strong></div><div><span>所得见闻</span><strong>+{result.insightEarned}</strong></div></div>
      <p className="legacy-earned">轮回见闻累计 {meta.totalInsight} 点</p>
      <div className="end-actions"><button className="primary-command" type="button" onClick={onReincarnate}><RefreshCw size={18} />再入轮回</button><button className="secondary-command" type="button" onClick={onHome}>返回山门</button></div>
    </main>
  );
}

function SaveDialog({ game, meta, aiSettings, onAiSettingsChange, onClose, onImport, onNew }: { game: GameState | null; meta: MetaProgress; aiSettings: AiSettings; onAiSettingsChange: (settings: AiSettings) => void; onClose: () => void; onImport: (game: GameState | null, meta: MetaProgress) => void; onNew: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [draftAi, setDraftAi] = useState<AiSettings>(aiSettings);
  const [models, setModels] = useState<string[]>([]);
  const [modelMessage, setModelMessage] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  useEffect(() => setDraftAi(aiSettings), [aiSettings]);
  const download = () => {
    const blob = new Blob([exportSave(game, meta)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `异界问道-存档-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url); setMessage("存档已导出");
  };
  const read = async (file?: File) => {
    if (!file) return;
    try { const save = importSave(await file.text()); onImport(save.game, save.meta); setMessage("存档已载入"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "存档读取失败"); }
  };
  const updateAi = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => setDraftAi((current) => ({ ...current, [key]: value }));
  const saveAi = () => {
    const next = { ...draftAi, endpoint: draftAi.endpoint.trim(), apiKey: draftAi.apiKey.trim(), model: draftAi.model.trim() };
    onAiSettingsChange(next);
    setDraftAi(next);
    setMessage("AI 设置已保存");
  };
  const loadModels = async () => {
    setLoadingModels(true);
    setModelMessage("");
    try {
      const fetched = await fetchAiModels(draftAi);
      setModels(fetched);
      setModelMessage(`已获取 ${fetched.length} 个模型`);
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : "模型列表获取失败");
    } finally {
      setLoadingModels(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">
        <header><div><span className="eyebrow">设置与卷宗</span><h2 id="save-title">存档与 AI 模式</h2></div><IconButton label="关闭" icon={X} onClick={onClose} /></header>
        <div className="save-options">
          <button type="button" onClick={download}><Download size={20} /><span><b>导出存档</b><small>保存本局与轮回见闻</small></span></button>
          <button type="button" onClick={() => fileRef.current?.click()}><Import size={20} /><span><b>导入存档</b><small>载入另一份 JSON 卷宗</small></span></button>
          <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void read(event.target.files?.[0])} />
        </div>
        <section className="ai-settings-section" aria-labelledby="ai-settings-title">
          <header className="ai-settings-heading"><div><span className="eyebrow">可选叙事引擎</span><h3 id="ai-settings-title"><Bot size={17} />AI 模式</h3></div><label className="ai-toggle"><input type="checkbox" checked={draftAi.enabled} onChange={(event) => updateAi("enabled", event.target.checked)} /><span>{draftAi.enabled ? "已开启" : "已关闭"}</span></label></header>
          <p className="settings-note">开启后，行动与事件会把当前角色、属性、地点和近期历程发送给配置的模型，由模型生成结果文案与属性变化。请求从浏览器直接发出，接口需允许跨域。</p>
          <label className="setting-field"><span>API 格式</span><select value={draftAi.format} onChange={(event) => { const format = event.target.value as AiSettings["format"]; updateAi("format", format); setModels([]); }}><option value="openai">OpenAI 兼容格式</option><option value="claude">Claude Messages 格式</option></select></label>
          <label className="setting-field"><span>API 地址</span><input type="url" value={draftAi.endpoint} placeholder={draftAi.format === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://api.anthropic.com/v1/messages"} onChange={(event) => updateAi("endpoint", event.target.value)} /></label>
          <label className="setting-field"><span>API Key</span><input type="password" autoComplete="off" value={draftAi.apiKey} placeholder="仅保存在本机浏览器" onChange={(event) => updateAi("apiKey", event.target.value)} /></label>
          <div className="setting-field model-field"><span>使用模型</span><div className="model-picker"><input list="ai-model-options" value={draftAi.model} placeholder={draftAi.format === "openai" ? "例如 gpt-4o-mini" : "例如 claude-3-5-sonnet-latest"} onChange={(event) => updateAi("model", event.target.value)} /><button className="secondary-command" type="button" disabled={loadingModels || !draftAi.apiKey.trim()} onClick={() => void loadModels()}><RefreshCw size={15} className={loadingModels ? "spin" : ""} />获取模型</button><datalist id="ai-model-options">{models.map((model) => <option key={model} value={model} />)}</datalist></div></div>
          {modelMessage && <p className="settings-message" role="status">{modelMessage}</p>}
          <button className="primary-command ai-save-button" type="button" onClick={saveAi}><Bot size={17} />保存 AI 设置</button>
        </section>
        {message && <p className="save-message" role="status">{message}</p>}
        {game && <button className="danger-command" type="button" onClick={() => { if (window.confirm("确定舍弃当前一世，重新选择命格？轮回见闻会保留。")) onNew(); }}><RefreshCw size={17} />舍弃此世，另启轮回</button>}
      </section>
    </div>
  );
}

function GameScreen({ game, meta, aiSettings, onAiSettingsChange, onGame, onMeta, onHome, onReincarnate, onManage }: { game: GameState; meta: MetaProgress; aiSettings: AiSettings; onAiSettingsChange: (settings: AiSettings) => void; onGame: (game: GameState) => void; onMeta: (meta: MetaProgress) => void; onHome: () => void; onReincarnate: () => void; onManage: () => void }) {
  const [tab, setTab] = useState<MobileTab>(() => game.pendingEventId ? "map" : "journey");
  const [showBreakthrough, setShowBreakthrough] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMarket, setShowMarket] = useState(false);
  const [giftItemId, setGiftItemId] = useState<string>();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState("");
  const aiBusyRef = useRef(false);
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth <= 720);
  useEffect(() => {
    const updateNarrow = () => setIsNarrow(window.innerWidth <= 720);
    window.addEventListener("resize", updateNarrow);
    return () => window.removeEventListener("resize", updateNarrow);
  }, []);
  const claimedResult = useMemo(() => game.status === "ended" ? claimLegacy(game, meta) : null, [game, meta]);
  useEffect(() => {
    if (claimedResult && !game.legacyClaimed) {
      onGame(claimedResult.game);
      onMeta(claimedResult.meta);
    }
  }, [claimedResult, game.legacyClaimed, onGame, onMeta]);
  const action = async (id: ActionId, durationDays?: number) => {
    if (aiBusyRef.current) return;
    const definition = ACTIONS.find((item) => item.id === id);
    const requestedDays = durationDays ?? definition?.durationDays ?? 1;
    const useAi = aiSettings.enabled;
    let next: GameState;
    if (useAi) {
      aiBusyRef.current = true;
      setAiBusy(true);
      setAiNotice("");
      try {
        if (!isAiConfigured(aiSettings) || !definition) throw new Error("AI 配置不完整");
        const generated = await requestAiAction(aiSettings, game, definition, requestedDays);
        next = performActionWithAi(game, id, requestedDays, generated);
      } catch (error) {
        next = performAction(game, id, requestedDays);
        setAiNotice(`AI 未能完成本次裁定，已使用本地规则${error instanceof Error ? `：${error.message}` : ""}`);
      } finally {
        aiBusyRef.current = false;
        setAiBusy(false);
      }
    } else {
      next = performAction(game, id, requestedDays);
    }
    onGame(next);
    setShowActions(false);
    const nextTab = next.pendingEventId ? "map" : tab === "map" ? "map" : tab === "actions" ? "actions" : "journey";
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openMarket = () => {
    if (aiBusyRef.current) return;
    setShowActions(false);
    setShowMarket(true);
  };
  // Travel is only available from the world map, so keep that view mounted after arrival.
  // This also prevents a rerender or result dialog from falling back to the chronicle tab.
  const travel = async (locationId: string) => {
    if (aiBusyRef.current) return;
    const target = game.world.locations.find((location) => location.id === locationId);
    let next: GameState;
    if (aiSettings.enabled && target && canTravel(game, locationId).allowed) {
      aiBusyRef.current = true;
      setAiBusy(true);
      setAiNotice("");
      try {
        if (!isAiConfigured(aiSettings)) throw new Error("AI 配置不完整");
        const generated = await requestAiTravel(aiSettings, game, target);
        next = travelToWithAi(game, locationId, generated);
      } catch (error) {
        next = travelTo(game, locationId);
        setAiNotice(`AI 未能完成行途裁定，已使用本地规则${error instanceof Error ? `：${error.message}` : ""}`);
      } finally {
        aiBusyRef.current = false;
        setAiBusy(false);
      }
    } else {
      next = travelTo(game, locationId);
    }
    onGame(next);
    setShowActions(false);
    setTab("map");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const choose = async (id: string) => {
    if (aiBusyRef.current) return;
    const event = getCurrentEvent(game);
    if (!event) return;
    if (aiSettings.enabled) {
      aiBusyRef.current = true;
      setAiBusy(true);
      setAiNotice("");
      try {
        if (!isAiConfigured(aiSettings)) throw new Error("AI 配置不完整");
        const choice = event.choices.find((item) => item.id === id);
        const generated = await requestAiEvent(aiSettings, game, event, choice);
        onGame(resolveEventWithAi(game, id, generated));
      } catch (error) {
        onGame(resolveEvent(game, id));
        setAiNotice(`AI 未能完成事件裁定，已使用本地规则${error instanceof Error ? `：${error.message}` : ""}`);
      } finally {
        aiBusyRef.current = false;
        setAiBusy(false);
      }
      return;
    }
    onGame(resolveEvent(game, id));
  };
  const npcInteraction = async (npcId: string, interactionId: NpcInteractionId) => {
    if (aiBusyRef.current) return;
    const npc = game.npcs.find((item) => item.id === npcId);
    const interaction = NPC_INTERACTIONS.find((item) => item.id === interactionId);
    let next: GameState;
    if (aiSettings.enabled && npc && interaction && canInteractWithNpc(game, npcId, interactionId).allowed) {
      aiBusyRef.current = true;
      setAiBusy(true);
      setAiNotice("");
      try {
        if (!isAiConfigured(aiSettings)) throw new Error("AI 配置不完整");
        const generated = await requestAiNpcInteraction(aiSettings, game, npc, interaction);
        next = interactWithNpcWithAi(game, npcId, interactionId, generated);
      } catch (error) {
        next = interactWithNpc(game, npcId, interactionId);
        setAiNotice(`AI 未能完成交往裁定，已使用本地规则${error instanceof Error ? `：${error.message}` : ""}`);
      } finally {
        aiBusyRef.current = false;
        setAiBusy(false);
      }
    } else {
      next = interactWithNpc(game, npcId, interactionId);
    }
    onGame(next);
    // Keep the map visible when the interaction was started from the map sidebar.
    setTab(tab === "map" || tab === "npcs" ? tab : "actions");
  };
  const toggleAttention = (npcId: string) => onGame(toggleNpcAttention(game, npcId));
  const itemUse = (itemId: string) => {
    if (aiBusyRef.current) return;
    const next = useItem(game, itemId);
    if (next === game) return;
    onGame(next);
    setTab("inventory");
  };
  const marketBuy = (itemId: string) => {
    if (aiBusyRef.current) return;
    const next = buyItem(game, itemId);
    if (next === game) return;
    onGame(next);
    setShowMarket(false);
  };
  const marketSell = (itemId: string) => {
    if (aiBusyRef.current) return;
    const next = sellItem(game, itemId);
    if (next === game) return;
    onGame(next);
    setShowMarket(false);
  };
  const confirmItemGift = (npcId: string) => {
    if (!giftItemId || aiBusyRef.current) return;
    const next = giftItem(game, npcId, giftItemId);
    if (next === game) return;
    onGame(next);
    setGiftItemId(undefined);
    setTab("inventory");
  };
  const commitBreakthrough = (pill: boolean) => { onGame(breakthrough(game, pill)); setShowBreakthrough(false); };
  if (game.status === "ended" && !game.eventResult) {
    const claimed = claimedResult!;
    return <EndScreen game={claimed.game} meta={claimed.meta} onReincarnate={() => { onGame(claimed.game); onMeta(claimed.meta); onReincarnate(); }} onHome={onHome} />;
  }
  return (
    <main className="game-shell">
      <header className="game-header"><button className="brand-button" type="button" onClick={onHome}><Brand /></button><div className="turn-marker"><span>第 {game.turn} 天</span><i /><span>{REALMS[game.realmStage - 1]}</span><i /><span>{getCurrentLocation(game).name}</span></div><div className="header-tools"><label className={`header-ai-toggle ${aiSettings.enabled ? "active" : ""}`} title={aiSettings.enabled ? "关闭 AI 模式" : "开启 AI 模式"}><Bot size={16} /><span>AI</span><input type="checkbox" checked={aiSettings.enabled} onChange={(event) => onAiSettingsChange({ ...aiSettings, enabled: event.target.checked })} /><span className="header-ai-switch" aria-hidden="true"><span /></span></label><IconButton label="设置" icon={Settings} onClick={onManage} /><IconButton label="本次模拟详情" icon={Info} onClick={() => setShowDetails(true)} /><IconButton label="返回山门" icon={Menu} onClick={onHome} /></div></header>
      <div className="desktop-layout">
        <aside className="left-sidebar"><StatPanel game={game} /></aside>
        <div className="center-column">
          <nav className="view-tabs" aria-label="历程视图"><button type="button" className={tab === "journey" ? "active" : ""} onClick={() => setTab("journey")}><ScrollText size={16} />历程</button><button type="button" className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}><MapIcon size={16} />异界舆图</button><button type="button" className={tab === "npcs" ? "active" : ""} onClick={() => setTab("npcs")}><Users size={16} />人物志</button><button type="button" className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}><Backpack size={16} />物品栏</button></nav>
          <div className={`center-panel ${tab === "journey" ? "active" : ""}`}><div className="mobile-status-strip"><span>第 {game.turn} 天</span><span><Heart size={14} />{Math.round(game.resources.stamina)}</span><span><Swords size={14} />{Math.round(game.resources.battlePower)}</span><span><Sparkles size={14} />{Math.round(game.resources.cultivation)}/{game.resources.cultivationRequired}</span></div><Chronicle game={game} /></div>
          <div className={`center-panel ${tab === "map" ? "active" : ""}`}><WorldMap game={game} onTravel={travel} onAction={action} onMarket={openMarket} onBreakthrough={() => setShowBreakthrough(true)} showActions={showActions} onShowActionsChange={setShowActions} /></div>
          <div className={`center-panel ${tab === "npcs" ? "active" : ""}`}><NpcDirectory game={game} onInteract={npcInteraction} onToggleAttention={toggleAttention} /></div>
          <div className={`center-panel ${tab === "inventory" ? "active" : ""}`}><InventoryPanel game={game} onUseItem={itemUse} onGiftItem={setGiftItemId} /></div>
        </div>
        <aside className="right-sidebar">{!showActions && <ActionSidebar game={game} onAction={action} onMarket={openMarket} onBreakthrough={() => setShowBreakthrough(true)} onNpcInteraction={npcInteraction} onToggleAttention={toggleAttention} />}</aside>
        <div className={`mobile-only-panel ${tab === "inventory" ? "active" : ""}`}><InventoryPanel game={game} onUseItem={itemUse} onGiftItem={setGiftItemId} /></div>
        <div className={`mobile-only-panel ${tab === "character" ? "active" : ""}`}><StatPanel game={game} /></div>
        {isNarrow && !showActions && <div className={`mobile-only-panel ${tab === "actions" ? "active" : ""}`}><ActionSidebar game={game} onAction={action} onMarket={openMarket} onBreakthrough={() => setShowBreakthrough(true)} onNpcInteraction={npcInteraction} onToggleAttention={toggleAttention} /></div>}
        <div className={`mobile-only-panel ${tab === "legacy" ? "active" : ""}`}><GoalPanel game={game} /><LegacyPanel meta={meta} /></div>
      </div>
      {(aiBusy || aiNotice) && <div className={`ai-status ${aiBusy ? "working" : "notice"}`} role="status">{aiBusy ? <><Bot size={15} />AI 正在处理当前叙事……</> : <><Bot size={15} />{aiNotice}</>}</div>}
      <nav className="mobile-nav" aria-label="主要视图">
        {([{ id: "journey", icon: ScrollText, label: "历程" }, { id: "map", icon: MapIcon, label: "舆图" }, { id: "npcs", icon: Users, label: "人物志" }, { id: "actions", icon: ListChecks, label: "行动" }, { id: "inventory", icon: Backpack, label: "物品栏" }, { id: "character", icon: UserRound, label: "人物" }, { id: "legacy", icon: History, label: "详情" }] as const).map(({ id, icon: Icon, label }) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}
      </nav>
      {game.pendingEventId && <PendingEvent game={game} onChoose={choose} busy={aiBusy} />}
      {game.eventResult && <EventResultDialog result={game.eventResult} onClose={() => onGame(dismissEventResult(game))} />}
      {aiBusy && <AiWorkingDialog />}
      {showBreakthrough && <BreakthroughDialog game={game} onClose={() => setShowBreakthrough(false)} onConfirm={commitBreakthrough} />}
      {showDetails && <SimulationDetailsDialog game={game} meta={meta} onClose={() => setShowDetails(false)} />}
      {showMarket && <MarketDialog game={game} onClose={() => setShowMarket(false)} onListen={() => { setShowMarket(false); void action("market"); }} onBuy={marketBuy} onSell={marketSell} />}
      {giftItemId && <ItemGiftDialog game={game} itemId={giftItemId} onClose={() => setGiftItemId(undefined)} onConfirm={confirmItemGift} />}
    </main>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [meta, setMeta] = useState<MetaProgress>(() => loadMeta());
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [screen, setScreen] = useState<Screen>(() => loadGame() ? "welcome" : "create");
  const [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => { saveGame(game); }, [game]);
  useEffect(() => { saveMeta(meta); }, [meta]);
  useEffect(() => { saveAiSettings(aiSettings); }, [aiSettings]);
  const begin = (candidate: CharacterCandidate, name: string, seed: number, worldOptions: WorldOptions) => { setGame(startGame(candidate, name, seed, worldOptions)); setScreen("game"); };
  const newRun = () => { setGame(null); setScreen("create"); setSaveOpen(false); };
  const importAll = (importedGame: GameState | null, importedMeta: MetaProgress) => { setGame(importedGame); setMeta(importedMeta); setScreen(importedGame ? "game" : "create"); setSaveOpen(false); };
  const openCreation = () => {
    if (game?.status === "playing" && !window.confirm("当前一世尚未终结。确定暂别此世，重新选择命格？")) return;
    setScreen("create");
  };
  return (
    <div className="app">
      {screen === "welcome" && <WelcomeScreen game={game} meta={meta} onContinue={() => setScreen("game")} onCreate={openCreation} onManage={() => setSaveOpen(true)} />}
      {screen === "create" && <CreationScreen meta={meta} onBack={() => setScreen("welcome")} onStart={begin} />}
      {screen === "game" && game && <GameScreen game={game} meta={meta} aiSettings={aiSettings} onAiSettingsChange={setAiSettings} onGame={setGame} onMeta={setMeta} onHome={() => setScreen("welcome")} onReincarnate={newRun} onManage={() => setSaveOpen(true)} />}
      {saveOpen && <SaveDialog game={game} meta={meta} aiSettings={aiSettings} onAiSettingsChange={setAiSettings} onClose={() => setSaveOpen(false)} onImport={importAll} onNew={newRun} />}
    </div>
  );
}
