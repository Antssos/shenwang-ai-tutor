from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


STRONG_CHILD_RE = re.compile(
    r"儿童|小孩|幼儿|宝宝|婴儿|青少年|未成年|青春期|留守儿童|校园欺凌|校园暴力|"
    r"早恋|厌学|逃学|亲子|育儿"
)
INHERENT_CHILD_TOPIC_RE = re.compile(r"儿童|青少年|未成年|亲子|育儿|青春期|早恋|厌学|校园欺凌|校园暴力")
FAMILY_CHILD_RE = re.compile(r"我的?孩子|我家孩子|孩子今年|孩子上[小学初高中]|我儿子|我女儿|儿子|女儿|子女")
GENERIC_CHILD_RE = re.compile(r"孩子|家长|学生")
CHILD_PROBLEM_RE = re.compile(
    r"教育|学习|考试|成绩|心理|沟通|成长|情绪|性格|行为|叛逆|不听话|撒谎|打人|欺负|"
    r"胆小|自卑|自信|焦虑|抑郁|孤独|恐惧|失眠|睡眠|网瘾|游戏|注意力|多动|自闭|早熟|"
    r"同学|老师|校园|父母|家庭|离家出走"
)
SELF_AGE_RE = re.compile(r"我今年\s*(\d{1,2})\s*岁")
SELF_STAGE_RE = re.compile(r"我是(?:一名)?(?:小学生|初中生|高中生|中学生|未成年人)|我(?:现在)?上(?:小学|初中|高中|初[一二三1-3]|高[一二三1-3])")
ADULT_REPRODUCTIVE_RE = re.compile(r"怀孕|流产|不孕|备孕|生育|生了孩子|生下孩子|生孩子|要(?:个|上)?小孩|想要孩子|失去.{0,4}宝宝|胎儿|产后")
CURRENT_ADULT_STAGE_RE = re.compile(r"现在.{0,15}(?:上大学|读大学|大[一二三四]|读研|研究生)|(?:正在|已经)?读研|大学生")
PARENT_CHILD_RE = re.compile(r"我(?:们)?(?:家|的)?(?:孩子|儿子|女儿)|孩子今年|儿子今年|女儿今年")
PARENT_CHILD_PROBLEM_RE = re.compile(
    r"(?:我(?:们)?(?:家|的)?(?:孩子|儿子|女儿)|孩子今年|儿子今年|女儿今年).{0,60}(?:学习|成绩|心理|情绪|性格|行为|叛逆|"
    r"撒谎|打人|欺负|胆小|自卑|焦虑|抑郁|孤独|恐惧|失眠|网瘾|游戏|注意力|多动|自闭|早熟|同学|老师|校园|不听话)|"
    r"(?:教育|帮助|引导|管教|陪伴|沟通|担心).{0,35}(?:我(?:们)?(?:家|的)?(?:孩子|儿子|女儿))"
)
CHILD_FOCUSED_RE = re.compile(
    r"(?:孩子|小孩|儿童|儿子|女儿|青少年|未成年).{0,18}(?:不爱学习|厌学|考试|成绩|心理|情绪|性格|"
    r"行为|叛逆|不听话|撒谎|打人|欺负|胆小|自卑|焦虑|抑郁|孤独|恐惧|失眠|睡眠|网瘾|"
    r"游戏|注意力|多动|自闭|早熟|同学|老师|校园|受伤|虐待|性侵|猥亵|打骂)|"
    r"(?:教育|帮助|引导|管教|陪伴|沟通|担心).{0,18}(?:我的?|我家)?(?:孩子|小孩|儿童|儿子|女儿)"
)
CHILD_SAFETY_RE = re.compile(r"(?:孩子|小孩|儿童|儿子|女儿).{0,25}(?:性侵|猥亵|虐待|打骂|伤害|欺凌|摸胸|自杀|自残)")
SCHOOL_STAGE_RE = re.compile(
    r"幼儿园|学龄前|小学生|小学[一二三四五六1-6]?年级|初中生|初[一二三1-3]|中学生|"
    r"高中生|高[一二三1-3]|中考|高考|班主任"
)
CHILD_LABELS = {"子女沟通"}
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    text = CONTROL_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def is_child_related(record: dict) -> tuple[bool, str]:
    q = record.get("ques_info") or {}
    title = clean(q.get("title"))
    content = clean(q.get("content"))
    labels = set(q.get("ques_label") or [])
    searchable = f"{title}\n{content}"
    if ADULT_REPRODUCTIVE_RE.search(searchable) and not SCHOOL_STAGE_RE.search(searchable):
        return False, ""
    if CURRENT_ADULT_STAGE_RE.search(searchable) and not INHERENT_CHILD_TOPIC_RE.search(title) and not PARENT_CHILD_PROBLEM_RE.search(searchable):
        return False, ""
    if labels & CHILD_LABELS:
        return True, "标签：子女沟通"
    if SCHOOL_STAGE_RE.search(title) and CHILD_PROBLEM_RE.search(title):
        return True, "标题明确包含未成年教育阶段及问题语境"
    if INHERENT_CHILD_TOPIC_RE.search(title):
        return True, "标题明确以儿童/青少年议题为主体"
    if STRONG_CHILD_RE.search(title) and CHILD_PROBLEM_RE.search(title):
        return True, "标题同时含儿童主体和发展/行为问题"
    ages = [int(x) for x in SELF_AGE_RE.findall(searchable)]
    if ages and min(ages) <= 17:
        return True, "提问者明确表示当前年龄不超过17岁"
    if SELF_STAGE_RE.search(searchable):
        return True, "提问者明确表示当前处于未成年教育阶段"
    if PARENT_CHILD_PROBLEM_RE.search(searchable):
        return True, "父母明确描述自己子女的发展或行为问题"
    if CHILD_SAFETY_RE.search(searchable):
        return True, "正文直接描述儿童安全风险"
    return False, ""


