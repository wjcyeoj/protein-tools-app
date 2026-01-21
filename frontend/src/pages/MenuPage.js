import { Link } from "react-router-dom";
import { TOOLS } from "../tools";
import "../App.css";

export default function MenuPage() {
  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <h1 className="title">Protein Tools</h1>
            <p className="subtitle">Choose a workflow to run on your instance.</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardInner">
          <div className="help" style={{ marginBottom: 12 }}>
            Select a tool to open its dedicated page.
          </div>

          <div className="grid2">
            {TOOLS.map((t) => (
              <Link key={t.id} to={`/tool/${t.id}`} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 14,
                    background: "white",
                    boxShadow: "var(--shadow-sm)",
                    height: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="drawerIcon">{t.icon}</div>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>
                      {t.name}
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>{t.desc}</div>
                  <div style={{ marginTop: 10, fontSize: 13, color: "var(--primary)", fontWeight: 700 }}>
                    Open →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
