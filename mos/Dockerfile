# Máy chủ phòng máy: phát trang + tệp đề, và cho Office mở/lưu thẳng bản làm bài (WebDAV) — xem server.js.
# Chấm bài vẫn chạy trên trình duyệt học sinh; container chỉ lưu tệp tạm, tự xoá sau 3 ngày.
FROM node:22-alpine
WORKDIR /app
COPY server.js index.html favicon.svg ./
COPY css ./css
COPY js ./js
COPY data ./data
ENV PORT=8080 MOS_WORK=/work
EXPOSE 8080
CMD ["node", "server.js"]
# files/ (tệp đề) và /work (bản làm bài) gắn từ máy chủ qua volume — xem docker-compose.yml.
