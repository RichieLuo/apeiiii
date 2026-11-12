# 交接文档：《晶塔远征》

## 当前版本（2026-11-11）

- 默认无限模式，每十层全部通关后自动解锁下一段；设置可切换经典 300 层模式，已超过 300 层的存档不能退回经典模式。
- 英雄扩为 24 名（12 近战、12 远程），普通怪物 18 种、Boss 6 种，三大区域每 300 层循环。
- `GameState.heroOrder` 保存召唤顺序，旧存档默认近战优先。英雄界面支持上移、下移和近战优先，实际影响入场与复活；近战可绕过远程队友，入口排队避免大队伍重叠。
- 角色采用四帧行走和攻击姿势，步幅适中；同队交战位置分离，异队不能穿越。怪物和 Boss 仍用独立立绘配合程序运动。
- 友军近战和远程均采用三路错位编队，`UnitState.combatLane` 保留车道，旧存档自动补齐；战后继续分路行军。同路保持间距，异路可并肩，敌方仍阻挡全部通道；近战可借道越过同路远程。抵达楼梯且目标入口有空间即可过层，不能再强制等待整层召唤顺序首位英雄。回归见 `scripts/verify-melee.ts`、`scripts/verify-transitions.ts`。
- 主动技能由 `getActiveSkillTargetFloor()` 自动作用于实际推进前线（首通下一层、已激活交战层及活单位最高层，限制在已解锁范围），波次空档不回退，`selectedFloor` 不再决定技能目标。技能栏不显示提示行和目标层数；无怪或无适用单位仍可空放并正常消耗冷却。
- 无限模式的已通关历史楼层会压缩，查询楼层应使用 `isFloorUnlocked` / `isFloorCleared`，不能依赖 `state.floors[id]` 必定存在。需要波次时再重建楼层。
- Phaser 使用向上为负的楼层世界坐标，并复用视口附近的楼层对象；不要恢复一次绘制全部楼层的方案。
- 无限模式英雄在当前十层区段的起点或刷金层复活，成长在原有指数区间之后接续线性增长。
- 手机战场等比适配屏幕并固定横向镜头，触摸仅上下浏览楼层；背景由 `render/backgrounds.ts` 统一配置，每十层换一套场景，十套美术每百层循环，与怪物生态分区独立。Go + PostgreSQL 支持账号和云存档，详见 [服务端说明](server/README.md)。
- 主要验证命令：`npm run typecheck`、`npm run test:game`、`npm run build`、`npm run sim`。无限模式回归覆盖第 10、300、600、10,000 层和旧版八英雄存档迁移。

下面是原始交接记录，记录当时的待办和实现，不代表当前功能状态。其动画待办、英雄数量、300 层上限和旧碰撞说明已被上述版本替代。

---

> 本文件写给「下一个继续开发的 AI 窗口」或开发者。读完即可无缝续做。

## 一、项目概况

- 位置：`D:/G`（非 git 仓库）
- 类型：纯网页放置爬塔游戏《晶塔远征》
- 技术栈：TypeScript + Phaser 3.90 + Vite 6 + React 18 + IndexedDB
- 运行：`npm run dev`（localhost:5173）/ `npm run build` / `npm run sim`（无头数值模拟）
- 战斗：Phaser 渲染纵向塔体（300 层、多楼层并行）；外围：React 面板
- 模拟内核：纯 TS，固定 20Hz、种子随机可重放，与渲染分离

**当前状态：游戏核心完全可玩**（战斗、楼层推进、每 10 层手动解锁、招募/宝石/装备/技能/任务/据点/竞技场/离线收益/导入导出全部已实现）。`npx tsc --noEmit` 通过。

## 二、本轮正在做但未完成的事：走路/攻击动画帧

用户要求「人物要有自然走路（GIF 样式）和打架的动作，不要程序弹跳」。已生成 27 张动作帧，但**只抠图完成 2 张**就被中断，还差 25 张 + 代码接入。

### 2.1 美术管线（重要，必须照此做）

