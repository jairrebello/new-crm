export function normalizePhoneWithDefaultBR(input: string | null): string | null {
  const raw = input?.trim()
  if (!raw) return null

  let digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null

  // Drop leading zeros (common in formatted numbers like 0xx...).
  while (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits) return null

  const hasPlus = raw.startsWith('+')

  const normalizeNationalBr = (nationalDigits: string) => {
    // If we ended up with only 10 digits for BR, it's often a missing "mobile prefix" digit.
    // Heuristic: insert "9" after the 2-digit area code => total 11 digits.
    if (nationalDigits.length === 10) return `${nationalDigits.slice(0, 2)}9${nationalDigits.slice(2)}`
    return nationalDigits
  }

  // If the number includes + and doesn't start with BR DDI, keep it unchanged.
  if (hasPlus && !digits.startsWith('55')) return `+${digits}`

  // If it contains BR DDI (55) or is missing it, build a canonical +55... representation.
  const national = digits.startsWith('55') ? digits.slice(2) : digits
  const normalizedNational = normalizeNationalBr(national)
  return `+55${normalizedNational}`
}

