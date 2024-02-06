import {Graph} from "./types";
import {PrismaClient} from "@prisma/client";

const prisma = new PrismaClient();

function addEdge(player1: string, player2: string, g: Graph) {
  if (!g[player1]) g[player1] = [];
  g[player1].push(player2);

  if (!g[player2]) g[player2] = [];
  g[player2].push(player1);
}


export async function loadGraph(g: Graph) {
  const allEdges = await prisma.link.findMany({
    where: {
      default: true,
    }
  });

  for (const edge of allEdges) {
    addEdge(edge.player1, edge.player2, g);
  }
}

export async function addLink(player1: string, player2: string, g: Graph) {
  const existingLink = await prisma.link.findUnique({
    where: {
      player1_player2: {
        player1: player1,
        player2: player2,
      }
    }
  });

  if (!existingLink) {
    await prisma.link.createMany({
      data: [
        {
          player1: player1,
          player2: player2,
          default: true,
        },
        {
          player1: player2,
          player2: player1,
          default: false,
        }
      ]
    })
  }

  addEdge(player1, player2, g);
}
