from pathlib import Path
import re

repo = Path(__file__).resolve().parents[1]
source_root = repo / "知识库" / "特色课程"

documents = [
    ("AI基础知识与望学伴.md", "knowledge/learning/digital-literacy/AI基础知识与望学伴.md", "AI基础知识与望学伴", "child"),
    ("Excel基础使用.md", "knowledge/learning/digital-literacy/Excel基础使用.md", "Excel基础使用", "child/teacher"),
    ("PPT基础使用.md", "knowledge/learning/digital-literacy/PowerPoint基础使用.md", "PowerPoint基础使用", "child/teacher"),
    ("Word基础使用.md", "knowledge/learning/digital-literacy/Word基础使用.md", "Word基础使用", "child/teacher"),
    ("WPS介绍.md", "knowledge/learning/digital-literacy/WPS介绍与基础使用.md", "WPS介绍与基础使用", "child/teacher"),
    ("中国象棋.md", "knowledge/learning/interest-courses/中国象棋.md", "中国象棋", "child"),
    ("爱心班菜谱_菜品详解.md", "knowledge/center_information/programs/爱心班儿童营养菜谱.md", "爱心班儿童营养菜谱", "guardian/teacher"),
]

for source_name, target_name, title, audience in documents:
    body = (source_root / source_name).read_text(encoding="utf-8")
    body = re.sub(r"^\s*---\s*.*?\s*---\s*", "", body, count=1, flags=re.S)
    body = body.replace("说��", "说明")
    if source_name == "AI基础知识与望学伴.md":
        body = re.sub(r"^\| \*\*技术栈\*\* \|.*$", "", body, flags=re.M)
    if source_name == "爱心班菜谱_菜品详解.md":
        notice = (
            "> **使用范围与安全提示：** 本文供食堂工作人员、教师和监护人参考。"
            "儿童不得独立进行切配、油炸、炒糖色或接触明火和高温蒸汽。"
            "实际供餐前应核对过敏原、食材新鲜度和食品安全要求；肉、蛋、水产和豆类须彻底熟制。\n\n"
        )
        body = notice + body
    header = (
        "---\n"
        f"title: {title}\n"
        "knowledge_base: learning\n" if source_name != "爱心班菜谱_菜品详解.md" else
        "---\n"
    )
    if source_name == "爱心班菜谱_菜品详解.md":
        header = "---\ntitle: 爱心班儿童营养菜谱\nknowledge_base: center-public\n"
    header += (
        f"audience: {audience}\n"
        "authority_level: reference\n"
        f"source_file: 知识库/特色课程/{source_name}\n"
        "updated_at: 2026-07-29\n"
        "---\n\n"
    )
    target = repo / target_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(header + body.lstrip(), encoding="utf-8", newline="\n")

print(f"created={len(documents)}")
