import express from 'express'
import axios from "axios";
import cors from 'cors'
import bodyParser from "body-parser";
import {StoreIPFSActionReturn} from "./types";
import verificationMiddleware from './verifyAttestation'
import {
    SchemaEncoder, AttestationShareablePackageObject
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

    if (attestation.sig.message.schema === CUSTOM_SCHEMAS.COMMIT_HASH) {
        const schemaEncoder = new SchemaEncoder("bytes32 commitHash");

        const commitHash = (schemaEncoder.decodeData(attestation.sig.message.data))[0].value.value.toString();
        const player1 = attestation.signer
        const player2 = attestation.sig.message.recipient
        await prisma.game.create({
            data: {
                uid: attestation.sig.uid,
                commit: commitHash,
                player1: player1,
                player2: player2,
                player1Choice: CHOICE_UNKNOWN,
                player2Choice: CHOICE_UNKNOWN,
                status: STATUS_UNKNOWN
            }
        })
        console.log('created')
    } else if (attestation.sig.message.schema === CUSTOM_SCHEMAS.REVEAL_GAME_CHOICE) {
        const gameID = attestation.sig.message.refUID;

        const schemaEncoder = new SchemaEncoder(
            "uint256 revealGameChoice,bytes32 salt,bytes32 commitUID"
        );

        const revealedChoice = JSON.parse(((schemaEncoder.decodeData(attestation.sig.message.data))[0].value.value).toString());

        const playersAndChoices = await prisma.game.findUnique({
            where: {
                uid: gameID
            },
            select: {
                player1: true,
                player2: true,
                player1Choice: true,
                player2Choice: true,
            }
        })

        if (attestation.signer === playersAndChoices!.player1 &&
            playersAndChoices!.player2Choice != CHOICE_UNKNOWN) {
            await prisma.game.update({
                where: {
                    uid: gameID
                },
                data: {
                    player1Choice: revealedChoice,
                    status: (3 + revealedChoice - playersAndChoices!.player2Choice) % 3
                }
            })
        } else if (attestation.signer === playersAndChoices!.player2) {
            await prisma.game.update({
                where: {
                    uid: gameID
                },
                data: {
                    player2Choice: revealedChoice,
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
            player2Choice: CHOICE_UNKNOWN
        },
    })

    res.json(challenges)
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
