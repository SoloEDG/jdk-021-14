import type { Game, Command } from "../shared/types";
import { accept, expire } from "../features/orders";
import { prepare, restock } from "../features/pantry";
import {
  cook,
  lift,
  startCooling,
  startRepair,
  bookMaintenance,
  cancelMaintenance,
} from "../features/kitchen";
import { maintenanceCost } from "../features/kitchen/lib/heat";
import { plate, discard, deliver } from "../features/service";
export function dispatch(g: Game, c: Command) {
  if (!g.running || g.ended) {
    g.notice = "请先开始营业，暂停时不能操作厨房";
    return;
  }
  switch (c.type) {
    case "accept":
      accept(g, c.id);
      break;
    case "select-order":
      if (g.orders.some((o) => o.id === c.id && o.status === "accepted"))
        g.selectedOrder = c.id;
      break;
    case "prepare":
      prepare(g, c.recipe);
      break;
    case "restock":
      restock(g, c.ingredient);
      break;
    case "cook":
      cook(g, c.portion, c.stove);
      break;
    case "lift":
      lift(g, c.id);
      break;
    case "cool": {
      const s = g.stoves.find((s) => s.id === c.stove);
      if (s) startCooling(g, s);
      break;
    }
    case "repair": {
      const s = g.stoves.find((s) => s.id === c.stove);
      if (s) startRepair(g, s);
      break;
    }
    case "maintain": {
      const s = g.stoves.find((s) => s.id === c.stove);
      if (s) bookMaintenance(g, s, maintenanceCost(s));
      break;
    }
    case "cancel-maintenance": {
      const s = g.stoves.find((s) => s.id === c.stove);
      if (s) cancelMaintenance(g, s);
      break;
    }
    case "plate":
      plate(g, c.id);
      break;
    case "select-dish":
      if (g.dishes.some((d) => d.id === c.id && d.stage === "plated"))
        g.selectedDish = c.id;
      break;
    case "serve":
      deliver(g);
      // 上菜后立即结算订单超时，保证同一刻只落到一个去向。
      expire(g);
      break;
    case "discard":
      discard(g, c.id);
      break;
  }
}
