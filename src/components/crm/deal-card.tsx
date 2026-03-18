'use client'

import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Deal } from '@/app/actions/deals'
import { cn } from '@/lib/utils'

const priorityConfig = {
  high: { label: 'Alta', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  medium: { label: 'Média', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  low: { label: 'Baixa', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
}

type Props = {
  deal: Deal
  onOpen: (deal: Deal) => void
}

function DealCardContent({ deal }: { deal: Deal }) {
  const priority = priorityConfig[deal.priority as keyof typeof priorityConfig] ?? priorityConfig.medium
  const contactName = (deal.contact as { name?: string } | null)?.name
  const accountName = (deal.account as { name?: string } | null)?.name
  const subtitle = contactName ?? accountName
  const money = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }),
    []
  )

  return (
    <>
      <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">{deal.title}</h4>
      {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{subtitle}</p>}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {deal.deal_value > 0 ? money.format(Number(deal.deal_value)) : '—'}
        </span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.className)}>{priority.label}</span>
      </div>
      {deal.expected_close_date && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Fechamento: {new Date(deal.expected_close_date).toLocaleDateString('pt-BR')}
        </p>
      )}
    </>
  )
}

export function DealCard({ deal, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })

  const style = transform
    ? {
        // dnd-kit aplica translate via `transform`; para não conflitar com utilitários Tailwind
        // que também alteram `transform`, combinamos scale aqui.
        transform: `${CSS.Translate.toString(transform)}${isDragging ? ' scale(0.95)' : ''}`,
      }
    : isDragging
      ? { transform: 'scale(0.95)' }
      : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(deal)}
      className={cn(
        'bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 w-full box-border',
        'cursor-grab active:cursor-grabbing select-none',
        'hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all',
        isDragging && 'opacity-50 shadow-lg border-blue-400'
      )}
    >
      <DealCardContent deal={deal} />
    </div>
  )
}

// Visual-only version used in DndContext <DragOverlay/> to avoid creating extra draggable nodes.
export function DealCardView({ deal, onOpen }: { deal: Deal; onOpen?: () => void }) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 w-full box-border',
        'select-none'
      )}
      onClick={onOpen}
    >
      <DealCardContent deal={deal} />
    </div>
  )
}
