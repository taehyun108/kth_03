export default function ComingSoon({ title, stage, lines }: { title: string; stage: string; lines: string[] }) {
  return (
    <section className="card soon" aria-labelledby="soon-title">
      <h2 id="soon-title">{title}</h2>
      <p>
        <strong>{stage}</strong>에서 만듭니다.
      </p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}
