import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortConfig<K extends string> {
  field: K | null;
  direction: SortDirection;
}

export interface UseListSearchSortOptions<T, K extends string> {
  /** Accessors returning the searchable text of an item (e.g. description, category). */
  searchAccessors?: Array<(item: T) => string | null | undefined>;
  /** Map of sort key -> value accessor (string | number | Date). */
  sortAccessors?: Partial<Record<K, (item: T) => string | number | Date | null | undefined>>;
  /**
   * Initial sort. Default: no sort, direction "desc".
   *
   * `NoInfer` é obrigatório aqui. Sem ele, `K` era inferido do literal em
   * `initialSort.field` (quase sempre a primeira propriedade que o TS
   * encontra), colapsando `K` numa chave só — e então `sortAccessors`
   * rejeitava todas as outras com "does not exist in type
   * Partial<Record<'<a chave>', ...>>". Eram 8 dos 39 erros da baseline do
   * tsc. Agora `K` sai apenas das chaves de `sortAccessors`, que é a fonte
   * correta, e `initialSort.field` passa a ser CONFERIDO contra elas em vez
   * de defini-las.
   */
  initialSort?: SortConfig<NoInfer<K>>;
}

/**
 * Reusable search + sort for any in-memory list. Mirrors the idiom already used
 * on the Transactions page: clicking a column sorts desc, then asc, then clears.
 * Search and sort are independent — pass an already-filtered list if the page
 * keeps its own search (just supply `sortAccessors`), or supply `searchAccessors`
 * to let this hook filter too.
 */
export function useListSearchSort<T, K extends string = string>(
  items: T[],
  options: UseListSearchSortOptions<T, K> = {}
) {
  const { searchAccessors, sortAccessors, initialSort } = options;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortConfig<K>>(
    initialSort ?? { field: null, direction: "desc" }
  );

  const toggleSort = (field: K) => {
    setSort((prev) => {
      if (prev.field === field) {
        // desc -> asc -> cleared
        return prev.direction === "desc"
          ? { field, direction: "asc" }
          : { field: null, direction: "desc" };
      }
      return { field, direction: "desc" };
    });
  };

  const processed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;

    if (q && searchAccessors && searchAccessors.length > 0) {
      list = list.filter((item) =>
        searchAccessors.some((acc) => {
          const v = acc(item);
          return typeof v === "string" && v.toLowerCase().includes(q);
        })
      );
    }

    if (sort.field && sortAccessors) {
      const acc = sortAccessors[sort.field];
      if (acc) {
        list = [...list].sort((a, b) => {
          const va = acc(a);
          const vb = acc(b);
          let cmp = 0;
          if (typeof va === "number" && typeof vb === "number") {
            cmp = va - vb;
          } else if (va instanceof Date && vb instanceof Date) {
            cmp = va.getTime() - vb.getTime();
          } else {
            cmp = String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR");
          }
          return sort.direction === "asc" ? cmp : -cmp;
        });
      }
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, sort]);

  return { query, setQuery, sort, toggleSort, setSort, items: processed };
}
