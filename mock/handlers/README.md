# Mock handlers

业务功能实现时在此建立 repository/API handler。handler 只负责已经 ready 的字段契约和场景注入，状态流转和金额/库存规则必须留在领域 service。不得根据 fixture 反向发明产品字段；fixture 必须由 schema 和产品规格生成。跨切片读取遵守实体拥有者和 ID 引用，不在 handler 中拼出另一份可变业务事实。
