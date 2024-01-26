"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var cors_1 = require("cors");
var body_parser_1 = require("body-parser");
var verifyAttestation_1 = require("./verifyAttestation");
var eas_sdk_1 = require("@ethereum-attestation-service/eas-sdk");
var dayjs_1 = require("dayjs");
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
var utils_1 = require("./utils");
var ethers_1 = require("ethers");
var app = (0, express_1.default)();
var port = 8080;
app.use(body_parser_1.default.urlencoded({ extended: true }));
app.use(body_parser_1.default.json());
app.use((0, cors_1.default)());
// note: build in middleware to verify all attestations
app.post('/newAttestation', verifyAttestation_1.default, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var attestation, player1, player2, existingLink, schemaEncoder, commitHash, gameID, players, gameID, players, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                attestation = JSON.parse(req.body.textJson);
                if (!(attestation.sig.message.schema === utils_1.CUSTOM_SCHEMAS.CREATE_GAME_CHALLENGE)) return [3 /*break*/, 5];
                player1 = attestation.signer;
                player2 = attestation.sig.message.recipient;
                return [4 /*yield*/, prisma.link.findUnique({
                        where: {
                            player1_player2: {
                                player1: player1,
                                player2: player2,
                            }
                        }
                    })];
            case 1:
                existingLink = _a.sent();
                if (!!existingLink) return [3 /*break*/, 3];
                return [4 /*yield*/, prisma.link.createMany({
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
                    })];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3: return [4 /*yield*/, prisma.game.create({
                    data: {
                        uid: attestation.sig.uid,
                        player1Object: {
                            connectOrCreate: {
                                where: {
                                    address: player1
                                },
                                create: {
                                    address: player1
                                }
                            }
                        },
                        player2Object: {
                            connectOrCreate: {
                                where: {
                                    address: player2
                                },
                                create: {
                                    address: player2
                                }
                            }
                        },
                        commit1: eas_sdk_1.ZERO_BYTES32,
                        commit2: eas_sdk_1.ZERO_BYTES32,
                        choice1: utils_1.CHOICE_UNKNOWN,
                        choice2: utils_1.CHOICE_UNKNOWN,
                        salt1: eas_sdk_1.ZERO_BYTES32,
                        salt2: eas_sdk_1.ZERO_BYTES32,
                        link: {
                            connect: {
                                player1_player2: {
                                    player1: player1,
                                    player2: player2,
                                }
                            }
                        }
                    }
                })];
            case 4:
                _a.sent();
                return [3 /*break*/, 14];
            case 5:
                if (!(attestation.sig.message.schema === utils_1.CUSTOM_SCHEMAS.COMMIT_HASH)) return [3 /*break*/, 11];
                schemaEncoder = new eas_sdk_1.SchemaEncoder("bytes32 commitHash");
                commitHash = (schemaEncoder.decodeData(attestation.sig.message.data))[0].value.value.toString();
                gameID = attestation.sig.message.refUID;
                return [4 /*yield*/, prisma.game.findUnique({
                        select: {
                            player1: true,
                            player2: true,
                        },
                        where: {
                            uid: gameID
                        }
                    })];
            case 6:
                players = _a.sent();
                if (!(attestation.signer === players.player1)) return [3 /*break*/, 8];
                return [4 /*yield*/, prisma.game.update({
                        where: {
                            uid: gameID,
                        },
                        data: {
                            commit1: commitHash,
                            updatedAt: (0, dayjs_1.default)().unix(),
                        }
                    })];
            case 7:
                _a.sent();
                return [3 /*break*/, 10];
            case 8:
                if (!(attestation.signer === players.player2)) return [3 /*break*/, 10];
                return [4 /*yield*/, prisma.game.update({
                        where: {
                            uid: gameID,
                        },
                        data: {
                            commit2: commitHash,
                            updatedAt: (0, dayjs_1.default)().unix(),
                        }
                    })];
            case 9:
                _a.sent();
                _a.label = 10;
            case 10: return [3 /*break*/, 14];
            case 11:
                if (!(attestation.sig.message.schema === utils_1.CUSTOM_SCHEMAS.DECLINE_GAME_CHALLENGE)) return [3 /*break*/, 14];
                gameID = attestation.sig.message.refUID;
                return [4 /*yield*/, prisma.game.findUnique({
                        select: {
                            player2: true,
                        },
                        where: {
                            uid: gameID,
                            commit2: eas_sdk_1.ZERO_BYTES32,
                        }
                    })];
            case 12:
                players = _a.sent();
                if (!players) {
                    return [2 /*return*/];
                }
                if (!(attestation.signer === players.player2)) return [3 /*break*/, 14];
                return [4 /*yield*/, prisma.game.update({
                        where: {
                            uid: gameID,
                        },
                        data: {
                            declined: true,
                            updatedAt: (0, dayjs_1.default)().unix(),
                        }
                    })];
            case 13:
                _a.sent();
                _a.label = 14;
            case 14: return [4 /*yield*/, prisma.attestation.create({
                    data: (0, utils_1.dbFriendlyAttestation)(attestation)
                })];
            case 15:
                _a.sent();
                result = {
                    error: null,
                    ipfsHash: null,
                    offchainAttestationId: attestation.sig.uid
                };
                res.json(result);
                return [2 /*return*/];
        }
    });
}); });
app.post('/gameStatus', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var uid, game;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                uid = req.body.uid;
                return [4 /*yield*/, prisma.game.findUnique({
                        where: {
                            uid: uid
                        },
                        include: {
                            relevantAttestations: {
                                select: {
                                    packageObjString: true,
                                }
                            }
                        }
                    })];
            case 1:
                game = _a.sent();
                res.json(game);
                return [2 /*return*/];
        }
    });
}); });
app.post('/incomingChallenges', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, challenges;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                address = req.body.address;
                return [4 /*yield*/, prisma.game.findMany({
                        where: {
                            player2: address,
                            commit2: eas_sdk_1.ZERO_BYTES32,
                            declined: false,
                        },
                    })];
            case 1:
                challenges = _a.sent();
                res.json(challenges);
                return [2 /*return*/];
        }
    });
}); });
app.post('/gamesPendingReveal', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, games;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                address = req.body.address;
                return [4 /*yield*/, prisma.game.findMany({
                        select: {
                            uid: true,
                        },
                        where: {
                            commit1: {
                                not: eas_sdk_1.ZERO_BYTES32
                            },
                            commit2: {
                                not: eas_sdk_1.ZERO_BYTES32
                            },
                            OR: [
                                {
                                    player1: address,
                                    choice1: utils_1.CHOICE_UNKNOWN
                                },
                                {
                                    player2: address,
                                    choice2: utils_1.CHOICE_UNKNOWN
                                }
                            ]
                        },
                    })];
            case 1:
                games = _a.sent();
                res.json(games.map(function (game) { return game.uid; }));
                return [2 /*return*/];
        }
    });
}); });
app.post('/revealMany', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var reveals, _i, reveals_1, reveal, uid, choice, salt, game, hashedChoice;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                reveals = req.body.reveals;
                _i = 0, reveals_1 = reveals;
                _a.label = 1;
            case 1:
                if (!(_i < reveals_1.length)) return [3 /*break*/, 7];
                reveal = reveals_1[_i];
                uid = reveal.uid, choice = reveal.choice, salt = reveal.salt;
                return [4 /*yield*/, prisma.game.findUnique({
                        where: {
                            uid: uid
                        },
                    })];
            case 2:
                game = _a.sent();
                if (!game) {
                    return [3 /*break*/, 6];
                }
                hashedChoice = ethers_1.ethers.solidityPackedKeccak256(["uint256", "bytes32"], [choice, salt]);
                if (!(hashedChoice === game.commit1)) return [3 /*break*/, 4];
                return [4 /*yield*/, prisma.game.update({
                        where: {
                            uid: reveal.uid
                        },
                        data: {
                            choice1: reveal.choice,
                            salt1: reveal.salt,
                            updatedAt: (0, dayjs_1.default)().unix(),
                        }
                    })];
            case 3:
                _a.sent();
                return [3 /*break*/, 6];
            case 4:
                if (!(hashedChoice === game.commit2)) return [3 /*break*/, 6];
                return [4 /*yield*/, prisma.game.update({
                        where: {
                            uid: reveal.uid
                        },
                        data: {
                            choice2: reveal.choice,
                            salt2: reveal.salt,
                            updatedAt: (0, dayjs_1.default)().unix(),
                        }
                    })];
            case 5:
                _a.sent();
                _a.label = 6;
            case 6:
                _i++;
                return [3 /*break*/, 1];
            case 7:
                res.json({});
                return [2 /*return*/];
        }
    });
}); });
app.post('/myStats', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, myStats, player1Games, player2Games, games;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                address = req.body.address;
                return [4 /*yield*/, prisma.player.findUnique({
                        where: {
                            address: address
                        },
                        include: {
                            gamesPlayedAsPlayer1: true,
                            gamesPlayedAsPlayer2: true,
                        }
                    })];
            case 1:
                myStats = _a.sent();
                if (!myStats) {
                    return [2 /*return*/];
                }
                player1Games = myStats.gamesPlayedAsPlayer1.filter(function (game) { return !game.declined; });
                player2Games = myStats.gamesPlayedAsPlayer2.filter(function (game) { return !game.declined; });
                games = player1Games.concat(player2Games).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
                res.json({ games: games, elo: myStats.elo });
                return [2 /*return*/];
        }
    });
}); });
app.post('/getGraph', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var links;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.link.findMany({
                    where: {
                        default: true,
                    },
                    include: {
                        opposite: {
                            include: {
                                gamesPlayed: {
                                    select: {
                                        uid: true,
                                        updatedAt: true,
                                    }
                                },
                            }
                        },
                        gamesPlayed: {
                            select: {
                                uid: true,
                                updatedAt: true,
                            }
                        },
                    }
                })];
            case 1:
                links = _a.sent();
                res.json({
                    nodes: __spreadArray([], new Set(links.map(function (link) { return link.player1; })
                        .concat(links.map(function (link) { return link.player2; }))), true).map(function (address) { return ({
                        id: address,
                        group: 1,
                    }); }),
                    links: links.map(function (link) { return ({
                        source: link.player1,
                        target: link.player2,
                        games: link.gamesPlayed
                            .concat(link.opposite.gamesPlayed)
                            .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
                            .map(function (game) { return game.uid; }),
                    }); })
                });
                return [2 /*return*/];
        }
    });
}); });
app.listen(port, function () {
    console.log("Example app listening on port ".concat(port));
});
