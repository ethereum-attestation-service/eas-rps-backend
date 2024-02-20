import {PrismaClient} from "@prisma/client";

const prisma = new PrismaClient();

import {UndirectedGraph} from "graphology";
import {createPlayerIfDoesntExist} from "./utils";


export async function updateNode(player: string, elo: number, g: UndirectedGraph) {
  await prisma.player.update({
    where: {
      address: player,
    },
    data: {
      elo: elo,
    },
  });

  g.mergeNode(player, {elo, badges: g.getNodeAttribute(player, "badges")});
}

export async function loadGraph(g: UndirectedGraph) {
  const allEdges = await prisma.link.findMany({
    where: {
      default: true,
    },
    include: {
      player1Object: {
        select: {
          elo: true,
          whiteListAttestations: {
            select: {
              type: true,
            }
          }
        },
      },
      player2Object: {
        select: {
          elo: true,
          whiteListAttestations: {
            select: {
              type: true,
            }
          }
        },
      }
    }
  });

  for (const edge of allEdges) {
    g.mergeNode(edge.player1, {
      elo: edge.player1Object.elo,
      badges: edge.player1Object.whiteListAttestations.map(elem => elem.type)
    });
    g.mergeNode(edge.player1, {
      elo: edge.player1Object.elo,
      badges: edge.player1Object.whiteListAttestations.map(elem => elem.type)
    });
    g.mergeEdge(edge.player1, edge.player2);
  }
}

export async function addLink(player1: string, player2: string, g: UndirectedGraph) {
  const existingLink = await prisma.link.findUnique({
    where: {
      player1_player2: {
        player1: player1,
        player2: player2,
      }
    }
  });

  if (!existingLink) {
    await createPlayerIfDoesntExist(player1);
    await createPlayerIfDoesntExist(player2);
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
    g.mergeEdge(player1, player2);

    if (!g.getNodeAttributes(player1).elo) {
      g.setNodeAttribute(player1, "elo", 1000);
    }

    if (!g.getNodeAttributes(player2).elo) {
      g.setNodeAttribute(player2, "elo", 1000);
    }
  }
}