1. **ImageGen 生成**：工具支持 `background: "transparent"`，但实际输出是 **RGB + 棋盘格底（无真实 alpha）**，必须再抠图。
2. **抠图**：用 `buddy-image-processing` skill 的 `matting` 操作，输出 RGBA 真实透明 PNG。
   - 需要先 `connect_cloud_service` 拿 `clientTempToken`（约 15 分钟过期，过期要重拿）。
   - 命令模板：
     ```bash
     python "D:/Program Files/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/buddy-image-processing/scripts/buddy-image-processing.py" image-edit --operation matting --image-file "<源图>" --prompt "提取角色前景，去除棋盘格背景，输出透明背景PNG，保留完整身体与武器" --token "<clientTempToken>"
     ```
   - 脚本输出 JSON，`result_files[].path` 是抠图结果，形如 `D:\G\processed_image_<taskid>_1.png`。
3. **对齐基准高度**：`python scripts/align_frame.py <抠图帧> <基准图> <输出>`。基准图是已接入的 idle 帧（见 2.3），作用是把动作帧统一缩放到与 idle 相同高度、脚底对齐，避免切帧时角色忽大忽小。
4. **登记**：把新纹理路径写进 `src/game/render/assets.ts` 的 `GENERATED_ASSETS`。
5. 文字/血条/冷却圈/稀有度框由代码绘制，不烘焙进图。

### 2.2 已生成但待抠图的对齐（25 张，源图都在 `art/source/`）

源图（带棋盘格）已全部生成完毕：

```
art/source/<角色>_walk_a.png   # 近侧腿前迈
art/source/<角色>_walk_b.png   # 另一条腿前迈（互补）
art/source/<角色>_attack.png   # 攻击关键姿势
```

角色列表（9 个）：
`hero_guard hero_archer hero_fire_mage hero_healer hero_assassin hero_engineer hero_ice_mage hero_banner unit_summon_squire`

**已完成抠图的**（在 `art/matted/`，无需再抠）：`hero_guard_walk_a.png`、`hero_guard_walk_b.png`

**待抠图的 25 张**：`hero_guard_attack` + 其余 8 个角色的 walk_a/walk_b/attack（共 25）。

### 2.3 续做步骤（按顺序）

**步骤 A — 抠图剩余 25 张**：参考 2.1 命令，逐个把 `art/source/<id>_<action>.png` 抠到 `art/matted/<id>_<action>.png`。

**步骤 B — 对齐**（基准图 = 已接入的 idle 帧）：
```bash
# 英雄（8 个）
python scripts/align_frame.py "art/matted/hero_archer_walk_a.png" "public/assets/sprites/heroes/hero_archer.png" "public/assets/sprites/heroes/hero_archer_walk_a.png"
# ... 对每个英雄的 walk_a / walk_b / attack 都执行一遍
# 勇者
python scripts/align_frame.py "art/matted/unit_summon_squire_walk_a.png" "public/assets/sprites/units/unit_summon_squire.png" "public/assets/sprites/units/unit_summon_squire_walk_a.png"
```

**步骤 C — 登记纹理**：在 `src/game/render/assets.ts` 的 `GENERATED_ASSETS` 里加 27 个条目，键名形如：
```ts
hero_guard_walk_a: 'assets/sprites/heroes/hero_guard_walk_a.png',
hero_guard_walk_b: 'assets/sprites/heroes/hero_guard_walk_b.png',
hero_guard_attack: 'assets/sprites/heroes/hero_guard_attack.png',
// …（8 英雄 + 勇者的 walk_a / walk_b / attack）
```

**步骤 D — 渲染层切纹理**：改 `src/game/render/GameScene.ts` 的 `updateUnitView`。动画状态机已就绪（`isMoving`、`attacking` 变量、`view.baseScale`、`view.prevFloor` 都在），只需在设置 body 前加纹理切换：
```ts
// 决定当前帧贴图（放在 bodyY/bodyRot 计算之前）
let tex = u.templateId;
const hasWalk = this.textures.exists(u.templateId + '_walk_a');
const hasAtk = this.textures.exists(u.templateId + '_attack');
if (attacking && hasAtk) {
  tex = u.templateId + '_attack';
} else if (isMoving && hasWalk) {
  tex = (Math.floor(now * 5 + u.id) % 2 === 0) ? u.templateId + '_walk_a' : u.templateId + '_walk_b';
}
if (view.body.texture.key !== tex) view.body.setTexture(tex);
```
（注意：`setTexture` 后 `baseScale` 不变，因对齐步骤已保证所有帧同高度。）

