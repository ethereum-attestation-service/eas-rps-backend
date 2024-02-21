import {Attestation, Game, PrismaClient} from "@prisma/client";
import {AttestationShareablePackageObject, ZERO_ADDRESS, ZERO_BYTES32} from "@ethereum-attestation-service/eas-sdk";
import {GameWithPlayers, GameWithPlayersAndAttestations} from "./types";
import {updateNode} from "./graph";
import {UndirectedGraph} from "graphology";
import dayjs from "dayjs";
import {EAS, SchemaEncoder} from "@ethereum-attestation-service/eas-sdk";
import {ethers} from "ethers";
import axios from "axios";


const prisma = new PrismaClient();

export const CUSTOM_SCHEMAS = {
  COMMIT_HASH:
    "0x2328029cfa84b9ea42f4e0e8fa24fbf66da07ceec0a925dd27370b9617b32d59",
  CREATE_GAME_CHALLENGE:
    "0x8f60d8dbd47e0a6953b0b1fd640359d249ba8f14c15c02bc5c6b642b0b888f37",
  DECLINE_GAME_CHALLENGE:
    "0x27e160d185f1d97202897bd3ed697906398b70a8d08b0d22bc2cfffdf561e3e9",
  FINALIZE_GAME:
    "0x74421276d2c56437784aec6f2ede7d837c2196897b16c0c73fa84865ce9ee565"
};

export const RPS_GAME_UID =
  "0x9a3b8beb51629e4624923863231c3931f466e79dac4d7c7f2d0e346240e66a72";

export const EAS_CONTRACT_ADDRESS = "0xC2679fBD37d54388Ce493F1DB75320D236e1815e";

export const CHOICE_UNKNOWN = 3;

export const STATUS_DRAW = 0;
export const STATUS_PLAYER1_WIN = 1;
export const STATUS_PLAYER2_WIN = 2;

export const STATUS_UNKNOWN = 3;
// export const STATUS_INVALID = 4;
//
// export const RESULT_DRAW = 0;
// export const RESULT_WIN = 1;
// export const RESULT_LOSS = 2;


// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export function dbFriendlyAttestation(attestation: AttestationShareablePackageObject): Attestation {
  return {
    uid: attestation.sig.uid,
    isOffchain: true,
    data: attestation.sig.message.data,
    attester: attestation.signer,
    recipient: attestation.sig.message.recipient,
    refUID: attestation.sig.message.refUID,
    schemaId: attestation.sig.message.schema,
    signature: JSON.stringify(attestation.sig.signature),
    gameUID: attestation.sig.message.schema === CUSTOM_SCHEMAS.CREATE_GAME_CHALLENGE ? attestation.sig.uid : attestation.sig.message.refUID,
    onChainTimestamp: 0,
    packageObjString: JSON.stringify(attestation),
  }
}


function calculateEloScore(player1Elo: number, player2Elo: number, result: number): [number, number] {
  const K = 32; // The maximum points that can be gained or lost
  const R1 = Math.pow(10, player1Elo / 400);
  const R2 = Math.pow(10, player2Elo / 400);

  // Expected scores
  const E1 = R1 / (R1 + R2);
  const E2 = R2 / (R1 + R2);

  let S1, S2;

  switch (result) {
    case STATUS_PLAYER1_WIN:
      // If player1 wins, S1 is 1, S2 is 0
      S1 = 1;
      S2 = 0;
      break;
    case STATUS_PLAYER2_WIN:
      // If player1 loses, S1 is 0, S2 is 1
      S1 = 0;
      S2 = 1;
      break;
    case STATUS_DRAW:
      // If it's a draw, S1 and S2 are 0.5
      S1 = 0.5;
      S2 = 0.5;
      break;
  }

  // if (typeof S1 === "undefined" || typeof S2 === "undefined") throw new Error("Invalid result");
  // New Elo rating calculation
  const newElo1 = player1Elo + K * (S1! - E1);
  const newElo2 = player2Elo + K * (S2! - E2);

  return [Math.round(newElo1), Math.round(newElo2)];
}

export function getGameStatus(game: Game) {
  if (game.choice1 === CHOICE_UNKNOWN || game.choice2 === CHOICE_UNKNOWN) {
    return STATUS_UNKNOWN;
  }
  return (3 + game.choice1 - game.choice2) % 3;
}

