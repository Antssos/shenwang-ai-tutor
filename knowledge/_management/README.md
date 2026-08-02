# 知识库管理区

## 目录边界

- `知识库/`：原始、杂乱、待处理的资料。只读保留，绝不作为 Dify 上传源。
- `knowledge/`：清洗后的成品资料。保存可入库的 Markdown、CSV、JSON 和管理文件。
- `.agents/`：清洗过程的脚本、抽取文本、检查记录等工作痕迹；不进入知识库，也不上传 Dify。

当前状态：已完成学习资料、中心信息和心理问答资料的分批整理。2026-07-25 准入的中心公开信息、课程资料和家庭教育参考已在 `document_manifest.csv` 标为 `active`；教材汇编和儿童心理问答仍为 `draft`，完成教师或专业人员审核后才能上传 Dify。

## 成品目录结构

所有成品必须放在英文目录中；正文成品允许使用 Markdown、CSV 或 JSON：

```text
knowledge/
├─ center_information/
│  ├─ center-profile/
│  ├─ programs/
│  └─ policies/
├─ learning/
│  ├─ interest-courses/
│  ├─ science-courses/
│  └─ local-culture/
├─ emotional_support/
│  └─ psychological-qa/
├─ care-support/            # 规划中的兼容目录
│  ├─ family-education/
│  └─ ...
└─ _management/
```

资料按三个业务库归档：`center-public`（中心公开信息）、`learning`（学科学习）和 `care-support`（专业审核后的非紧急支持）。危机处置只使用工作流固定回复，不建立可自由检索的资料库。

## 清洗规则

1. 每份原始文件只产生一个对应的 `.md` 成品；不再保留“第 1 页 / 第 2 页”式分段。
   对结构化数据，允许产生多个按大小分片的 `.csv` 或 `.json` 成品；同一原始文件的分片必须使用统一前缀和连续编号。
2. 使用一个清晰的一级标题和按主题组织的二级标题；页码、页眉、页尾、目录、封面、图片占位和重复装饰文字必须删除。
3. 保留原始资料中所有有效事实：机构名称、时间、地点、服务对象、活动、规则、章程条款、联系方式及来源明确的说明。
4. 不根据常识补写原文没有的信息；发现原文内部名称、日期不一致时，保留原文表述并在 `notes` 字段记录待核验项。
5. 仅 `status=active` 的成品允许导入 Dify；原始资料、抽取中间文件和审核草稿不得上传。
6. CSV 使用 UTF-8 编码、固定表头和标准 CSV 转义；JSON 使用 UTF-8 编码且必须可解析；单个 CSV 或 JSON 必须小于 15 MiB。心理问答数据默认保持 `draft`，完成专业审核后才能改为 `active`。

## 管理表使用

1. 复制 `document_manifest_template.csv` 为 `document_manifest.csv`。
2. 每份原始文件登记一行，并填写其实际存在的最终 `clean_file` 路径；路径必须与磁盘目录和文件名一致。
3. 清洗完成后，将 `status` 从 `draft` 改为 `active`；如果需人工核验，保持 `draft`。

字段含义：

- `doc_id`：永久编号，例如 `SW-CENTER-0001`。
- `source_file`：`知识库/` 下的原始文件相对路径。
- `clean_file`：`knowledge/` 下的最终 Markdown、CSV 或 JSON 相对路径；多个分片可填写统一文件前缀或分号分隔的文件清单。
- `knowledge_base`：仅用 `center-public`、`learning`、`care-support` 三类。
- `authority_level`：`official`、`reviewed` 或 `reference`。
- `status`：`draft`、`active` 或 `retired`。
- `duplicate_of`：重复文件填写主文件的 `doc_id`。
