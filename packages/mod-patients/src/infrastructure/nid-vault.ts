// Seals, opens and finds national IDs (T-PAT-03; FR-PAT-007; E section 5.2; owner decision
// 2026-11-04: encrypt in the app). Two keys are derived from NID_ENCRYPTION_KEY, one to encrypt
// and one for the lookup hash, so the hash column cannot be used to decrypt anything.
import { Inject, Injectable } from '@nestjs/common';
import { deriveKey, keyedHash, openSecret, sealSecret } from '@hms/platform';
import { visiblePartOf } from '../domain/nid.js';

export const NID_MASTER_KEY = Symbol('NID_MASTER_KEY');

export interface SealedNid {
  ciphertext: Buffer;
  hash: Buffer;
  last4: string;
}

@Injectable()
export class NidVault {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(@Inject(NID_MASTER_KEY) masterKey: Buffer) {
    // Versioned purposes, so a future key rotation can derive new keys beside the old ones.
    this.encryptionKey = deriveKey(masterKey, 'hms/patient-nid/encryption/v1');
    this.lookupKey = deriveKey(masterKey, 'hms/patient-nid/lookup/v1');
  }

  seal(nid: string): SealedNid {
    return {
      ciphertext: sealSecret(this.encryptionKey, Buffer.from(nid, 'utf8')),
      hash: this.lookupHash(nid),
      last4: visiblePartOf(nid),
    };
  }

  lookupHash(nid: string): Buffer {
    return keyedHash(this.lookupKey, nid);
  }

  open(ciphertext: Uint8Array): string {
    return openSecret(this.encryptionKey, Buffer.from(ciphertext)).toString('utf8');
  }
}
