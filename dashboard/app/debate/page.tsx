import ComingSoon from "@/components/ComingSoon";

export const metadata = { title: "시장 토론 — Economy Begin" };

export default function DebatePage() {
  return (
    <ComingSoon
      title="시장 토론"
      stage="3단계"
      lines={[
        "수집한 기사를 바탕으로 5인의 애널리스트가 산업별로 토론하고, 성장 / 보합 / 침체 중 하나로 평가합니다.",
        "하루 1번, 장 마감 후에 갱신됩니다.",
      ]}
    />
  );
}
