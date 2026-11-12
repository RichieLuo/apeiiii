import { useRef, useState } from 'react';
import { useGame } from './useGame';
import { store } from '../platform/store';
import { HEROES, HERO_ORDER } from '../game/data/heroes';
import { BALANCE, heroUpgradeCost, squireUpgradeCost } from '../game/data/economy';
import { squireStatsOf, isFloorCleared, canAscendHero } from '../game/core/state';
import type { EquipmentInstance, EquipmentSlot, GameMode, GemType } from '../game/core/types';
import { GEMS, GEM_ORDER, gemEffectValue } from '../game/data/gems';
import { EQUIPMENT_TEMPLATES, RARITY_NAMES, RARITY_COLORS, RARITY_ORDER } from '../game/data/equipment';
import { QUESTS, ACHIEVEMENTS } from '../game/data/quests';
import { exportSave, validateImport } from '../platform/db';
import { CloudError } from '../platform/cloud';
import { realAssetUrl } from '../game/render/assets';
import { Icon } from './Icon';

// —— 勇者培养 ——
export function SummonPanel() {
  const snap = useGame();
  const s = snap.state.summon;
  const stats = squireStatsOf(snap.state);
  const [goldTarget, setGoldTarget] = useState(String(snap.state.goldFloor ?? (snap.state.highestClearedFloor || 1)));
  const [goldMessage, setGoldMessage] = useState('');
  const rows = [
    { key: 'attack', icon: 'sword', name: '攻击', val: stats.atk, level: s.attackLevel },
    { key: 'hp', icon: 'heart', name: '生命', val: stats.hp, level: s.hpLevel },
    { key: 'stock', icon: 'pack', name: '库存上限', val: s.inventoryMax, level: s.stockLevel },
    { key: 'regen', icon: 'loop', name: '恢复速度', val: `${s.regenPerSec.toFixed(2)}/s`, level: s.regenLevel },
    { key: 'alive', icon: 'users', name: '存活上限', val: s.aliveMax, level: s.aliveLevel },
  ] as const;
  return (
    <div>
      <h2 className="panel-title"><Icon name="helmet" />勇者培养</h2>
      {rows.map((r) => {
        const cost = squireUpgradeCost(r.level);
        return (
          <div className="row" key={r.key}>
            <span className="panel-label panel-stat-label"><Icon name={r.icon} />{r.name}</span>
            <span className="panel-stat-value">{r.val}</span>
            <button
              className="btn"
              aria-label={`${r.name}升级（${cost} 金）`}
              onClick={() => store.dispatch('upgradeSquire', r.key)}
              disabled={snap.state.resources.gold < cost}
            >
              <Icon name="up" />升级（{cost} 金）
            </button>
          </div>
        );
      })}
      <hr style={{ borderColor: '#3a4a58', margin: '12px 0' }} />
      <div className="row">
        <label className="toggle">
          <input type="checkbox" checked={s.autoEnabled} onChange={(e) => store.dispatch('setAutoSummon', e.target.checked, s.autoTargetFloor ?? 1)} />
          <span className="toggle-track" aria-hidden="true" />
          <Icon name="loop" />自动召唤
        </label>
      </div>
      <div className="row">
        <span className="panel-label panel-stat-label"><Icon name="coin" />刷金楼层</span>
        {snap.state.highestClearedFloor <= 300 ? <select
          aria-label="刷金楼层"
          value={snap.state.goldFloor ?? ''}
          onChange={(e) => store.dispatch('setGoldFloor', e.target.value === '' ? null : Number(e.target.value))}
          style={{ background: '#233342', color: '#e9e1cf', border: '1px solid #3a4a58', borderRadius: 6 }}
        >
          <option value="">关闭刷金</option>
          {Array.from({ length: snap.state.highestClearedFloor }, (_, i) => i + 1).filter((f) => isFloorCleared(snap.state, f)).map((f) => (
            <option key={f} value={f}>
              第 {f} 层
            </option>
          ))}
        </select> : <>
          <input aria-label="刷金楼层" type="number" inputMode="numeric" min={1}
            max={snap.state.highestClearedFloor} step={1} value={goldTarget}
            onChange={(event) => setGoldTarget(event.target.value)} style={{ width: 110 }} />
          <button className="btn" onClick={() => {
            const result = store.dispatch('setGoldFloor', Number(goldTarget));
            setGoldMessage(result.ok ? '已设置刷金楼层' : result.reason ?? '无法设置');
          }}><Icon name="check" />设置</button>
          <button className="btn ghost" onClick={() => {
            store.dispatch('setGoldFloor', null);
            setGoldMessage('已关闭刷金');
          }}><Icon name="pause" />关闭刷金</button>
        </>}
      </div>
      {goldMessage && <p role="status">{goldMessage}</p>}
    </div>
  );
}

