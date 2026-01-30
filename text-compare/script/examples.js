(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.pasteJsonExample = function pasteJsonExample() {
    TC.setEditorText("text1", '{\n  "name": "John Doe",\n  "age": 30,\n  "city": "New York"\n}');
    TC.setEditorText("text2", '{\n  "name": "Jane Doe",\n  "age": 25,\n  "city": "Los Angeles",\n  "country": "USA"\n}');

    // Update line numbers and run compare next frame.
    TC.updateLineNumbers("text1", "lineNumbers1");
    TC.updateLineNumbers("text2", "lineNumbers2");

    requestAnimationFrame(() => TC.compareTexts());
  };

  TC.pasteExample = function pasteExample() {
    TC.setEditorText(
      "text1",
      "Công nghệ trí tuệ nhân tạo (AI) đang thay đổi cách chúng ta làm việc hàng ngày. Nó giúp tự động hóa các tác vụ lặp lại và tối ưu hóa quy trình sản xuất. Hệ thống AI có thể phân tích dữ liệu nhanh chóng hơn con người."
    );
    TC.setEditorText(
      "text2",
      "Công nghệ trí tuệ nhân tạo (AI) đang thay đổi cách chúng ta làm việc hàng ngày. Nó giúp tự động hóa các tác vụ lặp lại và tối ưu hóa quy trình sản xuất. Công cụ AI có thể phân tích dữ liệu nhanh chóng và chính xác."
    );

    TC.updateLineNumbers("text1", "lineNumbers1");
    TC.updateLineNumbers("text2", "lineNumbers2");

    requestAnimationFrame(() => TC.compareTexts());
  };
})();
