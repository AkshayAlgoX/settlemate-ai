# Receipt signing keys

Terminal decision receipts are sealed with HMAC-SHA256 over their canonical
body (`src/lib/receipts/signer.ts`). This page covers how the keys are
configured, generated, rotated and trusted.

## Trust model

- **Key source.** The server key ring is built from `RECEIPT_SIGNING_SECRET_V<n>`
  environment variables. Signing and verification use the same ring, and
  neither accepts a key from the caller.
- **What "trusted" means.** A verification report has both a `verdict` and a
  `trusted` flag:
  - `verdict: "VALID"` means the proof hash, the HMAC and the deterministic
    replay all check out against the ring.
  - `trusted: true` additionally requires that the key came from the
    environment (a governed key).
  - Only trusted receipts should be treated as financial proof.
- **What HMAC does not give you.** HMAC is a shared-secret scheme. Anyone
  holding the key can create receipts that verify, so it does not provide
  non-repudiation. Third-party verification would need an asymmetric
  signature (for example Ed25519), which this project does not implement.

## Configuration

- **`RECEIPT_SIGNING_SECRET_V1`, `RECEIPT_SIGNING_SECRET_V2`, …:** one key per
  version. Each must be at least 32 bytes.
- **`RECEIPT_SIGNING_ACTIVE_VERSION`:** the version used for new receipts.
  Defaults to `v1`.

A key is rejected in every environment if it:

- is shorter than 32 bytes;
- looks like a placeholder (`change-me`, `example`, `<...>` and similar);
- equals one of the old repository default secrets;
- is reused by another version.

These checks catch configuration mistakes. They cannot prove that a key is
random: a long string typed by hand passes them. Unpredictability depends
entirely on how the key was generated.

**Production (`NODE_ENV=production`):**

- A missing active key stops signing (`ReceiptKeyConfigError`).
- `/api/v1/ready` reports `RECEIPT_SIGNING_KEYS` as failed.
- Only the active version may sign, so a retired key cannot produce new
  receipts.
- Every configured version still verifies.

**Outside production:**

- An unset `v1` or `v2` key is replaced by a random key that exists only
  for the current process.
- Receipts signed with it are `VALID` but `trusted: false`
  (`UNTRUSTED_DEVELOPMENT_KEY`). They stop verifying when the process
  restarts.
- A key that is set but fails the checks is still an error. It is never
  silently replaced.

## Generating a key

Use the operating system's CSPRNG:

```bash
openssl rand -base64 32
```

Or, in Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the value in the hosting platform's secret store, for example a Render
environment variable or a cloud secret manager. Do not commit it, log it or
paste it into issues.

The Render blueprint (`render.yaml`) asks Render to generate
`RECEIPT_SIGNING_SECRET_V1` (`generateValue: true`).

## Rotation

1. Generate a new key and set `RECEIPT_SIGNING_SECRET_V2`. Keep
   `RECEIPT_SIGNING_SECRET_V1`.
2. Set `RECEIPT_SIGNING_ACTIVE_VERSION=v2` and redeploy. New receipts are
   signed with v2, and v1 receipts keep verifying as trusted.
3. Remove `RECEIPT_SIGNING_SECRET_V1` only when v1 receipts no longer need
   to verify. After removal they report `KEY_VERSION_UNKNOWN`.

If a key is suspected compromised, do steps 1 and 2 immediately. Then decide
separately how to treat receipts signed with the compromised version, since
anyone with that key could have produced them.

Receipts are never re-signed automatically. Stored receipts and their
signatures are not modified by any of the steps above.

## Legacy receipts signed with public secrets

Earlier versions fell back to two hard-coded secrets when the environment
variables were unset. Those secrets are in the public git history, and the
Render blueprint did not set the variables. Any receipt produced by that
deployment should therefore be assumed to carry a public-key signature.

The verifier still recognises these signatures, so such receipts can be
inspected. The report is:

- `verdict: "INVALID"`
- `failureReason: "LEGACY_PUBLIC_KEY"`
- `signatureTrust: "UNTRUSTED_LEGACY_PUBLIC_KEY"`
- `trusted: false`

The receipt's identifiers and decision are still reported, but such a
receipt is not evidence of anything, because anyone could have produced it.

## Verify endpoint

`POST /api/receipts/[id]/verify` verifies the stored receipt for the
caller's tenant.

The `tamperedFields` demo option verifies a modified in-memory copy, and
the response then carries `simulated: true`. In production the option is
rejected with `400 TAMPER_SIMULATION_DISABLED`, so the endpoint only ever
reports on the stored receipt.

## Tests

`npm run test:receipt-security` (also part of `npm test`) covers:

- missing, short, placeholder, public and reused keys;
- malformed or unconfigured active versions;
- secret values never appearing in errors;
- the readiness check;
- refusal of caller-supplied secrets;
- unknown versions and malformed signatures;
- rotation (old versions verify, retired versions cannot sign, removed
  versions stop verifying);
- tampering and version relabelling, with and without a recomputed hash;
- legacy public-key classification;
- ephemeral development keys;
- the verify route in production and development modes.
