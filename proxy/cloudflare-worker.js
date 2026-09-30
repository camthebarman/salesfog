// Tiny CORS proxy so the hosted (static) Salesfog can read prospect websites.
//
// Deploy (free): dash.cloudflare.com -> Workers & Pages -> Create -> "Hello World"
// worker -> Edit code -> paste this file -> Deploy. Then paste the worker's URL
// into Salesfog under "Website reader settings".
//
// Only pages from ALLOWED_ORIGINS may use it, so strangers can't borrow it.

const ALLOWED_ORIGINS = [
  'https://camthebarman.github.io',
  'http://localhost:3000',
];
const MAX_BYTES = 2 * 1024 * 1024;

function cors(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-expose-headers': 'x-final-url',
    vary: 'origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors(origin) });

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url'));
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors(origin) });
    }
    if (!/^https?:$/.test(target.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/.test(target.hostname)) {
      return new Response('URL not allowed', { status: 400, headers: cors(origin) });
    }

    const res = await fetch(target, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SalesfogBot/1.0; +https://github.com/camthebarman/salesfog)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
    });
    const type = res.headers.get('content-type') || 'text/html';
    if (!/html|xml|text/i.test(type)) {
      return new Response(`Not a web page (${type})`, { status: 415, headers: cors(origin) });
    }
    const body = (await res.text()).slice(0, MAX_BYTES);
    return new Response(body, {
      status: res.status,
      headers: { ...cors(origin), 'content-type': 'text/html; charset=utf-8', 'x-final-url': res.url },
    });
  },
};
