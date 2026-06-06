const VERSION = "petrair-prices-2026-06-01-v4";

const SYMBOLS = {
  brent: "BZ=F",
  wti: "CL=F",
  ulsdHarbor: "HO=F",
  rbobGasoline: "RB=F",
  naturalGas: "NG=F"
};

const FALLBACK = {
  brent: { price: 82.44, prev: 82.12, source: "fallback-indicative" },
  wti: { price: 77.91, prev: 77.55, source: "fallback-indicative" },
  ulsdHarbor: { price: 2.55, prev: 2.53, source: "fallback-indicative" },
  rbobGasoline: { price: 2.48, prev: 2.46, source: "fallback-indicative" },
  naturalGas: { price: 3.21, prev: 3.18, source: "fallback-indicative" }
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const debug = new URL(request.url).searchParams.has("debug");
    const notes = [];
    const prices = { ...FALLBACK };

    await Promise.all(
      Object.entries(SYMBOLS).map(async ([key, symbol]) => {
        const live = await getYahooChart(symbol, notes);
        if (live) prices[key] = live;
      })
    );

    const body = debug ? { version: VERSION, prices, debug: notes } : { version: VERSION, ...prices };
    return json(body, 200);
  }
};

async function getYahooChart(symbol, notes) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;

  try {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Mozilla/5.0"
      }
    });

    notes.push(`${symbol} status ${response.status}`);
    if (!response.ok) return null;

    const data = await response.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;

    return {
      price: Number(meta.regularMarketPrice),
      prev: Number(meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice),
      source: "yahoo-chart"
    };
  } catch (error) {
    notes.push(`${symbol} error ${error.message}`);
    return null;
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=45"
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
