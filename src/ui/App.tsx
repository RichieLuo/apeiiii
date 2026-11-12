import { type CSSProperties, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameScene } from '../game/render/GameScene';
import { useGame } from './useGame';
import { store } from '../platform/store';
import { HEROES, HERO_ORDER } from '../game/data/heroes';
import { BALANCE } from '../game/data/economy';
import { canAscendHero } from '../game/core/state';
import { realAssetUrl } from '../game/render/assets';
import { Icon } from './Icon';
import {
  SummonPanel,
  HeroPanel,
  HeroOrderPanel,
  HeroRoleBadge,
  GemPanel,
  RecruitPanel,
  EquipmentPanel,
  QuestPanel,
  StrongholdPanel,
  ArenaPanel,
  SettingsPanel,
} from './panels';

type PanelName =
  | null
  | 'summon'
  | 'hero'
  | 'hero-order'
  | 'gem'
  | 'recruit'
  | 'equipment'
  | 'quest'
  | 'stronghold'
  | 'arena'
  | 'settings';

const NAV_ITEMS = [
  { panel: 'summon', label: '勇者', icon: 'helmet' },
  { panel: 'recruit', label: '招募', icon: 'ticket' },
  { panel: 'gem', label: '宝石', icon: 'gem' },
  { panel: 'equipment', label: '装备', icon: 'armor' },
  { panel: 'quest', label: '任务', icon: 'scroll' },
  { panel: 'stronghold', label: '据点', icon: 'tower', unlockFloor: BALANCE.strongholdUnlockFloor },
  { panel: 'arena', label: '训练场', icon: 'trophy', unlockFloor: BALANCE.arenaUnlockFloor },
] as const;

const HERO_FILTERS = [
  { value: 'all', label: '全部', icon: 'grid' },
  { value: 'melee', label: '近战', icon: 'sword' },
  { value: 'ranged', label: '远程', icon: 'bow' },
] as const;

const PANEL_LABELS: Partial<Record<Exclude<PanelName, null>, string>> = {
  hero: '英雄', 'hero-order': '英雄召唤顺序', settings: '设置',
};

