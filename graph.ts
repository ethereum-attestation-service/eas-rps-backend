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
    ...g.getNodeAttributes(player)
  });
}

export async function loadGraph(g: UndirectedGraph) {
  const allNodes = await prisma.player.findMany({
    include: {
      whiteListAttestations: true
    }
  });
  for (const node of allNodes) {
    g.mergeNode(node.address, {
      elo: node.elo,
      ensName: node.ensName,
      ensAvatar: node.ensAvatar,
      badges: node.whiteListAttestations.map(attestation => attestation.type),
    });
  }


  const allEdges = await prisma.link.findMany({
    select: {
      player1: true,
      player2: true
    },
    where: {
      default: true
    }
  });

  for (const edge of allEdges) {
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
      g.mergeNode(player1, {
        elo: 0,
        ensName: ens1.name,
        ensAvatar: ens1.avatar,
        badges: [],
      })
    }

    if (!node2.elo && node2.elo !== 0) {
      g.mergeNode(player2, {
        elo: 0,
        ensName: ens2.name,
        ensAvatar: ens2.avatar,
        badges: [],
      })
    }
  }
}
