import type { Game, RecipeId, Stove } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";

/** 热负荷超过该值后传热效率开始下降 */
export const HEAT_WARN = 55;
export const HEAT_MAX = 100;
/** 主动冷却占用时间与单次释放的热负荷 */
export const COOL_SECONDS = 4;
export const COOL_RELIEF = 30;
/** 保养占用时间与恢复的健康度 */
export const MAINTENANCE_SECONDS = 8;
export const MAINTENANCE_RESTORE = 26;
/** 过热锁死额外损失的健康度 */
export const BREAKDOWN_HEALTH_LOSS = 12;
/** 出餐台容量，故障起锅与手动起锅共用同一规则 */
export const COUNTER_CAPACITY = 8;

const BASE_HEAT: Record<Stove["kind"], number> = { pan: 2.1, pot: 1.7 };

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** 磨损越重，升温越快。 */
export function heatGainPerSecond(s: Stove) {
  const wearFactor = 1.25 - 0.25 * clamp(s.health / 100, 0, 1);
  return BASE_HEAT[s.kind] * wearFactor;
}

/** 同一套传热函数同时用于实时火候、完成预估和界面展示。 */
export function heatTransferAt(heat: number, health: number) {
  const over =
    Math.max(0, heat - HEAT_WARN) / (HEAT_MAX - HEAT_WARN);
  const overload = 1 - 0.55 * clamp(over, 0, 1);
  const wear = 0.88 + 0.12 * clamp(health / 100, 0, 1);
  return overload * wear;
}

export function heatTransfer(s: Stove) {
  return heatTransferAt(s.heat, s.health);
}

/** 实际火候只取决于有效烹饪进度，而不是墙上时钟。 */
export function quality(recipe: RecipeId, progress: number) {
  const target = recipes[recipe].target;
  return Math.max(0, Math.round(100 - Math.abs(progress - target) * 12));
}

/**
 * 按当前热负荷、健康度与升温速度向前推演，得到到达最佳火候所需秒数。
 * 推演顺序与 tickStoves 完全一致（先升热负荷、触顶即锁死，再累计火候），
 * 因此预估时间、实际火候与停机结果遵循同一份设备状态。
 * null 表示还没到最佳火候就会过热锁死。
 */
export function estimateFinishSeconds(s: Stove): number | null {
  if (!s.portion || s.status !== "cooking") return 0;
  const target = recipes[s.portion.recipe].target;
  if (s.progress >= target) return 0;
  const gain = heatGainPerSecond(s);
  let progress = s.progress;
  let heat = s.heat;
  let seconds = 0;
  while (progress < target && seconds < 240) {
    heat = Math.min(HEAT_MAX, heat + gain * 0.1);
    if (heat >= HEAT_MAX) return null;
    progress += heatTransferAt(heat, s.health) * 0.1;
    seconds += 0.1;
  }
  return progress >= target ? Math.round(seconds * 10) / 10 : null;
}

export function repairQuote(s: Stove) {
  const wear = 100 - clamp(s.health, 0, 100);
  const thermalLoad = clamp(s.heat, 0, HEAT_MAX);
  return {
    seconds: Math.round((7 + wear * 0.05 + thermalLoad * 0.09) * 10) / 10,
    fee: Math.round(14 + wear * 0.4 + thermalLoad * 0.24),
  };
}

export function maintenanceCost(s: Stove) {
  return Math.round(8 + (100 - clamp(s.health, 0, 100)) * 0.25);
}

export function heatBand(s: Stove) {
  if (s.status === "locked" || s.heat >= HEAT_MAX) return "过热锁死";
  if (s.heat >= 85) return "严重过载";
  if (s.heat >= HEAT_WARN) return "过载";
  if (s.heat >= 35) return "温热";
  return "常温";
}

export function stoveName(s: Pick<Stove, "id" | "kind">) {
  return `${s.kind === "pan" ? "煎锅" : "汤锅"} 0${s.id}`;
}

export function statusLabel(g: Game, s: Stove) {
  const left = Math.max(0, Math.ceil(s.statusUntil - g.time));
  switch (s.status) {
    case "cooling":
      return `冷却 ${left}s`;
    case "locked":
      return "过热锁定";
    case "repairing":
      return `检修 ${left}s`;
    case "maintaining":
      return `保养 ${left}s`;
    case "cooking":
      return s.booking ? "烹饪中 · 已约保养" : "烹饪中";
    default:
      return s.booking ? "已约保养 · 待起锅" : "空闲";
  }
}
