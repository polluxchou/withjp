# Creator Guild AI OS — Product Metrics Dashboard Specification

> Generated: 2026-05-13  
> Product: Creator Guild AI OS (WithJP)  
> Purpose: Define the single source of truth for measuring product health, creator pipeline performance, and business outcomes.

---

## 1. Metrics Framework Overview

The guild's business model converts live-streaming creator prospects into monetized revenue generators, capturing a share of creator revenue. Every metric in this dashboard maps to that core loop.

```
[Prospect] → [Contacted] → [Engaged] → [Onboarded] → [Live Ready] → [Live] → [Monetized]
                                                                                      ↓
                                                                             Monthly Revenue Share
```

**Framework layers:**

| Layer | Purpose | Review Cadence |
|---|---|---|
| North Star | Single proxy for core value delivery | Monthly |
| Input Metrics | Levers the team can directly pull | Weekly |
| Health Metrics | Guardrails — catch regressions fast | Daily / Weekly |
| Business Metrics | Unit economics and sustainability | Monthly / Quarterly |

---

## 2. North Star Metric

### Monthly Creator Revenue (MCR)

**Why this is the North Star:**  
The guild earns revenue share from creator streaming income. Every upstream action — recruiting, onboarding, content strategy, ops — exists to move this number. It's customer-centric (creator success = guild success), comparative (MoM trending), and unambiguously behavior-changing: a drop triggers cross-functional investigation.

| Field | Value |
|---|---|
| **Definition** | `SUM(creator_financials.revenue)` for all creators in a given calendar month |
| **Data Source** | `creator_financials` table, `period` column (YYYY-MM format), joined with `creators` on `status = 'monetized'` |
| **Visualization** | Large number (current month) + sparkline (12-month trend) + MoM % delta badge |
| **Target** | Set per-quarter OKR; example baseline: ¥500,000/month |
| **Alert Threshold** | < 80% of forecast for the month-to-date (triggers Slack / in-app PMO notification) |

---

## 3. Input Metrics

These are the 5 levers that directly drive MCR. Each team owns at least one.

### 3.1 Active Monetized Creator Count

| Field | Value |
|---|---|
| **Definition** | `COUNT(creators)` where `status = 'monetized'` at the end of each week |
| **Data Source** | `creators` table, `status` column |
| **Visualization** | Number card with WoW delta; line chart (52-week) |
| **Target** | +2 net new monetized creators per month |
| **Alert Threshold** | Net count drops WoW (any termination not offset by new monetizations) |
| **Owner** | BD + Ops |

---

### 3.2 Creator Funnel Throughput (Monthly)

| Field | Value |
|---|---|
| **Definition** | Count of `lifecycle_transitions` where `to_status = 'monetized'` in the calendar month |
| **Data Source** | `lifecycle_transitions` table, `to_status`, `triggered_at` |
| **Visualization** | Funnel chart: prospect → contacted → engaged → onboarded → live_ready → live → monetized, with conversion % at each step |
| **Target** | ≥ 3 new monetized creators/month; funnel drop-off ≤ 40% at any single stage |
| **Alert Threshold** | Zero monetizations in any 3-week window; or > 50% drop-off at a single funnel stage vs prior 4-week avg |
| **Owner** | BD |

**SQL skeleton:**
```sql
SELECT to_status, COUNT(*) AS count
FROM lifecycle_transitions
WHERE triggered_at >= date_trunc('month', now())
GROUP BY to_status;
```

---

### 3.3 Average Revenue per Monetized Creator (ARMC)

| Field | Value |
|---|---|
| **Definition** | `SUM(revenue) / COUNT(DISTINCT creator_id)` where `status = 'monetized'`, for the calendar month |
| **Data Source** | `creator_financials` JOIN `creators` on `id`, filter `status = 'monetized'` |
| **Visualization** | Number card with MoM % delta; bar chart ranked by creator |
| **Target** | ¥50,000 ARMC or above; P10 creator ≥ ¥10,000 |
| **Alert Threshold** | ARMC drops > 20% MoM — trigger content/growth review |
| **Owner** | Content + Growth |

---

### 3.4 Pipeline-to-Monetized Conversion Rate (90-day Cohort)

| Field | Value |
|---|---|
| **Definition** | % of `prospect` creators created in a given month who reach `monetized` within 90 calendar days. Numerator: creators with a `lifecycle_transition` to `monetized` within 90d of `created_at`. Denominator: all creators created in that cohort month. |
| **Data Source** | `creators` (created_at) JOIN `lifecycle_transitions` (triggered_at, to_status = 'monetized') |
| **Visualization** | Cohort table (month × conversion %) with color gradient; rolling 6-month avg line |
| **Target** | ≥ 30% of a prospect cohort monetizes within 90 days |
| **Alert Threshold** | Any cohort < 15% at the 60-day mark (early warning of a bad batch) |
| **Owner** | BD + Ops |

