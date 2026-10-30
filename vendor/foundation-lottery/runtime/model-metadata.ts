// Scalar defaults, foreign keys and unique keys from the pinned source schema.
export default {
  "foundationAccountingOrganization": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "name": {
        "type": "String",
        "nullable": false
      },
      "tdsRateBps": {
        "type": "Int",
        "nullable": false,
        "default": "200"
      },
      "userLedgerStorage": {
        "type": "String",
        "nullable": false,
        "default": "\"CLOUD\""
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"ACTIVE\""
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ]
    ],
    "relations": []
  },
  "foundationAccountingParty": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "partyType": {
        "type": "String",
        "nullable": false
      },
      "name": {
        "type": "String",
        "nullable": false
      },
      "email": {
        "type": "String",
        "nullable": true
      },
      "phone": {
        "type": "String",
        "nullable": true
      },
      "emailNormalized": {
        "type": "String",
        "nullable": true
      },
      "phoneNormalized": {
        "type": "String",
        "nullable": true
      },
      "uniqueCode": {
        "type": "String",
        "nullable": false
      },
      "ticketRatePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "commissionRateBps": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "tdsRateBps": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"ACTIVE\""
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "uniqueCode"
      ],
      [
        "organizationId",
        "name"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryAccountingPeriod": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "label": {
        "type": "String",
        "nullable": false
      },
      "startsAt": {
        "type": "DateTime",
        "nullable": false
      },
      "endsAt": {
        "type": "DateTime",
        "nullable": false
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"OPEN\""
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "label"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryDocumentSequence": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "financialYear": {
        "type": "String",
        "nullable": false
      },
      "documentType": {
        "type": "String",
        "nullable": false
      },
      "nextValue": {
        "type": "Int",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "financialYear",
        "documentType"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryStockMovement": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "partyId": {
        "type": "String",
        "nullable": true
      },
      "sourceReceiptId": {
        "type": "String",
        "nullable": true
      },
      "returnSession": {
        "type": "String",
        "nullable": true
      },
      "movementType": {
        "type": "String",
        "nullable": false
      },
      "quantity": {
        "type": "BigInt",
        "nullable": false
      },
      "unitRatePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "grossPurchasePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "commissionPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "tdsRateBps": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "tdsPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "netPayablePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "reference",
        "movementType"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingParty",
        "fields": [
          "partyId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryStockistEntry": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "partyId": {
        "type": "String",
        "nullable": false
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "purchaseQuantity": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "morningReturnQuantity": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "dayReturnQuantity": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "eveningReturnQuantity": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "totalReturnQuantity": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "netPurchaseQuantity": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "unitRatePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "grossPurchasePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "commissionPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "tdsRateBps": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "tdsPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "netPayablePaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "updatedByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "partyId",
        "occurredAt"
      ],
      [
        "organizationId",
        "reference"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingParty",
        "fields": [
          "partyId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotterySale": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "partyId": {
        "type": "String",
        "nullable": false
      },
      "periodId": {
        "type": "String",
        "nullable": true
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "dispatchQuantity": {
        "type": "Int",
        "nullable": false
      },
      "morningReturnQuantity": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "dayReturnQuantity": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "eveningReturnQuantity": {
        "type": "Int",
        "nullable": false,
        "default": "0"
      },
      "returnQuantity": {
        "type": "Int",
        "nullable": false
      },
      "netTickets": {
        "type": "Int",
        "nullable": false
      },
      "ticketRatePaise": {
        "type": "BigInt",
        "nullable": false
      },
      "grossSalesPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "commissionRateBps": {
        "type": "Int",
        "nullable": false
      },
      "commissionPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "tdsRateBps": {
        "type": "Int",
        "nullable": false
      },
      "tdsPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "netPayablePaise": {
        "type": "BigInt",
        "nullable": false
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"DRAFT\""
      },
      "correctionOfSaleId": {
        "type": "String",
        "nullable": true
      },
      "syncVersion": {
        "type": "Int",
        "nullable": false,
        "default": "1"
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "reference"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingParty",
        "fields": [
          "partyId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationLotteryAccountingPeriod",
        "fields": [
          "periodId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotterySellerSyncOperation": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "operationId": {
        "type": "String",
        "nullable": false
      },
      "saleId": {
        "type": "String",
        "nullable": false
      },
      "requestHash": {
        "type": "String",
        "nullable": false
      },
      "expectedVersion": {
        "type": "Int",
        "nullable": false
      },
      "acknowledgedVersion": {
        "type": "Int",
        "nullable": false
      },
      "acknowledgement": {
        "type": "Json",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "operationId"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationLotterySale",
        "fields": [
          "saleId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryPayment": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "partyId": {
        "type": "String",
        "nullable": false
      },
      "periodId": {
        "type": "String",
        "nullable": true
      },
      "direction": {
        "type": "String",
        "nullable": false
      },
      "totalAmountPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "methodSplit": {
        "type": "Json",
        "nullable": false
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"POSTED\""
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "reference"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingParty",
        "fields": [
          "partyId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationLotteryAccountingPeriod",
        "fields": [
          "periodId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotterySettlement": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "saleId": {
        "type": "String",
        "nullable": false
      },
      "paymentId": {
        "type": "String",
        "nullable": false
      },
      "amountPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "saleId",
        "paymentId"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationLotterySale",
        "fields": [
          "saleId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationLotteryPayment",
        "fields": [
          "paymentId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryLedgerEntry": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "transactionId": {
        "type": "String",
        "nullable": false
      },
      "sourceType": {
        "type": "String",
        "nullable": false
      },
      "sourceId": {
        "type": "String",
        "nullable": false
      },
      "lineNumber": {
        "type": "Int",
        "nullable": false
      },
      "accountCode": {
        "type": "String",
        "nullable": false
      },
      "side": {
        "type": "String",
        "nullable": false
      },
      "amountPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "transactionId",
        "lineNumber"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryAuditEvent": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "eventType": {
        "type": "String",
        "nullable": false
      },
      "entityType": {
        "type": "String",
        "nullable": false
      },
      "entityId": {
        "type": "String",
        "nullable": false
      },
      "actorAdminId": {
        "type": "String",
        "nullable": false
      },
      "metadata": {
        "type": "Json",
        "nullable": true
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationAccountingCorrection": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "entityType": {
        "type": "String",
        "nullable": false
      },
      "entityId": {
        "type": "String",
        "nullable": false
      },
      "version": {
        "type": "Int",
        "nullable": false
      },
      "operationId": {
        "type": "String",
        "nullable": false
      },
      "requestHash": {
        "type": "String",
        "nullable": false
      },
      "previousSnapshot": {
        "type": "Json",
        "nullable": false
      },
      "replacement": {
        "type": "Json",
        "nullable": false
      },
      "acknowledgement": {
        "type": "Json",
        "nullable": false
      },
      "reason": {
        "type": "String",
        "nullable": true
      },
      "actorAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "operationId"
      ],
      [
        "organizationId",
        "entityType",
        "entityId",
        "version"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationLotteryEntryClearance": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "scope": {
        "type": "String",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationAccountingExpenseCategory": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "name": {
        "type": "String",
        "nullable": false
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"ACTIVE\""
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "name"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationAccountingExpenseProfile": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "categoryId": {
        "type": "String",
        "nullable": false
      },
      "name": {
        "type": "String",
        "nullable": false
      },
      "usualAmountPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "scheduleType": {
        "type": "String",
        "nullable": false,
        "default": "\"ONE_TIME\""
      },
      "recurringStartsAt": {
        "type": "DateTime",
        "nullable": true
      },
      "note": {
        "type": "String",
        "nullable": true
      },
      "status": {
        "type": "String",
        "nullable": false,
        "default": "\"ACTIVE\""
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      },
      "updatedAt": {
        "type": "DateTime",
        "nullable": false
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "categoryId",
        "name"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingExpenseCategory",
        "fields": [
          "categoryId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationAccountingExpenseBill": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "profileId": {
        "type": "String",
        "nullable": false
      },
      "amountPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "billingMonth": {
        "type": "String",
        "nullable": true
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "reference"
      ],
      [
        "organizationId",
        "profileId",
        "billingMonth"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingExpenseProfile",
        "fields": [
          "profileId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationAccountingExpensePayment": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "profileId": {
        "type": "String",
        "nullable": false
      },
      "totalAmountPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "cashPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "bankPaise": {
        "type": "BigInt",
        "nullable": false,
        "default": "0"
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "reference"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingExpenseProfile",
        "fields": [
          "profileId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  },
  "foundationAccountingCustomerBill": {
    "fields": {
      "id": {
        "type": "String",
        "nullable": false,
        "default": "uuid()"
      },
      "organizationId": {
        "type": "String",
        "nullable": false
      },
      "partyId": {
        "type": "String",
        "nullable": false
      },
      "quantity": {
        "type": "BigInt",
        "nullable": false
      },
      "unitRatePaise": {
        "type": "BigInt",
        "nullable": false
      },
      "amountPaise": {
        "type": "BigInt",
        "nullable": false
      },
      "reference": {
        "type": "String",
        "nullable": false
      },
      "occurredAt": {
        "type": "DateTime",
        "nullable": false
      },
      "createdByAdminId": {
        "type": "String",
        "nullable": false
      },
      "createdAt": {
        "type": "DateTime",
        "nullable": false,
        "default": "now()"
      }
    },
    "unique": [
      [
        "id"
      ],
      [
        "organizationId",
        "reference"
      ]
    ],
    "relations": [
      {
        "target": "foundationAccountingOrganization",
        "fields": [
          "organizationId"
        ],
        "references": [
          "id"
        ]
      },
      {
        "target": "foundationAccountingParty",
        "fields": [
          "partyId"
        ],
        "references": [
          "id"
        ]
      }
    ]
  }
};
