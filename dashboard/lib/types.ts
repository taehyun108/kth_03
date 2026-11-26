export type Stock = {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string;
  price: number;
  prevClose: number | null;
  changePct: number | null;
  volume: number;
  /** 종가 x 거래량으로 추정한 거래대금(원) */
  tradingValue: number;
};

export type Snapshot = {
  /** 수집 시각 (ISO, KST) */
  asOf: string;
  /** 시세가 속한 거래일 (YYYY-MM-DD) */
  barDate: string;
  /** supabase: 실제 수집 데이터 / sample: 저장소에 들어 있는 견본 */
  source: "supabase" | "sample";
  /** 화면 상단에 보여 줄 경고 (예: 수집 데이터를 못 읽어 견본을 보여 주는 중) */
  warning?: string;
  stocks: Stock[];
};
