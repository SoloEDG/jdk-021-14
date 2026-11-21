import type {
  Downtime,
  DowntimeImpact,
  DowntimeKind,
  Game,
  Order,
  Portion,
  RecipeId,
  Stove,
  StoveBooking,
} from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import {
  BREAKDOWN_HEALTH_LOSS,
  COOL_RELIEF,
  COOL_SECONDS,
  COUNTER_CAPACITY,
  HEAT_MAX,
  MAINTENANCE_RESTORE,
  MAINTENANCE_SECONDS,
  clamp,
  heatGainPerSecond,
  heatTransfer,
  maintenanceCost,
  quality,
  repairQuote,
  stoveName,
} from "../lib/heat";

const WASTE_COST = 3;

export type RouteDestination = "counter" | "waste";

export interface RoutedPortion {
  destination: RouteDestination;
  portion: Portion;
  quality: number;
}

function isActive(o: Order) {
  return o.status === "waiting" || o.status === "accepted";
}

export function activeOrderSnapshot(g: Game) {
  return g.orders.filter(isActive).map((o) => o.id);
}

function newDowntime(
  g: Game,
  s: Stove,
  kind: DowntimeKind,
  note: string,
  fee = 0,
): Downtime {
  const record: Downtime = {
    id: g.nextId++,
    stoveId: s.id,
    kind,
    start: g.time,
    end: null,
    fee,
    affected: activeOrderSnapshot(g),
    impacts: [],
    note,
  };
  g.downtimes.push(record);
  s.downtimeId = record.id;
  return record;
}

function openDowntimeForStove(g: Game, s: Stove) {
  return g.downtimes.find((d) => d.id === s.downtimeId && d.end === null);
}

function finishDowntime(g: Game, s: Stove) {
  const record = openDowntimeForStove(g, s);
  if (record) record.end = g.time;
  s.downtimeId = null;
}

/**
 * 锅内食品唯一的出口。
 * 任何起锅、故障溢出或打烊清理都必须经过这里，
 * 保证同一份食品只会落到「出餐台」或「废弃账目」其中一个去向。
 */
export function routePortion(
  g: Game,
  s: Stove,
  opts: { forceWaste?: boolean; label?: string } = {},
): RoutedPortion | null {
  const portion = s.portion;
  if (!portion) return null;
  const q = quality(portion.recipe, s.progress);
  s.portion = null;
  s.started = 0;
  s.progress = 0;

  if (!opts.forceWaste && g.dishes.length < COUNTER_CAPACITY) {
    g.dishes.push({
      id: portion.id,
      recipe: portion.recipe,
      quality: q,
      cookedAt: g.time,
      stage: "counter",
    });
    return { destination: "counter", portion, quality: q };
  }

  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: `${opts.label ?? "溢出清理"} · ${stoveName(s)} · ${recipes[portion.recipe].name}`,
    amount: -WASTE_COST,
    kind: "waste",
  });
  return { destination: "waste", portion, quality: q };
}

/** 订单去向发生的时刻是否正处于这次停机期间。 */
function activeAt(g: Game, d: Downtime, at: number) {
  const end = d.end ?? g.time;
  return d.start - 1e-9 <= at && at <= end + 1e-9;
}

/**
 * 把订单的最终去向写回它发生时所处的停机记录。
 * 同一停机对同一订单只记一次，账本因此能追溯每次停机造成的后果。
 */
export function noteOrderOutcome(
  g: Game,
  order: Order,
  outcome: DowntimeImpact["outcome"],
) {
  for (const d of g.downtimes) {
    if (!activeAt(g, d, g.time)) continue;
    if (d.impacts.some((i) => i.orderId === order.id)) continue;
    d.impacts.push({
      orderId: order.id,
      guest: order.guest,
      recipe: order.recipe,
      outcome,
      at: g.time,
    });
  }
}

export function noteClosedOrders(g: Game) {
  for (const o of g.orders.filter(isActive)) {
    for (const d of g.downtimes) {
      if (!activeAt(g, d, g.time)) continue;
      if (d.impacts.some((i) => i.orderId === o.id)) continue;
      d.impacts.push({
        orderId: o.id,
        guest: o.guest,
        recipe: o.recipe,
        outcome: "closed",
        at: g.time,
      });
    }
  }
}

/**
 * 过热锁死：设备停火并锁定，但锅内食品原样保留。
 * 「不能在锅里还有食品时直接清空设备」——必须由玩家先起锅抢救，
 * 再决定检修；起锅是这一份食品唯一的出口，因此同刻故障不会重复记账。
 */
