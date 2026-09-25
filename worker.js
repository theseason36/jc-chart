// Jc 트레이딩 차트 - 거래소 시세 중계 (Cloudflare Worker)
// 브라우저에서 직접 막힌 거래소 공개 시세 API를 대신 받아서 전달합니다.
// 주소 맨 앞의 /backpack 또는 /lighter 로 어느 거래소로 보낼지 정하고,
// 그 뒤는 원래 API 경로 그대로 붙입니다.
// 예) /backpack/api/v1/tickers  ->  https://api.backpack.exchange/api/v1/tickers
//     /lighter/api/v1/candles   ->  https://mainnet.zklighter.elliot.ai/api/v1/candles
// 시세 조회 경로만 허용하고, 읽기(GET) 외의 요청은 모두 거절합니다.

const EXCHANGES = {
  backpack: {
    upstream: 'https://api.backpack.exchange',
    allowedPaths: new Set(['/api/v1/markets', '/api/v1/tickers', '/api/v1/ticker', '/api/v1/klines']),
  },
  lighter: {
    upstream: 'https://mainnet.zklighter.elliot.ai',
    allowedPaths: new Set(['/api/v1/orderBookDetails', '/api/v1/candles']),
  },
};

// 내 웹앱 주소만 허용하려면 '*' 대신 'https://아이디.github.io' 로 바꾸세요.
const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (ALLOWED_ORIGIN !== '*' && origin && origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean); // ["backpack", "api", "v1", "tickers"]
    const exchangeKey = segments[0];
    const exchange = EXCHANGES[exchangeKey];
    if (!exchange) {
      return new Response('Not found (use /backpack/... or /lighter/...)', { status: 404, headers: cors });
    }

    const upstreamPath = '/' + segments.slice(1).join('/');
    if (!exchange.allowedPaths.has(upstreamPath)) {
      return new Response('Not found', { status: 404, headers: cors });
    }

    try {
      const upstream = await fetch(exchange.upstream + upstreamPath + url.search, {
        headers: { Accept: 'application/json' },
      });
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      const retryAfter = upstream.headers.get('Retry-After');
      if (retryAfter) headers.set('Retry-After', retryAfter);
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      return new Response(JSON.stringify({ message: exchangeKey + ' 서버에 연결하지 못했어요.' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
