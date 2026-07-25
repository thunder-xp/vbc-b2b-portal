export const COMMERCIAL_SYNC_SCHEDULES = {
  rates: {
    path: "/api/cron/commercial-rate",
    cron: "15 22 * * *",
    chisinauSummer: "01:15",
    chisinauWinter: "00:15",
  },
  prices: {
    path: "/api/cron/price-sync-start",
    cron: "25 23 * * *",
    chisinauSummer: "02:25",
    chisinauWinter: "01:25",
  },
  stockAndArrivals: {
    path: "/api/cron/stock-sync-start",
    cron: "35 0 * * *",
    chisinauSummer: "03:35",
    chisinauWinter: "02:35",
  },
  catalog: {
    path: "/api/internal/catalog-sync",
    cron: "55 2 * * *",
    chisinauSummer: "05:55",
    chisinauWinter: "04:55",
  },
} as const;

export const COMMERCIAL_FRESHNESS_STALE_AFTER_HOURS = {
  rates: 26,
  prices: 26,
  stock: 5,
  arrivals: 26,
} as const;
