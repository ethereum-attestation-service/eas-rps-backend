import {Attestation, Game, Player, PrismaClient} from "@prisma/client";
import {AttestationShareablePackageObject, ZERO_ADDRESS, ZERO_BYTES32} from "@ethereum-attestation-service/eas-sdk";
import {GameWithPlayers} from "./types";
import {updateNode} from "./graph";
import {UndirectedGraph} from "graphology";
import exp from "node:constants";
import dayjs from "dayjs";
import {EAS, SchemaEncoder} from "@ethereum-attestation-service/eas-sdk";
import {ethers} from "ethers";


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
  "0x048de8e6b4bf0769744930cc2641ce05d473f3cd5ce976ba9e6a3256d4b011eb";

export const EAS_CONTRACT_ADDRESS = "0xC2679fBD37d54388Ce493F1DB75320D236e1815e";

export const CHOICE_UNKNOWN = 3;

export const STATUS_DRAW = 0;
export const STATUS_PLAYER1_WIN = 1;
export const STATUS_PLAYER2_WIN = 2;

export const STATUS_UNKNOWN = 3;
export const STATUS_INVALID = 4;

export const RESULT_DRAW = 0;
export const RESULT_WIN = 1;
export const RESULT_LOSS = 2;


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
  const [newElo1, newElo2] = calculateEloScore(elo1, elo2, gameStatus);

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

export function insertToTop10(currList: Player[], newPlayer: Player) {
  const idxToInsertAt = currList.findIndex((player) => player.elo < newPlayer.elo);
  if (idxToInsertAt === -1) {
    if (currList.length < 10) {
      currList.push(newPlayer);
    }
  } else {
    currList.splice(idxToInsertAt, 0, newPlayer);
    if (currList.length > 10) {
      currList.pop();
    }
  }
}


export async function signGameFinalization(game: GameWithPlayers, abandoned: boolean) {
  const eas = new EAS(EAS_CONTRACT_ADDRESS);
// Signer must be an ethers-like signer.
  const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
  const signer = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);

  await eas.connect(signer);
// Initialize SchemaEncoder with the schema string
  const schemaEncoder = new SchemaEncoder("bytes32[] relevantAttestations,bytes32 salt1,bytes32 salt2,uint8 choice1,uint8 choice2,bool abandoned");
  const encodedData = schemaEncoder.encodeData([
    {name: "relevantAttestations", value: [], type: "bytes32[]"},
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

export const timePerMove = 60; // 1 minute

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

