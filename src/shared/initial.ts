import type { EquipmentSnapshot, Game, Stove } from "./types";

interface StoveSeed {
  id: number;
  kind: Stove["kind"];
  health?: number;
}

function seedStove(seed: StoveSeed): Stove {
  return {
    id: seed.id,
    kind: seed.kind,
    portion: null,
    started: 0,
    progress: 0,
    heat: 0,
    health: seed.health ?? 100,
    status: "idle",
    statusUntil: 0,
    booking: null,
    downtimeId: null,
  };
}

const DEFAULT_SEEDS: StoveSeed[] = [
  { id: 1, kind: "pan" },
  { id: 2, kind: "pan" },
  { id: 3, kind: "pot" },
];

/**
 * 设备状态来自上一局的健康度快照；旧局的灶具结构（型号/顺序）保持不变，
 * 只把健康状态迁移进来，保证旧存档不会因为新增字段而丢失。
 */
function migrateStoves(
  seeds: StoveSeed[],
  snapshot: EquipmentSnapshot | null,
): Stove[] {
  if (!snapshot?.stoves.length) return seeds.map(seedStove);
  return seeds.map((seed) => {
    const saved =
      snapshot.stoves.find((s) => s.id === seed.id && s.kind === seed.kind) ??
      snapshot.stoves.find((s) => s.id === seed.id);
    return seedStove(
      saved ? { ...seed, kind: seed.kind, health: saved.health } : seed,
    );
  });
}

export function createGame(
  best = 0,
  snapshot: EquipmentSnapshot | null = null,
): Game {
  return {
    time: 0,
    duration: 180,
    running: false,
    ended: false,
    nextId: 4,
    selectedOrder: null,
    selectedDish: null,
    orders: [
      {
        id: 1,
        recipe: "steak",
        guest: "林小姐",
        arrived: 0,
        deadline: 65,
        status: "waiting",
      },
      {
        id: 2,
        recipe: "pasta",
        guest: "周先生",
        arrived: 0,
        deadline: 75,
        status: "waiting",
      },
      {
        id: 3,
        recipe: "salad",
        guest: "小陈",
        arrived: 0,
        deadline: 55,
        status: "waiting",
      },
    ],
    stock: { beef: 5, noodle: 5, greens: 6 },
    portions: [],
    stoves: migrateStoves(DEFAULT_SEEDS, snapshot),
    dishes: [],
    entries: [],
    downtimes: [],
    combo: 0,
    served: 0,
    missed: 0,
    notice: "准备好了吗？开门迎接第一位客人。",
    best: Math.max(best, snapshot?.best ?? 0),
  };
}
