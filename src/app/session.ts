import { reactive, onUnmounted } from "vue";
import { createGame } from "../shared/initial";
import { expire, arrive } from "../features/orders";
import { closeShift, saveBest, readSnapshot } from "../features/ledger";
import { tickStoves } from "../features/kitchen";
export function useSession() {
  const snapshot = readSnapshot();
  const game = reactive(createGame(snapshot?.best ?? 0, snapshot));
  let last = performance.now(),
    carry = 0;
  const timer = setInterval(() => {
    const now = performance.now(),
      dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    // 暂停时不推进时间，也不推进设备磨损与停机计时。
    if (!game.running) return;
    carry += dt;
    while (carry >= 0.1 && game.running) {
      carry -= 0.1;
      game.time = Math.min(
        game.duration,
        Math.round((game.time + 0.1) * 10) / 10,
      );
      tickStoves(game, 0.1);
      expire(game);
      if (Math.round(game.time * 10) % 180 === 0) arrive(game);
      if (game.time >= game.duration) {
        closeShift(game);
        saveBest(game);
      }
    }
  }, 50);
  onUnmounted(() => clearInterval(timer));
  function toggle() {
    if (game.ended) return;
    carry = 0;
    last = performance.now();
    game.running = !game.running;
    game.notice = game.running
      ? "营业中，客人已经入座。"
      : "已暂停，所有厨房计时冻结。";
  }
  function restart() {
    const next = readSnapshot();
    Object.assign(game, createGame(game.best, next));
    carry = 0;
    last = performance.now();
  }
  return { game, toggle, restart };
}