---

### 3.5 Monthly Forecast Accuracy Rate

| Field | Value |
|---|---|
| **Definition** | `(1 - ABS(actual_revenue - forecast_revenue) / forecast_revenue) × 100%` aggregated across all accounts per month |
| **Data Source** | `forecast_assumptions` (monthly targets by account type: key/mature/growing/newbie) vs `creator_financials` (actuals), joined on `period` |
| **Visualization** | Gauge (0–100%); waterfall chart showing variance by account type |
| **Target** | ≥ 85% forecast accuracy |
| **Alert Threshold** | < 70% accuracy in any month — triggers Finance + PMO review of assumptions |
| **Owner** | Finance |

---

## 4. Health Metrics

These are guardrails. They shouldn't drive strategy, but a red health metric means something is broken.

### 4.1 Task On-Time Completion Rate

| Field | Value |
|---|---|
| **Definition** | `COUNT(tasks WHERE status = 'done') / COUNT(tasks WHERE status IN ('done','failed'))` within a rolling 7-day window |
| **Data Source** | `tasks` table, `status`, `updated_at` |
| **Visualization** | Percentage gauge; stacked bar (done vs failed vs still-running by agent role) |
| **Target** | ≥ 90% completion rate |
| **Alert Threshold** | < 75% in any 7-day window — check for agent failures or blocked workflows |

---

### 4.2 Agent Task Success Rate

| Field | Value |
|---|---|
| **Definition** | `COUNT(tasks WHERE status = 'done') / COUNT(tasks WHERE status IN ('done','failed'))` grouped by `agent_id` / `agent.role`, 30-day rolling |
| **Data Source** | `tasks` JOIN `agents` on `agent_id` |
| **Visualization** | Horizontal bar per agent role (done% vs failed%); trend line |
| **Target** | ≥ 95% per agent role |
| **Alert Threshold** | Any single agent role drops below 80% — likely prompt or API issue |

---

### 4.3 Creator Retention Rate (Monetized)

| Field | Value |
|---|---|
| **Definition** | `1 - (COUNT of lifecycle_transitions WHERE from_status = 'monetized' AND to_status = 'terminated' in last 30 days) / (avg active monetized count in same window)` |
| **Data Source** | `lifecycle_transitions` (from_status, to_status, triggered_at), `creators` |
| **Visualization** | Number (% retained); line chart 12-month; table of churned creators with churn date |
| **Target** | ≥ 90% monthly retention |
| **Alert Threshold** | Any single creator churns — immediate PMO alert (zero-tolerance for surprise terminations) |

---

### 4.4 PMO Activity Coverage

| Field | Value |
|---|---|
| **Definition** | % of milestones with `status = 'at_risk'` that have a corresponding `activity_events` record of type `message_sent` (PMO follow-up) within 48 hours of status change |
| **Data Source** | `milestones` (status, updated_at) JOIN `activity_events` (entity_type = 'milestone', action = 'status_change') |
| **Visualization** | Number (% coverage); list of at-risk milestones without PMO follow-up |
| **Target** | 100% of at-risk milestones receive PMO outreach within 48 hours |
| **Alert Threshold** | Any at-risk milestone > 48 hours without PMO message |

---

### 4.5 Monthly OPEX Trend

| Field | Value |
|---|---|
| **Definition** | `SUM(expenses.amount)` grouped by `category` for each calendar month (categories: tangible_asset, salary, rent, travel, office_supplies, cloud_services) |
| **Data Source** | `expenses` table, `amount`, `category`, `expense_date`, filtered by `payment_status IN ('ordered_unpaid','paid')` |
| **Visualization** | Stacked area chart (12-month); category breakdown pie for current month |
| **Target** | Total OPEX ≤ 60% of MCR (cost ratio guardrail) |
| **Alert Threshold** | Any single month OPEX > 70% of MCR, or any category spikes > 30% MoM |

---

## 5. Business Metrics

### 5.1 Guild Gross Profit Margin

| Field | Value |
|---|---|
| **Definition** | `(SUM(creator_financials.profit)) / SUM(creator_financials.revenue)` per month |
| **Data Source** | `creator_financials` (revenue, profit, period) |
| **Visualization** | Number with trend arrow; bar chart MoM; line vs target |
| **Target** | ≥ 35% gross margin |
| **Alert Threshold** | < 20% in any month — triggers Finance deep-dive |

---

### 5.2 ROI per Creator

