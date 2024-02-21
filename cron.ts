import {concludeAbandonedGames, invalidateAbandonedGames} from './utils'
import {UndirectedGraph} from "graphology";

export function runCron(graph: UndirectedGraph) {
  async function task() {
    await concludeAbandonedGames(graph);
    await invalidateAbandonedGames();
    setTimeout(task, 1000*5);
  }

  task();
}
