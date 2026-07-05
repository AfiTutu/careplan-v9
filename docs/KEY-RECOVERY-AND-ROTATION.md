# Encryption-key recovery and rotation

## Key loss

`DATA_ENCRYPTION_KEY` protects D1 workspace documents and R2 media objects. If all usable copies are lost, the ciphertext cannot be recovered. Cloudflare, GitHub and CarePlan do not know the customer’s backup passwords or the server encryption key.

Keep a recovery copy in an approved secrets vault with:

- access logging;
- at least two authorised recovery custodians;
- a documented retrieval test;
- no copy in source control, email or ordinary cloud drives.

## Controlled rotation

1. Preserve the current key as `DATA_ENCRYPTION_KEY_PREVIOUS`.
2. Preserve its identifier as `DATA_ENCRYPTION_KEY_PREVIOUS_ID`.
3. Generate a new random 32-byte key and set it as `DATA_ENCRYPTION_KEY`.
4. Change `DATA_ENCRYPTION_KEY_ID` to a new identifier.
5. Deploy and verify that old records/media remain readable and new writes use the new identifier.
6. Re-encrypt existing workspaces and media through a separately reviewed migration utility before removing the previous key.
7. Verify complete backups and recovery before retiring any key.

The included runtime supports reading a current or one previous key. It does not automatically re-encrypt the full database and bucket.
