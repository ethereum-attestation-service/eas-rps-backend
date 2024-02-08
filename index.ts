import express from 'express'
import axios from "axios";
import cors from 'cors'
import bodyParser from "body-parser";
import {Graph, StoreIPFSActionReturn} from "./types";
import verificationMiddleware from './verifyAttestation'
import {
  SchemaEncoder, AttestationShareablePackageObject, ZERO_BYTES, ZERO_BYTES32
} from "@ethereum-attestation-service/eas-sdk";
import dayjs from "dayjs";

import {PrismaClient, Game, Link, Player} from "@prisma/client";

const prisma = new PrismaClient();
import {UndirectedGraph} from "graphology";
import {subgraph} from "graphology-operators";

const graph = new UndirectedGraph();

import {
  updateEloChangeIfApplicable,
  CHOICE_UNKNOWN,
  CUSTOM_SCHEMAS,
  dbFriendlyAttestation,
  STATUS_UNKNOWN, RPS_GAME_UID, getGameStatus, STATUS_PLAYER1_WIN, STATUS_PLAYER2_WIN, insertToTop10
} from "./utils";
import {ethers} from 'ethers';
import {loadGraph, addLink} from "./graph";
import {bfsFromNode} from "graphology-traversal";

const app = express()
const port = 8080


app.use(bodyParser.urlencoded({extended: true}));

app.use(bodyParser.json());
app.use(cors())

// note: build in middleware to verify all attestations
app.post('/newAttestation', verificationMiddleware, async (req, res) => {
  const attestation: AttestationShareablePackageObject = JSON.parse(req.body.textJson)

  if (attestation.sig.message.schema === CUSTOM_SCHEMAS.CREATE_GAME_CHALLENGE) {
    if (attestation.sig.message.refUID !== RPS_GAME_UID) {
      return
    }

    const schemaEncoder = new SchemaEncoder("string stakes");
    const stakes = (schemaEncoder.decodeData(attestation.sig.message.data))[0].value.value.toString();

    const player1 = attestation.signer
    const player2 = attestation.sig.message.recipient
    if (player1 === player2) {
      return
    }

    await addLink(player1, player2, graph);

    await prisma.game.create({
      data: {
        uid: attestation.sig.uid,
        player1Object: {
          connect: {
            address: player1
          }
        },
        player2Object: {
          connect: {
            address: player2
          }
        },
        commit1: ZERO_BYTES32,
        commit2: ZERO_BYTES32,
        choice1: CHOICE_UNKNOWN,
        choice2: CHOICE_UNKNOWN,
        salt1: ZERO_BYTES32,
        salt2: ZERO_BYTES32,
        stakes: stakes,
        link: {
          connect: {
            player1_player2: {
              player1: player1,
              player2: player2,
            }
          }
        }
      }
    })

  } else if (attestation.sig.message.schema === CUSTOM_SCHEMAS.COMMIT_HASH) {
    const schemaEncoder = new SchemaEncoder("bytes32 commitHash");

    const commitHash = (schemaEncoder.decodeData(attestation.sig.message.data))[0].value.value.toString();
    const gameID = attestation.sig.message.refUID;

    const players = await prisma.game.findUnique({
      select: {
        player1: true,
        player2: true,
      },
      where: {
        uid: gameID
      }
    })

    if (attestation.signer === players!.player1) {
      await prisma.game.update({
        where: {
          uid: gameID,
        },
        data: {
          commit1: commitHash,
          updatedAt: dayjs().unix(),
        }
      })
    } else if (attestation.signer === players!.player2) {
      await prisma.game.update({
        where: {
          uid: gameID,
        },
        data: {
          commit2: commitHash,
          updatedAt: dayjs().unix(),
        }
      })
    }
  } else if (attestation.sig.message.schema === CUSTOM_SCHEMAS.DECLINE_GAME_CHALLENGE) {
    const gameID = attestation.sig.message.refUID;

    const players = await prisma.game.findUnique({
      select: {
        player2: true,
      },
      where: {
        uid: gameID,
        commit2: ZERO_BYTES32,
      }
    })

    if (!players) {
      return
    }

    if (attestation.signer === players.player2) {
      await prisma.game.update({
        where: {
          uid: gameID,
        },
        data: {
          declined: true,
          updatedAt: dayjs().unix(),
        }
      })
    }
  }

  await prisma.attestation.create({
    data: dbFriendlyAttestation(attestation)
  })

  const result: StoreIPFSActionReturn = {
    error: null,
    ipfsHash: null,
    offchainAttestationId: attestation.sig.uid
  }
  res.json(result)
})