export default function App() {
  const snap = useGame();
  const state = snap.state;
  const [panel, setPanel] = useState<PanelName>(null);
  const [selectedHero, setSelectedHero] = useState<string | null>('hero_guard');
  const [heroListOpen, setHeroListOpen] = useState(false);
  const [heroFilter, setHeroFilter] = useState<(typeof HERO_FILTERS)[number]['value']>('all');
  const battleRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!battleRef.current || gameRef.current) return;
    const el = battleRef.current;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      width: el.clientWidth,
      height: el.clientHeight,
      backgroundColor: '#17212b',
      scene: [GameScene],
      scale: { mode: Phaser.Scale.RESIZE },
      render: { antialias: true },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const r = state.resources;
  const ascendableHeroes = new Set(HERO_ORDER.filter((id) => canAscendHero(state, id)));
  const aliveSquires = state.units.filter((u) => u.kind === 'squire' && u.phase !== 'dead').length;

  const openPanel = (p: PanelName) => {
    setPanel(p);
    if (p && p !== 'hero' && p !== 'hero-order') setHeroListOpen(false);
  };

  const focusFloor = (floor: number) => {
    const scene = gameRef.current?.scene.getScene('game');
    if (scene instanceof GameScene) scene.focusFloor(floor);
  };

  return (
    <div className="app">
      {/* 顶部资源条 */}
      <div className="resource-bar">
        <div className="resource-currencies">
          <span className="res gold" title="金币">
            <Icon name="coin" />
            <span className="sr-only">金币</span>
            <span className="res-amount">{Math.floor(r.gold).toLocaleString()}</span>
          </span>
          <span className="res crystal" title="晶钻">
            <Icon name="gem" />
            <span className="sr-only">晶钻</span>
            <span className="res-amount">{Math.floor(r.crystal).toLocaleString()}</span>
          </span>
          <span className="res ticket" title="招募券">
            <Icon name="ticket" />
            <span className="sr-only">招募券</span>
            <span className="res-amount">{r.recruitTickets}</span>
          </span>
        </div>
        <div className="resource-status">
          <span className="res" title={state.mode === 'classic' ? '经典模式' : '无限模式'}>
            <Icon name="tower" />
            <span>最高 {state.highestClearedFloor}/{state.mode === 'classic' ? BALANCE.floorsTotal : '∞'} 层</span>
          </span>
          <span className="res">
            <Icon name="helmet" />
            <span>勇者 {aliveSquires}/{state.summon.aliveMax}</span>
          </span>
          <span className="res">
            <Icon name="pack" />
            <span>库存 {Math.floor(state.summon.inventory)}/{state.summon.inventoryMax}</span>
          </span>
        </div>
        <span className="spacer" />
        <div className="resource-actions">
          <button
            type="button"
            className="btn ghost hero-drawer-toggle"
            aria-controls="hero-list"
            aria-expanded={heroListOpen}
            aria-label={`${heroListOpen ? '收起英雄列表' : '英雄'}${ascendableHeroes.size > 0 ? `，${ascendableHeroes.size} 名可升星` : ''}`}
            onClick={() => setHeroListOpen((v) => !v)}
          >
            <Icon name={heroListOpen ? 'close' : 'users'} />
            {heroListOpen ? '收起' : '英雄'}
            {ascendableHeroes.size > 0 && <span className="hero-ascend-count" aria-hidden="true">{ascendableHeroes.size}</span>}
          </button>
          <button type="button" className="btn ghost" onClick={() => openPanel('settings')}>
            <Icon name="settings" />
            设置
          </button>
        </div>
      </div>

      {/* 主区域 */}
      <div className="main">
        <aside id="hero-list" aria-label="英雄图鉴" className={`hero-list ${heroListOpen ? 'open' : ''}`}>
          <div className="hero-list-tools">
            <button type="button" className="btn ghost hero-order-open" onClick={() => openPanel('hero-order')}>
              <Icon name="list" />召唤顺序
            </button>
            <div className="hero-filter" role="group" aria-label="英雄类型筛选">
              {HERO_FILTERS.map(({ value, label, icon }) => (
                <button type="button" className="btn ghost" key={value} aria-pressed={heroFilter === value}
                  onClick={() => setHeroFilter(value)}><Icon name={icon} />{label}</button>
              ))}
            </div>
            {ascendableHeroes.size > 0 && <span className="hero-ascend-summary"><Icon name="spark" />共 {ascendableHeroes.size} 名英雄可升星</span>}
          </div>
          {HERO_ORDER.map((id) => {
            const h = state.heroes[id];
            const cfg = HEROES[id];
            const owned = h.owned;
            const canAscend = ascendableHeroes.has(id);
            if (heroFilter !== 'all' && cfg.melee !== (heroFilter === 'melee')) return null;
            return (
              <button
                key={id}
                type="button"
                className={`hero-card ${owned ? 'owned' : ''}${canAscend ? ' ascendable' : ''}`}
                onClick={() => {
                  setSelectedHero(id);
                  openPanel('hero');
                }}
              >
                <span className="hero-avatar" style={{ background: cfg.color }}>
                  {realAssetUrl(cfg.spriteId) ? (
                    <img
                      src={'./' + realAssetUrl(cfg.spriteId)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Icon name="helmet" />
                  )}
                </span>
                <span className="hero-info">
                  <span className="hero-name">{cfg.shortName}</span>
                  <span className="hero-sub">{owned ? `Lv${h.level} ★${h.star}` : cfg.title}</span>
                </span>
                <span className="hero-card-status">
                  {canAscend && <span className="hero-ascend-badge"><Icon name="up" />可升星</span>}
                  <HeroRoleBadge melee={cfg.melee} />
                  <span className={owned && h.enabled ? 'hero-state active' : 'hero-state'}>
                    <Icon name={owned ? h.enabled ? 'check' : 'pause' : 'lock'} />
                    {owned ? h.enabled ? '已启用' : '停用' : '未招募'}
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="battle-wrap" ref={battleRef} />

        {heroListOpen && (
          <button type="button" className="hero-drawer-backdrop" aria-label="收起英雄列表" onClick={() => setHeroListOpen(false)} />
        )}
      </div>

      {/* 底部技能栏 */}
      <SkillBar state={state} target={snap.skillTargetFloor} canUnlock={snap.canUnlock.ok} onOpen={() => openPanel('summon')} onFocusFloor={focusFloor} />

      {/* 底部导航 */}
      <nav className="nav-bar" aria-label="游戏功能">
        {NAV_ITEMS.map((item) => {
          const { panel: id, label, icon } = item;
          const locked = 'unlockFloor' in item && state.highestClearedFloor < item.unlockFloor;
          return (
            <button type="button" key={id} className={`nav-item nav-${id}${panel === id ? ' active' : ''}`}
              aria-pressed={panel === id} title={locked ? `第 ${item.unlockFloor} 层首通后解锁` : undefined}
              onClick={() => openPanel(id)}>
              <span className="nav-emblem" aria-hidden="true">
                <Icon name={icon} />
                {locked && <span className="nav-lock"><Icon name="lock" /></span>}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* 弹层 */}
      {panel && (
        <div className="overlay" onClick={() => setPanel(null)}>
          <div
            className="panel"
            role="dialog"
            aria-modal="true"
            aria-label={PANEL_LABELS[panel] ?? NAV_ITEMS.find((item) => item.panel === panel)?.label}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPanel(null);
            }}
          >
            <button type="button" className="close" aria-label="关闭面板" autoFocus onClick={() => setPanel(null)}>
              <Icon name="close" />
            </button>
            <div className="panel-body">
              {panel === 'summon' && <SummonPanel />}
              {panel === 'hero' && <HeroPanel heroId={selectedHero ?? 'hero_guard'} />}
              {panel === 'hero-order' && <HeroOrderPanel />}
              {panel === 'gem' && <GemPanel />}
              {panel === 'recruit' && <RecruitPanel />}
              {panel === 'equipment' && <EquipmentPanel heroId={selectedHero ?? 'hero_guard'} onSelectHero={setSelectedHero} />}
              {panel === 'quest' && <QuestPanel />}
              {panel === 'stronghold' && <StrongholdPanel />}
              {panel === 'arena' && <ArenaPanel />}
              {panel === 'settings' && <SettingsPanel />}
            </div>
          </div>
        </div>
      )}

      {/* 离线收益弹窗 */}
      {state.offlineRewardPending && <OfflineReward />}
    </div>
  );
}

function SkillBar({ state, target, canUnlock, onOpen, onFocusFloor }: {
  state: ReturnType<typeof useGame>['state'];
  target: number;
  canUnlock: boolean;
  onOpen: () => void;
  onFocusFloor: (floor: number) => void;
}) {
  const a = state.activeSkills;
  const attackPercent = Math.round(BALANCE.skillBattleCry.atkBoost * 100);
  const healPercent = Math.round(BALANCE.skillLifeEcho.hpRatio * 100);
  const rainDamage = Math.round(BALANCE.skillCrystalRain.dmg + state.highestClearedFloor * BALANCE.skillCrystalRain.dmgScaling);
  const boostedUntil = state.units.reduce((until, unit) => unit.floorId === target && unit.team === 'ally'
    && unit.phase !== 'dead' && unit.atkBoostFactor >= BALANCE.skillBattleCry.atkBoost
    ? Math.max(until, unit.atkBoostUntil) : until, state.time);
  const boostRemaining = Math.ceil(boostedUntil - state.time);
  const advanceRemaining = Math.max(0, Math.ceil(a.rapidAdvanceUntil - state.time));
  const autoFloor = state.summon.autoTargetFloor ?? 1;
  const setAutoFloor = (floor: number) => store.dispatch('setAutoSummon', state.summon.autoEnabled, floor);
  const skills = [
    { key: 'battleCry', name: '战意鼓舞', icon: 'horn', cd: a.battleCryCooldown, total: BALANCE.skillBattleCry.cooldown,
      effect: `攻击 +${attackPercent}%`, description: `使目标层当前友军攻击提高 ${attackPercent}%，持续 ${BALANCE.skillBattleCry.duration} 秒。适合交战前使用。` },
    { key: 'lifeEcho', name: '生命回响', icon: 'heart', cd: a.lifeEchoCooldown, total: BALANCE.skillLifeEcho.cooldown,
      effect: `回血 ${healPercent}%`, description: `立即为目标层受伤友军恢复各自最大生命的 ${healPercent}%，不超过满血。` },
    { key: 'crystalRain', name: '晶雨打击', icon: 'rain', cd: a.crystalRainCooldown, total: BALANCE.skillCrystalRain.cooldown,
      effect: `群伤 ${rainDamage}`, description: `立即对目标层每个敌人造成 ${rainDamage} 点伤害；伤害随最高首通层数提高。` },
    { key: 'rapidAdvance', name: '加速前进', icon: 'bolt', cd: a.rapidAdvanceCooldown, total: BALANCE.skillRapidAdvance.cooldown,
      effect: `全体移速 ×${1 + BALANCE.skillRapidAdvance.moveBoost}`,
      description: `所有楼层的英雄移动速度提高 ${Math.round(BALANCE.skillRapidAdvance.moveBoost * 100)}%，持续 ${BALANCE.skillRapidAdvance.duration} 秒；期间新出场或复活的英雄也享受剩余效果，攻击速度不变。` },
  ] as const;
  return (
    <div className="skill-dock">
    <div className="skill-bar">
      {skills.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`skill-btn skill-${s.key}${s.cd <= 0 ? ' is-ready' : ''}${(s.key === 'battleCry' && boostRemaining > 0) || (s.key === 'rapidAdvance' && advanceRemaining > 0) ? ' is-active' : ''}`}
          disabled={s.cd > 0}
          title={`${s.description} 冷却 ${s.total} 秒。`}
          onClick={() => store.dispatch('useActiveSkill', s.key)}
        >
          <span className="skill-emblem" aria-hidden="true"
            style={{ '--skill-charge': `${100 * (1 - Math.min(1, s.cd / s.total))}%` } as CSSProperties}>
            <Icon name={s.icon} />
          </span>
          <span className="skill-copy">
            <span>{s.name}</span>
            <span className="skill-effect">{s.key === 'battleCry' && boostRemaining > 0 ? `加攻中 · ${boostRemaining}秒`
              : s.key === 'rapidAdvance' && advanceRemaining > 0 ? `全体加速 ${advanceRemaining}秒` : s.effect}</span>
            <span className="skill-cd">{s.cd > 0 ? `冷却 ${Math.ceil(s.cd)}秒` : '点击施放'}</span>
          </span>
        </button>
      ))}
      <span className="spacer" />
      <label className="toggle skill-auto">
        <input
          type="checkbox"
          checked={state.summon.autoEnabled}
          onChange={(e) => store.dispatch('setAutoSummon', e.target.checked, autoFloor)}
        />
        <span className="toggle-track" aria-hidden="true" />
        自动召唤
      </label>
      <span className="skill-floor-control">
        <Icon name="tower" />
        {state.maxFloorUnlocked > BALANCE.floorsTotal ? (
          <AutoFloorInput floor={autoFloor} max={state.maxFloorUnlocked} onCommit={(floor) => {
            if (setAutoFloor(floor).ok) onFocusFloor(floor);
          }} />
        ) : (
          <select className="skill-floor" aria-label="自动召唤楼层" value={autoFloor}
            onChange={(e) => setAutoFloor(Number(e.target.value))}>
            {Array.from({ length: state.maxFloorUnlocked }, (_, i) => i + 1).map((f) => (
              <option key={f} value={f}>{f} 层</option>
            ))}
          </select>
        )}
      </span>
      <button className="btn squire-upgrade" onClick={onOpen}>
        <Icon name="level" />
        勇者培养
      </button>
      {state.mode === 'classic' ? (
        <button className="unlock-btn" disabled={!canUnlock} onClick={() => store.dispatch('unlockNextSegment')}>
          <Icon name={canUnlock ? 'unlock' : 'lock'} />
          解锁下一段
        </button>
      ) : (
        <button type="button" className="btn ghost tower-frontier"
          aria-label={`自动推进，前往第 ${state.maxFloorUnlocked} 层`}
          onClick={() => onFocusFloor(state.maxFloorUnlocked)}>
          <Icon name="flag" />
          <span className="skill-copy">
            <span>自动推进</span>
            <span>前线 {state.maxFloorUnlocked}</span>
          </span>
        </button>
      )}
    </div>
    </div>
  );
}

function AutoFloorInput({ floor, max, onCommit }: { floor: number; max: number; onCommit: (floor: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" className="skill-floor skill-floor-input" inputMode="numeric" min={1} max={max} step={1}
      aria-label="自动召唤楼层" value={draft ?? floor} onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const next = Number(draft);
        setDraft(null);
        if (Number.isSafeInteger(next) && next >= 1 && next <= max) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }} />
  );
}

function OfflineReward() {
  const snap = useGame();
  const reward = snap.state.lastOfflineReward;
  return (
    <div className="overlay">
      <div className="panel" role="dialog" aria-modal="true" aria-label="离线收益">
        <div className="panel-body">
          <h2 className="panel-title"><Icon name="clock" />离线收益</h2>
          <div className="row">
            你离开期间共获得 <b style={{ color: '#d9ad64' }}>{reward?.gold.toLocaleString() ?? 0}</b> 金币（
            {Math.floor((reward?.seconds ?? 0) / 60)} 分钟）
          </div>
          <div className="row">
            <button className="btn" onClick={() => store.ackOffline()}>
              <Icon name="gift" />领取
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
