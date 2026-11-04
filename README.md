# Debt Manager — Quản lý nợ hàng tháng

App web theo dõi thẻ tín dụng, vay trả góp, vay công ty tài chính: tháng này phải trả bao nhiêu, khoản nào, trước ngày nào; tiền có đủ không; khi nào hết nợ; lãi thực tế bao nhiêu.

**Dữ liệu chỉ lưu trong trình duyệt của bạn (IndexedDB).** Không có máy chủ, không gửi dữ liệu đi đâu. Hãy dùng *Cài đặt → Xuất JSON* để sao lưu.

## Tính năng

- Thẻ tín dụng, vay trả góp, hạn mức, khoản nợ tự định nghĩa — quy tắc từng ngân hàng là cấu hình (ngày trả cố định, phí thu hộ, dùng chung hạn mức, trả góp gộp sao kê…), có preset
- Ghi nhận thanh toán, tự suy ra kỳ đã trả; cảnh báo sắp đến hạn / quá hạn / vượt hạn mức / lãi cao
- Lãi danh nghĩa, lãi thực tế (APR) sau phí và bảo hiểm bị trừ
- Dòng tiền theo ngày, dự phóng nhiều tháng, mốc hết nợ
- Cài như ứng dụng (PWA), dùng offline, nhắc hạn bằng thông báo hoặc file lịch `.ics`

Đặc tả: [debt-manager-spec-v2.md](debt-manager-spec-v2.md).

## Phát triển

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit test (vitest)
npm run test:e2e   # E2E (Playwright, dùng Chrome đã cài)
npm run build
```

Mỗi lần push lên `main`, GitHub Actions chạy toàn bộ test rồi deploy lên GitHub Pages.
