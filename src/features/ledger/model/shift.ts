import type { Game } from "../../../shared/types";
import { totals } from "../lib/totals";
import { settleAtClose } from "../../kitchen/model/equipment";
import { persistSnapshot } from "./persistence";

export function closeShift(g: Game) {
  g.running = false;
  // 先结算设备侧的食品去向，再清理出餐台，避免同一份食品被记账两次。
  // settleAtClose 内部会先关闭停机记录，再标记仍未出餐的订单为「打烊未决」。
  settleAtClose(g);
  g.dishes = [];
  g.selectedDish = null;
  g.selectedOrder = null;
  g.combo = 0;
  g.ended = true;
  g.best = Math.max(g.best, totals(g).net);
  persistSnapshot(g);
  g.notice = "午市结束，辛苦了，主厨！";
}

export function saveBest(g: Game) {
  persistSnapshot(g);
}
