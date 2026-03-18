"use client"

import * as React from "react"
import { ChevronsUpDown, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

type Tenant = {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

export function TenantSwitcher({ 
  tenants, 
  currentTenantSlug 
}: { 
  tenants: Tenant[], 
  currentTenantSlug: string 
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(currentTenantSlug)

  const activeTenant = tenants.find((tenant) => tenant.slug === value) || tenants[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between mt-2"
        >
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={activeTenant?.logo_url || ""} />
              <AvatarFallback>{activeTenant?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{activeTenant?.name}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      } />
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Buscar empresa..." />
          <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
          <CommandGroup>
            <CommandList>
              {tenants.map((tenant) => (
                <CommandItem
                  key={tenant.slug}
                  value={tenant.slug}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? value : currentValue)
                    setOpen(false)
                    window.location.href = `/${currentValue}/dashboard`
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === tenant.slug ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {tenant.name}
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