| Field | Value |
|---|---|
| **Definition** | `creator_financials.roi` per creator per period (stored field: `(revenue - cost) / cost × 100%`) |
| **Data Source** | `creator_financials` (roi, creator_id, period) |
| **Visualization** | Scatter plot (x = creator, y = ROI%); ranked table; color coding: green > 50%, yellow 0–50%, red < 0% |
| **Target** | Portfolio avg ROI ≥ 50%; zero creators with negative ROI for > 2 consecutive months |
| **Alert Threshold** | Any creator with ROI < 0% for 2+ months — trigger review |

---

### 5.3 Cost per Monetized Creator (CPMC)

| Field | Value |
|---|---|
| **Definition** | `SUM(expenses)` attributable to onboarding activities in a quarter ÷ number of new monetized creators in that quarter |
| **Data Source** | `expenses` (amount, expense_date, category) — tangible_asset + travel as primary onboarding costs; `lifecycle_transitions` (to_status = 'monetized', triggered_at) |
| **Visualization** | Number card (quarterly); bar chart QoQ trend |
| **Target** | CPMC ≤ ¥8,000 per creator |
| **Alert Threshold** | CPMC > ¥15,000 in any quarter — signal of inefficient onboarding |

---

### 5.4 Revenue Forecast vs Actual by Account Type

| Field | Value |
|---|---|
| **Definition** | For each account type (key, mature, growing, newbie, test): `(actual_revenue - forecast_revenue)` and `(actual_revenue / forecast_revenue - 1) × 100%` per month |
| **Data Source** | `forecast_assumptions` JOIN `creator_financials` on `period` and account type |
| **Visualization** | Grouped bar (forecast vs actual) by account type; variance heatmap (month × account_type) |
| **Target** | All account types within ±15% of forecast |
| **Alert Threshold** | Any account type > 30% below forecast — investigate that segment |

---

### 5.5 Revenue per Operator (Headcount Efficiency)

| Field | Value |
|---|---|
| **Definition** | `SUM(creator_financials.revenue for creators assigned to operator X) / monthly_salary_cost_of_operator_X` per month |
| **Data Source** | `creators` (operator_user_id) JOIN `creator_financials` (revenue) JOIN `user_salaries` (monthly_salary, effective_date) |
| **Visualization** | Ranked bar chart by operator; MoM trend line |
| **Target** | Each operator generates ≥ 5× their monthly salary in creator revenue |
| **Alert Threshold** | Any operator below 2× revenue-to-salary ratio for 2+ consecutive months |

---

## 6. Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  NORTH STAR: Monthly Creator Revenue (MCR)                          │
│  Current: ¥___,___ | MoM: +X.X% | vs Forecast: XX%                │
│  [12-month sparkline]                                               │
├──────────────────┬──────────────────┬──────────────────────────────┤
│ Monetized        │ Funnel           │ ARMC                         │
│ Creator Count    │ Throughput       │ ¥___/creator                 │
│ NN (↑N WoW)      │ [Funnel chart]   │ [MoM bar chart]              │
├──────────────────┴──────────────────┼──────────────────────────────┤
│ 90-day Cohort Conversion Rate        │ Forecast Accuracy            │
│ [Cohort table, color-coded]          │ [Gauge] XX%                  │
├──────────────────────────────────────┴──────────────────────────────┤
│  HEALTH METRICS                                                     │
│  [Task Completion %] [Agent Success %] [Creator Retention %]        │
│  [PMO Coverage %]    [OPEX Trend area chart]                        │
├─────────────────────────────────────────────────────────────────────┤
│  BUSINESS METRICS                                                   │
│  [Gross Margin %] [Avg ROI] [CPMC] [Rev/Operator]                  │
│  [Forecast vs Actual heatmap by account type]                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Second screen — Creator Detail Drill-Down:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Creator Pipeline                      │ Creator Leaderboard (Rev)  │
│  [Kanban by status with counts]        │ [Ranked table with ROI]    │
├────────────────────────────────────────┴────────────────────────────┤
│  At-Risk Creators (ROI < 0 or 2+ months stagnant in same stage)    │
│  [Table: name, status, days_in_stage, last_activity, operator]      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Review Cadence

| Cadence | Metrics Reviewed | Owner | Format |
|---|---|---|---|
| **Daily** | Agent Task Success Rate, PMO Activity Coverage, any red alerts | PMO Agent | Automated Slack digest |
| **Weekly** | MCR MTD vs forecast, Active Monetized Count, Task Completion Rate, OPEX Trend | Ops Lead | 15-min standup |
| **Monthly** | Full dashboard review — all 15 metrics, OKR progress, cohort conversion | All leads | 60-min review meeting |
| **Quarterly** | CPMC, Headcount Efficiency, metric recalibration, target setting | Leadership | Strategic review |