def render_unit(record: dict, seq: int, match_reason: str) -> str:
    q = record.get("ques_info") or {}
    stats = record.get("staic_info") or {}
    answers = record.get("answers_info") or []
    title = clean(q.get("title")) or "未命名问题"
    labels = "、".join(clean(x) for x in (q.get("ques_label") or [])) or "无"
    lines = [
        f"<!-- QA-UNIT-START id={clean(record.get('ques_id'))} -->",
        f"## 问答单元 {seq}｜{title}",
        "",
        "### 问题",
        "",
        clean(q.get("content")) or "（原始问题没有补充描述）",
        "",
        "### 元数据",
        "",
        f"- 问题编号：{clean(record.get('ques_id'))}",
        f"- 标签：{labels}",
        f"- 原始回答数：{clean(q.get('answer_count')) or len(answers)}",
        f"- 抱抱数：{clean(stats.get('hug')) or '0'}",
        f"- 收藏数：{clean(stats.get('collect')) or '0'}",
        f"- 儿童相关判定：{match_reason}",
        "",
        "### 回答",
        "",
    ]
    for index, answer in enumerate(answers, 1):
        lines.extend([
            f"#### 回答 {index}",
            "",
            clean(answer.get("content")) or "（空回答）",
            "",
            f"- 推荐标记：{clean(answer.get('recommend_flag')) or '未标记'}",
            f"- 赞同数：{clean(answer.get('zan')) or '0'}",
            f"- 评论数：{clean(answer.get('comment_count')) or '0'}",
            "",
        ])
    lines.extend(["<!-- QA-UNIT-END -->", "", "---", ""])
    return "\n".join(lines)


def write_chunks(units: list[str], output_dir: Path, limit: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    header = (
        "# 儿童与青少年心理问答资料\n\n"
        "> 分块要求：每个 `QA-UNIT-START` 到对应 `QA-UNIT-END` 之间是一个完整的“问题 + 全部回答”单元，检索和模型处理时不得跨单元合并，也不得把单元内部的问题与答案拆开。\n\n"
        "> 风险说明：内容来自公开网友问答，尚未经过专业审核，不能作为诊断、治疗或危机处置依据。\n\n"
    )
    paths: list[Path] = []
    chunk_units: list[str] = []
    chunk_no = 1
    current_size = len(header.encode("utf-8"))

    def flush() -> None:
        nonlocal chunk_no, chunk_units, current_size
        if not chunk_units:
            return
        path = output_dir / f"child_psychological_qa_{chunk_no:03d}.md"
        path.write_text(header + "".join(chunk_units), encoding="utf-8", newline="\n")
        paths.append(path)
        chunk_no += 1
        chunk_units = []
        current_size = len(header.encode("utf-8"))

    for unit in units:
        unit_size = len(unit.encode("utf-8"))
        if unit_size + len(header.encode("utf-8")) >= limit:
            raise ValueError("单个问答单元已超过分片大小上限，不能保证问答完整性")
        if chunk_units and current_size + unit_size >= limit:
            flush()
        chunk_units.append(unit)
        current_size += unit_size
    flush()
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--limit-mb", type=float, default=14.5)
    args = parser.parse_args()

    records = json.loads(args.input_json.read_text(encoding="utf-8"))
    selected: list[tuple[dict, str]] = []
    no_answer = 0
    for record in records:
        matched, reason = is_child_related(record)
        if not matched:
            continue
        if not (record.get("answers_info") or []):
            no_answer += 1
            continue
        selected.append((record, reason))

    units = [render_unit(record, i, reason) for i, (record, reason) in enumerate(selected, 1)]
    limit = int(args.limit_mb * 1024 * 1024)
    paths = write_chunks(units, args.output_dir, limit)
    print(json.dumps({
        "source_records": len(records),
        "selected_qa_units": len(selected),
        "matched_but_without_answer": no_answer,
        "chunks": len(paths),
        "limit_bytes": limit,
        "max_output_bytes": max((p.stat().st_size for p in paths), default=0),
        "files": [p.name for p in paths],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
