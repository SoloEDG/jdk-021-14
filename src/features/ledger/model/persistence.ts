import type {
  EquipmentSnapshot,
  Game,
  Stove,
  StoveSnapshot,
} from "../../../shared/types";
import { clamp } from "../../kitchen/lib/heat";

export const STORAGE_KEY = "lunch-rush-equipment-v2";
export const LEGACY_BEST_KEY = "lunch-rush-best";

export type { EquipmentSnapshot, StoveSnapshot };

/**
 * 旧局没有设备字段，只有历史最佳。迁移时按健康状态补齐：
 * 没有健康数据视为满健康、热负荷为零；字段损坏则退回安全默认值。
 */
export function migrateSnapshot(raw: unknown): EquipmentSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const stoves = Array.isArray(source.stoves)
    ? source.stoves
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s): StoveSnapshot => {
          const kind: Stove["kind"] = s.kind === "pot" ? "pot" : "pan";
          const id = Number(s.id);
          const health = Number(s.health);
          const heat = Number(s.heat);
          return {
            id: Number.isFinite(id) && id > 0 ? Math.floor(id) : 1,
            kind,
            // 缺失或损坏的健康数据按满健康迁移，避免旧局被误判为已损坏。
            health: Number.isFinite(health) ? clamp(health, 0, 100) : 100,
            heat: Number.isFinite(heat) ? clamp(heat, 0, 100) : 0,
          };
        })
    : [];
  const best = Number(source.best);
  return {
    best: Number.isFinite(best) ? Math.max(0, best) : 0,
    stoves,
  };
}

export function readSnapshot(): EquipmentSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateSnapshot(JSON.parse(raw));
    const legacy = Number(localStorage.getItem(LEGACY_BEST_KEY));
    if (Number.isFinite(legacy)) {
      return { best: Math.max(0, legacy), stoves: [] };
    }
    return null;
  } catch {
    return null;
  }
}

export function persistSnapshot(g: Game) {
  const snapshot: EquipmentSnapshot = {
    best: g.best,
    stoves: g.stoves.map((s) => ({
      id: s.id,
      kind: s.kind,
      // 跨局迁移以健康状态为准；停机与热负荷属于当班状态，不写入。
      health: clamp(s.health, 0, 100),
      heat: 0,
    })),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(LEGACY_BEST_KEY, String(g.best));
  } catch {
    g.notice = "浏览器存储不可用，本局结算仍然有效";
  }
}

export function readBest() {
  return readSnapshot()?.best ?? 0;
}
