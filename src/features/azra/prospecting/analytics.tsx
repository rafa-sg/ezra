"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CircleHelp } from "lucide-react";
import { useLanguage, type MessageKey } from "../i18n";
import { getProspectingService } from "./service";
import { ProspectingLayout, prospectingErrorKey } from "./layout";

// Validated categorical pair (dataviz validator, light surface): blue / sky.
const SERIES = [
  { key: "seriesTool", color: "#4b5ced" },
  { key: "seriesWidgets", color: "#1e9bd6" },
] as const;
const RANGES = { range3: 3, range6: 6, range12: 12 } as const;
type Range = keyof typeof RANGES;
function monthLabels(count: number, locale: string) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const month = date.toLocaleDateString(locale, { month: "short" }).replace(".", "");
    return `${month} '${String(date.getFullYear()).slice(2)}`;
  });
}
type Metrics = { reports: number; conversions: number; leads: number; views: number };
export function ProspectAnalytics() {
  const { t, locale } = useLanguage();
  const [range, setRange] = useState<Range>("range6");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    getProspectingService()
      .getAnalytics()
      .then(setMetrics)
      .catch((e) => setError(prospectingErrorKey(e)));
  }, [range]);
  const months = monthLabels(RANGES[range], locale === "es" ? "es-SV" : "en-US");
  // The demo has no activity, so every series is zero for every month.
  const series = SERIES.map((s) => ({ ...s, values: months.map(() => 0) }));
  const kpis: { label: MessageKey; value: string }[] = metrics
    ? [
        { label: "kpiReports", value: String(metrics.reports) },
        { label: "kpiConversions", value: `${metrics.conversions}%` },
        { label: "kpiLeads", value: String(metrics.leads) },
        { label: "kpiViews", value: String(metrics.views) },
      ]
    : [];
  const W = 640;
  const H = 240;
  const pad = { l: 36, r: 16, t: 16, b: 34 };
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * (i + 0.5)) / months.length;
  const y0 = H - pad.b;
  return (
    <ProspectingLayout active="prospecting/analytics">
      <div className="az-analytics-head">
        <h2>{t("analytics")}</h2>
        <div className="az-analytics-range">
          <label className="az-select az-range">
            <span className="az-visually-hidden">{t("dateRange")}</span>
            <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
              {(Object.keys(RANGES) as Range[]).map((key) => (
                <option key={key} value={key}>
                  {t(key)}
                </option>
              ))}
            </select>
            <CalendarDays size={18} aria-hidden="true" />
          </label>
          <small className="az-muted">{t("analyticsDemoNote")}</small>
        </div>
      </div>
      {error && (
        <p className="az-error" role="alert">
          {t(error)}
        </p>
      )}
      <ul className="az-kpis">
        {kpis.map((kpi) => (
          <li key={kpi.label} className="az-card">
            <h3>
              {t(kpi.label)}{" "}
              <CircleHelp size={18} aria-label={t("helpPending")}>
                <title>{t("helpPending")}</title>
              </CircleHelp>
            </h3>
            <p>
              <strong>{kpi.value}</strong>
              <span className="az-trend" title={t("changeVsPrevious")}>
                <ArrowRight size={16} aria-hidden="true" />
                0%
                <span className="az-visually-hidden">{t("changeVsPrevious")}</span>
              </span>
            </p>
          </li>
        ))}
      </ul>
      <div className="az-charts">
        <figure className="az-card az-chart">
          <figcaption>{t("kpiConversions")}</figcaption>
          <div className="az-donut-wrap">
            <svg
              viewBox="0 0 80 80"
              width="80"
              height="80"
              role="img"
              aria-label={`${t("kpiConversions")}: ${t("noChartData")}`}
            >
              <circle cx="40" cy="40" r="30" fill="none" stroke="#e4e7ec" strokeWidth="8" />
            </svg>
            <ul className="az-legend">
              {series.map((s) => (
                <li key={s.key}>
                  <span className="az-swatch is-dot" style={{ background: s.color }} />
                  {t(s.key)}: 0
                </li>
              ))}
            </ul>
          </div>
        </figure>
        <figure className="az-card az-chart">
          <figcaption>{t("kpiViews")}</figcaption>
          <ul className="az-legend is-row">
            {series.map((s) => (
              <li key={s.key}>
                <span className="az-swatch" style={{ background: s.color }} />
                {t(s.key)}
              </li>
            ))}
          </ul>
          <div className="az-line-wrap">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${t("kpiViews")}: ${t("noChartData")}`}
            >
              <line x1={pad.l} x2={W - pad.r} y1={y0} y2={y0} stroke="#e4e7ec" />
              <text x={pad.l - 10} y={y0 + 4} textAnchor="end" className="az-axis">
                0
              </text>
              {months.map((m, i) => (
                <text key={m} x={x(i)} y={H - 10} textAnchor="middle" className="az-axis">
                  {m}
                </text>
              ))}
              {series.map((s) => (
                <polyline
                  key={s.key}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  points={s.values.map((v, i) => `${x(i)},${y0 - v}`).join(" ")}
                />
              ))}
              {hover !== null && (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={pad.t}
                  y2={y0}
                  stroke="#98a2b3"
                  strokeDasharray="3 3"
                />
              )}
              {months.map((m, i) => (
                <rect
                  key={m}
                  x={x(i) - (W - pad.l - pad.r) / months.length / 2}
                  y={pad.t}
                  width={(W - pad.l - pad.r) / months.length}
                  height={y0 - pad.t}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </svg>
            {hover !== null && (
              <div
                className="az-tooltip"
                style={{ left: `${(x(hover) / W) * 100}%` }}
                role="status"
              >
                <strong>{months[hover]}</strong>
                {series.map((s) => (
                  <span key={s.key}>
                    <span className="az-swatch" style={{ background: s.color }} />
                    {t(s.key)}: {s.values[hover]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <details className="az-table-view">
            <summary>{t("tableView")}</summary>
            <table className="az-table">
              <thead>
                <tr>
                  <th scope="col">{t("month")}</th>
                  {series.map((s) => (
                    <th scope="col" key={s.key}>
                      {t(s.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m, i) => (
                  <tr key={m}>
                    <th scope="row">{m}</th>
                    {series.map((s) => (
                      <td key={s.key}>{s.values[i]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      </div>
    </ProspectingLayout>
  );
}
