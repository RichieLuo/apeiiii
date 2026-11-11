// 无头数值模拟 —— 评估推进、金币产出、升级成本与 Boss 时长。
// 运行：npm run sim
import { createNewGame, isFloorCleared } from '../src/game/core/state';
import { Simulation } from '../src/game/core/simulation';
import { HEROES, HERO_ORDER } from '../src/game/data/heroes';
import { BALANCE, heroUpgradeCost } from '../src/game/data/economy';

function run(seed: number, seconds: number) {
  const state = createNewGame(seed);
  const sim = new Simulation(state);

  const log: { t: number; floor: number; gold: number; heroes: number; label: string }[] = [];

  for (let t = 0; t < seconds; t++) {
    for (let i = 0; i < 20; i++) sim.step(1 / 20);

    // 每 10 秒做一次"玩家"决策
    if (t % 10 === 0) {
      // 自动召唤目标：最低未首通的已解锁层（跟随最前线，自下而上推进）
      let target = 1;
      for (let f = Math.max(1, state.maxFloorUnlocked - BALANCE.floorsPerGate + 1); f <= state.maxFloorUnlocked; f++) {
        if (!isFloorCleared(state, f)) {
          target = f;
          break;
        }
      }
      sim.setAutoSummon(true, target);

      // 解锁下一段
      if (sim.canUnlockNextSegment().ok) sim.unlockNextSegment();

      // 升级英雄（逐个升到可负担）
      for (const id of HERO_ORDER) {
        const h = state.heroes[id];
        if (!h.owned) continue;
        const cfg = HEROES[id];
        const cost = heroUpgradeCost(h.level, cfg.upgradeCostBase);
        while (state.resources.gold >= cost && h.level < 40) {
          sim.upgradeHero(id, 1);
          if (state.resources.gold < heroUpgradeCost(h.level, cfg.upgradeCostBase)) break;
        }
      }
      // 升级勇者
      for (const cat of ['attack', 'hp', 'stock'] as const) {
        sim.upgradeSquire(cat);
      }

      // 招募
      if (state.resources.recruitTickets > 0) sim.recruit();
    }

    if (t % 30 === 0) {
      log.push({
        t,
        floor: state.highestClearedFloor,
        gold: state.resources.gold,
        heroes: HERO_ORDER.filter((id) => state.heroes[id].owned).length,
        label: `t=${t}s`,
      });
    }
  }

  return log;
}

console.log('晶塔远征 · 数值模拟（自动玩家）');
console.log('='.repeat(64));
console.log('时间    | 最高首通层 | 金币      | 已招募英雄');
console.log('-'.repeat(64));
for (const row of run(42, 600)) {
  console.log(
    `${String(row.t).padEnd(7)} | ${String(row.floor).padEnd(11)} | ${String(Math.floor(row.gold)).padEnd(9)} | ${row.heroes}`,
  );
}

// 关键指标
const log = run(42, 1800);
const twoMin = log.find((r) => r.t >= 120);
const fiveMin = log.find((r) => r.t >= 300);
const thirtyMin = log[log.length - 1];
console.log('\n关键指标：');
console.log(`  2 分钟：最高 ${twoMin?.floor ?? 0} 层，金币 ${Math.floor(twoMin?.gold ?? 0)}，英雄 ${twoMin?.heroes ?? 0}`);
console.log(`  5 分钟：最高 ${fiveMin?.floor ?? 0} 层，金币 ${Math.floor(fiveMin?.gold ?? 0)}，英雄 ${fiveMin?.heroes ?? 0}`);
console.log(`  30 分钟：最高 ${thirtyMin?.floor ?? 0} 层，金币 ${Math.floor(thirtyMin?.gold ?? 0)}，英雄 ${thirtyMin?.heroes ?? 0}`);
