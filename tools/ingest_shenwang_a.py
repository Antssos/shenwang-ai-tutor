from pathlib import Path
import re

repo = Path(__file__).resolve().parents[1]
source_root = repo / "知识库" / "申望儿童关爱服务A"

documents = [
    ("五子棋教学课件.md", "knowledge/learning/interest-courses/五子棋教学.md", "五子棋教学", "learning", "child"),
    ("游戏知多少教学课件.md", "knowledge/learning/interest-courses/游戏认知与设计.md", "游戏认知与设计", "learning", "child"),
    ("认识DNA与粗提取实验.md", "knowledge/learning/science-courses/认识DNA与香蕉DNA粗提取实验.md", "认识DNA与香蕉DNA粗提取实验", "learning", "child"),
    ("武穴红色历史.md", "knowledge/learning/local-culture/武穴红色历史.md", "武穴红色历史", "learning", "child"),
    ("申望儿童关爱中心_特色课程.md", "knowledge/center_information/programs/特色课程体系.md", "申望儿童关爱中心特色课程体系", "center-public", "public"),
    ("申望爱心班第十一期课程体系.md", "knowledge/center_information/programs/第十一期课程体系.md", "申望爱心班第十一期课程体系", "center-public", "public"),
    ("家校社协同育人与县域教联体建设.md", "knowledge/care_support/family-education/家校社协同育人与县域教联体建设.md", "家校社协同育人与县域教联体建设", "care-support", "guardian/teacher"),
    ("教师家庭教育指导能力建设.md", "knowledge/care_support/family-education/教师家庭教育指导能力建设.md", "教师家庭教育指导能力建设", "care-support", "guardian/teacher"),
]

for source_name, target_name, title, knowledge_base, audience in documents:
    body = (source_root / source_name).read_text(encoding="utf-8")
    body = re.sub(r"^\s*---\s*.*?\s*---\s*", "", body, count=1, flags=re.S)
    if source_name == "五子棋教学课件.md":
        body = re.sub(r"^# 一、基础元数据.*?(?=^# 二、)", "", body, count=1, flags=re.S | re.M)
    header = (
        "---\n"
        f"title: {title}\n"
        f"knowledge_base: {knowledge_base}\n"
        f"audience: {audience}\n"
        "authority_level: reference\n"
        f"source_file: 知识库/申望儿童关爱服务A/{source_name}\n"
        "updated_at: 2026-07-25\n"
        "---\n\n"
    )
    target = repo / target_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(header + body.lstrip(), encoding="utf-8", newline="\n")

print(f"created={len(documents)}")
