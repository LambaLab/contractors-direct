/** Generates a cryptographically-random 6-digit string (zero-padded). */
export function generateOtp(): string {
  // Use crypto.getRandomValues for better randomness than Math.random
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 1000000).padStart(6, '0')
}
