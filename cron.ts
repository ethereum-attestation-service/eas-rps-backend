import {concludeAbandonedGames} from './utils'
import {UndirectedGraph} from "graphology";

export function runCron(graph: UndirectedGraph) {
  async function task() {
    await concludeAbandonedGames(graph);
    setTimeout(task, 1000*5);
  }

  task();
}
