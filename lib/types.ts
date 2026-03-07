export type Lead = {
  id: string;
  // from CSV
  account_name: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_job_title: string | null;
  account_domain: string | null;
  account_employee_range: string | null;
  account_industry: string | null;
  // ranking results
  score: number | null;
  rank: number | null;
  global_rank: number | null;
  reasoning: string | null;
  is_relevant: boolean | null;
  ranked_at: string | null;
};

export type RankingResult = {
  id: string;
  score: number;
  rank: number;
  reasoning: string;
  is_relevant: boolean;
};
