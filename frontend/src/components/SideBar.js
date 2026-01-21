import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { TOOLS } from "../tools";

export default function Sidebar({ open, onClose }) {
  const loc = useLocation();

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`backdrop ${open ? "show" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      {/* Drawer */}
      <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="drawerHeader">
          <div className="drawerBrand">
            <div className="logo" style={{ width: 34, height: 34, borderRadius: 12 }}>P</div>
            <div>
              <div style={{ fontWeight: 800, lineHeight: 1.1 }}>Protein Tools</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Switch tools</div>
            </div>
          </div>

          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <nav className="drawerList">
          {TOOLS.map((t) => {
            const active = loc.pathname === `/tool/${t.id}`;
            return (
              <Link
                key={t.id}
                to={`/tool/${t.id}`}
                className={`drawerItem ${active ? "active" : ""}`}
                onClick={onClose}
              >
                <div className="drawerItemTitle">{t.name}</div>
                <div className="drawerItemDesc">{t.desc}</div>
              </Link>
            );
          })}
        </nav>

        <div className="drawerFooter">
          <Link to="/" className="drawerFooterLink" onClick={onClose}>
            ← Back to main menu
          </Link>
        </div>
      </aside>
    </>
  );
}
