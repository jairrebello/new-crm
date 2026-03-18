'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Pipeline, PipelineStageDraft } from '@/app/actions/pipelines'
import { createPipeline, syncPipeline } from '@/app/actions/pipelines'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PlusIcon, Trash2Icon, ArrowDownIcon, ArrowUpIcon } from 'lucide-react'

type Props = {
  tenantSlug: string
  pipelines: Pipeline[]
}

function btrim(s: string) {
  return s.replace(/^\s+|\s+$/g, '')
}

function defaultColor() {
  return '#e2e8f0'
}

function normalizeHexColor(input: string) {
  const c = input.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  return defaultColor()
}

export function PipelinesSettings({ tenantSlug, pipelines }: Props) {
  const [localPipelines, setLocalPipelines] = useState<Pipeline[]>(pipelines)
  useEffect(() => {
    setLocalPipelines(pipelines)
  }, [pipelines])

  const initialPipelineId = useMemo(() => pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id ?? '', [pipelines])
  const [selectedPipelineId, setSelectedPipelineId] = useState(initialPipelineId)
  useEffect(() => {
    if (!localPipelines.some((p) => p.id === selectedPipelineId)) {
      const next = localPipelines.find((p) => p.is_default)?.id ?? localPipelines[0]?.id ?? ''
      setSelectedPipelineId(next)
    }
  }, [localPipelines, selectedPipelineId])

  const selectedPipeline = localPipelines.find((p) => p.id === selectedPipelineId) ?? null

  const [draftName, setDraftName] = useState(selectedPipeline?.name ?? '')
  const [draftIsDefault, setDraftIsDefault] = useState(selectedPipeline?.is_default ?? false)
  const [draftStages, setDraftStages] = useState<PipelineStageDraft[]>(selectedPipeline?.stages.map((s) => ({ id: s.id, name: s.name, color: s.color })) ?? [])

  useEffect(() => {
    if (!selectedPipeline) return
    setDraftName(selectedPipeline.name)
    setDraftIsDefault(selectedPipeline.is_default)
    setDraftStages(selectedPipeline.stages.map((s) => ({ id: s.id, name: s.name, color: s.color })))
  }, [selectedPipelineId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingSave, startSave] = useTransition()

  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [pendingCreate, startCreate] = useTransition()

  const [createName, setCreateName] = useState('')
  const [createIsDefault, setCreateIsDefault] = useState(false)
  const [createStages, setCreateStages] = useState<Array<{ name: string; color: string }>>([{ name: 'Nova etapa', color: defaultColor() }])

  function resetCreateForm() {
    setCreateName('')
    setCreateIsDefault(false)
    setCreateStages([{ name: 'Nova etapa', color: defaultColor() }])
    setCreateError(null)
  }

  function updateDraftStage(index: number, patch: Partial<PipelineStageDraft>) {
    setDraftStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch, color: patch.color ? normalizeHexColor(patch.color) : s.color } : s)))
  }

  function moveDraftStage(index: number, dir: -1 | 1) {
    setDraftStages((prev) => {
      const nextIndex = index + dir
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(nextIndex, 0, item)
      return copy
    })
  }

  function deleteDraftStage(index: number) {
    setDraftStages((prev) => prev.filter((_, i) => i !== index))
  }

  function addDraftStage() {
    setDraftStages((prev) => [...prev, { name: 'Nova etapa', color: defaultColor() }])
  }

  async function handleSavePipeline() {
    if (!selectedPipeline) return
    setSaveError(null)

    const name = btrim(draftName)
    if (!name) return setSaveError('Informe o nome da pipeline.')
    if (!draftStages.length) return setSaveError('Informe pelo menos 1 etapa.')
    for (const s of draftStages) {
      if (!btrim(s.name)) return setSaveError('Informe o nome de todas as etapas.')
      if (!/^#[0-9a-f]{6}$/i.test(s.color)) return setSaveError('Cor de etapa inválida.')
    }

    startSave(async () => {
      try {
        const originalIds = new Set(selectedPipeline.stages.map((s) => s.id))
        const keptIds = new Set(draftStages.filter((s) => Boolean(s.id)).map((s) => s.id as string))
        const deletedStageIds = [...originalIds].filter((id) => !keptIds.has(id))

        const updated = await syncPipeline({
          tenantSlug,
          pipelineId: selectedPipeline.id,
          name,
          is_default: draftIsDefault,
          stages: draftStages.map((s) => ({ id: s.id, name: btrim(s.name), color: normalizeHexColor(s.color) })),
          deletedStageIds,
        })

        setLocalPipelines((prev) => {
          if (updated.is_default) {
            return prev.map((p) => (p.id === updated.id ? updated : { ...p, is_default: false }))
          }
          return prev.map((p) => (p.id === updated.id ? updated : p))
        })
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Falha ao salvar pipeline.')
      }
    })
  }

  function updateCreateStage(index: number, patch: Partial<{ name: string; color: string }>) {
    setCreateStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch, color: patch.color ? normalizeHexColor(patch.color) : s.color } : s)))
  }

  function moveCreateStage(index: number, dir: -1 | 1) {
    setCreateStages((prev) => {
      const nextIndex = index + dir
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(nextIndex, 0, item)
      return copy
    })
  }

  function deleteCreateStage(index: number) {
    setCreateStages((prev) => prev.filter((_, i) => i !== index))
  }

  function addCreateStage() {
    setCreateStages((prev) => [...prev, { name: 'Nova etapa', color: defaultColor() }])
  }

  async function handleCreatePipeline(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)

    const name = btrim(createName)
    if (!name) return setCreateError('Informe o nome da pipeline.')
    if (!createStages.length) return setCreateError('Informe pelo menos 1 etapa.')
    for (const s of createStages) {
      if (!btrim(s.name)) return setCreateError('Informe o nome de todas as etapas.')
      if (!/^#[0-9a-f]{6}$/i.test(s.color)) return setCreateError('Cor de etapa inválida.')
    }

    startCreate(async () => {
      try {
        const created = await createPipeline({
          tenantSlug,
          name,
          is_default: createIsDefault,
          stages: createStages.map((s) => ({ name: btrim(s.name), color: normalizeHexColor(s.color) })),
        })

        setLocalPipelines((prev) => {
          if (created.is_default) return prev.map((p) => ({ ...p, is_default: false })).concat(created)
          return prev.concat(created)
        })

        setSelectedPipelineId(created.id)
        setCreateOpen(false)
        resetCreateForm()
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : 'Falha ao criar pipeline.')
      }
    })
  }

  if (!localPipelines.length) {
    return (
      <div className="bg-white shadow rounded-lg p-6 border">
        <h3 className="text-lg font-medium">Pipelines</h3>
        <p className="text-sm text-muted-foreground mt-1">Nenhuma pipeline cadastrada.</p>
        <div className="mt-4">
          <Button onClick={() => setCreateOpen(true)}>Criar pipeline</Button>
        </div>

        <Dialog open={createOpen} onOpenChange={(next) => { setCreateOpen(next); if (!next) resetCreateForm() }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova pipeline</DialogTitle>
              <DialogDescription>Crie a pipeline e suas etapas. Cada etapa terá uma cor.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreatePipeline} className="grid gap-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Nome da pipeline</label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Ex: Vendas" />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={createIsDefault} onChange={(e) => setCreateIsDefault(e.target.checked)} />
                Definir como pipeline padrão
              </label>

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Etapas</div>
                  <Button type="button" size="sm" variant="outline" onClick={addCreateStage}>
                    <PlusIcon className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>

                <div className="grid gap-3">
                  {createStages.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-1">
                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: s.color }} />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="color"
                          value={s.color}
                          onChange={(e) => updateCreateStage(idx, { color: e.target.value })}
                          className="w-full h-8 rounded-md border bg-transparent p-0"
                        />
                      </div>
                      <div className="col-span-5">
                        <Input value={s.name} onChange={(e) => updateCreateStage(idx, { name: e.target.value })} />
                      </div>
                      <div className="col-span-2 flex gap-2 justify-end">
                        <Button type="button" size="icon-xs" variant="outline" disabled={idx === 0} onClick={() => moveCreateStage(idx, -1)}>
                          <ArrowUpIcon className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon-xs" variant="outline" disabled={idx === createStages.length - 1} onClick={() => moveCreateStage(idx, 1)}>
                          <ArrowDownIcon className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Button type="button" size="icon-xs" variant="destructive" disabled={createStages.length <= 1} onClick={() => deleteCreateStage(idx)}>
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {createError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>}

              <DialogFooter>
                <Button type="button" variant="outline" disabled={pendingCreate} onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pendingCreate}>
                  {pendingCreate ? 'Criando...' : 'Criar pipeline'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 border">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Pipelines</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie, edite e alterne pipelines por empresa.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)} variant="outline">
            <PlusIcon className="h-4 w-4 mr-2" />
            Nova pipeline
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-1.5" style={{ width: 320 }}>
            <label className="text-sm font-medium">Pipeline em edição</label>
            <Select
              value={selectedPipelineId}
              onValueChange={(v) => setSelectedPipelineId(v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione pipeline" />
              </SelectTrigger>
              <SelectContent>
                {localPipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? ' (padrão)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button type="button" onClick={handleSavePipeline} disabled={pendingSave} className="gap-1.5">
              {pendingSave ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {selectedPipeline && (
          <div className="rounded-lg border p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Nome da pipeline</label>
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground pt-6">
                <input type="checkbox" checked={draftIsDefault} onChange={(e) => setDraftIsDefault(e.target.checked)} />
                Definir como pipeline padrão
              </label>
            </div>

            <div className="mt-4 rounded-lg border p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Etapas ({draftStages.length})</div>
                <Button type="button" size="sm" variant="outline" onClick={addDraftStage}>
                  <PlusIcon className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              <div className="grid gap-3">
                {draftStages.map((s, idx) => (
                  <div key={s.id ?? `new-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1">
                      <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: s.color }} />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="color"
                        value={normalizeHexColor(s.color)}
                        onChange={(e) => updateDraftStage(idx, { color: e.target.value })}
                        className="w-full h-8 rounded-md border bg-transparent p-0"
                      />
                    </div>
                    <div className="col-span-5">
                      <Input value={s.name} onChange={(e) => updateDraftStage(idx, { name: e.target.value })} />
                    </div>
                    <div className="col-span-2 flex gap-2 justify-end">
                      <Button type="button" size="icon-xs" variant="outline" disabled={idx === 0} onClick={() => moveDraftStage(idx, -1)}>
                        <ArrowUpIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        disabled={idx === draftStages.length - 1}
                        onClick={() => moveDraftStage(idx, 1)}
                      >
                        <ArrowDownIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button type="button" size="icon-xs" variant="destructive" disabled={draftStages.length <= 1} onClick={() => deleteDraftStage(idx)}>
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {saveError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(next) => { setCreateOpen(next); if (!next) resetCreateForm() }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova pipeline</DialogTitle>
            <DialogDescription>Crie a pipeline e suas etapas. Cada etapa terá uma cor.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePipeline} className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Nome da pipeline</label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Ex: Vendas" />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={createIsDefault} onChange={(e) => setCreateIsDefault(e.target.checked)} />
              Definir como pipeline padrão
            </label>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Etapas</div>
                <Button type="button" size="sm" variant="outline" onClick={addCreateStage}>
                  <PlusIcon className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              <div className="grid gap-3">
                {createStages.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1">
                      <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: s.color }} />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="color"
                        value={normalizeHexColor(s.color)}
                        onChange={(e) => updateCreateStage(idx, { color: e.target.value })}
                        className="w-full h-8 rounded-md border bg-transparent p-0"
                      />
                    </div>
                    <div className="col-span-5">
                      <Input value={s.name} onChange={(e) => updateCreateStage(idx, { name: e.target.value })} />
                    </div>
                    <div className="col-span-2 flex gap-2 justify-end">
                      <Button type="button" size="icon-xs" variant="outline" disabled={idx === 0} onClick={() => moveCreateStage(idx, -1)}>
                        <ArrowUpIcon className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon-xs" variant="outline" disabled={idx === createStages.length - 1} onClick={() => moveCreateStage(idx, 1)}>
                        <ArrowDownIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button type="button" size="icon-xs" variant="destructive" disabled={createStages.length <= 1} onClick={() => deleteCreateStage(idx)}>
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {createError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pendingCreate} onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendingCreate}>
                {pendingCreate ? 'Criando...' : 'Criar pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

