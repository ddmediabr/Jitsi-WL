"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const PAGE_SIZE = 15;

/** Minúsculas e sem acentos: "joao" encontra "João". */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Busca em tempo real (por partes do texto) + paginação de uma lista que já está no navegador. As listas do painel
 * são pequenas (centenas), então filtrar a cada tecla é imediato. Trocar a busca ou o filtro volta à página 1.
 */
export function usePaged<T>(items: T[], text: (item: T) => string[], filter?: (item: T) => boolean, pageSize = PAGE_SIZE) {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const q = norm(query.trim());
  const matched = items.filter((item) => (!filter || filter(item)) && (!q || text(item).some((t) => norm(t).includes(q))));
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const current = Math.min(page, pageCount);
  return {
    query,
    setQuery: (value: string) => {
      setQueryState(value);
      setPage(1);
    },
    resetPage: () => setPage(1),
    page: current,
    setPage,
    pageCount,
    total: matched.length,
    rows: matched.slice((current - 1) * pageSize, current * pageSize),
    searching: q !== "" || Boolean(filter),
    pageSize,
  };
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className = "w-full max-w-sm",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        maxLength={64}
        className="pl-[42px]"
      />
    </div>
  );
}

export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] leading-normal text-muted-foreground" aria-live="polite">
        {from}–{to} de {total}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Paginação" className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeftIcon /> Anterior
          </Button>
          <span className="text-sm leading-normal text-muted-foreground tabular-nums">
            Página {page} de {pageCount}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            Próxima <ChevronRightIcon />
          </Button>
        </nav>
      )}
    </div>
  );
}
