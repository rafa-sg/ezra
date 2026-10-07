"use client";
import { ArrowRight, CalendarDays, CheckCheck, Package } from "lucide-react";
import type { Post, Workspace } from "@/lib/model";
import { statusLabels } from "@/lib/model";
import { useLanguage } from "./i18n";

type Destination = "catalog" | "content" | "calendar" | "settings";
export function BusinessOverview({
  state,
  name,
  navigate,
  open,
}: {
  state: Workspace;
  name: string;
  navigate: (view: Destination) => void;
  open: (post: Post) => void;
}) {
  const { t } = useLanguage();
  const items = [
    { label: t("businessCatalog"), count: state.catalog.length, icon: Package, view: "catalog" },
    {
      label: t("businessReview"),
      count: state.posts.filter((post) => post.status === "review").length,
      icon: CheckCheck,
      view: "content",
    },
    {
      label: t("businessPlanned"),
      count: state.posts.filter((post) => post.status === "planned").length,
      icon: CalendarDays,
      view: "calendar",
    },
  ] as const;
  return (
    <section className="az-business-dashboard">
      <div className="az-business-heading">
        <div>
          <h1>{name}</h1>
          <p className="az-muted">{t("businessIntro")}</p>
        </div>
        <button className="az-button az-primary" onClick={() => navigate("catalog")}>
          {t("businessOpenCatalog")}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="az-business-summary">
        {items.map((item) => (
          <button className="az-card" key={item.view} onClick={() => navigate(item.view)}>
            <item.icon size={20} />
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>
      <div className="az-card az-business-posts">
        <div className="az-business-heading">
          <h2>{t("businessRecent")}</h2>
          <button className="az-button" onClick={() => navigate("content")}>
            {t("businessViewAll")}
          </button>
        </div>
        {state.posts.length ? (
          <ul>
            {state.posts.slice(0, 5).map((post) => (
              <li key={post.id}>
                <button onClick={() => open(post)}>
                  <span>
                    {post.title || t("businessUntitled")}
                    {post.demo && <small> · {t("demo")}</small>}
                  </span>
                  <span className="az-muted">{statusLabels[post.status]}</span>
                  <ArrowRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="az-empty">
            <h3>{t("businessEmpty")}</h3>
            <p>{t("businessEmptyHint")}</p>
            <button className="az-button" onClick={() => navigate("content")}>
              {t("businessOpenPosts")}
            </button>
          </div>
        )}
      </div>
      <div className="az-card az-business-connection">
        <div>
          <h2>{t("businessConnections")}</h2>
          <p className="az-muted">{t("businessDisconnected")}</p>
        </div>
        <button className="az-button" onClick={() => navigate("settings")}>
          {t("settings")}
        </button>
      </div>
    </section>
  );
}
