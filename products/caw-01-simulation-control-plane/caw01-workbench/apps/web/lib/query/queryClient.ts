import { QueryClient } from "@tanstack/react-query";

/** TanStack Query = the server-state half of the ViewModel (app-architecture-mvvm.md). */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
}
