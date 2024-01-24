import {Attestation, Game, PrismaClient} from "@prisma/client";
import {AttestationShareablePackageObject} from "@ethereum-attestation-service/eas-sdk";

const prisma = new PrismaClient();
export const CUSTOM_SCHEMAS = {
  COMMIT_HASH:
    "0x2328029cfa84b9ea42f4e0e8fa24fbf66da07ceec0a925dd27370b9617b32d59",
  CREATE_GAME_CHALLENGE:
    "0x64b1bac6f531c64a6aa372b1239111fe41a60003dcda62bfa967bc6e4c4d91e0",
  DECLINE_GAME_CHALLENGE:
    "0x27e160d185f1d97202897bd3ed697906398b70a8d08b0d22bc2cfffdf561e3e9",
};

export const RPS_GAME_UID =
  "0x048de8e6b4bf0769744930cc2641ce05d473f3cd5ce976ba9e6a3256d4b011eb";

export const CHOICE_UNKNOWN = 3;

export const STATUS_DRAW = 0;
export const STATUS_PLAYER1_WIN = 1;
export const STATUS_PLAYER2_WIN = 2;

export const STATUS_UNKNOWN = 3;
export const STATUS_INVALID = 4;

export const RESULT_DRAW = 0;
export const RESULT_WIN = 1;
export const RESULT_LOSS = 2;

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
    onChainTimestamp: 0
  }
}

export async function createPlayerIfNonexistent(address:string) {
  await prisma.player.upsert({
    where: {
      address: address
    },
    update: {},
    create: {
      address: address
    }
  })
}
