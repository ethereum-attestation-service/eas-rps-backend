import {OffchainAttestationType} from "@ethereum-attestation-service/eas-sdk";
import {Game, Player} from "@prisma/client";


export type EASChainConfig = {
  chainId: number;
  chainName: string;
  version: string;
  contractAddress: string;
  schemaRegistryAddress: string;
  etherscanURL: string;
  /** Must contain a trailing dot (unless mainnet). */
  subdomain: string;
  contractStartBlock: number;
  rpcProvider: string;
};

export interface AttestationResult {
  data: Data;
}

export interface MyAttestationResult {
  data: MyData;
}

export interface EnsNamesResult {
  data: {
    ensNames: { id: string; name: string }[];
  };
}

export interface Data {
  attestation: Attestation | null;
}

export interface MyData {
  attestations: Attestation[];
}

export type ResolvedAttestation = Attestation & {
  name: string;
  confirmation?: Attestation;
};

export type StoreAttestationRequest = { filename: string; textJson: string };

export type StoreIPFSActionReturn = {
  error: null | string;
  ipfsHash: string | null;
  offchainAttestationId: string | null;
};

export interface AvailableChallengesResult {
  data: Data;
}

export interface Data {
  attestations: Attestation[];
}

export interface Attestation {
  attester: string;
  data: string;
  decodedDataJson: string;
  expirationTime: number;
  id: string;
  ipfsHash: string;
  isOffchain: boolean;
  recipient: string;
  revocable: boolean;
  refUID: string;
  revocationTime: number;
  revoked: boolean;
  schemaId: string;
  time: number;
  timeCreated: number;
  txid: string;
}

export type GameCommit = {
  salt: string;
  choice: number;
  challengeUID: string;
};

export type AcceptedChallenge = {
  UID: string;
  opponentAddress: string;
  playerChoice: number;
  opponentChoice: number;
};

export type GameWithPlayers = Game & {
  player1Object: Player;
  player2Object: Player;
};

export type GameWithPlayersAndAttestations = GameWithPlayers & {relevantAttestations: {uid: string}[]};

// Type for Graph as object with key as string and value as array of strings
export type Graph = {
  [key: string]: string[];
};

export type LeaderboardPlayer = {
  address: string;
  elo: number;
  badges: string[];
  ensName?: string;
  ensAvatar?: string;
}
