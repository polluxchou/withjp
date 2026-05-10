-- ============================================================
-- Seed: Agents, Knowledge Base, Config
-- ============================================================

-- ── Agents ───────────────────────────────────────────────────
insert into agents (name, role, responsibility, input_schema, output_schema, prompt_template, model_provider, model_name) values

(
  'Alex (BD Agent)',
  'bd',
  'Prospect identification, personalized outreach, relationship building, and creator engagement up to contract signing.',
  '{"creator_name": "string", "platform": "string", "profile": "object", "task_context": "string"}',
  '{"outreach_message": "string", "strategy": "string", "talking_points": "array", "predicted_next_status": "string", "next_action": "string"}',
  'You are Alex, a sharp Business Development agent for a live-streaming creator guild. Your goal is to identify high-potential creators, craft personalized outreach, and guide them toward signing with the guild.

CREATOR PROFILE:
{{creator_info}}

TASK:
{{task_context}}

RELEVANT KNOWLEDGE:
{{knowledge}}

GUILD CONFIG:
{{config}}

Respond ONLY with valid JSON matching this schema:
{
  "outreach_message": "Full personalized message to send to the creator",
  "strategy": "Short-term engagement strategy (2-3 sentences)",
  "talking_points": ["point 1", "point 2", "point 3"],
  "predicted_next_status": "One of: contacted | engaged | onboarded",
  "next_action": "Single concrete next action for the human to take"
}',
  'anthropic',
  'claude-sonnet-4-6'
),

(
  'Jordan (Ops Agent)',
  'ops',
  'Creator onboarding, live stream planning, content strategy, technical setup guidance, and go-live coordination.',
  '{"creator_name": "string", "platform": "string", "profile": "object", "bd_output": "object", "task_context": "string"}',
  '{"live_plan": "string", "schedule": "object", "content_strategy": "string", "technical_checklist": "array", "next_action": "string"}',
  'You are Jordan, a meticulous Operations agent for a live-streaming creator guild. Your goal is to ensure every creator has a flawless onboarding experience and a concrete plan to go live profitably.

CREATOR PROFILE:
{{creator_info}}

PREVIOUS AGENT OUTPUT:
{{previous_output}}

TASK:
{{task_context}}

RELEVANT KNOWLEDGE:
{{knowledge}}

Respond ONLY with valid JSON matching this schema:
{
  "live_plan": "Detailed live streaming plan (3-5 paragraphs)",
  "schedule": {"recommended_days": ["Monday", "Wednesday"], "hours_per_session": 2, "sessions_per_week": 3},
  "content_strategy": "Content approach and topic recommendations",
  "technical_checklist": ["item 1", "item 2", "item 3"],
  "next_action": "Single concrete next action for the human to take"
}',
  'anthropic',
  'claude-sonnet-4-6'
),

(
  'Morgan (Finance Agent)',
  'finance',
  'Revenue tracking, cost analysis, ROI calculation, profitability assessment, and financial recommendations per creator.',
  '{"creator_name": "string", "finance_data": "object", "task_context": "string"}',
  '{"roi_analysis": "string", "is_profitable": "boolean", "recommendations": "array", "revenue_projection": "object", "risk_factors": "array"}',
  'You are Morgan, a data-driven Finance agent for a live-streaming creator guild. Your goal is to assess creator profitability, identify levers to improve ROI, and flag financial risks early.

CREATOR PROFILE:
{{creator_info}}

FINANCIAL DATA:
{{finance_data}}

TASK:
{{task_context}}

GUILD CONFIG:
{{config}}

Respond ONLY with valid JSON matching this schema:
{
  "roi_analysis": "Detailed ROI breakdown and interpretation",
  "is_profitable": true,
  "recommendations": ["recommendation 1", "recommendation 2"],
  "revenue_projection": {"next_period_low": 0, "next_period_high": 0, "assumptions": "string"},
  "risk_factors": ["risk 1", "risk 2"]
}',
  'anthropic',
  'claude-sonnet-4-6'
);

