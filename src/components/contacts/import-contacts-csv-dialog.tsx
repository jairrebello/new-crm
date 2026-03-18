'use client'

import { useMemo, useState, useTransition } from 'react'
import { importContacts, type ImportContactsRow } from '@/app/actions/contacts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseCsvText } from '@/lib/csv'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
}

type MappingKey = 'name' | 'email' | 'phone' | 'notes'

const fieldLabels: Record<MappingKey, string> = {
  name: 'Nome (obrigatório)',
  email: 'E-mail',
  phone: 'Telefone',
  notes: 'Observações',
}

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function guessMapping(headers: string[]): Record<MappingKey, string> {
  const byNorm = new Map<string, string>()
  for (const h of headers) byNorm.set(normalizeHeader(h), h)

  const pick = (candidates: string[]) => {
    for (const c of candidates) {
      const found = byNorm.get(c)
      if (found) return found
    }
    return 'none'
  }

  return {
    name: pick(['nome', 'name', 'contato', 'cliente']),
    email: pick(['email', 'e mail', 'e-mail', 'mail']),
    phone: pick(['telefone', 'celular', 'whatsapp', 'phone', 'fone']),
    notes: pick(['observacoes', 'observacao', 'notas', 'notes', 'nota']),
  }
}

export function ImportContactsCsvDialog({ open, onOpenChange, tenantSlug }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvText, setCsvText] = useState<string>('')
  const parsed = useMemo(() => parseCsvText(csvText), [csvText])

  const [mapping, setMapping] = useState<Record<MappingKey, string>>({
    name: 'none',
    email: 'none',
    phone: 'none',
    notes: 'none',
  })

  const headers = useMemo(() => parsed.headers ?? [], [parsed])
  const previewRows = useMemo(() => (parsed.rows ?? []).slice(0, 5), [parsed])

  const mappedPreview = useMemo(() => {
    const idxByHeader = new Map<string, number>()
    headers.forEach((h, i) => idxByHeader.set(h, i))

    const get = (row: string[], header: string) => {
      const idx = idxByHeader.get(header)
      if (idx === undefined) return ''
      return (row[idx] ?? '').trim()
    }

    return previewRows.map((row) => ({
      name: mapping.name !== 'none' ? get(row, mapping.name) : '',
      email: mapping.email !== 'none' ? get(row, mapping.email) : '',
      phone: mapping.phone !== 'none' ? get(row, mapping.phone) : '',
      notes: mapping.notes !== 'none' ? get(row, mapping.notes) : '',
    }))
  }, [headers, mapping, previewRows])

  async function handleFile(file: File) {
    setError(null)
    setFileName(file.name)
    const text = await file.text()
    setCsvText(text)
    const guessed = guessMapping(parseCsvText(text).headers)
    setMapping(guessed)
  }

  function buildRowsToImport(): ImportContactsRow[] {
    const idxByHeader = new Map<string, number>()
    headers.forEach((h, i) => idxByHeader.set(h, i))
    const get = (row: string[], header: string) => {
      const idx = idxByHeader.get(header)
      if (idx === undefined) return ''
      return (row[idx] ?? '').trim()
    }

    return (parsed.rows ?? []).map((row) => ({
      name: mapping.name !== 'none' ? get(row, mapping.name) : '',
      email: mapping.email !== 'none' ? get(row, mapping.email) : null,
      phone: mapping.phone !== 'none' ? get(row, mapping.phone) : null,
      notes: mapping.notes !== 'none' ? get(row, mapping.notes) : null,
    }))
  }

  function resetAll() {
    setError(null)
    setFileName(null)
    setCsvText('')
    setMapping({ name: 'none', email: 'none', phone: 'none', notes: 'none' })
  }

  const canImport = headers.length > 0 && mapping.name !== 'none' && (parsed.rows?.length ?? 0) > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) resetAll()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar contatos via CSV</DialogTitle>
          <DialogDescription>
            Faça upload do CSV, mapeie as colunas e importe. Se o telefone vier sem DDI, vamos assumir Brasil (+55).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Arquivo CSV</label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            {fileName && <div className="text-xs text-muted-foreground">{fileName}</div>}
          </div>

          {headers.length > 0 && (
            <div className="grid gap-3">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-sm font-medium mb-2">Mapeamento de colunas</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(Object.keys(fieldLabels) as MappingKey[]).map((key) => (
                    <div key={key} className="grid gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{fieldLabels[key]}</label>
                      <Select
                        value={mapping[key]}
                        onValueChange={(v) => setMapping((prev) => ({ ...prev, [key]: v ?? 'none' }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— não importar —</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={`${key}-${h}`} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {mapping.name === 'none' && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Mapeie a coluna de <span className="font-medium">Nome</span> para habilitar a importação.
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-white p-3">
                <div className="text-sm font-medium mb-2">Prévia (primeiras 5 linhas)</div>
                {mappedPreview.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sem linhas para pré-visualizar.</div>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                      <div className="col-span-4">Nome</div>
                      <div className="col-span-3">E-mail</div>
                      <div className="col-span-3">Telefone</div>
                      <div className="col-span-2">Obs.</div>
                    </div>
                    <div className="divide-y">
                      {mappedPreview.map((r, i) => (
                        <div key={i} className="grid grid-cols-12 px-3 py-2 text-sm">
                          <div className="col-span-4 truncate">{r.name || '—'}</div>
                          <div className="col-span-3 truncate text-muted-foreground">{r.email || '—'}</div>
                          <div className="col-span-3 truncate text-muted-foreground">{r.phone || '—'}</div>
                          <div className="col-span-2 truncate text-muted-foreground">{r.notes || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || !canImport}
            onClick={() => {
              setError(null)
              if (!canImport) {
                setError('Selecione um CSV válido e mapeie a coluna de Nome.')
                return
              }

              const rowsToImport = buildRowsToImport()
              startTransition(async () => {
                try {
                  const res = await importContacts({ tenantSlug, rows: rowsToImport, defaultCountry: 'BR' })
                  toast.success(
                    `Importação concluída: ${res.inserted} inseridos, ${res.skippedDuplicates} duplicados, ${res.skippedInvalid} inválidos.`
                  )
                  onOpenChange(false)
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Falha ao importar contatos.'
                  setError(msg)
                  toast.error(msg)
                }
              })
            }}
          >
            {pending ? 'Importando...' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

