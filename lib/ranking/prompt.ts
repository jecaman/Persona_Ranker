import type { Lead } from "@/lib/types";

// Versión simplificada de un lead para el prompt
// Solo enviamos los campos relevantes para el scoring (ahorramos tokens)
type LeadForPrompt = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  company_size: string | null;
  industry: string | null;
};

export function buildLeadsForPrompt(leads: Lead[]): LeadForPrompt[] {
  return leads.map((lead) => ({
    id: lead.id,
    name: [lead.lead_first_name, lead.lead_last_name].filter(Boolean).join(" "),
    title: lead.lead_job_title,
    company: lead.account_name,
    company_size: lead.account_employee_range,
    industry: lead.account_industry,
  }));
}

// Construye el system prompt con la persona spec inyectada
export function buildSystemPrompt(personaSpec: string): string {
  return `You are a B2B sales lead qualification system for Throxy.

Your job is to evaluate each lead against the ideal customer persona below and return a structured JSON response.

<persona_spec>
${personaSpec}
</persona_spec>

## How to evaluate each lead

**Step 1 — Check for hard exclusions first.**
If the lead matches any hard exclusion in the persona spec, assign score 0 and is_relevant false immediately.
Hard exclusions are absolute — no other signal overrides them.
Important: some exclusions are context-dependent (e.g. CEO is ideal at startups but excluded at Enterprise). Always consider company size.

**Step 2 — Score based on title × company size.**
The persona spec defines different target titles for each company size tier (Startup, SMB, Mid-Market, Enterprise).
A strong title match at the right company size = high score. A good title but wrong company size = lower score.

**Step 3 — Apply soft exclusion penalty.**
Soft exclusions (BDRs, AEs, CMO, Advisors) are not disqualified but deprioritized. Reduce their score by 20-30 points.

**Step 4 — Consider qualification signals.**
Positive signals (e.g. recently funded, hiring SDRs) can add up to +10 points.
Negative signals (e.g. B2C company, PLG motion) can subtract up to -15 points.

## Output format
Return ONLY a valid JSON array — no extra text, no markdown blocks:
[
  {
    "id": "<lead id>",
    "score": <integer 0-100>,
    "reasoning": "<one sentence: title + company size context + key signal>",
    "is_relevant": <true if score >= 30, false otherwise>
  }
]

## Score reference
- 80-100: Ideal fit — right title, right company size, strong signals
- 50-79: Good fit — solid match with minor gaps
- 30-49: Weak fit — some alignment but notable mismatches
- 1-29: Poor fit — soft exclusion or weak signal combination
- 0: Hard exclusion — do not contact under any circumstances`;
}

// Construye el mensaje de usuario con los leads del batch en formato JSON
export function buildUserMessage(leads: LeadForPrompt[]): string {
  return `Evaluate these leads:\n${JSON.stringify(leads, null, 2)}`;
}