-- ── Knowledge Base ────────────────────────────────────────────
insert into knowledge (category, title, content, tags) values

-- Outreach Scripts
(
  'outreach_scripts',
  'First Touch — Short-form Video Creator',
  'Hi [Name], I came across your [platform] channel and your content on [niche] immediately stood out — your [specific element, e.g. storytelling style / editing pace] is exactly the caliber we work with. I''m with [Guild Name], a live-streaming guild that helps creators like you turn your audience into reliable monthly revenue. We handle the logistics; you focus on content. Would you be open to a quick 15-min call this week?',
  ARRAY['outreach', 'first-touch', 'short-form', 'video']
),
(
  'outreach_scripts',
  'Follow-Up — No Response After 5 Days',
  'Hey [Name], following up on my last message. I know your inbox is busy, so I''ll keep this short: we have a creator in your niche who went from 0 to ¥80K/month in live revenue in 3 months with our system. I''d love to show you how. Still interested?',
  ARRAY['outreach', 'follow-up', 'reengagement']
),
(
  'outreach_scripts',
  'Warm Lead — Creator Showed Interest',
  'Great to hear back, [Name]! Based on your [metric, e.g. 200K followers / 15% engagement rate], I think you''re sitting on a significant untapped revenue stream. Here''s what I''d propose for our call: (1) A 10-min overview of how our guild works, (2) A quick audit of your current monetization, (3) A rough estimate of what you could realistically earn in 90 days. Does [Day/Time] work for you?',
  ARRAY['outreach', 'warm-lead', 'scheduling']
),

-- Onboarding Materials
(
  'onboarding_materials',
  'Creator Welcome Checklist',
  '**Week 1 — Setup**
- [ ] Complete creator profile form (niche, audience demographics, content style)
- [ ] Connect platform accounts (Douyin/Bilibili/YouTube API access)
- [ ] Join guild''s Discord/WeChat group
- [ ] Review revenue split agreement
- [ ] Equipment audit: camera, mic, lighting, internet speed

**Week 2 — Training**
- [ ] Watch guild''s live-streaming fundamentals course (3 hrs)
- [ ] Shadow a top guild creator''s live session
- [ ] Set up streaming software (OBS / platform native)
- [ ] Create first test stream (private, 30 min)

**Week 3 — Soft Launch**
- [ ] Plan first 3 live streams with ops team
- [ ] Announce launch to existing audience
- [ ] Go live! First session goal: audience warmup, no hard sells
- [ ] Post-stream debrief with ops team',
  ARRAY['onboarding', 'checklist', 'setup', 'training']
),
(
  'onboarding_materials',
  'Revenue Split Agreement — Standard Terms',
  'Guild Standard Revenue Split:
- Creator keeps 70% of all live stream revenue (gifts, subscriptions, brand deals sourced by creator)
- Guild takes 30% service fee
- Brand deals sourced BY THE GUILD: 50/50 split
- Monthly settlement: revenue calculated on the 1st, paid out by the 7th

Conditions:
- Minimum 8 live sessions per month to maintain guild membership
- 30-day notice required to exit
- Guild provides: operations support, brand deal sourcing, analytics dashboard, marketing amplification',
  ARRAY['onboarding', 'contract', 'revenue-split', 'terms']
),

