/**
 * Password generation for accounts an admin creates on someone else's behalf.
 *
 * Why this exists: Supabase's leaked-password protection (which rejects
 * passwords found in HaveIBeenPwned) is a Pro-plan feature. But that check only
 * matters when a human *chooses* the password — it catches "Summer2024!" and
 * friends. Every password in this app is issued by an admin to a team member or
 * a client, so the better answer is to never let a human pick one.
 *
 * A 20-character password drawn from this alphabet has roughly 122 bits of
 * entropy. It cannot appear in a breach corpus, so the Pro feature would have
 * nothing to tell us. Free, and strictly stronger.
 */

// No look-alikes: O/0, I/l/1. These get read off a screen and typed into a
// login box, sometimes over a phone call, so ambiguity costs real support time.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

/**
 * Cryptographically random password.
 *
 * Uses crypto.getRandomValues, not Math.random — the latter is seeded
 * predictably and is never appropriate for a credential.
 *
 * Rejection sampling rather than a plain modulo: with 68 characters and a
 * 0-255 byte range, `byte % 68` would make the first 52 characters slightly
 * likelier than the rest. A small bias, but free to avoid.
 */
export function generatePassword(length = 20): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out: string[] = [];
  const buf = new Uint8Array(length * 2);

  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (out.length >= length) break;
      if (byte >= max) continue; // discard, would skew the distribution
      out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }

  return out.join("");
}
