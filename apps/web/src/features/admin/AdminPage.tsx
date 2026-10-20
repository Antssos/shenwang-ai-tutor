import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
interface Document {
  id: string;
  title: string;
  knowledgeBase: string;
  status: string;
  version: string;
}
interface Status {
  provider: string;
  model: string | null;
  activeRuns: number;
  documents: Document[];
  quotas: { day: string; requests: number; tokens: number }[];
}
async function loadStatus(signal?: AbortSignal): Promise<Status> {
  const r = await fetch("/api/v1/admin/status", { signal });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message ?? "无法读取状态");
  return body;
}
export function AdminPage() {
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await loadStatus());
  }
  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal)
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e.message));
      });
    return () => controller.abort();
  }, []);
  async function toggle(doc: Document) {
    setBusy(true);
    try {
      const r = await fetch(
        "/api/v1/admin/documents/" + encodeURIComponent(doc.id) + "/status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: doc.status !== "active" }),
        },
      );
      if (!r.ok) throw new Error("更新失败");
      await refresh();
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <Link to="/chat">返回对话</Link>
      <h1>资料与服务管理</h1>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            模型状态：{data.provider} · {data.model ?? "未配置"} · 正在生成：
            {data.activeRuns}
          </p>
          <h2>知识资料</h2>
          <p>
            新资料通过受控导入流程审核并建立索引，此处可发布或下架已导入资料。
          </p>
          <table>
            <thead>
              <tr>
                <th>资料</th>
                <th>知识库</th>
                <th>版本</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.knowledgeBase}</td>
                  <td>{d.version}</td>
                  <td>{d.status}</td>
                  <td>
                    <button disabled={busy} onClick={() => void toggle(d)}>
                      {d.status === "active" ? "下架" : "发布"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>近期使用量</h2>
          <p>Token 数为保守预留上限，用于限制预算，不代表供应商账单。</p>
          <ul>
            {data.quotas.map((q) => (
              <li key={q.day}>
                {q.day}：{q.requests} 次，预留 {q.tokens} tokens
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
