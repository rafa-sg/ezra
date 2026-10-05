"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { ArrowUpRight, Check, FileText, ImageIcon, X } from "lucide-react";
import { Artwork } from "./artwork";
import { displayDate, formatLabels, statusLabels, type Post, type Workspace } from "@/lib/model";

export const FeedbackContext = createContext<{ message: string; error: boolean } | null>(null);

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <g fill="currentColor" transform="translate(20 20)">
          <ellipse rx="5.2" ry="18" />
          <ellipse rx="5.2" ry="18" transform="rotate(60)" />
          <ellipse rx="5.2" ry="18" transform="rotate(120)" />
          <circle r="5" fill="var(--paper)" />
        </g>
      </svg>
    </span>
  );
}
export function StatusBadge({ status }: { status: Post["status"] }) {
  return (
    <span className={`badge status-${status}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}
export function Network({ channel, label = false }: { channel: Post["channel"]; label?: boolean }) {
  return (
    <span className={`network ${channel}`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        {channel === "instagram" ? (
          <>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r=".7" fill="currentColor" />
          </>
        ) : (
          <path
            stroke="none"
            fill="currentColor"
            d="M14 22v-9h3l.5-4H14V7c0-1.1.3-2 2-2h2V1.4A26 26 0 0 0 15 1c-3 0-5 1.8-5 5v3H7v4h3v9z"
          />
        )}
      </svg>
      {label && (channel === "instagram" ? "Instagram" : "Facebook")}
    </span>
  );
}

export function PostVisual({ post, state }: { post: Post; state: Workspace }) {
  const asset = state.media.find((m) => post.mediaIds.includes(m.id));
  return asset ? (
    asset.mime.startsWith("video/") ? (
      <video
        src={`/api/media/${asset.id}`}
        muted
        playsInline
        preload="metadata"
        aria-label={asset.originalName}
      />
    ) : (
      // Local uploads use a protected route; no external image optimizer is needed.
      <img src={`/api/media/${asset.id}`} alt={asset.originalName} />
    )
  ) : (
    <Artwork scene={post.artwork} />
  );
}
export function PostCard({
  post,
  state,
  onOpen,
}: {
  post: Post;
  state: Workspace;
  onOpen: (post: Post) => void;
}) {
  return (
    <button className="post-card" onClick={() => onOpen(post)}>
      <div className="post-art">
        <PostVisual post={post} state={state} />
        <span className="art-network">
          <Network channel={post.channel} />
        </span>
        <span className="format-tag">
          {post.format === "text" ? <FileText size={12} /> : <ImageIcon size={12} />}{" "}
          {formatLabels[post.format]}
        </span>
        {!post.mediaIds.length && (
          <span className="illustration-label">Ilustración de referencia</span>
        )}
      </div>
      <div className="post-body">
        <div className="post-overline">
          <StatusBadge status={post.status} />
          {post.demo && <span className="demo-tag">Ejemplo</span>}
          {post.aiGenerated && <span className="badge ai-badge">Generado con IA</span>}
        </div>
        <h3>{post.title}</h3>
        <p>{post.caption || "Una historia por escribir…"}</p>
        <div className="post-bottom">
          <span>
            {post.plannedAt
              ? displayDate(post.plannedAt, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Sin fecha prevista"}
          </span>
          <ArrowUpRight size={17} />
        </div>
      </div>
    </button>
  );
}
export function Dialog({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const notice = useContext(FeedbackContext);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
        {notice && (
          <div
            className={`dialog-notice ${notice.error ? "error" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.message}
            {notice.error && notice.message.includes("otra ventana") && (
              <button className="text-button" onClick={() => window.location.reload()}>
                Recargar el estudio
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FileText size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Checkline({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={`checkline ${checked ? "checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden="true">
        {checked && <Check size={12} />}
      </span>
      <span>{children}</span>
    </label>
  );
}