app.post('/gameStatus', async (req, res) => {
  const {uid} = req.body

  const game = await prisma.game.findUnique({
    where: {
      uid: uid
    },
    include: {
      relevantAttestations: {
        select: {
          packageObjString: true,
        }
      },
      player1Object: true,
      player2Object: true,
    }
  })

  res.json(game)
})

const finalizedGamesFilter = {
  gamesPlayed: {
    where: {
      finalized: true
    }
  },
}
app.post('/incomingChallenges', async (req, res) => {
  const {address}: { address: string } = req.body

  const challenges = await prisma.game.findMany({
    where: {
      player2: address,
      commit2: ZERO_BYTES32,
      declined: false,
    },
    include: {
      link: {
        include: {
          ...finalizedGamesFilter,
          opposite: {
            include: finalizedGamesFilter,
          }
        }
      },
      player1Object: true,
    },
  });

  let winStreaks: number[] = [];
  let gameCounts: number[] = [];

  for (const challenge of challenges) {
    // Get list of games sorted by updatedAt
    const games = challenge.link.gamesPlayed.concat(challenge.link.opposite.gamesPlayed).sort((a, b) => b.updatedAt - a.updatedAt);
    gameCounts.push(games.length);
    if (games.length === 0) {
      winStreaks.push(0);
      continue;
    }
    let currIdx = 0;
    let winStreak = 0;

    while (currIdx < games.length && (
      (getGameStatus(games[currIdx]) === STATUS_PLAYER1_WIN && address === games[currIdx].player1) ||
      (getGameStatus(games[currIdx]) === STATUS_PLAYER2_WIN && address === games[currIdx].player2)
    )) {
      winStreak++;
      currIdx++;
    }
    winStreaks.push(winStreak);
  }

  res.json(challenges.map((challenge, idx) => ({
    uid: challenge.uid,
    player1Object: challenge.player1Object,
    stakes: challenge.stakes,
    winstreak: winStreaks[idx],
    gameCount: gameCounts[idx],
  })));
})


app.post('/gamesPendingReveal', async (req, res) => {
  const {address} = req.body

  const games = await prisma.game.findMany({
    select: {
      uid: true,
    },
    where: {
      commit1: {
        not: ZERO_BYTES32
      },
      commit2: {
        not: ZERO_BYTES32
      },
      OR: [
        {
          player1: address,
          choice1: CHOICE_UNKNOWN
        },
        {
          player2: address,
          choice2: CHOICE_UNKNOWN
        }
      ]
    },
  });

  res.json(games.map((game) => game.uid))

})

app.post('/revealMany', async (req, res) => {
  type Reveal = { uid: string, choice: number, salt: string }
  const {reveals}: { reveals: Reveal[] } = req.body

  for (const reveal of reveals) {
    const {uid, choice, salt} = reveal

    let game = await prisma.game.findUnique({
      where: {
        uid: uid
      },
      include: {
        player1Object: true,
        player2Object: true,
      }
    })

    if (!game) {
      continue
    }

    const hashedChoice = ethers.solidityPackedKeccak256(
      ["uint256", "bytes32"],
      [choice, salt]
    );

    if (hashedChoice === game.commit1) {
      game.choice1 = choice
      game.salt1 = salt
    } else if (hashedChoice === game.commit2) {
      game.choice2 = choice
      game.salt2 = salt
    }


    const [eloChange1, eloChange2, finalized] = await updateEloChangeIfApplicable(game, graph);

    await prisma.game.update({
      where: {
        uid: reveal.uid
      },
      data: {
        choice1: game.choice1,
        choice2: game.choice2,
        salt1: game.salt1,
        salt2: game.salt2,
        eloChange1: eloChange1,
        eloChange2: eloChange2,
        finalized: finalized,
      }
    })
  }

  res.json({})
})