---

## 8. Alert Definitions

### Alert Matrix

| Metric | Threshold | Channel | Response SLA | Assignee |
|---|---|---|---|---|
| MCR < 80% of MTD forecast | Month-to-date running total falls short | Slack #finance-alerts | 4 hours | Finance Lead |
| Creator churn | Any `monetized → terminated` transition | Slack #ops-critical + in-app PMO | Immediate | PMO Agent + Ops Lead |
| Agent task failure spike | Any role < 80% success rate (7-day) | Slack #tech-alerts | 2 hours | Tech Lead |
| At-risk milestone, no PMO follow-up > 48h | See §4.4 | In-app PMO notification + email | 48 hours | PMO Agent |
| OPEX > 70% of MCR | Monthly roll-up | Slack #finance-alerts | Weekly review | Finance |
| Cohort 60-day conversion < 15% | Cohort-by-cohort check | Slack #bd-alerts | Next weekly review | BD Lead |
| Any creator ROI < 0% for 2+ months | Consecutive months check | Slack #ops-alerts | Next monthly review | Ops + Content |

### Alert Implementation Notes

The `activity_events` table already captures all state transitions. Recommended approach:
1. **Postgres triggers** → insert into `activity_events` on any `creators.status` change or `milestones.status` change.
2. **Supabase Realtime** → subscribe to `activity_events` in PMO Agent to trigger notifications.
3. **Scheduled function** (daily cron) → compute aggregates (OPEX %, task success rate, MCR MTD) and compare against thresholds; write results to a `metric_snapshots` table.

---

## 9. Recommended Tool Stack

| Layer | Tool | Rationale |
|---|---|---|
| **Primary analytics** | **PostHog** (self-hosted or cloud) | Open-source, event-based, excellent funnel + cohort analysis; integrates with Next.js via SDK. Pair with `activity_events` stream. |
| **SQL-based dashboards** | **Metabase** (open-source) | Connect directly to Supabase Postgres; non-engineers can write questions in UI. Ideal for Finance and Ops users. |
| **Operational monitoring** | **Grafana + pg_stat** | Monitor Supabase query performance, API route latency, agent task queue depth. |
| **Alerting** | **Supabase Realtime + custom webhook** | Trigger Slack notifications from DB events without additional infra. |
| **In-product KPI panel** | Custom `/dashboard` page (already exists) | Extend `DashboardStats` API to include all 15 metrics above; render natively in the app for the operations team. |

---

## 10. Metric Quality Audit (Ben Yoskovitz Criteria)

| Metric | Understandable | Comparative | Ratio/Rate | Behavior-changing | Grade |
|---|---|---|---|---|---|
| MCR | ✅ | ✅ (MoM) | — (absolute, but normalized by forecast %) | ✅ | A |
| Active Monetized Count | ✅ | ✅ (WoW) | — | ✅ | A- |
| Funnel Throughput | ✅ | ✅ | ✅ (conversion %) | ✅ | A |
| ARMC | ✅ | ✅ | ✅ (ratio) | ✅ | A |
| 90-day Cohort Conversion | ✅ | ✅ | ✅ (%) | ✅ | A |
| Forecast Accuracy | ✅ | ✅ | ✅ (%) | ✅ | A |
| Task Completion Rate | ✅ | ✅ | ✅ (%) | ✅ | A |
| Gross Margin | ✅ | ✅ | ✅ (%) | ✅ | A |
| Revenue per Operator | ✅ | ✅ | ✅ (ratio) | ✅ | A |

**Vanity metrics to avoid** (not included in this dashboard):
- Total creator count (absolute, not rate)
- Total tasks created (activity metric, not outcome)
- Total messages sent to agents (usage, not value)
- Page views / DAU (operational tool — team size is fixed)

---

## 11. Implementation Priority

| Phase | Metrics | Effort | Value |
|---|---|---|---|
| **Phase 1** (immediate — data already exists) | MCR, Active Monetized Count, Funnel Throughput, Task Completion Rate, Gross Margin, ROI per Creator | Low — extend existing `/api/dashboard/stats` endpoint | High |
| **Phase 2** (next sprint) | ARMC, Forecast Accuracy, OPEX Trend, Creator Retention Rate | Medium — new aggregation queries | High |
| **Phase 3** (next month) | 90-day Cohort Conversion, CPMC, Headcount Efficiency, PMO Coverage, Revenue per Operator | Medium-High — cohort logic + salary join | Medium |
| **Phase 4** (quarterly) | Automated alerts, Metabase integration, PostHog event tracking | High — infrastructure | High (long-term) |