export async function updateEloChangeIfApplicable(game: GameWithPlayers, graph: UndirectedGraph): Promise<[number, number, boolean]> {
  const elo1 = game.player1Object.elo;
  const elo2 = game.player2Object.elo;
  const gameStatus = getGameStatus(game);
  if (gameStatus === STATUS_UNKNOWN) return [0, 0, false];
  const player1Verified = graph.getNodeAttributes(game.player1Object.address).badges &&
    graph.getNodeAttributes(game.player1Object.address).badges.length > 0;
  const player2Verified = graph.getNodeAttributes(game.player2Object.address).badges &&
    graph.getNodeAttributes(game.player2Object.address).badges.length > 0;
  const bothVerified = player1Verified && player2Verified;

  const [newElo1, newElo2] = bothVerified ?
    calculateEloScore(elo1, elo2, gameStatus) : [elo1, elo2];

  await updateNode(game.player1Object.address, newElo1, graph);
  await updateNode(game.player2Object.address, newElo2, graph);

  return [newElo1 - elo1, newElo2 - elo2, true]
}

export async function createPlayerIfDoesntExist(address: string) {
  const player = await prisma.player.findUnique({
    where: {
      address: address,
    }
  });

  if (!player) {
    await prisma.player.create({
      data: {
        address: address,
      }
    });
  }
}

export type LeaderboardPlayer = {
  address: string;
  elo: number;
  badges: string[];
}

export function insertToLeaderboard(currList: LeaderboardPlayer[], newPlayer: LeaderboardPlayer, numPlayers: number) {
  const idxToInsertAt = currList.findIndex((player) => player.elo < newPlayer.elo);
  if (idxToInsertAt === -1) {
    if (currList.length < numPlayers) {
      currList.push(newPlayer);
    }
  } else {
    currList.splice(idxToInsertAt, 0, newPlayer);
    if (currList.length > numPlayers) {
      currList.pop();
    }
  }
}


export async function signGameFinalization(game: GameWithPlayersAndAttestations, abandoned: boolean) {
  const eas = new EAS(EAS_CONTRACT_ADDRESS);
// Signer must be an ethers-like signer.
  const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
  const signer = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);

  eas.connect(signer);
// Initialize SchemaEncoder with the schema string
  const schemaEncoder = new SchemaEncoder("bytes32[] relevantAttestations,bytes32 salt1,bytes32 salt2,uint8 choice1,uint8 choice2,bool abandoned");
  const encodedData = schemaEncoder.encodeData([
    {name: "relevantAttestations", value: game.relevantAttestations.map(att => att.uid), type: "bytes32[]"},
    {name: "salt1", value: game.salt1, type: "bytes32"},
    {name: "salt2", value: game.salt2, type: "bytes32"},
    {name: "choice1", value: game.choice1, type: "uint8"},
    {name: "choice2", value: game.choice2, type: "uint8"},
    {name: "abandoned", value: abandoned, type: "bool"}
  ]);

  const offchain = await eas.getOffchain();

  const signedOffchainAttestation = await offchain.signOffchainAttestation(
    {
      schema: CUSTOM_SCHEMAS.FINALIZE_GAME,
      recipient: ZERO_ADDRESS,
      refUID: game.uid,
      data: encodedData,
      time: BigInt(dayjs().unix()),
      revocable: false,
      expirationTime: BigInt(0),
    },
    signer,
  );

  const pkg: AttestationShareablePackageObject = {
    signer: signer.address!,
    sig: signedOffchainAttestation,
  };

  return pkg;
}

export const timePerMove = 30; // 30 sec

export async function concludeAbandonedGames(graph: UndirectedGraph) {
  const abandonedGames = await prisma.game.findMany({
    where: {
      AND: [
        {
          OR: [
            {choice1: CHOICE_UNKNOWN},
            {choice2: CHOICE_UNKNOWN}
          ]
        },
        {NOT: {commit1: ZERO_BYTES32}},
        {NOT: {commit2: ZERO_BYTES32}},
        {NOT: {choice1: CHOICE_UNKNOWN, choice2: CHOICE_UNKNOWN}},
        {
          updatedAt: {lt: dayjs().unix() - timePerMove}
        }
      ]
    },
    include: {
      player1Object: true,
      player2Object: true,
      relevantAttestations: {
        select: {
          uid: true
        }
      }
    }
  });


  for (let game of abandonedGames) {
    const player1Abandoned = game.choice1 === CHOICE_UNKNOWN;
    if (player1Abandoned) {
      game.choice1 = (game.choice2 + 2) % 3; // Give player 1 the losing choice
    } else {
      game.choice2 = (game.choice1 + 2) % 3; // Give player 2 the losing choice
    }

    const [eloChange1, eloChange2, finalized] = await updateEloChangeIfApplicable(game, graph);

    if (finalized) {
      const finalizationAttestation = await signGameFinalization(game, true);
      await prisma.attestation.create({
        data: dbFriendlyAttestation(finalizationAttestation),
      })
    }

    await prisma.game.update({
      where: {
        uid: game.uid
      },
      data: {
        choice1: game.choice1,
        choice2: game.choice2,
        salt1: game.salt1,
        salt2: game.salt2,
        eloChange1: eloChange1,
        eloChange2: eloChange2,
        finalized: finalized,
        updatedAt: dayjs().unix(),
      }
    })
  }
}