function breakDown(g: Game, s: Stove) {
  s.heat = HEAT_MAX;
  s.health = clamp(s.health - BREAKDOWN_HEALTH_LOSS, 0, 100);
  s.status = "locked";
  s.statusUntil = 0;
  finishDowntime(g, s);
  const record = newDowntime(
    g,
    s,
    "overheat",
    `${stoveName(s)} 过热锁死，等待检修`,
  );
  record.note = s.portion
    ? `${stoveName(s)} 过热锁死，锅内${recipes[s.portion.recipe].name}需先起锅才能检修`
    : `${stoveName(s)} 过热锁死，等待检修`;
  g.notice = record.note;
}

function finishCooling(g: Game, s: Stove) {
  s.heat = clamp(s.heat - COOL_RELIEF, 0, HEAT_MAX);
  s.status = "idle";
  s.statusUntil = 0;
  finishDowntime(g, s);
  g.notice = `${stoveName(s)} 冷却完成，热负荷降至 ${Math.round(s.heat)}`;
}

function beginMaintenance(g: Game, s: Stove, booking: StoveBooking) {
  s.booking = null;
  s.status = "maintaining";
  s.statusUntil = g.time + MAINTENANCE_SECONDS;
  // 费用在预约时已经入账，这里只记录停机本身，避免账目重复。
  newDowntime(
    g,
    s,
    "maintenance",
    `${stoveName(s)} 保养（费用已预付 ¥${booking.fee}）`,
  );
  g.notice = `${stoveName(s)} 开始保养，${MAINTENANCE_SECONDS} 秒后恢复接单`;
}

function finishMaintenance(g: Game, s: Stove) {
  s.health = clamp(s.health + MAINTENANCE_RESTORE, 0, 100);
  s.status = "idle";
  s.statusUntil = 0;
  finishDowntime(g, s);
  g.notice = `${stoveName(s)} 保养完成，健康度 ${Math.round(s.health)}`;
}

function finishRepair(g: Game, s: Stove) {
  s.health = 100;
  s.heat = 0;
  s.status = "idle";
  s.statusUntil = 0;
  finishDowntime(g, s);
  const booking = s.booking;
  if (booking) {
    beginMaintenance(g, s, booking);
    g.notice = `${stoveName(s)} 检修完成，随即执行已预约保养`;
  } else {
    g.notice = `${stoveName(s)} 检修完成，设备已恢复`;
  }
}

/** 每 0.1 秒推进一次设备状态；暂停时不会被调用。 */
export function tickStoves(g: Game, dt: number) {
  for (const s of g.stoves) {
    if (s.status === "cooking") {
      if (!s.portion) {
        s.status = "idle";
        s.statusUntil = 0;
        continue;
      }
      // 顺序与 estimateFinishSeconds 完全一致：先结算热量，再累计火候。
      s.heat = clamp(s.heat + heatGainPerSecond(s) * dt, 0, HEAT_MAX);
      if (s.heat >= HEAT_MAX) {
        breakDown(g, s);
        continue;
      }
      s.progress += heatTransfer(s) * dt;
      continue;
    }
    if (g.time + 1e-9 < s.statusUntil) continue;
    if (s.status === "cooling") finishCooling(g, s);
    else if (s.status === "repairing") finishRepair(g, s);
    else if (s.status === "maintaining") finishMaintenance(g, s);
  }
}

export function canCook(g: Game, s: Stove): string {
  if (s.status === "cooling") return `${stoveName(s)} 正在冷却`;
  if (s.status === "locked") return `${stoveName(s)} 过热锁死，需先检修`;
  if (s.status === "repairing") return `${stoveName(s)} 正在检修`;
  if (s.status === "maintaining") return `${stoveName(s)} 正在保养`;
  if (s.status !== "idle") return `${stoveName(s)} 不可用`;
  if (s.booking) return `${stoveName(s)} 已预约保养，不再接收新食材`;
  if (s.portion) return `${stoveName(s)} 锅内已有食品`;
  return "";
}

export function startCooking(g: Game, s: Stove, portion: Portion, recipe: RecipeId) {
  s.portion = portion;
  s.started = g.time;
  s.progress = 0;
  s.status = "cooking";
  s.statusUntil = 0;
  s.downtimeId = null;
  const transfer = Math.round(heatTransfer(s) * 100);
  g.notice =
    transfer < 70
      ? `已下锅，设备过载，当前传热效率仅 ${transfer}%`
      : `已下锅，当前传热效率 ${transfer}%`;
}

/** 起锅：唯一出口 + 结算磨损；若已预约保养则同刻进入保养。 */
export function finishCooking(g: Game, s: Stove): RoutedPortion | null {
  if (s.status !== "cooking" || !s.portion) return null;
  if (g.dishes.length >= COUNTER_CAPACITY) {
    g.notice = "出餐台已满，请先上菜或丢弃";
    return null;
  }
  const routed = routePortion(g, s);
  if (!routed) return null;
  s.health = clamp(s.health - (0.6 + (s.heat / HEAT_MAX) * 1.6), 0, 100);
  s.status = "idle";
  s.statusUntil = 0;
  const booking = s.booking;
  if (booking) {
    beginMaintenance(g, s, booking);
    g.notice = `起锅完成，品质 ${routed.quality}；${stoveName(s)} 开始保养`;
  } else {
    g.notice = `起锅完成，品质 ${routed.quality}，前往装盘`;
  }
  return routed;
}

