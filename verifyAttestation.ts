import {
  AttestationShareablePackageObject, EAS,
  Offchain, SignedOffchainAttestation, SignedOffchainAttestationV1,
} from "@ethereum-attestation-service/eas-sdk";
import {PrismaClient} from "@prisma/client";
import dayjs, {Dayjs} from "dayjs";

const prisma = new PrismaClient();


const SEPOLIA_CONFIG = {
  chainId: 11155111,
  chainName: "sepolia",
  subdomain: "sepolia.",
  version: "0.26",
  contractAddress: "0xC2679fBD37d54388Ce493F1DB75320D236e1815e",
  schemaRegistryAddress: "0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0",
  etherscanURL: "https://sepolia.etherscan.io",
  contractStartBlock: 2958570,
}

export const EAS_CONFIG = {
  address: SEPOLIA_CONFIG.contractAddress,
  version: SEPOLIA_CONFIG.version,
  chainId: BigInt(SEPOLIA_CONFIG.chainId),
};

function timestampsWithinTwoMinutesOfServer(time: Dayjs) {
  return dayjs().diff(time, "minute") < 2;
}


export async function verifyOffchainAttestation(
  offchainAttestationObj: AttestationShareablePackageObject
): Promise<boolean> {
  const eas = new EAS(EAS_CONFIG.address);
  const offchain = new Offchain(
    EAS_CONFIG,
    offchainAttestationObj.sig.message.version ?? 0,
    eas
  );

  if (offchainAttestationObj.sig.types.EIP712Domain) {
    delete offchainAttestationObj.sig.types.EIP712Domain;
  }

  offchainAttestationObj.sig.domain.chainId = BigInt(
    offchainAttestationObj.sig.domain.chainId
  );

  offchainAttestationObj.sig.message.nonce = BigInt(
    offchainAttestationObj.sig.message.nonce ?? 0
  );

  offchainAttestationObj.sig.message.time = BigInt(
    offchainAttestationObj.sig.message.time
  );

  offchainAttestationObj.sig.message.expirationTime = BigInt(
    offchainAttestationObj.sig.message.expirationTime
  );

  const request = offchainAttestationObj.sig;

  return offchain.verifyOffchainAttestationSignature(
    offchainAttestationObj.signer,
    request
  );
}

export default async function (req: any, res: any, next: any) {
  try {
    const attestation: AttestationShareablePackageObject = JSON.parse(req.body.textJson)
    const existingAttestation = await prisma.attestation.findUnique({
      where: {
        uid: attestation.sig.uid,
      }
    });
    const attestationTime = dayjs.unix(Number(attestation.sig.message.time));
    if (timestampsWithinTwoMinutesOfServer(attestationTime) &&
      await verifyOffchainAttestation(attestation) &&
      !existingAttestation) {
      next()
    } else {
      res.json({error: 'Your attestation could not be verified within the allotted time. Please try again.'})
    }
  } catch (e) {
    console.log(e)
    res.json({error: 'Your attestation could not be verified within the allotted time. Please try again.'})
  }
}
