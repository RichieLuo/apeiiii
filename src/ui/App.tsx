import { type CSSProperties, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameScene } from '../game/render/GameScene';
import { useGame } from './useGame';
import { store } from '../platform/store';
import { HEROES, HERO_ORDER } from '../game/data/heroes';
import { BALANCE } from '../game/data/economy';
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
            onClick={() => setHeroListOpen((v) => !v)}
          >
            <Icon name={heroListOpen ? 'close' : 'users'} />
            {heroListOpen ? '收起' : '英雄'}
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
          </div>
          {HERO_ORDER.map((id) => {
            const h = state.heroes[id];
            const cfg = HEROES[id];
            const owned = h.owned;
            if (heroFilter !== 'all' && cfg.melee !== (heroFilter === 'melee')) return null;
            return (
              <button
                key={id}
                type="button"
                className={`hero-card ${owned ? 'owned' : ''}`}
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
      <SkillBar state={state} canUnlock={snap.canUnlock.ok} onOpen={() => openPanel('summon')} onFocusFloor={focusFloor} />

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
              {panel === 'equipment' && <EquipmentPanel heroId={selectedHero ?? 'hero_guard'} />}
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

function SkillBar({ state, canUnlock, onOpen, onFocusFloor }: {
  state: ReturnType<typeof useGame>['state'];
  canUnlock: boolean;
  onOpen: () => void;
  onFocusFloor: (floor: number) => void;
}) {
  const a = state.activeSkills;
  const target = state.selectedFloor;
  const autoFloor = state.summon.autoTargetFloor ?? 1;
  const setAutoFloor = (floor: number) => store.dispatch('setAutoSummon', state.summon.autoEnabled, floor);
  const skills = [
    { key: 'battleCry', name: '战意鼓舞', icon: 'horn', cd: a.battleCryCooldown, total: BALANCE.skillBattleCry.cooldown },
    { key: 'lifeEcho', name: '生命回响', icon: 'heart', cd: a.lifeEchoCooldown, total: BALANCE.skillLifeEcho.cooldown },
    { key: 'crystalRain', name: '晶雨打击', icon: 'rain', cd: a.crystalRainCooldown, total: BALANCE.skillCrystalRain.cooldown },
  ] as const;
  return (
    <div className="skill-bar">
      <span className="skill-target">
        <Icon name="target" />
        <span className="skill-copy">
          <span>技能目标</span>
          <strong>{target == null ? '未选楼层' : `第 ${target} 层`}</strong>
        </span>
      </span>
      {skills.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`skill-btn skill-${s.key}${s.cd <= 0 && target != null ? ' is-ready' : ''}`}
          disabled={s.cd > 0 || target == null}
          onClick={() => target != null && store.dispatch('useActiveSkill', s.key, target)}
        >
          <span className="skill-emblem" aria-hidden="true"
            style={{ '--skill-charge': `${target == null && s.cd <= 0 ? 0 : 100 * (1 - Math.min(1, s.cd / s.total))}%` } as CSSProperties}>
            <Icon name={s.icon} />
          </span>
          <span className="skill-copy">
            <span>{s.name}</span>
            <span className="skill-cd">{s.cd > 0 ? `${Math.ceil(s.cd)}s` : target == null ? '待选目标' : '就绪'}</span>
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
