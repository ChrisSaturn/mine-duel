/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mine_duel.json`.
 */
export type MineDuel = {
  "address": "4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ",
  "metadata": {
    "name": "mineDuel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Mine Duel v1: on-chain wagered duel with MagicBlock ER + VRF + session-key mining"
  },
  "instructions": [
    {
      "name": "cancelRoomPrejoin",
      "discriminator": [
        163,
        206,
        182,
        64,
        224,
        70,
        208,
        5
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "winnerState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "playerOneReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "commitCheckpoint",
      "discriminator": [
        130,
        226,
        232,
        85,
        95,
        156,
        126,
        157
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "checkpointHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "consumeWinnerVrf",
      "discriminator": [
        224,
        34,
        36,
        247,
        88,
        23,
        87,
        21
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "winnerState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createRoom",
      "discriminator": [
        130,
        166,
        32,
        2,
        247,
        120,
        178,
        53
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "winnerState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "playerOneReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "stakeLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePrivateState",
      "discriminator": [
        144,
        146,
        123,
        179,
        191,
        79,
        155,
        26
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "roomCreator"
        },
        {
          "name": "playerOne"
        },
        {
          "name": "playerTwo"
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "roomCreator"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "winnerState",
          "writable": true
        },
        {
          "name": "playerOneReveal",
          "writable": true
        },
        {
          "name": "playerTwoReveal",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "bufferRoom",
          "writable": true
        },
        {
          "name": "delegationRecordRoom",
          "writable": true
        },
        {
          "name": "delegationMetadataRoom",
          "writable": true
        },
        {
          "name": "bufferVault",
          "writable": true
        },
        {
          "name": "delegationRecordVault",
          "writable": true
        },
        {
          "name": "delegationMetadataVault",
          "writable": true
        },
        {
          "name": "bufferWinnerState",
          "writable": true
        },
        {
          "name": "delegationRecordWinnerState",
          "writable": true
        },
        {
          "name": "delegationMetadataWinnerState",
          "writable": true
        },
        {
          "name": "bufferPlayerOneReveal",
          "writable": true
        },
        {
          "name": "delegationRecordPlayerOneReveal",
          "writable": true
        },
        {
          "name": "delegationMetadataPlayerOneReveal",
          "writable": true
        },
        {
          "name": "bufferPlayerTwoReveal",
          "writable": true
        },
        {
          "name": "delegationRecordPlayerTwoReveal",
          "writable": true
        },
        {
          "name": "delegationMetadataPlayerTwoReveal",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "finalizeWin",
      "discriminator": [
        176,
        153,
        87,
        154,
        19,
        37,
        63,
        167
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "winnerState",
          "writable": true
        },
        {
          "name": "playerOneReveal",
          "writable": true
        },
        {
          "name": "playerTwoReveal",
          "writable": true
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinRoom",
      "discriminator": [
        95,
        232,
        188,
        81,
        124,
        130,
        78,
        139
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "winnerState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "playerTwoReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mine",
      "discriminator": [
        59,
        22,
        178,
        213,
        139,
        197,
        160,
        196
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "winnerState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        },
        {
          "name": "playerOneReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "account",
                "path": "room.player_one",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "playerTwoReveal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "account",
                "path": "room.player_two",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "x",
          "type": "u8"
        },
        {
          "name": "y",
          "type": "u8"
        },
        {
          "name": "z",
          "type": "u8"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "requestWinnerVrf",
      "discriminator": [
        164,
        208,
        87,
        113,
        208,
        100,
        189,
        228
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "clientSeed",
          "type": "u8"
        }
      ]
    },
    {
      "name": "settleWinPayout",
      "discriminator": [
        102,
        188,
        18,
        66,
        35,
        67,
        245,
        203
      ],
      "accounts": [
        {
          "name": "winner",
          "writable": true,
          "signer": true
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.creator",
                "account": "roomShared"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "room"
              }
            ]
          }
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "playerReveal",
      "discriminator": [
        83,
        49,
        173,
        3,
        143,
        29,
        53,
        150
      ]
    },
    {
      "name": "roomShared",
      "discriminator": [
        25,
        83,
        102,
        255,
        68,
        110,
        74,
        164
      ]
    },
    {
      "name": "sessionToken",
      "discriminator": [
        233,
        4,
        115,
        14,
        46,
        21,
        1,
        15
      ]
    },
    {
      "name": "vaultEscrow",
      "discriminator": [
        132,
        153,
        31,
        208,
        212,
        90,
        34,
        186
      ]
    },
    {
      "name": "winnerState",
      "discriminator": [
        61,
        174,
        53,
        217,
        202,
        173,
        149,
        22
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidStatus",
      "msg": "Invalid status transition for this instruction."
    },
    {
      "code": 6001,
      "name": "invalidStake",
      "msg": "Stake must be greater than zero."
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Unauthorized caller for this action."
    },
    {
      "code": 6003,
      "name": "overflow",
      "msg": "Overflow while updating state."
    },
    {
      "code": 6004,
      "name": "playerTwoMissing",
      "msg": "Second player is required for this operation."
    },
    {
      "code": 6005,
      "name": "alreadyJoined",
      "msg": "Room already has two players."
    },
    {
      "code": 6006,
      "name": "invalidCoordinate",
      "msg": "Invalid coordinate."
    },
    {
      "code": 6007,
      "name": "cellAlreadyMined",
      "msg": "Cell was already mined."
    },
    {
      "code": 6008,
      "name": "alreadyVrfRequested",
      "msg": "VRF has already been requested."
    },
    {
      "code": 6009,
      "name": "vrfNotReady",
      "msg": "VRF winner cell is not ready."
    },
    {
      "code": 6010,
      "name": "invalidSessionToken",
      "msg": "Invalid or expired session token."
    },
    {
      "code": 6011,
      "name": "invalidDelegateAccounts",
      "msg": "Invalid delegation support account set."
    },
    {
      "code": 6012,
      "name": "invalidFinalizeAccounts",
      "msg": "Invalid finalize account set."
    }
  ],
  "types": [
    {
      "name": "playerReveal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "revealedMask",
            "type": {
              "array": [
                "u8",
                256
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roomShared",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "playerOne",
            "type": "pubkey"
          },
          {
            "name": "playerTwo",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "stakeLamports",
            "type": "u64"
          },
          {
            "name": "totalEscrowLamports",
            "type": "u64"
          },
          {
            "name": "mineActions",
            "type": "u64"
          },
          {
            "name": "checkpointSeq",
            "type": "u64"
          },
          {
            "name": "checkpointHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "lastActionSlot",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "roomStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roomStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "waitingForOpponent"
          },
          {
            "name": "waitingForVrf"
          },
          {
            "name": "active"
          },
          {
            "name": "won"
          },
          {
            "name": "finalized"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "sessionToken",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "vaultEscrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "winnerState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "vrfRequested",
            "type": "bool"
          },
          {
            "name": "vrfFulfilled",
            "type": "bool"
          },
          {
            "name": "winnerCell",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "randomness",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "minedMask",
            "type": {
              "array": [
                "u8",
                256
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
