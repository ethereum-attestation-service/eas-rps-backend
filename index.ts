import express from 'express'
import axios from "axios";
import cors from 'cors'
import bodyParser from "body-parser";
import {AttestationResult, StoreIPFSActionReturn} from "./types";
import {
    OffchainAttestationVersion,
    Offchain,
    PartialTypedDataConfig,
    EAS,
    SchemaEncoder
} from "@ethereum-attestation-service/eas-sdk";

import {PrismaClient, Game} from "@prisma/client";

const prisma = new PrismaClient();

import {CHOICE_UNKNOWN, CUSTOM_SCHEMAS, STATUS_UNKNOWN} from "./utils";

const app = express()
const port = 8080

app.use(bodyParser.urlencoded({extended: true}));

app.use(bodyParser.json());
app.use(cors())

// note: build in middleware to verify all attestations
app.post('/newAttestation', async (req, res) => {
    const attestation = JSON.parse(req.body.textJson)

    if (attestation.sig.message.schema === CUSTOM_SCHEMAS.COMMIT_HASH) {
        const schemaEncoder = new SchemaEncoder("bytes32 commitHash");

        const commitHash = (schemaEncoder.decodeData(attestation.sig.message.data))[0].value.value.toString();
        console.log(commitHash)
        const player1 = attestation.signer
        const player2 = attestation.sig.message.recipient
        await prisma.game.create({
            data: {
                commit: commitHash,
                player1: player1,
                player2: player2,
                player1Choice: CHOICE_UNKNOWN,
                player2Choice: CHOICE_UNKNOWN,
                player1RevealDeadline: 0,
                player2RevealDeadline: 0,
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
                commit: gameID
            },
            select: {
                player1: true,
                player2: true,
                player1Choice: true,
                player2Choice: true,
            }
        })

        if (attestation.attester === playersAndChoices!.player1 &&
            playersAndChoices!.player2Choice != CHOICE_UNKNOWN) {
            await prisma.game.update({
                where: {
                    commit: gameID
                },
                data: {
                    player1Choice: revealedChoice,
                    status: (revealedChoice - playersAndChoices!.player2Choice) % 3
                }
            })
        } else if (attestation.attester === playersAndChoices!.player2) {
            await prisma.game.update({
                where: {
                    commit: gameID
                },
                data: {
                    player2Choice: revealedChoice,
                }
            })
        }
    }

    const result: StoreIPFSActionReturn = {
        error: null,
        ipfsHash: null,
        offchainAttestationId: attestation.sig.uid
    }
    res.json(result)
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
