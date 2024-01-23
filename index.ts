import express from 'express'
import axios from "axios";
import cors from 'cors'
import bodyParser from "body-parser";
import {StoreIPFSActionReturn} from "./types";
import verificationMiddleware from './verifyAttestation'
import {
    SchemaEncoder, AttestationShareablePackageObject, ZERO_BYTES, ZERO_BYTES32
} from "@ethereum-attestation-service/eas-sdk";

import {PrismaClient, Game} from "@prisma/client";

const prisma = new PrismaClient();

import {CHOICE_UNKNOWN, CUSTOM_SCHEMAS, dbFriendlyAttestation, STATUS_UNKNOWN} from "./utils";

const app = express()
const port = 8080

app.use(bodyParser.urlencoded({extended: true}));

app.use(bodyParser.json());
app.use(cors())

// note: build in middleware to verify all attestations
app.post('/newAttestation', verificationMiddleware, async (req, res) => {
    const attestation: AttestationShareablePackageObject = JSON.parse(req.body.textJson)

    if (attestation.sig.message.schema === CUSTOM_SCHEMAS.CREATE_GAME_CHALLENGE) {
        const player1 = attestation.signer
        const player2 = attestation.sig.message.recipient
        await prisma.game.create({
            data: {
                uid: attestation.sig.uid,
                player1: player1,
                player2: player2,
                commit1: ZERO_BYTES32,
                commit2: ZERO_BYTES32,
                choice1: CHOICE_UNKNOWN,
                choice2: CHOICE_UNKNOWN,
                salt1: ZERO_BYTES32,
                salt2: ZERO_BYTES32,
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
                    commit1: commitHash
                }
            })
        } else if (attestation.signer === players!.player2) {
            await prisma.game.update({
                where: {
                    uid: gameID,
                },
                data: {
                    commit2: commitHash
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
    })

    res.json(game)
})

app.post('/incomingChallenges', async (req, res) => {
    const {toAddress} = req.body

    const challenges = await prisma.game.findMany({
        where: {
            player2: toAddress,
            commit2: ZERO_BYTES32
        },
    })

    res.json(challenges)
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
