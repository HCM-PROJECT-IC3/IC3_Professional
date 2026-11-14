/* Cloudflare Worker cho bản dist-hosting (wrangler.jsonc). Chỉ chạy khi KHÔNG có file tĩnh khớp đường dẫn —
   file tĩnh (HTML/JS/CSS/ảnh/JSON) Cloudflare phục vụ thẳng, không tốn lượt Worker (gói miễn phí 100.000 lượt/ngày).

   html_handling "none" tắt việc Cloudflare tự đổi URL (arena.html → /arena), nên phải tự làm 2 việc:
   • "/", "/app/", "/mos/"… (thư mục) → index.html trong thư mục đó; "/app" → chuyển sang "/app/";
   • không có file → trang 404 đơn giản (GitHub Pages cũng trả 404). */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/')) {
      url.pathname += 'index.html';
      const res = await env.ASSETS.fetch(new Request(url, request));
      if (res.status !== 404) return res;
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
    // "/app" (thiếu "/") mà có thư mục app/index.html → chuyển sang "/app/" như GitHub Pages
    if (!/\.[a-z0-9]+$/i.test(url.pathname)) {
      const dir = new URL(url); dir.pathname += '/index.html';
      if ((await env.ASSETS.fetch(new Request(dir, { method: 'HEAD' }))).ok) {
        url.pathname += '/';
        return Response.redirect(url.toString(), 301);
      }
    }
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Không tìm thấy trang</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px">'
      + '<h1>Không tìm thấy trang</h1><p>Đường dẫn này không có. <a href="/">Về trang chủ</a></p>',
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    );
  },
};
