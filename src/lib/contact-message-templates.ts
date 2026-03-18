/**
 * Substitui placeholders pelo cadastro do contato.
 * Suportados: {nome}, {primeiro_nome} (case-insensitive).
 */
export function applyContactMessageTemplates(
  text: string,
  contact: { name: string; email?: string | null }
): string {
  const name = (contact.name ?? '').trim()
  const primeiroNome = name.split(/\s+/).filter(Boolean)[0] ?? ''

  return text
    .replace(/\{nome\}/gi, name)
    .replace(/\{primeiro_nome\}/gi, primeiroNome || name)
}