**步骤 E — 验证**：`npm run build` + `node scripts/verify.mjs`（用 Puppeteer 截图，会打印 pageerror/console error）+ `npm run sim`。

## 三、本轮已完成的代码改动（已通过 tsc，需重新 build 验证视觉效果）

1. **碰撞分离（刚体）**：`simulation.ts` 的 `resolveCollisions()`，同层单位不堆叠；同队允许 62% 重叠，异队 90%。
2. **交战锁定**：`resolveCollisions()` 中 `phase === 'attacking'` 的单位不可被推动，解决「推着怪走」。
3. **中场等待位**：`simulation.ts` 的 `FRONTLINE_X = 620`，盟友在未清楼层无敌人时推进到 620 就停，不再越过怪物刷新点（940）——解决「怪物出现在人物后面」。
4. **换楼层/新单位直接定位**：`GameScene.ts` 新单位容器直接定位、`prevFloor` 变化时 `displayX = targetX` 不平滑——解决「上一层楼从右往左滑」的错觉。
5. **程序动画占位**：`updateUnitView` 已有攻击前冲/受击闪白/行走弹跳逻辑（待 D 步骤换成真实帧）。

## 四、关键文件

| 文件 | 作用 |
|---|---|
| `src/game/core/simulation.ts` | 模拟内核（战斗/移动/生成/掉落/成长/碰撞/命令） |
| `src/game/core/state.ts` | 初始状态 + 属性派生 |
| `src/game/data/*.ts` | 英雄/怪物/宝石/装备/经济/任务配置 |
| `src/game/render/GameScene.ts` | Phaser 塔体渲染 + 程序动画（改这里接帧动画） |
| `src/game/render/assets.ts` | 正式美术登记表 `GENERATED_ASSETS` |
| `src/game/render/textures.ts` | 程序占位图（未生成正式图的怪物兜底） |
| `src/ui/*.tsx` | React 面板 |
| `src/platform/*.ts` | IndexedDB 存档 / 音频 / Store |
| `scripts/sim.ts` | 无头数值模拟 |
| `scripts/verify.mjs` | Puppeteer 运行时验证（截图 + 控制台错误捕获） |
| `scripts/align_frame.py` / `normalize.py` | 帧对齐 / 透明边裁切（需 `python -m pip install Pillow`） |
| `art/prompts/完整提示词.txt` | 附件完整 90 条提示词副本 |
| `art/prompts/MISSING_RESOURCES.md` | 美术缺口清单 |

## 五、工具链坑（务必注意）

1. **ImageGen 无真 alpha**：`background:"transparent"` 只给棋盘格，必须 `matting` 抠图。
2. **matting 需 token**：`connect_cloud_service` → `clientTempToken`，约 15 分钟过期。
3. **pip 与 python 版本不一致**：本机 `pip` 指向 Python 3.9、`python` 是 3.13，装 Pillow 必须用 `python -m pip install Pillow`。
4. **ImageGen 图生图保身份**：用 `image1`（基准图）+ `input_fidelity:"high"`，保持同一角色不换脸/换衣。
5. 开发服务器用 `npm run dev`（后台任务会随会话结束而停，重启即可）。

## 六、本轮之后的剩余大项（非本轮范围，供参考）

- 怪物（12 种）与 Boss（3 种）目前用程序占位走路动画，如需 GIF 式也可按同管线补 walk_a/walk_b/attack 帧。
- 其余 60 项美术（4 宝石/货币物品/技能图标/特效/建筑模块/11 张攻击姿势）仍为占位，清单见 `art/prompts/MISSING_RESOURCES.md`。
- 训练竞技场是占位入口；据点守卫简化为即时占领；未接 Service Worker；背景音乐未接。