/** 锁死设备的抢救起锅：食品走唯一出口，但设备不会被解锁。 */
export function rescueLocked(g: Game, s: Stove): RoutedPortion | null {
  if (s.status !== "locked" || !s.portion) return null;
  // 出餐台满时拒绝起锅，绝不把食品悄悄丢进废弃；救援后设备仍需检修。
  if (g.dishes.length >= COUNTER_CAPACITY) return null;
  return routePortion(g, s);
}

export function startCooling(g: Game, s: Stove) {
  if (s.status !== "idle") {
    g.notice = `${stoveName(s)} 正在${s.status === "cooking" ? "烹饪" : "停机"}，无法冷却`;
    return;
  }
  if (s.booking) {
    g.notice = `${stoveName(s)} 已预约保养，请先取消预约`;
    return;
  }
  if (s.heat < 1) {
    g.notice = `${stoveName(s)} 已冷却，无需降温`;
    return;
  }
  s.status = "cooling";
  s.statusUntil = g.time + COOL_SECONDS;
  newDowntime(g, s, "cooling", `${stoveName(s)} 主动冷却`);
  g.notice = `${stoveName(s)} 冷却 ${COOL_SECONDS} 秒，释放 ${COOL_RELIEF} 点热负荷`;
}

export function bookMaintenance(g: Game, s: Stove, cost: number) {
  if (s.booking) {
    g.notice = `${stoveName(s)} 已经预约保养`;
    return;
  }
  if (s.health >= 99) {
    g.notice = `${stoveName(s)} 状态良好，无需保养`;
    return;
  }
  if (s.status === "locked") {
    g.notice = `${stoveName(s)} 已锁死，请先检修`;
    return;
  }
  if (s.status !== "idle" && s.status !== "cooking") {
    g.notice = `${stoveName(s)} 正在停机，无法预约保养`;
    return;
  }
  if (s.portion && s.status !== "cooking") {
    g.notice = `${stoveName(s)} 锅内还有食品，不能保养`;
    return;
  }
  const entry = {
    id: g.nextId++,
    time: g.time,
    label: `预约保养 · ${stoveName(s)}`,
    amount: -cost,
    kind: "upkeep" as const,
  };
  g.entries.push(entry);
  s.booking = { fee: cost, bookedAt: g.time, entryId: entry.id };

  if (s.status === "cooking") {
    g.notice = `已预约保养，费用 ¥${cost}；${stoveName(s)} 起锅后执行，期间不再接收新食材`;
  } else {
    beginMaintenance(g, s, s.booking);
    g.notice = `已支付 ¥${cost}，${stoveName(s)} 开始保养`;
  }
}

export function cancelMaintenance(g: Game, s: Stove) {
  if (s.status === "maintaining") {
    g.notice = `${stoveName(s)} 保养已经开始，无法取消`;
    return;
  }
  const booking = s.booking;
  if (!booking) {
    g.notice = `${stoveName(s)} 没有待执行的保养预约`;
    return;
  }
  s.booking = null;
  // 已支付的费用作为不可退款项保留在账本里，只释放设备占用。
  g.notice = `已取消 ${stoveName(s)} 的保养预约，已付 ¥${booking.fee} 不退`;
}

export function startRepair(g: Game, s: Stove) {
  if (s.status !== "locked") {
    g.notice = `${stoveName(s)} 无需检修`;
    return;
  }
  if (s.portion) {
    g.notice = `${stoveName(s)} 锅内还有食品，不能直接清空设备`;
    return;
  }
  const quote = repairQuote(s);
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: `检修 · ${stoveName(s)}`,
    amount: -quote.fee,
    kind: "repair",
  });
  // 过热停机在检修开始时结束，并单独保留为一条可追溯记录。
  finishDowntime(g, s);
  newDowntime(
    g,
    s,
    "repair",
    `${stoveName(s)} 过热后检修`,
    quote.fee,
  );
  s.status = "repairing";
  s.statusUntil = g.time + quote.seconds;
  g.notice = `${stoveName(s)} 检修 ${quote.seconds} 秒，费用 ¥${quote.fee}`;
}

/** 打烊：锅内食品只计入一次废弃，并关闭所有停机记录。 */
export function settleAtClose(g: Game) {
  for (const s of g.stoves) {
    if (s.portion) routePortion(g, s, { forceWaste: true, label: "打烊清理" });
  }
  for (const d of g.downtimes) {
    if (d.end === null) d.end = g.time;
  }
  noteClosedOrders(g);
}