export async function invalidateAbandonedGames() {
  const abandonedGames = await prisma.game.findMany({
    where: {
      AND: [
        {choice1: CHOICE_UNKNOWN, choice2: CHOICE_UNKNOWN},
        {
          updatedAt: {lt: dayjs().unix() - timePerMove}
        },
        {invalidated: false}
      ]
    },
    include: {
      player1Object: true,
      player2Object: true,
      relevantAttestations: {
        select: {
          uid: true
        }
      }
    }
  });

  for (let game of abandonedGames) {
    const finalizationAttestation = await signGameFinalization(game, true);
    await prisma.attestation.create({
      data: dbFriendlyAttestation(finalizationAttestation),
    })


    await prisma.game.update({
      where: {
        uid: game.uid
      },
      data: {
        choice1: game.choice1,
        choice2: game.choice2,
        salt1: game.salt1,
        salt2: game.salt2,
        finalized: true,
        updatedAt: dayjs().unix(),
        invalidated: true
      }
    });
  }
}

type AuthorizedSchema = {
  name: string;
  attestors: string[];
  schemaId: string;
}

const addresses = {
  coinbase: '0x357458739F90461b99789350868CD7CF330Dd7EE',
  steve: '0x0fb166cDdF1387C5b63fFa25721299fD7b068f3f',
  bryce: '0x3e95B8E249c4536FE1db2E4ce5476010767C0A05',
  jacob: '0xD04d9F44244929205cC4d1D9F21c96205DfD272B',
};

type Chain = 'base' | 'mainnet';
export const AUTHORIZED_SCHEMAS = {
  base: [{
    name: 'Coinbase Verification',
    attestors: [addresses.coinbase],
    schemaId: "0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9"
  }],
  mainnet: [{
    name: 'EAS Met IRL',
    attestors: [addresses.steve, addresses.bryce, addresses.jacob],
    schemaId: "0xc59265615401143689cbfe73046a922c975c99d97e4c248070435b1104b2dea7"
  }]
}

type AttestationResponse = {
  decodedDataJson: string;
  id: string;
  isOffchain: boolean;
}

const CHAIN_ENDPOINTS = {
  base: "https://base.easscan.org/graphql",
  mainnet: "https://easscan.org/graphql"
}

export async function getAttestations(address: string, chain: Chain, timestamp: number) {
  try {
    // Get all attestations for this schema from graphql since last timestamp
    const response = await axios.post(
      CHAIN_ENDPOINTS[chain],
      {
        'query': 'query Query($where: AttestationWhereInput) {\n  attestations(where: $where) {\n    decodedDataJson\n    id\n    isOffchain\n  }\n}\n',
        'variables': {
          'where': {
            'OR': AUTHORIZED_SCHEMAS[chain].map((schema: AuthorizedSchema) => ({
              'attester': {
                'in': schema.attestors
              },
              'schemaId': {
                'equals': schema.schemaId
              }
            })),
            'recipient': {
              'equals': address
            },
            'time': {
              'gt': timestamp
            }
          }
        },
        'operationName': 'Query'
      },
      {
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
          'Origin': 'https://studio.apollographql.com',
          'Referer': 'https://studio.apollographql.com/sandbox/explorer',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'content-type': 'application/json',
          'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"'
        }
      }
    );

    return response.data.data.attestations.map((attestation: AttestationResponse) => ({...attestation, chain}));
  } catch {
    return []
  }
}

export async function checkForNewVerifications(address: string, g: UndirectedGraph) {
  const player = await prisma.player.findUnique({
    select: {
      whiteListTimestamp: true,
      whiteListAttestations: true
    },
    where: {
      address: address
    }
  });

  if (!player) {
    return;
  }

  const attestations = [...await getAttestations(address, 'base', player.whiteListTimestamp),
    ...await getAttestations(address, 'mainnet', player.whiteListTimestamp)];

  for (const attestation of attestations) {
    //generate a new WhitelistAttestation in the db
    try {
      const badgeType = attestation.chain === 'base' ? "Coinbase" : "MetIRL"
      await prisma.whitelistAttestation.create({
        data: {
          type: badgeType,
          uid: attestation.id,
          packageObjString: attestation.decodedDataJson,
          chain: attestation.chain,
          isOffchain: attestation.isOffchain,
          recipient: address,
        }
      });


      g.mergeNode(address, {
        elo: g.getNodeAttribute(address, "elo") || 1000,
        badges: [...g.getNodeAttribute(address, "badges"), badgeType]
      })
    } catch {
    }
  }

  await prisma.player.update({
    where: {
      address: address
    },
    data: {
      whiteListTimestamp: dayjs().unix(),
      elo: g.getNodeAttribute(address, "elo"),
    }
  });
}
