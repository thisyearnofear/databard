/**
 * Anchor IDL for the DataBard escrow program.
 * Mirrors contracts/escrow/programs/escrow/src/lib.rs. Kept in sync by hand — the CI test
 * (test:escrow) will diff this against the on-disk IDL produced by `anchor build` and fail
 * if they drift.
 */
export const ESCROW_IDL = {
  address: "ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK",
  metadata: {
    name: "escrow",
    version: "0.1.0",
    spec: "0.1.0",
    description: "DataBard escrow — buyer-released settlement with seller-committed delivery hash",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        { name: "buyer", writable: true, signer: true },
        { name: "seller" },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              { kind: "const", value: [101, 115, 99, 114, 111, 119] },
              { kind: "account", path: "buyer" },
              { kind: "arg", path: "reference" },
            ],
          },
        },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "reference", type: "pubkey" },
        { name: "deadline", type: "i64" },
      ],
    },
    {
      name: "commit_delivery",
      discriminator: [6, 196, 49, 197, 177, 47, 24, 151],
      accounts: [
        { name: "seller", signer: true },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              { kind: "const", value: [101, 115, 99, 114, 111, 119] },
              { kind: "account", path: "escrow.buyer", account: "Escrow" },
              { kind: "account", path: "escrow.reference", account: "Escrow" },
            ],
          },
        },
      ],
      args: [{ name: "hash", type: { array: ["u8", 32] } }],
    },
    {
      name: "release",
      discriminator: [253, 249, 15, 206, 28, 127, 193, 241],
      accounts: [
        { name: "buyer", writable: true, signer: true },
        { name: "seller", writable: true },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              { kind: "const", value: [101, 115, 99, 114, 111, 119] },
              { kind: "account", path: "buyer" },
              { kind: "account", path: "escrow.reference", account: "Escrow" },
            ],
          },
        },
      ],
      args: [],
    },
    {
      name: "refund",
      discriminator: [2, 96, 183, 251, 63, 208, 46, 46],
      accounts: [
        { name: "buyer", writable: true, signer: true },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              { kind: "const", value: [101, 115, 99, 114, 111, 119] },
              { kind: "account", path: "buyer" },
              { kind: "account", path: "escrow.reference", account: "Escrow" },
            ],
          },
        },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "Escrow",
      discriminator: [31, 213, 123, 187, 186, 22, 218, 155],
    },
  ],
  types: [
    {
      name: "Escrow",
      type: {
        kind: "struct",
        fields: [
          { name: "buyer", type: "pubkey" },
          { name: "seller", type: "pubkey" },
          { name: "amount", type: "u64" },
          { name: "reference", type: "pubkey" },
          { name: "deadline", type: "i64" },
          { name: "deliverable_hash", type: { option: { array: ["u8", 32] } } },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "ZeroAmount", msg: "Amount must be greater than zero" },
    { code: 6001, name: "DeadlineInPast", msg: "Deadline must be in the future" },
    { code: 6002, name: "BeforeDeadline", msg: "Refund is only allowed at or after the deadline" },
    { code: 6003, name: "WrongBuyer", msg: "Buyer does not match the escrow" },
    { code: 6004, name: "WrongSeller", msg: "Seller does not match the escrow" },
    { code: 6005, name: "Overflow", msg: "Arithmetic overflow" },
    { code: 6006, name: "NoDeliveryCommitment", msg: "Seller has not yet committed a delivery hash" },
    { code: 6007, name: "AlreadyCommitted", msg: "Delivery has already been committed for this escrow" },
  ],
} as const;
