# Máy chủ trường cho cả dự án (server/server.js): phát trang qua LAN, MOS ở /mos/, hàng đợi bài nộp
# gửi Apps Script theo lô. Chỉ dùng Node có sẵn — không cài gói npm nào. Hướng dẫn: docs/DOCKER.md.
FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data /app/mos/files && chown node:node /data
ENV PORT=8080 DATA_DIR=/data MOS_WORK=/data/work
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
CMD ["node", "server/server.js"]
# mos/files (tệp đề Excel/PowerPoint/Word) gắn từ máy chủ qua volume; /data (hàng đợi bài nộp,
# bản làm bài MOS) là volume riêng — xoá/cập nhật container không mất bài chưa gửi.
