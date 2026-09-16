/* ============================================================
   js/services/sharepoint-sync.js
   Đồng bộ TRỰC TIẾP từ file Excel trên SharePoint/OneDrive — thay vì
   tải file về máy rồi bấm "📥 Nhập từ Excel" thủ công. Dùng MSAL.js
   (đăng nhập Microsoft ngay trên trình duyệt, popup, KHÔNG cần
   backend/server riêng) + Microsoft Graph API để tải nội dung file
   .xlsx mới nhất, sau đó trả về y hệt một ArrayBuffer như khi đọc
   file từ <input type="file"> — nơi gọi (teaching-schedule.js) tái sử
   dụng nguyên hàm parseWorkbookArrayBuffer() sẵn có, không cần đụng gì
   tới logic đọc/parse Excel.

   BẮT BUỘC cấu hình trước khi dùng (window.EDU_SHAREPOINT_CONFIG bên
   dưới) — 3 bước một lần trong Entra admin center (portal.azure.com,
   cần quyền admin M365/Azure của tổ chức, KHÔNG cần backend/server):
     1) Entra ID → App registrations → New registration.
        - Tên tuỳ ý, vd "IC3 Lịch giảng dạy".
        - Supported account types: "Accounts in this organizational
          directory only" (single tenant) là đủ.
        - Redirect URI: chọn "Single-page application (SPA)", điền
          đúng URL trang teaching-schedule.html đang chạy (vd
          https://<domain-hosting-cua-ban>/teaching-schedule.html).
     2) Sau khi tạo xong, copy "Application (client) ID" và
        "Directory (tenant) ID" ở trang Overview → điền vào CLIENT_ID/
        TENANT_ID bên dưới.
     3) API permissions → Add a permission → Microsoft Graph →
        Delegated permissions → thêm "Files.Read.All" → bấm "Grant
        admin consent" (nếu tổ chức yêu cầu admin duyệt trước).
   Cuối cùng, SHARE_URL bên dưới chính là link chia sẻ file Excel mà
   bạn đã có (đảm bảo người dùng đăng nhập có quyền "View"/"Edit" file
   này — Graph API tôn trọng đúng quyền chia sẻ hiện có trên SharePoint,
   không tự mở quyền truy cập gì thêm).
   ============================================================ */
(function () {
  'use strict';

  window.EDU_SHAREPOINT_CONFIG = window.EDU_SHAREPOINT_CONFIG || {
    // ⚠️ Điền 3 giá trị dưới đây sau khi đăng ký app ở Entra admin center
    // (xem hướng dẫn phía trên) — để trống thì nút "Đồng bộ SharePoint" sẽ
    // báo lỗi hướng dẫn thay vì âm thầm không chạy được gì.
    clientId: '4f3d02f0-105b-4427-9937-8d00d9442c4e',
    tenantId: 'a41d5dd2-b4a1-47ca-9838-e976cee80de2',
    shareUrl: 'https://iigvietnamedu.sharepoint.com/:x:/s/PhngDnTP.HCM/IQAZ_cGq41Z3QZgIgD0JF1myAVKf80z5MKPpNUifjN8kh0U?e=yuBUsd',
  };

  let msalInstance = null;
  function getMsalInstance() {
    if (msalInstance) return msalInstance;
    const cfg = window.EDU_SHAREPOINT_CONFIG;
    if (!window.msal) throw new Error('Chưa tải được thư viện đăng nhập Microsoft (MSAL.js), kiểm tra mạng rồi thử lại.');
    if (!cfg.clientId || !cfg.tenantId) {
      throw new Error('Chưa cấu hình kết nối SharePoint — điền clientId/tenantId vào window.EDU_SHAREPOINT_CONFIG trong js/services/sharepoint-sync.js (xem hướng dẫn ở đầu file).');
    }
    msalInstance = new msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    return msalInstance;
  }

  const GRAPH_SCOPES = ['Files.Read.All'];

  async function getAccessToken() {
    const msalApp = getMsalInstance();
    const accounts = msalApp.getAllAccounts();
    if (accounts.length) {
      try {
        const res = await msalApp.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] });
        return res.accessToken;
      } catch (_) { /* rơi xuống đăng nhập lại bằng popup bên dưới */ }
    }
    const res = await msalApp.loginPopup({ scopes: GRAPH_SCOPES, prompt: accounts.length ? undefined : 'select_account' });
    const res2 = await msalApp.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: res.account });
    return res2.accessToken;
  }

  /** Mã hoá share URL thành "shareId" theo đúng định dạng Microsoft Graph
   * yêu cầu cho endpoint /shares/{shareId} — xem tài liệu "Access
   * SharePoint site or OneDrive item by using a sharing URL". */
  function encodeShareUrl(url) {
    const base64 = btoa(unescape(encodeURIComponent(url)))
      .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    return 'u!' + base64;
  }

  /** Tải nội dung file Excel mới nhất từ SharePoint qua Graph API, trả về
   * ArrayBuffer y hệt FileReader.readAsArrayBuffer() — nơi gọi feed thẳng
   * vào XLSX.read() sẵn có, không cần tải file về máy/upload thủ công. */
  async function fetchLatestWorkbookArrayBuffer() {
    const cfg = window.EDU_SHAREPOINT_CONFIG;
    if (!cfg.shareUrl) throw new Error('Chưa cấu hình shareUrl trong window.EDU_SHAREPOINT_CONFIG.');
    const token = await getAccessToken();
    const shareId = encodeShareUrl(cfg.shareUrl);
    const res = await fetch(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Không tải được file từ SharePoint (HTTP ${res.status}). Kiểm tra lại quyền truy cập file hoặc thử đăng nhập lại.`);
    }
    return res.arrayBuffer();
  }

  window.EduSharePointSync = { fetchLatestWorkbookArrayBuffer };
})();
