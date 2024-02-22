import {PrismaClient} from "@prisma/client";

const prisma = new PrismaClient();

import {UndirectedGraph} from "graphology";
import {createPlayerIfDoesntExistAndReturnENS} from "./utils";


export async function updateNode(player: string, elo: number, g: UndirectedGraph) {
  await prisma.player.update({
    where: {
      address: player,
    },
    data: {
      elo: elo,
    },
  });

  g.mergeNode(player, {
    elo,
    badges: g.getNodeAttribute(player, "badges"),
    ensName: g.getNodeAttribute(player, "ensName")
  });
}

export async function loadGraph(g: UndirectedGraph) {
  const allEdges = await prisma.link.findMany({
    include: {
      player1Object: {
        select: {
          elo: true,
          ensName: true,
          whiteListAttestations: {
            select: {
              type: true,
            }
          }
        },
      },
    }
  });

  for (const edge of allEdges) {
    g.mergeNode(edge.player1, {
      elo: edge.player1Object.elo,
      badges: edge.player1Object.whiteListAttestations.map(elem => elem.type),
      ensName: edge.player1Object.ensName
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
    const ens1 = await createPlayerIfDoesntExistAndReturnENS(player1);
    const ens2 = await createPlayerIfDoesntExistAndReturnENS(player2);
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

    const [node1, node2] = [player1, player2].map(player => g.getNodeAttributes(player));

    if (!node1.elo && node1.elo !== 0) {
      g.setNodeAttribute(player1, "elo", 0);
      g.setNodeAttribute(player1, "ensName", ens1);
    }

    if (!node2.elo && node2.elo !== 0) {
      g.setNodeAttribute(player2, "elo", 0);
      g.setNodeAttribute(player2, "ensName", ens2);
    }
  }
}