app.post('/myGames', async (req, res) => {
  const {address, finalized} = req.body
  const myStats = await prisma.player.findUnique({
    where: {
      address: address
    },
    include: {
      gamesPlayedAsPlayer1: {
        where: {
          declined: false,
          finalized: finalized,
        },
      },
      gamesPlayedAsPlayer2: {
        where: {
          declined: false,
          finalized: finalized,
        }
      },
    }
  });

  if (!myStats) {
    return
  }

  const player1Games = myStats.gamesPlayedAsPlayer1
  const player2Games = myStats.gamesPlayedAsPlayer2

  let games = player1Games.concat(player2Games).sort((a, b) => b.updatedAt - a.updatedAt);

  res.json({games: games, elo: myStats.elo});
});


const graphGameFilter = {
  select: {
    uid: true,
    updatedAt: true,
    declined: true,
    choice1: true,
    choice2: true,
  },
  where: {
    declined: false,
  }
};
app.post('/getGraph', async (req, res) => {
  const links = graph.edges().map((edge) => {
    // get destination of edge
    return {source: graph.source(edge), target: graph.target(edge)}
  })


  res.json({
    nodes: graph.nodes().map((node) => ({id: node})),
    links: links
  })
})

app.post('/getGamesBetweenPlayers', async (req, res) => {
  const {player1, player2} = req.body

  const link = await prisma.link.findUnique({
    where: {
      player1_player2: {
        player1: player1,
        player2: player2,
      }
    },
    include: {
      gamesPlayed: graphGameFilter,
      opposite: {
        include: {
          gamesPlayed: graphGameFilter,
        }
      }
    }
  });

  if (!link) return;

  res.json(link.gamesPlayed.concat(link.opposite.gamesPlayed).sort((a, b) => b.updatedAt - a.updatedAt))
})

app.post('/getElo', async (req, res) => {
  const {address} = req.body
  if (!graph.hasNode(address)) {
    return
  }
  const player = graph.getNodeAttributes(address)
  res.json(player.elo)
})

app.post('/ongoing', async (req, res) => {
  const {address} = req.body
  const games = await prisma.game.findMany({
    where: {
      OR: [
        {
          player1: address,
          choice1: CHOICE_UNKNOWN
        },
        {
          player2: address,
          choice2: CHOICE_UNKNOWN,
          commit2: {
            not: ZERO_BYTES32
          }
        }
      ]
    },
    include: {
      player1Object: true,
      player2Object: true,
    }
  });

  res.json(games)
})

app.post('/globalLeaderboard', async (req, res) => {
  const players = await prisma.player.findMany({
    orderBy: {
      elo: 'desc'
    },
    take: 10
  });

  res.json(players)
})

app.post('/localLeaderboard', async (req, res) => {
  // bfs from address
  const {address} = req.body

  if (!graph.hasNode(address)) {
    return
  }
  let leaderboard: Player[] = [];
  bfsFromNode(graph, address, (node, attr, depth) => {
    if (depth > 1) {
      return true;
    } else {
      insertToTop10(leaderboard, {address: node, elo: attr.elo});
      return false;
    }
  });

  res.json(leaderboard)
})

app.post('/localGraph', async (req, res) => {
  const {address} = req.body;
  let nodes: string[] = [];
  bfsFromNode(graph, address, (node, attr, depth) => {
    if (depth > 1) {
      return true;
    } else {
      nodes.push(node);
      return false;
    }
  });

  const sg = subgraph(graph, nodes);

  const links = sg.edges().map((edge) => {
    // get destination of edge
    return {source: graph.source(edge), target: sg.target(edge)}
  });


  res.json({
    nodes: nodes.map((node) => ({id: node})),
    links: links
  })
})

app.listen(port, async () => {
  await loadGraph(graph)
  console.log(` app listening on port ${port}`)
})