export function HeroRoleBadge({ melee }: { melee: boolean }) {
  return <span className={`hero-role ${melee ? 'melee' : 'ranged'}`}>
    <Icon name={melee ? 'sword' : 'bow'} />{melee ? '近战' : '远程'}
  </span>;
}

// —— 英雄召唤顺序 ——
export function HeroOrderPanel() {
  const { state } = useGame();
  const [message, setMessage] = useState('');
  const order = state.heroOrder;
  const active = order.filter((id) => state.heroes[id]?.owned && state.heroes[id].enabled);
  const meleeFirst = [...order.filter((id) => HEROES[id].melee), ...order.filter((id) => !HEROES[id].melee)];

  const saveOrder = (nextOrder: string[], confirmation: string) => {
    const result = store.dispatch('setHeroOrder', nextOrder);
    setMessage(result.ok ? confirmation : result.reason ?? '无法调整召唤顺序');
  };

  const move = (index: number, to: number) => {
    const next = [...active];
    const [id] = next.splice(index, 1);
    next.splice(to, 0, id);
    const activeIds = new Set(active);
    let i = 0;
    saveOrder(order.map((entry) => activeIds.has(entry) ? next[i++] : entry), `${HEROES[id].shortName}已移到第 ${to + 1} 位`);
  };

  return (
    <div className="hero-order-panel">
      <h2 className="panel-title"><Icon name="list" />英雄召唤顺序</h2>
      <p className="hero-order-note">靠前的英雄优先出场和复活，入口拥挤时等待空位。已出战的英雄会在脱离交战后调整站位。</p>
      <div className="hero-order-tools">
        <span className="panel-label"><Icon name="users" />{active.length} 名英雄已启用</span>
        <button type="button" className="btn ghost" disabled={meleeFirst.every((id, index) => id === order[index])}
          onClick={() => saveOrder(meleeFirst, '已按近战优先排列')}><Icon name="sword" />近战优先</button>
      </div>
      {active.length === 0 ? <p className="empty">在英雄详情中启用英雄，即可安排出场顺序。</p> : (
        <ol className="hero-order-list" role="list" aria-label="已启用英雄的召唤顺序">
          {active.map((id, index) => {
            const hero = HEROES[id];
            return (
              <li key={id} className="hero-order-entry">
                <span className="hero-order-rank" aria-hidden="true">{index + 1}</span>
                <span className="hero-order-name"><strong>{hero.shortName}</strong><HeroRoleBadge melee={hero.melee} /></span>
                <span className="hero-order-actions">
                  <button type="button" className="btn ghost" aria-label={`上移${hero.shortName}`}
                    disabled={index === 0} onClick={() => move(index, index - 1)}><Icon name="up" />上移</button>
                  <button type="button" className="btn ghost" aria-label={`下移${hero.shortName}`}
                    disabled={index === active.length - 1} onClick={() => move(index, index + 1)}><Icon name="down" />下移</button>
                  <button type="button" className="btn ghost" aria-label={`将${hero.shortName}移到首位`}
                    disabled={index === 0} onClick={() => move(index, 0)}><Icon name="top" />置首</button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="sr-only" role="status">{message}</p>
    </div>
  );
}

// —— 英雄详情 ——
export function HeroPanel({ heroId }: { heroId: string }) {
  const snap = useGame();
  const hero = snap.state.heroes[heroId];
  const cfg = HEROES[heroId];
  if (!hero || !hero.owned) return <div>
    <h2 className="panel-title"><Icon name="helmet" />{cfg.name} · {cfg.title}</h2>
    <HeroRoleBadge melee={cfg.melee} />
    {realAssetUrl(cfg.spriteId) && <img className="hero-detail-art" src={'./' + realAssetUrl(cfg.spriteId)} alt={cfg.name} />}
    <p>{cfg.desc}</p><p>{cfg.skillDesc}</p>
    <div className="empty"><span className="panel-label"><Icon name="lock" />可在招募中获得该英雄</span></div>
  </div>;
  const cost = heroUpgradeCost(hero.level, cfg.upgradeCostBase);
  const atLevelCap = snap.state.mode === 'classic' && hero.level >= BALANCE.heroMaxLevel;
  const shards = snap.state.resources.soulShards[heroId] ?? 0;
  const starCost = hero.star < BALANCE.heroMaxStar ? BALANCE.starCosts[hero.star] : 0;
  return (
    <div>
      <h2 className="panel-title"><Icon name="helmet" />{cfg.name} · {cfg.title}</h2>
      <HeroRoleBadge melee={cfg.melee} />
      <div className="row" style={{ color: '#9aa7b0', fontSize: 13 }}>{cfg.desc}</div>
      <div className="row">
        <span className="panel-label"><Icon name="level" />等级 {hero.level}</span>
        <span className="panel-label"><Icon name="spark" />星级 {hero.star}</span>
        <span>{cfg.skillDesc}</span>
      </div>
      <div className="row">
        <button className="btn" onClick={() => store.dispatch('upgradeHero', heroId, 1)} disabled={atLevelCap || snap.state.resources.gold < cost}>
          <Icon name="up" />升 1 级（{cost} 金）
        </button>
        <button className="btn" onClick={() => store.dispatch('upgradeHero', heroId, 10)} disabled={atLevelCap || snap.state.resources.gold < cost}>
          <Icon name="top" />升 10 级
        </button>
        <button
          className="btn"
          onClick={() => store.dispatch('ascendHero', heroId)}
          disabled={!canAscendHero(snap.state, heroId)}
        >
          <Icon name="spark" />升星（{hero.star >= BALANCE.heroMaxStar ? '已满' : `${starCost} 英魂`}）
        </button>
        <button className="btn ghost" onClick={() => store.dispatch('setHeroEnabled', heroId, !hero.enabled)}>
          <Icon name={hero.enabled ? 'pause' : 'play'} />{hero.enabled ? '停用' : '启用'}
        </button>
      </div>
      <div className="row" style={{ color: '#9aa7b0' }}>
        <span className="panel-label"><Icon name="spark" />英魂 {shards}</span>
      </div>
    </div>
  );
}

// —— 宝石 ——
const GEM_ICONS = {
  attack: 'sword', health: 'heart', defense: 'shield', haste: 'bolt', critical: 'spark', gold: 'coin',
} as const;

function GemIcon({ type }: { type: GemType }) {
  const gem = GEMS[type];
  const asset = realAssetUrl(gem.iconId);
  return asset ? <img className="gem-icon" src={'./' + asset} alt="" /> : (
    <span className="gem-icon" style={{ color: gem.color }}><Icon name={GEM_ICONS[type]} /></span>
  );
}

export function GemPanel() {
  const snap = useGame();
  const board = snap.state.gemBoard;
  const unlockedSlots = BALANCE.gemBoardInitialSlots + BALANCE.gemBoardUnlockFloors.filter((f) => snap.state.highestClearedFloor >= f).length;
  const [selGem, setSelGem] = useState<string | null>(null);
  const backpack = useRef<HTMLDivElement>(null);

  const emptySlot = board.findIndex((gem, i) => !gem && i < unlockedSlots);
  const selectedGem = snap.state.gems.find((gem) => gem.id === selGem);

  return (
    <div>
      <h2 className="panel-title"><Icon name="gem" />宝石（全队共享）</h2>
      <div className="slot-grid">
        {board.map((gem, i) => {
          if (gem) {
            const config = GEMS[gem.type];
            return (
              <button
                type="button"
                key={i}
                className="gem-slot filled"
                style={{ borderColor: config.color, background: config.color + '22' }}
                aria-label={`卸下第 ${i + 1} 槽的 ${config.name} Lv${gem.level}`}
                title={`卸下${config.name}`}
                onClick={(event) => {
                  const result = store.dispatch('unequipGem', i);
                  if (result.ok && event.detail === 0) backpack.current?.focus();
                }}
              >
                <GemIcon type={gem.type} />
                <span>Lv{gem.level}</span>
              </button>
            );
          }
          const unlockFloor = i >= unlockedSlots ? BALANCE.gemBoardUnlockFloors[i - BALANCE.gemBoardInitialSlots] : null;
          return (
            <div key={i} className={`gem-slot${unlockFloor ? ' locked' : ''}`}>
              <Icon name={unlockFloor ? 'lock' : 'plus'} />
              <span>{unlockFloor ? <>{unlockFloor} 层<span className="sr-only">解锁</span></> : '空槽'}</span>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ fontSize: 12, color: '#9aa7b0' }}>
        <span className="panel-label"><Icon name="grid" />已装备 {board.filter(Boolean).length}/{unlockedSlots} 槽</span>
      </div>

      <h2 className="panel-title" style={{ fontSize: 15, marginTop: 16 }}><Icon name="pack" />背包</h2>
      <div ref={backpack} className="gem-backpack" role="group" aria-label="宝石背包" tabIndex={-1}>
        {snap.state.gems.length === 0 ? (
          <p className="gem-backpack-empty">背包暂无宝石</p>
        ) : snap.state.gems.map((gem) => {
          const config = GEMS[gem.type];
          const selected = selectedGem?.id === gem.id;
          return (
            <button
              type="button"
              key={gem.id}
              className={`gem-backpack-item${selected ? ' selected' : ''}`}
              aria-label={`${config.name} Lv${gem.level}${gem.locked ? '（已锁定）' : ''}`}
              aria-pressed={selected}
              onClick={() => setSelGem(selected ? null : gem.id)}
            >
              <GemIcon type={gem.type} />
              <span>{config.name}</span>
              <span className="gem-backpack-level">Lv{gem.level}</span>
              {gem.locked && <span className="gem-backpack-lock" aria-hidden="true"><Icon name="lock" /></span>}
              {selected && <span className="gem-backpack-check" aria-hidden="true"><Icon name="check" /></span>}
            </button>
          );
        })}
      </div>
      <div className="row">
        <span className="gem-backpack-hint" role="status">
          {emptySlot < 0 ? '宝石槽已满，请先卸下一颗宝石' : selectedGem ? `已选择 ${GEMS[selectedGem.type].name} Lv${selectedGem.level}` : '点击宝石方格选择'}
        </span>
        <button
          className="btn"
          disabled={!selectedGem || emptySlot < 0}
          onClick={() => {
            if (selectedGem && store.dispatch('equipGem', selectedGem.id, emptySlot).ok) {
              setSelGem(null);
            }
          }}
        >
          <Icon name="plus" />装备到空槽
        </button>
      </div>
      <div className="row" style={{ fontSize: 12, color: '#9aa7b0' }}>
        {GEM_ORDER.map((t) => {
          const count = snap.state.gems.filter((g) => g.type === t && !g.locked).length;
          const maxFuse = count >= 3 ? '可合成' : `${count}/3`;
          return (
            <button key={t} className="btn ghost" style={{ fontSize: 12 }} disabled={count < 3} onClick={() => store.dispatch('fuseGems', t)}>
              <GemIcon type={t} />{GEMS[t].name} {maxFuse}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ fontSize: 12, color: '#9aa7b0' }}>
        宝石效果：攻击 +{Math.round(gemEffectValue('attack', 1) * 100)}% · 生命 +{Math.round(gemEffectValue('health', 1) * 100)}% · 防御 +{gemEffectValue('defense', 1)} · 急速 +{Math.round(gemEffectValue('haste', 1) * 100)}% · 暴击 +{gemEffectValue('critical', 1)}pp · 金币 +{Math.round(gemEffectValue('gold', 1) * 100)}%（1 级）
      </div>
    </div>
  );
}

// —— 招募 ——
export function RecruitPanel() {
  const snap = useGame();
  const r = snap.state.resources;
  const unowned = HERO_ORDER.filter((id) => !snap.state.heroes[id].owned);
  return (
    <div>
      <h2 className="panel-title"><Icon name="ticket" />招募英雄</h2>
      <div className="row">
        <span className="panel-label"><Icon name="ticket" />招募券 {r.recruitTickets}（可用金币兑换）</span>
      </div>
      <div className="row">
        <button className="btn" onClick={() => store.dispatch('recruit')} disabled={r.recruitTickets < 1}>
          <Icon name="users" />招募（消耗 1 券）
        </button>
        <button className="btn ghost" onClick={() => store.dispatch('buyRecruitTicket')}>
          <Icon name="coin" />金币购买招募券
        </button>
      </div>
      <div className="row" style={{ fontSize: 12, color: '#9aa7b0' }}>
        {unowned.length > 0 ? `还有 ${unowned.length} 名英雄待招募，接下来依次获得：${unowned.slice(0, 3).map((id) => HEROES[id].shortName).join('、')}${unowned.length > 3 ? '…' : ''}` : '已集齐全部英雄，重复招募转化为英魂'}
      </div>
    </div>
  );
}

// —— 装备 ——
const EQUIPMENT_SLOTS = {
  weapon: { name: '武器', icon: 'sword' },
  armor: { name: '护具', icon: 'armor' },
  trinket: { name: '饰品', icon: 'amulet' },
} as const;

const EQUIPMENT_STATS = [
  { key: 'atkBonus', name: '攻击', icon: 'sword' },
  { key: 'hpBonus', name: '生命', icon: 'heart' },
  { key: 'defBonus', name: '防御', icon: 'shield' },
] as const;

function equipmentName(equipment: EquipmentInstance) {
  return EQUIPMENT_TEMPLATES[equipment.templateId]?.name
    ?? `${RARITY_NAMES[equipment.rarity]}${EQUIPMENT_SLOTS[equipment.slot].name}`;
}

function EquipmentBonuses({ equipment }: { equipment: EquipmentInstance }) {
  return <span className="equipment-stats">
    {EQUIPMENT_STATS.filter(({ key }) => equipment[key] !== 0).map(({ key, name, icon }) => (
      <span className="panel-label" key={key}><Icon name={icon} />{name} +{equipment[key]}</span>
    ))}
  </span>;
}

export function EquipmentPanel({ heroId, onSelectHero }: { heroId: string; onSelectHero: (heroId: string) => void }) {
  const snap = useGame();
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot>('weapon');
  const [message, setMessage] = useState('');
  const list = snap.state.equipment;
  const ownedHeroes = HERO_ORDER.filter((id) => snap.state.heroes[id].owned);
  const selectedHeroId = ownedHeroes.find((id) => id === heroId) ?? ownedHeroes[0];
  const hero = snap.state.heroes[selectedHeroId];
  if (!hero) return <div><h2 className="panel-title"><Icon name="armor" />英雄装备</h2><p className="empty">先招募一名英雄，即可为其穿戴装备。</p></div>;
  const heroName = HEROES[selectedHeroId].shortName;
  const currentEquipment = list.find((equipment) => equipment.id === hero[selectedSlot]);
  const available = list.filter((equipment) => equipment.slot === selectedSlot).sort((a, b) =>
    Number(b.id === hero[selectedSlot]) - Number(a.id === hero[selectedSlot])
    || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));

  const equip = (equipment: EquipmentInstance) => {
    const previousOwner = equipment.equippedBy && equipment.equippedBy !== selectedHeroId
      ? HEROES[equipment.equippedBy]?.shortName : null;
    const result = store.dispatch('equipToHero', selectedHeroId, equipment.id);
    setMessage(result.ok
      ? `${heroName}已穿戴${equipmentName(equipment)}${previousOwner ? `，已从${previousOwner}身上取下` : ''}${currentEquipment ? '，原装备已放回背包' : ''}。`
      : result.reason ?? '暂时无法穿戴');
  };

  return (
    <div className="equipment-panel">
      <h2 className="panel-title"><Icon name="armor" />英雄装备</h2>
      <div className="equipment-hero-picker">
        <label htmlFor="equipment-hero">为谁穿戴</label>
        <select id="equipment-hero" value={selectedHeroId} onChange={(event) => {
          onSelectHero(event.target.value);
          setMessage('');
        }}>
          {ownedHeroes.map((id) => <option key={id} value={id}>{HEROES[id].shortName}</option>)}
        </select>
        <HeroRoleBadge melee={HEROES[selectedHeroId].melee} />
      </div>
      <p className="equipment-help">选择下方槽位，再挑选装备。每件装备只能由一名英雄穿戴，更换后旧装备回到背包。</p>
      <h3 className="equipment-section-title">{heroName}当前穿戴</h3>
      <div className="equipment-slots" role="group" aria-label="选择装备槽位">
        {(Object.keys(EQUIPMENT_SLOTS) as EquipmentSlot[]).map((key) => {
          const slot = EQUIPMENT_SLOTS[key];
          const equipment = list.find((item) => item.id === hero[key]);
          const count = list.filter((item) => item.slot === key).length;
          return <button type="button" className="equipment-slot" key={key} aria-pressed={selectedSlot === key}
            aria-label={`${slot.name}：${equipment ? equipmentName(equipment) : '未穿戴'}，共 ${count} 件，查看可选${slot.name}`}
            onClick={() => { setSelectedSlot(key); setMessage(''); }}>
            <span className="panel-label"><Icon name={slot.icon} />{slot.name}</span>
            <strong style={{ color: equipment ? RARITY_COLORS[equipment.rarity] : undefined }}>{equipment ? equipmentName(equipment) : '未穿戴'}</strong>
            {equipment && <EquipmentBonuses equipment={equipment} />}
            <span className="equipment-slot-count">{count > 0 ? `共 ${count} 件` : '暂无装备'}</span>
          </button>;
        })}
      </div>
      <p className="equipment-feedback" role="status">{message}</p>
      <div className="equipment-inventory-heading">
        <h3 className="equipment-section-title">{EQUIPMENT_SLOTS[selectedSlot].name}列表</h3>
        <span>共 {available.length} 件</span>
      </div>
      {available.length > 0 && <p className="equipment-help">下方显示装备加成，以及换装后相对当前{EQUIPMENT_SLOTS[selectedSlot].name}的加成变化。</p>}
      <div className="equipment-inventory">
        {available.map((equipment) => {
          const equipped = hero[selectedSlot] === equipment.id;
          const owner = equipment.equippedBy ? HEROES[equipment.equippedBy]?.shortName : null;
          const changes = EQUIPMENT_STATS.map((stat) => ({ ...stat, delta: equipment[stat.key] - (currentEquipment?.[stat.key] ?? 0) }))
            .filter(({ delta }) => delta !== 0);
          return <div className={`equipment-item${equipped ? ' is-equipped' : ''}`} key={equipment.id}>
            <div className="equipment-item-copy">
              <div className="equipment-item-heading">
                <strong className="panel-label" style={{ color: RARITY_COLORS[equipment.rarity] }}>
                  <Icon name={EQUIPMENT_SLOTS[equipment.slot].icon} />{equipmentName(equipment)}
                </strong>
                <span className={`equipment-owner${equipped ? ' is-current' : ''}`}>{equipped ? '当前穿戴' : owner ? `${owner}穿戴中` : '背包中'}</span>
              </div>
              <EquipmentBonuses equipment={equipment} />
              {!equipped && <div className="equipment-comparison">
                <span>换装加成变化</span>
                {changes.length === 0 ? <span>属性相同</span> : changes.map(({ key, name, delta }) => (
                  <span className={delta > 0 ? 'increase' : 'decrease'} key={key}>{name} {delta > 0 ? '+' : ''}{delta}</span>
                ))}
              </div>}
            </div>
            <button type="button" className={`btn${equipped ? ' ghost' : ''}`} disabled={equipped}
              aria-label={equipped ? `${equipmentName(equipment)}已由${heroName}穿戴` : `${owner ? `从${owner}转给` : '为'}${heroName}穿戴${equipmentName(equipment)}`}
              onClick={() => equip(equipment)}>
              <Icon name={equipped ? 'check' : 'plus'} />{equipped ? '已穿戴' : owner ? `转给${heroName}` : currentEquipment ? '更换' : '穿戴'}
            </button>
          </div>;
        })}
      </div>
      {available.length === 0 && <div className="equipment-empty">
        <Icon name="pack" />
        <strong>还没有{EQUIPMENT_SLOTS[selectedSlot].name}</strong>
        <span>首次通关每 10 层的关口，会随机获得一件武器、护具或饰品。</span>
      </div>}
    </div>
  );
}

// —— 任务与成就 ——
const QUEST_ICONS = {
  summon_count: 'helmet', upgrade_count: 'up', recruit_count: 'ticket', gem_equip_count: 'gem',
  gem_fuse_count: 'spark', boss_kill_count: 'shield', max_floor: 'tower', kill_count: 'sword', gold_earned: 'coin',
} as const;

export function QuestPanel() {
  const snap = useGame();
  const [tab, setTab] = useState<'quest' | 'achieve'>('quest');
  const entries = tab === 'quest' ? QUESTS : ACHIEVEMENTS;
  const progress = tab === 'quest' ? snap.state.quests : snap.state.achievements;
  const claim = tab === 'quest' ? 'claimQuest' : 'claimAchievement';
  return (
    <div>
      <h2 className="panel-title"><Icon name="scroll" />任务与成就</h2>
      <div className="row" role="group" aria-label="任务分类">
        <button className={`btn ${tab === 'quest' ? '' : 'ghost'}`} aria-pressed={tab === 'quest'} onClick={() => setTab('quest')}>
          <Icon name="scroll" />任务
        </button>
        <button className={`btn ${tab === 'achieve' ? '' : 'ghost'}`} aria-pressed={tab === 'achieve'} onClick={() => setTab('achieve')}>
          <Icon name="trophy" />成就
        </button>
      </div>
      {entries.map((entry) => {
        const state = progress[entry.id];
        if (!state) return null;
        const value = Math.min(state.progress, entry.target);
        const ready = !state.claimed && value >= entry.target;
        return (
          <div className="quest-row" key={entry.id}>
            <div className="quest-copy">
              <span className="panel-label"><Icon name={QUEST_ICONS[entry.metric]} />{entry.name}</span>
              <span className="quest-progress">{value}/{entry.target}</span>
              <progress className="quest-meter" aria-label={`${entry.name}进度`} max={entry.target} value={value} />
            </div>
            <button className={`btn quest-claim ${ready ? 'is-ready' : 'ghost'}`} disabled={!ready}
              aria-label={`${state.claimed ? '已领取' : '领取'}${entry.name}奖励`} onClick={() => store.dispatch(claim, entry.id)}>
              <Icon name={state.claimed ? 'check' : ready ? 'gift' : 'lock'} />{state.claimed ? '已领取' : '领取'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// —— 据点 ——
const SITES = [
  { id: 'gold_mine', name: '金币矿井', desc: '持续产出金币', icon: 'pickaxe' },
  { id: 'dust_workshop', name: '粉尘工坊', desc: '持续产出强化粉尘', icon: 'flask' },
  { id: 'crystal_prospect', name: '晶石勘探点', desc: '持续产出晶钻', icon: 'gem' },
] as const;

export function StrongholdPanel() {
  const snap = useGame();
  const unlocked = snap.state.highestClearedFloor >= BALANCE.strongholdUnlockFloor;
  if (!unlocked) return <div>
    <h2 className="panel-title"><Icon name="tower" />据点</h2>
    <div className="empty"><span className="panel-label"><Icon name="lock" />第 {BALANCE.strongholdUnlockFloor} 层首通后解锁</span></div>
  </div>;
  return (
    <div>
      <h2 className="panel-title"><Icon name="tower" />据点（本地经营）</h2>
      <div className="row" style={{ fontSize: 12, color: '#9aa7b0' }}>页面显示为本地据点经营，不虚构在线玩家动态。</div>
      {SITES.map((s) => {
        const site = snap.state.stronghold.sites[s.id];
        return (
          <div className="quest-row" key={s.id}>
            <div style={{ flex: 1 }}>
              <span className="panel-label"><Icon name={s.icon} />{s.name} · {s.desc}</span>
              <div className="quest-progress panel-label">
                <Icon name={site?.conquered ? 'clock' : 'lock'} />{site?.conquered ? `累积 ${Math.floor(site.stored)}` : '未占领'}
              </div>
            </div>
            {site?.conquered ? (
              <button className="btn" onClick={() => store.dispatch('collectStronghold', s.id)}>
                <Icon name="gift" />领取
              </button>
            ) : (
              <button className="btn" onClick={() => store.dispatch('conquerStronghold', s.id)}>
                <Icon name="sword" />挑战守卫
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// —— 训练竞技场 ——
export function ArenaPanel() {
  const snap = useGame();
  const unlocked = snap.state.highestClearedFloor >= BALANCE.arenaUnlockFloor;
  return (
    <div>
      <h2 className="panel-title"><Icon name="trophy" />训练竞技场</h2>
      {unlocked ? (
        <div>
          <div className="row" style={{ fontSize: 13 }}>
            <span className="panel-label"><Icon name="trophy" />本地 AI 训练对手，胜场 {snap.state.arena.wins}（今日 {snap.state.arena.dailyWins}）</span>
          </div>
          <div className="empty">训练对战为本地 AI 阵容，不显示伪造真人排名。</div>
        </div>
      ) : (
        <div className="empty"><span className="panel-label"><Icon name="lock" />第 {BALANCE.arenaUnlockFloor} 层首通后解锁</span></div>
      )}
    </div>
  );
}

// —— 设置 ——
export function SettingsPanel() {
  const snap = useGame();
  const s = snap.state.settings;
  const [msg, setMsg] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  return (
    <div>
      <h2 className="panel-title"><Icon name="settings" />设置</h2>
      <div className="row">
        <label className="panel-label" htmlFor="game-mode"><Icon name="tower" />游戏模式</label>
        <select id="game-mode" value={snap.state.mode} onChange={(event) => {
          const result = store.dispatch('setMode', event.target.value as GameMode);
          setMsg(result.ok ? '模式已保存' : result.reason ?? '无法切换模式');
        }}>
          <option value="endless">无限模式</option>
          <option value="classic" disabled={snap.state.maxFloorUnlocked > BALANCE.floorsTotal}>经典 300 层</option>
        </select>
      </div>
      <p style={{ fontSize: 13, color: '#9aa7b0' }}>
        {snap.state.mode === 'endless' ? '每十层通关后自动开放下一段，持续向上挑战。' : '每十层通关后手动解锁下一段，最高 300 层。'}
      </p>
      <div className="row">
        <label className="toggle">
          <input type="checkbox" checked={s.mute} onChange={(e) => store.dispatch('setSetting', 'mute', e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          <Icon name={s.mute ? 'mute' : 'sound'} />静音
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.reduceFx} onChange={(e) => store.dispatch('setSetting', 'reduceFx', e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          <Icon name="spark" />减少动态效果
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.reduceNumbers} onChange={(e) => store.dispatch('setSetting', 'reduceNumbers', e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          <Icon name="sword" />减少伤害数字
        </label>
      </div>
      <hr style={{ borderColor: '#3a4a58', margin: '12px 0' }} />
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            const blob = new Blob([exportSave(snap.state)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `晶塔远征存档_v${snap.state.schemaVersion}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Icon name="download" />导出存档
        </button>
        <button type="button" className="btn ghost" onClick={() => importInput.current?.click()}>
          <Icon name="upload" />导入存档
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            e.currentTarget.value = '';
            let json: unknown;
            try {
              json = JSON.parse(await file.text());
            } catch {
              setMsg('无法读取 JSON 存档');
              return;
            }
            const res = validateImport(json);
            if (!res.ok || !res.state) {
              setMsg(res.reason ?? '导入失败');
              return;
            }
            store.importState(res.state);
            setMsg('导入成功');
          }}
        />
      </div>
      <div className="row" role="status" style={{ fontSize: 12, color: '#9aa7b0' }}>{msg}</div>
      <CloudSettings />
    </div>
  );
}

const CLOUD_STATUS = {
  pending: '正在同步',
  synced: '已同步',
  offline: '暂时无法同步，已保留本机进度',
  conflict: '另一设备已更新云存档。可先导出本机进度，再载入云端进度。',
  expired: '会话已过期，请重新登录。',
};

const CLOUD_STATUS_ICONS = {
  pending: 'loop', synced: 'check', offline: 'cloud', conflict: 'lock', expired: 'clock',
} as const;

function CloudSettings() {
  const { cloud } = useGame();
  const [username, setUsername] = useState(cloud?.username ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await task();
      setPassword('');
    } catch (error) {
      if (!(error instanceof CloudError)) setMessage('云存档服务暂时无法连接');
      else if (error.code === 'invalid_save') setMessage('云端存档格式无效，请保留本机进度');
      else if (error.status === 401) setMessage('账号、密码或登录状态无效');
      else if (error.status === 409) setMessage('账号已存在，请直接登录');
      else if (error.status === 400) setMessage('账号需为 3–32 位字母、数字、下划线或短横线，密码至少 8 位');
      else if (error.status === 429) setMessage('尝试次数过多，请稍后再试');
      else setMessage('云存档服务暂时无法连接');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cloud-panel" aria-labelledby="cloud-heading">
      <h3 id="cloud-heading" className="panel-title"><Icon name="cloud" />云存档</h3>
      {cloud && <p role="status" className="panel-label"><Icon name={CLOUD_STATUS_ICONS[cloud.status]} />{cloud.username} · {CLOUD_STATUS[cloud.status]}</p>}
      {(!cloud || cloud.status === 'expired') && (
        <form onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const action = submitter?.getAttribute('value') === 'register' ? 'register' : 'login';
          void run(() => store.authenticate(action, username, password));
        }}>
          <p>注册时保存当前进度。登录后可在其他设备继续游戏。</p>
          <div className="cloud-fields">
            <label>
              账号
              <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={32} />
            </label>
            <label>
              密码
              <input name="password" autoComplete="current-password" type="password" value={password}
                onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} />
            </label>
          </div>
          <div className="row">
            <button type="submit" className="btn" value="login" disabled={busy}><Icon name="login" />登录</button>
            {!cloud && <button type="submit" className="btn ghost" value="register" disabled={busy}><Icon name="plus" />注册</button>}
          </div>
        </form>
      )}
      {cloud && (
        <div className="row">
          {cloud.status === 'conflict' && (
            <button className="btn" disabled={busy} onClick={() => void run(() => store.reloadCloud())}><Icon name="download" />载入云端进度</button>
          )}
          {cloud.status === 'offline' && (
            <button className="btn" disabled={busy} onClick={() => void run(() => store.save())}><Icon name="loop" />重试同步</button>
          )}
          <button className="btn ghost" disabled={busy} onClick={() => void run(() => store.signOut())}><Icon name="logout" />退出账号</button>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
