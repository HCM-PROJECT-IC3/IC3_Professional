/* Ngân hàng nhận xét chung (Ưu điểm / Hạn chế) cho "Điền bảng tuần" — js/so-dau-bai/sdb-weekly.js pickComment.
   Khoá chủ đề = tên chủ đề trong PPCT (js/so-dau-bai/ppct-ic3.js) viết thường, bỏ dấu. {bai} = tên bài bỏ "Bài N:".
   {n} = số học sinh vắng. Sửa câu ở đây là đổi cho mọi giáo viên; câu thầy cô sửa tay trên trang được giữ trong sổ. */
window.SDB_COMMENT_BANK = {
  common: {
    know: [
      'Nắm được nội dung chính của bài {bai}.',
      'Hiểu và trả lời được các câu hỏi về {bai}.',
      'Đa số HS nắm được kiến thức trọng tâm của bài.',
    ],
    uu: [
      'Lớp hào hứng, tích cực phát biểu xây dựng bài.',
      'HS chú ý nghe giảng, thực hiện tốt yêu cầu của GV.',
      'Nề nếp phòng máy tốt, HS sử dụng máy đúng quy định.',
      'Nhiều HS mạnh dạn chia sẻ ý kiến, trao đổi sôi nổi.',
      'HS hợp tác tốt khi thảo luận nhóm.',
      'Lớp học sôi nổi, HS làm bài nghiêm túc.',
    ],
    hc: [
      'Một số HS còn nói chuyện riêng, chưa tập trung.',
      'Một vài em thao tác còn chậm, cần GV hỗ trợ.',
      'Một số HS chưa mạnh dạn phát biểu.',
    ],
    absent: [
      'Sĩ số chưa đảm bảo (vắng {n} HS), GV đã nhắc nhở.',
      'Lớp vắng {n} HS, cần phối hợp GVCN nhắc nhở chuyên cần.',
    ],
  },
  kinds: {
    review: {
      uu: [
        'HS ôn lại được các kiến thức đã học trong chủ đề.',
        'Đa số HS trả lời đúng các câu hỏi ôn tập.',
        'HS tự giác làm bài ôn, nhiều em đạt kết quả tốt.',
      ],
      hc: [
        'Một số HS còn nhầm lẫn kiến thức giữa các bài.',
        'Một vài em làm bài còn vội, đọc câu hỏi chưa kĩ.',
        'Một số HS ghi nhớ chưa chắc, cần ôn thêm.',
      ],
    },
    test: {
      uu: [
        'HS làm bài nghiêm túc, đúng thời gian quy định.',
        'Nhiều HS đạt kết quả tốt trong bài luyện thi.',
        'HS đã quen với giao diện và cách làm bài thi.',
      ],
      hc: [
        'Một số HS còn đọc đề chưa kĩ, chọn đáp án vội.',
        'Một vài em chưa quen thao tác kéo thả, chọn nhiều đáp án.',
        'Kết quả một số HS chưa cao, cần luyện thêm.',
      ],
    },
    intro: {
      uu: [
        'HS hào hứng làm quen với chương trình IC3 Spark.',
        'HS nắm được nội quy phòng máy và cách học môn.',
      ],
      hc: [
        'Một số HS chưa quen nề nếp phòng máy.',
        'Một vài em còn rụt rè khi làm quen môn học mới.',
      ],
    },
  },
  topics: {
    'can ban ve cong nghe': {
      uu: [
        'HS nhận biết và gọi đúng tên các thiết bị, thành phần trong bài.',
        'HS nắm được nội dung bài {bai}, liên hệ được với máy tính ở nhà, ở trường.',
        'HS phân biệt được các khái niệm cơ bản về công nghệ trong bài.',
      ],
      hc: [
        'Một số HS còn nhầm lẫn giữa các thiết bị, khái niệm.',
        'Một vài em gọi tên thiết bị chưa chính xác.',
        'Một số HS còn lúng túng khi phân loại.',
      ],
    },
    'an toan va bao mat': {
      uu: [
        'HS nêu được cách giữ an toàn khi sử dụng thiết bị và Internet.',
        'HS nhận biết được tình huống không an toàn, biết cách ứng xử phù hợp.',
        'HS hiểu bài {bai} và liên hệ được với thực tế.',
      ],
      hc: [
        'Một số HS còn lúng túng khi xử lí tình huống.',
        'Một vài em chưa nhận ra hết các rủi ro trong ví dụ.',
        'Một số HS chưa có thói quen bảo vệ thông tin cá nhân.',
      ],
    },
    'quan li thong tin': {
      uu: [
        'HS nắm được nội dung bài {bai} và thực hành được trên trình duyệt.',
        'HS biết tìm kiếm và đánh giá thông tin trực tuyến ở mức cơ bản.',
        'HS thao tác được với trình duyệt Web theo hướng dẫn.',
      ],
      hc: [
        'Một số HS còn lúng túng khi đánh giá độ tin cậy của thông tin.',
        'Một vài em thao tác trên trình duyệt còn chậm.',
        'Một số HS gõ từ khoá tìm kiếm chưa chính xác.',
      ],
    },
    'sang tao noi dung': {
      uu: [
        'HS thực hành được các thao tác cơ bản trong bài {bai}.',
        'HS thao tác nhanh, nhiều sản phẩm đẹp, sáng tạo.',
        'HS nắm được các thành phần cơ bản của tài liệu, bài trình chiếu.',
      ],
      hc: [
        'Một số HS thao tác chuột, bàn phím còn chậm.',
        'Một vài em chưa hoàn thành sản phẩm trong tiết.',
        'Một số HS còn nhầm vị trí các nút lệnh.',
      ],
    },
    'cong dan so': {
      uu: [
        'HS hiểu được quyền và trách nhiệm khi tham gia môi trường số.',
        'HS nêu được hành vi đúng, sai khi trực tuyến.',
        'HS nắm được nội dung bài {bai} và liên hệ bản thân.',
      ],
      hc: [
        'Một số HS chưa phân biệt rõ hành vi phù hợp và chưa phù hợp.',
        'Một vài em còn lúng túng khi nêu ví dụ thực tế.',
      ],
    },
    'giao tiep ki thuat so': {
      uu: [
        'HS biết lựa chọn cách giao tiếp kĩ thuật số phù hợp.',
        'HS nắm được quy tắc ứng xử khi giao tiếp trực tuyến.',
        'HS nắm được nội dung bài {bai}.',
      ],
      hc: [
        'Một số HS còn nhầm lẫn giữa các phương thức giao tiếp.',
        'Một vài em chưa nắm chắc các thành phần của thư điện tử.',
      ],
    },
    'cong tac': {
      uu: [
        'HS hiểu được lợi ích của cộng tác, làm việc nhóm tích cực.',
        'HS phối hợp tốt trong nhóm, hoàn thành nhiệm vụ.',
      ],
      hc: [
        'Một số nhóm phân công chưa hợp lí.',
        'Một vài em còn ỷ lại vào bạn trong nhóm.',
      ],
    },
    'mo rong': {
      uu: [
        'HS tiếp thu tốt nội dung mở rộng.',
        'HS hào hứng với nội dung mới, tích cực thực hành.',
      ],
      hc: [
        'Một số HS chưa theo kịp nội dung mở rộng.',
      ],
    },
  },
};
