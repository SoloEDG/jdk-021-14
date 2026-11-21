import type { Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import {
  canCook,
  finishCooking,
  rescueLocked,
  startCooking,
} from "./equipment";
import { stoveName } from "../lib/heat";

export function cook(g: Game, portion: number, stove: number) {
  const p = g.portions.find((p) => p.id === portion),
    s = g.stoves.find((s) => s.id === stove);
  if (!p || !s) return;
  if (recipes[p.recipe].station !== s.kind) {
    g.notice = "设备不匹配：意面用汤锅，牛排和沙拉用煎锅";
    return;
  }
  const issue = canCook(g, s);
  if (issue) {
    g.notice = issue;
    return;
  }
  g.portions = g.portions.filter((x) => x.id !== portion);
  startCooking(g, s, p, p.recipe);
}

export function lift(g: Game, id: number) {
  const s = g.stoves.find((s) => s.id === id);
  if (!s?.portion) {
    if (s) g.notice = `${stoveName(s)} 锅内没有食品`;
    return;
  }
  // 过热锁死只是停止加热，锅内食品仍在；允许起锅，但设备依旧锁定。
  if (s.status === "locked") {
    const routed = rescueLocked(g, s);
    if (routed) {
      g.notice =
        routed.destination === "counter"
          ? `已从锁定的${stoveName(s)}起锅，品质 ${routed.quality}；设备仍需检修`
          : `出餐台已满，${stoveName(s)} 锅内食品计入废弃；设备仍需检修`;
    } else {
      g.notice = `出餐台已满，无法起锅；${stoveName(s)} 仍锁定`;
    }
    return;
  }
  if (s.status !== "cooking") {
    g.notice = `${stoveName(s)} 处于停机状态，无法起锅`;
    return;
  }
  finishCooking(g, s);
}