-- Live Strategies
(
  'live_strategies',
  'Engagement Ladder — Converting Viewers to Buyers',
  '**The 4-Phase Live Session Structure (2-hour template)**

Phase 1 — Hook (0-15 min): Greet returning fans by name. Tease today''s exclusive content/offers. Run a warm-up poll or question to activate chat.

Phase 2 — Value Delivery (15-75 min): Core content (tutorials, entertainment, Q&A). Establish authority/trust. Introduce products/services naturally within context. Use scarcity cues sparingly ("only 20 left").

Phase 3 — Conversion Window (75-105 min): Direct call-to-action. Bundle offers. Countdown timer if platform supports it. Viewer shoutouts for purchases (social proof).

Phase 4 — Retention Close (105-120 min): Tease next stream''s exclusive. Ask viewers to follow/subscribe. Thank top gifters by name. Strong close line.',
  ARRAY['live-strategy', 'engagement', 'conversion', 'structure']
),
(
  'live_strategies',
  'Optimal Streaming Schedule by Platform',
  'Douyin (TikTok Live): Peak hours 20:00-23:00 CST. Min 3x/week. Sessions 1.5-3 hours. Algorithm rewards consistency over length.

Bilibili: Peak 19:00-22:00 CST. 2-4x/week. Sessions 2-4 hours. Gaming/knowledge audiences. Super Chat (charging) activates after 1,000 followers.

YouTube Live: Peak varies by audience timezone. 2-3x/week. Sessions 1-3 hours. Memberships and Super Chats. SEO-optimize stream titles.

General Rule: First 4 weeks — prioritize consistency (same days/times). After week 4 — A/B test time slots using platform analytics.',
  ARRAY['live-strategy', 'schedule', 'platform', 'optimization']
),

-- Objection Handling
(
  'objection_handling',
  'Objection: "I Already Monetize on My Own"',
  'Acknowledge first: "That''s great — it means you''re already proven. Most creators we work with were already monetizing when they joined."

Reframe: "The question isn''t whether you can do it alone — you clearly can. The question is: what''s the ceiling? Our top creators 3-5x their revenue in the first quarter because they''re no longer doing this alone."

Evidence: "Here''s a quick example: [Creator X] was making ¥15K/month independently. 90 days with us: ¥72K/month. Same content, same audience — different system."

Close: "What would it mean for you if your live revenue 3x''d by next quarter?"',
  ARRAY['objection', 'monetization', 'independence', 'reframe']
),
(
  'objection_handling',
  'Objection: "The Revenue Split Doesn''t Work for Me"',
  'Validate: "Totally fair point — the split matters, and I want to make sure it works for both of us."

Calculate together: "Let''s run the math. If you''re currently making ¥X/month solo, and our system gets you to ¥Y/month, your 70% of ¥Y is [Z] — that''s [comparison] more than you''re keeping now, even after our fee."

Alternative framing: "Think of our 30% as a performance-based service fee. We only earn if you earn. Our incentive is entirely aligned with yours."

Negotiate if needed: "For creators at your scale, we do have a modified tier at 75/25. Let me check if you qualify."',
  ARRAY['objection', 'revenue-split', 'negotiation', 'pricing']
);

-- ── Config ────────────────────────────────────────────────────
insert into config (key, value, description) values

(
  'revenue_split',
  '{"creator_pct": 70, "guild_pct": 30, "brand_deal_creator_pct": 50, "brand_deal_guild_pct": 50}',
  'Default revenue split rules between creator and guild'
),
(
  'roi_thresholds',
  '{"profitable_roi_pct": 20, "high_roi_pct": 100, "loss_threshold_pct": -10}',
  'ROI thresholds for creator profitability classification'
),
(
  'agent_tone',
  '{"bd": "confident, personable, data-driven", "ops": "structured, supportive, detail-oriented", "finance": "analytical, precise, risk-aware"}',
  'Tone and style guidelines for each agent role'
),
(
  'automation_triggers',
  '{"prospect_to_contacted": ["create_outreach_task"], "engaged_to_onboarded": ["create_onboarding_task"], "onboarded_to_live_ready": ["create_live_plan_task"], "live_to_monetized": ["create_roi_analysis_task"]}',
  'State transitions that automatically trigger task creation'
),
(
  'minimum_live_sessions',
  '{"per_month": 8, "warning_threshold": 5}',
  'Minimum live sessions per month required for guild membership'
);
