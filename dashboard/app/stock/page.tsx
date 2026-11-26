import ComingSoon from "@/components/ComingSoon";

export const metadata = { title: "종목 조회 — Economy Begin" };

export default function StockPage() {
  return (
    <ComingSoon
      title="종목 조회"
      stage="2단계"
      lines={[
        "종목명이나 6자리 코드를 입력하면 재무제표 지표와 기업 뉴스, 투자 대가 5인의 매수·매도 판단이 나옵니다.",
        "150개 목록 밖의 종목도 코드를 넣으면 조회됩니다.",
      ]}
    />
  );
}
